// HTTP handlers for League accounts. Route files only wrap these. Every handler answers 404 while accounts are off,
// checks the request came from this site, and rate-limits by address before doing any work.

import { siteUrl, getRuntime, type Runtime } from "../auth/server"
import { bindClaim, chooseHandle, finalizeVerifiedUser, peekClaim, reserveHandle, startClaim } from "../services/accounts"
import { disablePlayer, linkLegacyByReview, memberDetail, requireAdmin, restorePlayer, revokeSessions, rollbackClaim, searchMembers, sendResetLink } from "../services/admin"
import { checkPassword, normalizeEmail } from "../services/passwords"
import { allow } from "../services/ratelimit"
import { STRONG_EVIDENCE, type EvidenceKind } from "../domain/legacyClaim"

const NO_STORE = { "Cache-Control": "no-store" }

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...NO_STORE } })
}
const notFound = () => new Response("Not found", { status: 404, headers: NO_STORE })
const fail = (status: number, message: string, code?: string) => json({ ok: false, message, code }, status)

export function allowedOrigins(): string[] {
	return Array.from(new Set([siteUrl(), "https://www.raidersrundown.com", "https://raidersrundown.com"]))
}

/** A state-changing request must name this site as its origin (or referrer). */
export function sameSite(req: Request): boolean {
	const origin = req.headers.get("origin") || ""
	const from = origin || (req.headers.get("referer") ? new URL(req.headers.get("referer") as string, "http://x").origin : "")
	return from !== "" && from !== "null" && allowedOrigins().indexOf(from) >= 0
}

export function clientIp(req: Request): string {
	const h = req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-forwarded-for") || ""
	return h.split(",")[0].trim().slice(0, 64) || "unknown"
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
	try {
		const text = await req.text()
		if (text.length > 8_000) return null
		const v = JSON.parse(text)
		return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
	} catch {
		return null
	}
}

type Gate = { rt: Runtime; data: Record<string, unknown> } | Response

/** Common front door for POST handlers. */
async function gate(req: Request, limit: { name: string; max: number; windowMs: number }): Promise<Gate> {
	const rt = getRuntime()
	if (!rt) return notFound()
	if (req.method !== "POST") return fail(405, "Method not allowed")
	if (!sameSite(req)) return fail(403, "Request not allowed")
	if (!(await allow(rt.db, `http:${limit.name}:${clientIp(req)}`, limit.max, limit.windowMs))) return fail(429, "Too many attempts. Try again later.")
	const data = await body(req)
	if (!data) return fail(400, "Invalid request")
	return { rt, data }
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "")

async function signUp(rt: Runtime, req: Request, a: { name: string; email: string; password: string }): Promise<{ userId: string | null }> {
	try {
		const r = await rt.auth.api.signUpEmail({ body: { name: a.name, email: a.email, password: a.password }, headers: req.headers })
		return { userId: r?.user?.id ?? null }
	} catch (e) {
		// Do not distinguish failures the visitor could use to probe for accounts.
		console.log("league: sign-up failed:", (e as Error).message)
		return { userId: null }
	}
}

const CHECK_EMAIL = "Check your email to finish creating your account."

/** New account: reserve the handle, create the unverified account, send the confirmation email. */
export async function register(req: Request): Promise<Response> {
	const g = await gate(req, { name: "register", max: 10, windowMs: 60 * 60_000 })
	if (g instanceof Response) return g
	const { rt, data } = g
	const email = normalizeEmail(data.email)
	if (!email) return fail(400, "Enter a valid email address")
	const pw = checkPassword(data.password, { handle: str(data.handle), email })
	if (pw) return fail(400, pw, "weak_password")
	const reserved = await reserveHandle(rt.db, { handle: data.handle, email, now: Date.now() })
	if (!reserved.ok) return fail(reserved.code === "taken" ? 409 : 400, reserved.message, reserved.code)
	await signUp(rt, req, { name: reserved.handle, email, password: data.password as string })
	return json({ ok: true, message: CHECK_EMAIL })
}

/** Step 1 of upgrading a legacy player: handle plus recovery key. */
export async function claimStart(req: Request): Promise<Response> {
	const g = await gate(req, { name: "claim-start", max: 8, windowMs: 15 * 60_000 })
	if (g instanceof Response) return g
	const { rt, data } = g
	const handleKey = str(data.handle, 40).trim().toLowerCase()
	if (!(await allow(rt.db, `http:claim-handle:${handleKey}`, 10, 60 * 60_000))) return fail(429, "Too many attempts. Try again later.")
	const r = await startClaim(rt.db, { handle: data.handle, key: data.key, now: Date.now() })
	if (!r.ok) {
		return r.code === "already_claimed"
			? fail(409, "This player already has an account. Sign in with your email.", "already_claimed")
			: fail(400, "That handle and recovery key do not match.", "invalid")
	}
	return json({ ok: true, token: r.token, handle: r.handle })
}

