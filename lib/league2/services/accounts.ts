// Accounts: reserving a handle, finishing a verified sign-up, and the legacy-claim flow.
//
// Every function takes a Db and does its writes in one transaction, so a failure leaves nothing half done.
// Server use only.

import { parseHandle } from "../../league"
import type { Db, Queryable } from "../db"
import { type LegacyClaim, type LegacyState, reduceClaim } from "../domain"
import { hashToken, keyMatches, newToken } from "../legacyKey"
import { mustAudit } from "./audit"

export const CLAIM_BEGIN_TTL_MS = 30 * 60_000
export const CLAIM_BIND_TTL_MS = 2 * 60 * 60_000
export const RESERVATION_TTL_MS = 2 * 60 * 60_000

// --- new players -----------------------------------------------------------------------------------

export type ReserveResult = { ok: true; handle: string; lower: string } | { ok: false; code: "invalid" | "taken"; message: string }

/**
 * Hold a handle for an email address while the sign-up waits for verification. The same address can retry; anyone else
 * is told the handle is taken until the hold expires. A handle that belongs to a player (including a legacy player) is
 * never available.
 */
export async function reserveHandle(db: Db, a: { handle: unknown; email: string; now: number; ttlMs?: number }): Promise<ReserveResult> {
	const h = parseHandle(a.handle)
	if (!h.ok) return { ok: false, code: "invalid", message: h.message }
	const now = new Date(a.now).toISOString()
	const until = new Date(a.now + (a.ttlMs ?? RESERVATION_TTL_MS)).toISOString()
	return db.tx(async (q) => {
		await q.query(`delete from league_handle_reservations where expires_at <= $1::timestamptz`, [now])
		const taken = await q.query(`select 1 from league_players where handle_lower = $1`, [h.lower])
		if (taken.rows.length > 0) return { ok: false, code: "taken", message: "That handle is taken. Try another." } as const
		const r = await q.query(
			`insert into league_handle_reservations (handle_lower, email_lower, expires_at) values ($1, $2, $3::timestamptz)
			 on conflict (handle_lower) do update set expires_at = excluded.expires_at
			 where league_handle_reservations.email_lower = excluded.email_lower
			 returning handle_lower`,
			[h.lower, a.email, until]
		)
		if (r.rows.length === 0) return { ok: false, code: "taken", message: "That handle is taken. Try another." } as const
		return { ok: true, handle: h.handle, lower: h.lower } as const
	})
}

export async function attachReservation(q: Queryable, lower: string, userId: string): Promise<void> {
	await q.query(`update league_handle_reservations set user_id = $2 where handle_lower = $1`, [lower, userId])
}

export type Finalized = "claimed" | "created" | "exists" | "needs_handle"

type ClaimRow = {
	handle_lower: string
	player_id: string
	state: LegacyState
	token_hash: string | null
	pending_user_id: string | null
	expires_at: Date | null
	claimed_by: string | null
	claimed_at: Date | null
}

const toClaim = (r: ClaimRow): LegacyClaim => ({
	handleLower: r.handle_lower,
	state: r.state,
	tokenHash: r.token_hash,
	pendingUserId: r.pending_user_id,
	expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : null,
	claimedBy: r.claimed_by,
	claimedAt: r.claimed_at ? new Date(r.claimed_at).getTime() : null,
})

async function saveClaim(q: Queryable, c: LegacyClaim): Promise<void> {
	await q.query(
		`update league_legacy_identities set state = $2, token_hash = $3, pending_user_id = $4, expires_at = $5, claimed_by = $6, claimed_at = $7 where handle_lower = $1`,
		[c.handleLower, c.state, c.tokenHash, c.pendingUserId, c.expiresAt === null ? null : new Date(c.expiresAt).toISOString(), c.claimedBy, c.claimedAt === null ? null : new Date(c.claimedAt).toISOString()]
	)
}

/**
 * Called once an account's email is verified. Idempotent: running it again changes nothing.
 *  - If a legacy claim is bound to this account, it completes: the account takes over the legacy player, in one
 *    transaction, and the legacy key stops working.
 *  - Otherwise the account becomes a new player under the handle it signed up with, if that handle is still free.
 */
export async function finalizeVerifiedUser(db: Db, user: { id: string; email: string; name: string }, now: number): Promise<Finalized> {
	return db.tx(async (q) => {
		const have = await q.query(`select id from league_players where user_id = $1`, [user.id])
		if (have.rows.length > 0) return "exists"

		const pending = await q.query<ClaimRow>(`select * from league_legacy_identities where pending_user_id = $1 for update`, [user.id])
		if (pending.rows.length > 0) {
			const row = pending.rows[0]
			const out = reduceClaim(toClaim(row), { type: "complete", userId: user.id, now })
			if (out.ok) {
				await saveClaim(q, out.claim)
				const linked = await q.query(`update league_players set user_id = $1 where id = $2 and user_id is null returning id`, [user.id, row.player_id])
				if (linked.rows.length !== 1) throw new Error("legacy player already linked to another account")
				await mustAudit(q, { actor: user.id, actorRole: "player", action: "legacy.claim.complete", subject: `legacy:${row.handle_lower}`, before: { state: row.state }, after: { state: "claimed", playerId: row.player_id } }, now)
				return "claimed"
			}
			// An expired or mismatched claim falls through: the account is just a new sign-up.
		}

		const h = parseHandle(user.name)
		if (!h.ok) return "needs_handle"
		const ins = await q.query(`insert into league_players (user_id, handle) values ($1, $2) on conflict do nothing returning id`, [user.id, h.handle])
		if (ins.rows.length === 0) return "needs_handle"
		await q.query(`delete from league_handle_reservations where handle_lower = $1`, [h.lower])
		await mustAudit(q, { actor: user.id, actorRole: "player", action: "account.verify_email", subject: `player:${ins.rows[0].id}`, before: null, after: { handle: h.handle } }, now)
		return "created"
	})
}

