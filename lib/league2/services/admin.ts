// Administration. Every privileged action needs an AdminContext, and the only way to get one is requireAdmin(), which
// checks on the server that the signed-in account is BOTH in the league_admins table AND on the LEAGUE_ADMIN_EMAILS
// allow-list with a verified email. A flag sent by the browser is never consulted.
//
// There is no impersonation, no way to read a password, and no way to set one. Recovery means sending the owner a
// reset link at their verified address. Every action below writes an audit entry in the same transaction.

import type { Db, Queryable } from "../db"
import { type EvidenceKind, type ManualReview, manualReviewSufficient, reduceClaim } from "../domain"
import { mustAudit } from "./audit"

declare const adminBrand: unique symbol
export type AdminContext = { readonly userId: string; readonly [adminBrand]: true }

export function parseAllowList(raw: string | undefined): string[] {
	return (raw ?? "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
}

/** Returns an AdminContext only for a verified account that is in the admin table and on the allow-list. */
export async function requireAdmin(q: Queryable, user: { id: string; email: string; emailVerified: boolean } | null | undefined, allow: readonly string[]): Promise<AdminContext | null> {
	if (!user || !user.emailVerified || allow.indexOf(user.email.toLowerCase()) < 0) return null
	const r = await q.query(`select 1 from league_admins where user_id = $1`, [user.id])
	return r.rows.length > 0 ? ({ userId: user.id } as AdminContext) : null
}

export type MemberSummary = {
	playerId: string
	handle: string
	userId: string | null
	emailVerified: boolean | null
	maskedEmail: string | null
	disabled: boolean
	legacyState: string | null
	joinedAt: string
}

export function maskEmail(email: string): string {
	const [local, domain] = email.split("@")
	return `${local.slice(0, 1)}***@${domain}`
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Find members by handle prefix or by exact email. Emails are shown masked. */
export async function searchMembers(q: Queryable, _admin: AdminContext, query: string, limit = 25): Promise<MemberSummary[]> {
	const term = query.trim().toLowerCase().slice(0, 100)
	if (!term) return []
	const byEmail = term.indexOf("@") >= 0
	const r = await q.query<{ id: string; handle: string; user_id: string | null; email: string | null; email_verified: boolean | null; disabled_at: Date | null; legacy_state: string | null; joined_at: Date }>(
		`select p.id, p.handle, p.user_id, u.email, u."emailVerified" as email_verified, p.disabled_at, i.state as legacy_state, p.joined_at
		 from league_players p
		 left join "user" u on u.id = p.user_id
		 left join league_legacy_identities i on i.player_id = p.id
		 where ${byEmail ? "lower(u.email) = $1" : "p.handle_lower like $1 || '%' escape '\\'"}
		 order by p.handle_lower limit $2`,
		[byEmail ? term : escapeLike(term), Math.min(Math.max(limit, 1), 100)]
	)
	return r.rows.map((x) => ({
		playerId: x.id,
		handle: x.handle,
		userId: x.user_id,
		emailVerified: x.email_verified,
		maskedEmail: x.email ? maskEmail(x.email) : null,
		disabled: x.disabled_at !== null,
		legacyState: x.legacy_state,
		joinedAt: new Date(x.joined_at).toISOString(),
	}))
}

export type MemberDetail = MemberSummary & {
	entries: number
	gradedEntries: number
	activeSessions: number
	cases: { id: string; kind: string; status: string; createdAt: string }[]
	recentAudit: { at: string; action: string; actor: string; reason: string | null }[]
}

export async function memberDetail(q: Queryable, admin: AdminContext, playerId: string): Promise<MemberDetail | null> {
	const base = await q.query<{ id: string }>(`select id from league_players where id = $1`, [playerId])
	if (base.rows.length === 0) return null
	const [summary] = await searchByPlayerId(q, admin, playerId)
	const counts = await q.query<{ entries: string; graded: string }>(
		`select (select count(*) from league_entries where player_id = $1) as entries, (select count(*) from league_current_grades where player_id = $1 and not voided) as graded`,
		[playerId]
	)
	const sessions = summary.userId ? await q.query<{ n: string }>(`select count(*) as n from "session" where "userId" = $1 and "expiresAt" > now()`, [summary.userId]) : { rows: [{ n: "0" }] }
	const cases = await q.query<{ id: string; kind: string; status: string; created_at: Date }>(`select id, kind, status, created_at from league_support_cases where player_id = $1 order by created_at desc limit 20`, [playerId])
	const audit = await q.query<{ at: Date; action: string; actor: string; reason: string | null }>(
		`select at, action, actor, reason from league_audit_log where subject = $1 or subject = $2 order by at desc limit 20`,
		[`player:${playerId}`, summary.legacyState ? `legacy:${summary.handle.toLowerCase()}` : `player:${playerId}`]
	)
	return {
		...summary,
		entries: Number(counts.rows[0].entries),
		gradedEntries: Number(counts.rows[0].graded),
		activeSessions: Number(sessions.rows[0].n),
		cases: cases.rows.map((c) => ({ id: c.id, kind: c.kind, status: c.status, createdAt: new Date(c.created_at).toISOString() })),
		recentAudit: audit.rows.map((a) => ({ at: new Date(a.at).toISOString(), action: a.action, actor: a.actor, reason: a.reason })),
	}
}

async function searchByPlayerId(q: Queryable, admin: AdminContext, playerId: string): Promise<MemberSummary[]> {
	const h = await q.query<{ handle: string }>(`select handle from league_players where id = $1`, [playerId])
	const rows = await searchMembers(q, admin, h.rows[0].handle, 100)
	return rows.filter((r) => r.playerId === playerId)
}

type PlayerRow = { id: string; handle: string; user_id: string | null; disabled_at: Date | null }

async function lockPlayer(q: Queryable, playerId: string): Promise<PlayerRow> {
	const r = await q.query<PlayerRow>(`select id, handle, user_id, disabled_at from league_players where id = $1 for update`, [playerId])
	if (r.rows.length === 0) throw new Error("player not found")
	return r.rows[0]
}

const revokeAll = (q: Queryable, userId: string) => q.query(`delete from "session" where "userId" = $1`, [userId])

/** Disable an account: it disappears from the boards, cannot sign in, and every session ends. A reason is mandatory. */
export async function disablePlayer(db: Db, admin: AdminContext, playerId: string, reason: string, now: number): Promise<{ ok: true; noop: boolean }> {
	return db.tx(async (q) => {
		const p = await lockPlayer(q, playerId)
		if (p.disabled_at) return { ok: true, noop: true } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "account.disable", subject: `player:${playerId}`, before: { disabled: false }, after: { disabled: true }, reason }, now)
		await q.query(`update league_players set disabled_at = $2::timestamptz, disabled_reason = $3 where id = $1`, [playerId, new Date(now).toISOString(), reason.trim()])
		if (p.user_id) await revokeAll(q, p.user_id)
		return { ok: true, noop: false } as const
	})
}