/** Step 2: create the account that will take the legacy player over once its email is confirmed. */
export async function claimRegister(req: Request): Promise<Response> {
	const g = await gate(req, { name: "claim-register", max: 8, windowMs: 60 * 60_000 })
	if (g instanceof Response) return g
	const { rt, data } = g
	const claim = await peekClaim(rt.db, data.token, Date.now())
	if (!claim) return fail(400, "This upgrade link has expired. Start again with your recovery key.", "expired")
	const email = normalizeEmail(data.email)
	if (!email) return fail(400, "Enter a valid email address")
	const pw = checkPassword(data.password, { handle: claim.handle, email })
	if (pw) return fail(400, pw, "weak_password")
	const { userId } = await signUp(rt, req, { name: claim.handle, email, password: data.password as string })
	if (userId) {
		const bound = await bindClaim(rt.db, { token: data.token, userId, now: Date.now() })
		if (!bound.ok) return fail(400, "This upgrade link has expired. Start again with your recovery key.", bound.code)
	}
	return json({ ok: true, message: CHECK_EMAIL })
}

async function currentUser(rt: Runtime, req: Request) {
	const s = await rt.auth.api.getSession({ headers: req.headers })
	return s?.user ? { id: s.user.id, email: s.user.email, emailVerified: Boolean(s.user.emailVerified), name: s.user.name } : null
}

/** Who am I? Finishes setup for a verified account that has no player yet. */
export async function me(req: Request): Promise<Response> {
	const rt = getRuntime()
	if (!rt) return notFound()
	const user = await currentUser(rt, req)
	if (!user) return json({ signedIn: false })
	let player = (await rt.db.query<{ id: string; handle: string }>(`select id, handle from league_players where user_id = $1 and disabled_at is null`, [user.id])).rows[0]
	if (!player && user.emailVerified) {
		await finalizeVerifiedUser(rt.db, user, Date.now())
		player = (await rt.db.query<{ id: string; handle: string }>(`select id, handle from league_players where user_id = $1 and disabled_at is null`, [user.id])).rows[0]
	}
	const admin = Boolean(await requireAdmin(rt.db, user, rt.adminEmails))
	return json({ signedIn: true, player: player ? { id: player.id, handle: player.handle } : null, needsHandle: !player, admin })
}

/** A verified account whose handle was taken picks another. */
export async function handle(req: Request): Promise<Response> {
	const g = await gate(req, { name: "handle", max: 20, windowMs: 60 * 60_000 })
	if (g instanceof Response) return g
	const { rt, data } = g
	const user = await currentUser(rt, req)
	if (!user || !user.emailVerified) return fail(401, "Sign in first")
	const r = await chooseHandle(rt.db, user.id, data.handle, Date.now())
	return r.ok ? json({ ok: true, handle: r.handle }) : fail(r.code === "taken" ? 409 : 400, r.message, r.code)
}

/** One door for every admin action. The admin check runs first and is the only thing that mints an AdminContext. */
export async function admin(req: Request): Promise<Response> {
	const g = await gate(req, { name: "admin", max: 120, windowMs: 10 * 60_000 })
	if (g instanceof Response) return g
	const { rt, data } = g
	const user = await currentUser(rt, req)
	const ctx = await requireAdmin(rt.db, user, rt.adminEmails)
	if (!ctx) return notFound() // not even a hint that the area exists
	const now = Date.now()
	const action = str(data.action, 40)
	const reason = str(data.reason, 500)
	const player = str(data.playerId, 64)
	try {
		switch (action) {
			case "search":
				return json({ ok: true, members: await searchMembers(rt.db, ctx, str(data.query, 100)) })
			case "detail": {
				const d = await memberDetail(rt.db, ctx, player)
				return d ? json({ ok: true, member: d }) : fail(404, "No such player")
			}
			case "disable":
				return json(await disablePlayer(rt.db, ctx, player, reason, now))
			case "restore":
				return json(await restorePlayer(rt.db, ctx, player, reason, now))
			case "revoke_sessions":
				return json(await revokeSessions(rt.db, ctx, player, reason, now))
			case "send_reset": {
				const r = await sendResetLink(rt.db, ctx, player, async (email) => {
					await rt.auth.api.requestPasswordReset({ body: { email, redirectTo: `${siteUrl()}/league/reset-password` } })
				}, now)
				return r.ok ? json({ ok: true }) : fail(400, r.message)
			}
			case "rollback_claim": {
				const r = await rollbackClaim(rt.db, ctx, str(data.handleLower, 40), reason, now)
				return r.ok ? json({ ok: true, noop: r.noop }) : fail(400, r.message)
			}
			case "link_legacy": {
				const evidence = (Array.isArray(data.evidence) ? data.evidence : []).filter((e): e is EvidenceKind => typeof e === "string" && (STRONG_EVIDENCE as readonly string[]).indexOf(e) >= 0)
				const r = await linkLegacyByReview(rt.db, ctx, { handleLower: str(data.handleLower, 40), claimantUserId: str(data.claimantUserId, 64), evidence, notes: str(data.notes, 2000) }, now)
				return r.ok ? json({ ok: true }) : fail(400, r.message)
			}
			default:
				return fail(400, "Unknown action")
		}
	} catch (e) {
		// Services throw on a missing reason or a failed audit write; say which, never the SQL.
		const m = (e as Error).message
		return fail(400, /reason|audit/i.test(m) ? m : "Action failed")
	}
}