/** For a verified account with no player yet (its handle was taken, or setup was interrupted): pick a handle. */
export async function chooseHandle(db: Db, userId: string, handleRaw: unknown, now: number): Promise<ReserveResult> {
	const h = parseHandle(handleRaw)
	if (!h.ok) return { ok: false, code: "invalid", message: h.message }
	return db.tx(async (q) => {
		const have = await q.query(`select 1 from league_players where user_id = $1`, [userId])
		if (have.rows.length > 0) return { ok: false, code: "invalid", message: "Your account already has a handle" } as const
		const ins = await q.query(`insert into league_players (user_id, handle) values ($1, $2) on conflict do nothing returning id`, [userId, h.handle])
		if (ins.rows.length === 0) return { ok: false, code: "taken", message: "That handle is taken. Try another." } as const
		await mustAudit(q, { actor: userId, actorRole: "player", action: "account.register", subject: `player:${ins.rows[0].id}`, before: null, after: { handle: h.handle } }, now)
		return { ok: true, handle: h.handle, lower: h.lower } as const
	})
}

// --- legacy claims ----------------------------------------------------------------------------------

export type StartClaim = { ok: true; token: string; handle: string } | { ok: false; code: "invalid" | "already_claimed" }

/**
 * Step 1: prove ownership with the legacy handle and recovery key. Wrong handle and wrong key are the same answer.
 * Only a correct key learns whether the player has already upgraded.
 */
export async function startClaim(db: Db, a: { handle: unknown; key: unknown; now: number; token?: string }): Promise<StartClaim> {
	const h = parseHandle(a.handle)
	if (!h.ok) return { ok: false, code: "invalid" }
	return db.tx(async (q) => {
		const found = await q.query<ClaimRow & { key_hash: string; handle: string }>(
			`select i.*, p.handle from league_legacy_identities i join league_players p on p.id = i.player_id where i.handle_lower = $1 for update of i`,
			[h.lower]
		)
		const row = found.rows[0]
		if (!row || !keyMatches(a.key, row.key_hash)) return { ok: false, code: "invalid" } as const
		const token = a.token ?? newToken()
		const out = reduceClaim(toClaim(row), { type: "begin", tokenHash: hashToken(token), now: a.now, ttlMs: CLAIM_BEGIN_TTL_MS })
		if (!out.ok) return { ok: false, code: "already_claimed" } as const
		await saveClaim(q, out.claim)
		await mustAudit(q, { actor: `legacy:${row.handle_lower}`, actorRole: "player", action: "legacy.claim.begin", subject: `legacy:${row.handle_lower}`, before: { state: row.state }, after: { state: "claiming" } }, a.now)
		return { ok: true, token, handle: row.handle } as const
	})
}

/** Is this claim token currently valid? Used before creating the account, without changing anything. */
export async function peekClaim(q: Queryable, token: unknown, now: number): Promise<{ handle: string; handleLower: string } | null> {
	if (typeof token !== "string" || token.length < 20 || token.length > 100) return null
	const r = await q.query<ClaimRow & { handle: string }>(
		`select i.*, p.handle from league_legacy_identities i join league_players p on p.id = i.player_id where i.token_hash = $1 and i.state = 'claiming' and i.expires_at > $2::timestamptz`,
		[hashToken(token), new Date(now).toISOString()]
	)
	return r.rows[0] ? { handle: r.rows[0].handle, handleLower: r.rows[0].handle_lower } : null
}

export type BindResult = { ok: true; handle: string } | { ok: false; code: "bad_token" | "expired" | "bound_to_other" | "already_claimed" | "no_pending_claim" }

/** Step 2: tie the claim to the account just created. Only that account can finish it. */
export async function bindClaim(db: Db, a: { token: unknown; userId: string; now: number }): Promise<BindResult> {
	if (typeof a.token !== "string" || a.token.length < 20 || a.token.length > 100) return { ok: false, code: "bad_token" }
	const tokenHash = hashToken(a.token)
	return db.tx(async (q) => {
		const r = await q.query<ClaimRow & { handle: string }>(
			`select i.*, p.handle from league_legacy_identities i join league_players p on p.id = i.player_id where i.token_hash = $1 for update of i`,
			[tokenHash]
		)
		const row = r.rows[0]
		if (!row) return { ok: false, code: "bad_token" } as const
		const out = reduceClaim(toClaim(row), { type: "bind", tokenHash, userId: a.userId, now: a.now, ttlMs: CLAIM_BIND_TTL_MS })
		if (!out.ok) return { ok: false, code: out.code === "owner_mismatch" || out.code === "reason_required" || out.code === "not_claimed" ? "bad_token" : out.code } as const
		if (!out.noop) {
			await saveClaim(q, out.claim)
			await mustAudit(q, { actor: a.userId, actorRole: "player", action: "legacy.claim.bind", subject: `legacy:${row.handle_lower}`, before: { state: "claiming", pendingUserId: null }, after: { state: "claiming", pendingUserId: a.userId } }, a.now)
		}
		return { ok: true, handle: row.handle } as const
	})
}