export async function restorePlayer(db: Db, admin: AdminContext, playerId: string, reason: string, now: number): Promise<{ ok: true; noop: boolean }> {
	return db.tx(async (q) => {
		const p = await lockPlayer(q, playerId)
		if (!p.disabled_at) return { ok: true, noop: true } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "account.restore", subject: `player:${playerId}`, before: { disabled: true }, after: { disabled: false }, reason }, now)
		await q.query(`update league_players set disabled_at = null, disabled_reason = null where id = $1`, [playerId])
		return { ok: true, noop: false } as const
	})
}

/** End every session for an account, for example after a suspected compromise. */
export async function revokeSessions(db: Db, admin: AdminContext, playerId: string, reason: string, now: number): Promise<{ ok: true; revoked: number }> {
	return db.tx(async (q) => {
		const p = await lockPlayer(q, playerId)
		if (!p.user_id) return { ok: true, revoked: 0 } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "account.sessions.revoke", subject: `player:${playerId}`, before: null, after: { revoked: true }, reason }, now)
		const r = await revokeAll(q, p.user_id)
		return { ok: true, revoked: r.rowCount ?? 0 } as const
	})
}

/**
 * Send the owner a password reset at their verified address. The admin never sees or sets a password. `requestReset`
 * is the auth library's reset-request call; it emails a one-hour, single-use link.
 */
export async function sendResetLink(db: Db, admin: AdminContext, playerId: string, requestReset: (email: string) => Promise<void>, now: number): Promise<{ ok: true } | { ok: false; message: string }> {
	const r = await db.query<{ email: string; verified: boolean }>(`select u.email, u."emailVerified" as verified from league_players p join "user" u on u.id = p.user_id where p.id = $1`, [playerId])
	const u = r.rows[0]
	if (!u || !u.verified) return { ok: false, message: "This player has no verified email to send a reset link to" }
	await db.tx((q) => mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "account.password_reset.request", subject: `player:${playerId}`, before: null, after: { sent: true } }, now))
	await requestReset(u.email)
	return { ok: true }
}

/** Undo a legacy claim (wrong person, mistake). The old key works again. The reason is mandatory and audited. */
export async function rollbackClaim(db: Db, admin: AdminContext, handleLower: string, reason: string, now: number): Promise<{ ok: true; noop: boolean } | { ok: false; message: string }> {
	return db.tx(async (q) => {
		const r = await q.query<{ handle_lower: string; player_id: string; state: "unclaimed" | "claiming" | "claimed" | "retired"; token_hash: string | null; pending_user_id: string | null; expires_at: Date | null; claimed_by: string | null; claimed_at: Date | null }>(
			`select * from league_legacy_identities where handle_lower = $1 for update`,
			[handleLower]
		)
		const row = r.rows[0]
		if (!row) return { ok: false, message: "No such legacy player" } as const
		const out = reduceClaim(
			{ handleLower: row.handle_lower, state: row.state, tokenHash: row.token_hash, pendingUserId: row.pending_user_id, expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null, claimedBy: row.claimed_by, claimedAt: row.claimed_at ? new Date(row.claimed_at).getTime() : null },
			{ type: "rollback", actor: admin.userId, reason, now }
		)
		if (!out.ok) return { ok: false, message: "A written reason (at least 10 characters) is required" } as const
		if (out.noop) return { ok: true, noop: true } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "legacy.claim.rollback", subject: `legacy:${handleLower}`, before: { state: row.state, claimedBy: row.claimed_by }, after: { state: "unclaimed" }, reason }, now)
		await q.query(`update league_legacy_identities set state = 'unclaimed', token_hash = null, pending_user_id = null, expires_at = null, claimed_by = null, claimed_at = null where handle_lower = $1`, [handleLower])
		await q.query(`update league_players set user_id = null where id = $1`, [row.player_id])
		// The account that held the player loses its sessions; the account itself (email and password) is untouched.
		if (row.claimed_by) await revokeAll(q, row.claimed_by)
		return { ok: true, noop: false } as const
	})
}

export type ReviewInput = { handleLower: string; claimantUserId: string; evidence: EvidenceKind[]; notes: string }

/**
 * Hand a legacy player to an account that has no key, after review. The claimant must be a verified account whose
 * provisional player (created when they verified) has no entries at all; that empty player is removed and the legacy
 * player, with all its history, is linked to the account. Needs two kinds of independent evidence and a reviewer who
 * is not the claimant. Nothing is transferred on a handle match or an email match alone.
 */
export async function linkLegacyByReview(db: Db, admin: AdminContext, a: ReviewInput, now: number): Promise<{ ok: true } | { ok: false; message: string }> {
	const review: ManualReview = { evidence: a.evidence, notes: a.notes, reviewer: admin.userId }
	const enough = manualReviewSufficient(review, a.claimantUserId)
	if (!enough.ok) return { ok: false, message: enough.reason }
	return db.tx(async (q) => {
		const leg = await q.query<{ player_id: string; state: string }>(`select player_id, state from league_legacy_identities where handle_lower = $1 for update`, [a.handleLower])
		if (leg.rows.length === 0) return { ok: false, message: "No such legacy player" } as const
		if (leg.rows[0].state === "claimed" || leg.rows[0].state === "retired") return { ok: false, message: "This player already belongs to an account" } as const
		const user = await q.query<{ id: string; verified: boolean }>(`select id, "emailVerified" as verified from "user" where id = $1`, [a.claimantUserId])
		if (!user.rows[0] || !user.rows[0].verified) return { ok: false, message: "The claimant needs a verified account" } as const
		const prov = await q.query<{ id: string }>(`select id from league_players where user_id = $1 for update`, [a.claimantUserId])
		if (prov.rows.length > 0) {
			const used = await q.query(`select 1 from league_entries where player_id = $1 limit 1`, [prov.rows[0].id])
			if (used.rows.length > 0) return { ok: false, message: "The claimant's account already has picks. Resolve this as a duplicate-account case instead." } as const
			await q.query(`delete from league_players where id = $1`, [prov.rows[0].id])
		}
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "legacy.manual_review", subject: `legacy:${a.handleLower}`, before: { state: leg.rows[0].state }, after: { state: "claimed", claimedBy: a.claimantUserId, evidence: a.evidence }, reason: a.notes }, now)
		await q.query(
			`update league_legacy_identities set state = 'claimed', token_hash = null, pending_user_id = null, expires_at = null, claimed_by = $2, claimed_at = $3::timestamptz where handle_lower = $1`,
			[a.handleLower, a.claimantUserId, new Date(now).toISOString()]
		)
		await q.query(`update league_players set user_id = $1 where id = $2 and user_id is null`, [a.claimantUserId, leg.rows[0].player_id])
		return { ok: true } as const
	})
}
