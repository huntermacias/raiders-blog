import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { buildAuthOptions } from "../../../lib/league2/auth/options"
import { createLeagueAuth, depsFor, type LeagueAuth } from "../../../lib/league2/auth/server"
import { dbFromPool, type Db } from "../../../lib/league2/db"
import { type Mail, memoryMailer } from "../../../lib/league2/mail"
import { bindClaim, peekClaim, reserveHandle, startClaim } from "../../../lib/league2/services/accounts"
import { generateKey, hashKey } from "../../../lib/league.server"

// Runs the REAL Better Auth against a scratch Postgres with an in-memory mailer. Needs LEAGUE_TEST_PG.
const TEST_PG = process.env.LEAGUE_TEST_PG
const run = TEST_PG ? describe : describe.skip

run("sign-up, verification, sign-in, reset and sessions (real Better Auth)", () => {
	let pool: Pool
	let db: Db
	let auth: LeagueAuth
	let mailer: ReturnType<typeof memoryMailer>
	const BASE = "http://localhost:3000"
	const ORIGIN = { Origin: BASE, "Content-Type": "application/json" }

	beforeAll(() => {
		if (!/test/i.test(TEST_PG as string)) throw new Error("LEAGUE_TEST_PG must point at a database with 'test' in its name")
		pool = new Pool({ connectionString: TEST_PG })
		db = dbFromPool(pool)
	})
	afterAll(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
		await pool.end()
	})
	beforeEach(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
		mailer = memoryMailer()
		auth = createLeagueAuth(depsFor({ pool, secret: "s".repeat(48), baseURL: BASE, production: false, mailer }, db))
	})

	const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
		auth.handler(new Request(`${BASE}/api/auth${path}`, { method: "POST", headers: { ...ORIGIN, "x-forwarded-for": "203.0.113.7", ...headers }, body: JSON.stringify(body) }))
	const get = (path: string, headers: Record<string, string> = {}) => auth.handler(new Request(`${BASE}/api/auth${path}`, { method: "GET", headers: { ...ORIGIN, "x-forwarded-for": "203.0.113.7", ...headers } }))
	const link = (mail: Mail) => (mail.text.match(/https?:\/\/\S+/) as RegExpMatchArray)[0]
	const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,]+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ")

	async function signUp(handle: string, email: string, password = "silver and black sundays") {
		const r = await reserveHandle(db, { handle, email, now: Date.now() })
		if (!r.ok) throw new Error(r.message)
		return post("/sign-up/email", { name: handle, email, password })
	}
	async function verify(): Promise<Response> {
		const mail = mailer.sent[mailer.sent.length - 1]
		return get(new URL(link(mail)).pathname.replace("/api/auth", "") + new URL(link(mail)).search)
	}

	it("registers, blocks sign-in until the email is verified, then creates the player and signs in", async () => {
		const res = await signUp("NewFan", "fan@example.com")
		expect(res.status).toBe(200)
		expect(mailer.sent.length).toBe(1)
		expect(mailer.sent[0].to).toBe("fan@example.com")
		expect(mailer.sent[0].subject).toMatch(/Confirm/)
		// Not signed in, and no player yet.
		expect(res.headers.get("set-cookie") ?? "").not.toContain("session_token")
		expect((await pool.query(`select count(*)::int n from league_players`)).rows[0].n).toBe(0)

		const early = await post("/sign-in/email", { email: "fan@example.com", password: "silver and black sundays" })
		expect(early.status).toBe(403)

		await verify()
		const players = await pool.query(`select handle, user_id is not null as linked from league_players`)
		expect(players.rows).toEqual([{ handle: "NewFan", linked: true }])

		const ok = await post("/sign-in/email", { email: "Fan@Example.com", password: "silver and black sundays" })
		expect(ok.status).toBe(200)
		expect(ok.headers.get("set-cookie")).toMatch(/rr-league\.session_token/)
		const session = await get("/get-session", { Cookie: cookieOf(ok) })
		expect((await session.json()).user.email).toBe("fan@example.com")
	})

	it("stores only a scrypt hash of the password, never the password", async () => {
		await signUp("NewFan", "fan@example.com", "a very private phrase 12345")
		const a = await pool.query(`select password from "account"`)
		expect(a.rows.length).toBe(1)
		expect(a.rows[0].password).not.toContain("a very private phrase")
		expect(a.rows[0].password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
		const dump = JSON.stringify((await pool.query(`select * from "account"`)).rows) + JSON.stringify((await pool.query(`select * from "verification"`)).rows)
		expect(dump).not.toContain("a very private phrase")
	})

	it("answers a duplicate sign-up the same way and tells the real owner by email, not the stranger", async () => {
		await signUp("NewFan", "fan@example.com")
		await verify()
		mailer.sent.length = 0
		const dupe = await signUp("OtherName", "fan@example.com")
		expect(dupe.status).toBe(200)
		const body = await dupe.json()
		expect(JSON.stringify(body)).not.toMatch(/already|exist|taken/i)
		expect(mailer.sent.map((m) => m.subject)).toEqual(["Raiders Rundown League sign-up attempt"])
		expect(mailer.sent[0].to).toBe("fan@example.com")
		expect((await pool.query(`select count(*)::int n from "user"`)).rows[0].n).toBe(1)
	})

	it("rejects a wrong password and an unknown email with the same answer", async () => {
		await signUp("NewFan", "fan@example.com")
		await verify()
		const wrong = await post("/sign-in/email", { email: "fan@example.com", password: "not the password at all" })
		const unknown = await post("/sign-in/email", { email: "nobody@example.com", password: "not the password at all" })
		expect(wrong.status).toBe(401)
		expect(unknown.status).toBe(401)
		expect(await wrong.json()).toEqual(await unknown.json())
	})

	it("limits password guessing against one account even from many addresses", async () => {
		await signUp("NewFan", "fan@example.com")
		await verify()
		const statuses: number[] = []
		for (let i = 0; i < 11; i++) statuses.push((await post("/sign-in/email", { email: "fan@example.com", password: `wrong guess number ${i}` }, { "x-forwarded-for": `198.51.100.${i + 1}` })).status)
		expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true)
		expect(statuses.slice(8).every((s) => s === 429)).toBe(true)
		// The right password is also held off while the account is being hammered.
		expect((await post("/sign-in/email", { email: "fan@example.com", password: "silver and black sundays" }, { "x-forwarded-for": "198.51.100.99" })).status).toBe(429)
	})

	it("limits sign-ups from one address", async () => {
		const codes: number[] = []
		for (let i = 0; i < 8; i++) codes.push((await post("/sign-up/email", { name: `Fan${i}00`, email: `f${i}@example.com`, password: "silver and black sundays" }, { "x-forwarded-for": "192.0.2.50" })).status)
		expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(2)
	})

	it("resets a password with a link that works once, ends every session, and expires", async () => {
		await signUp("NewFan", "fan@example.com")
		await verify()
		const s1 = await post("/sign-in/email", { email: "fan@example.com", password: "silver and black sundays" })
		const cookie = cookieOf(s1)
		mailer.sent.length = 0

		// Asking for a reset reveals nothing about whether the address exists.
		const known = await post("/request-password-reset", { email: "fan@example.com", redirectTo: `${BASE}/league/reset` })
		const unknown = await post("/request-password-reset", { email: "ghost@example.com", redirectTo: `${BASE}/league/reset` })
		expect(known.status).toBe(200)
		expect(await known.json()).toEqual(await unknown.json())
		expect(mailer.sent.length).toBe(1)
		expect(mailer.sent[0].to).toBe("fan@example.com")

		const token = new URL(link(mailer.sent[0])).pathname.split("/").pop() as string
		const done = await post("/reset-password", { newPassword: "a brand new passphrase", token })
		expect(done.status).toBe(200)
		const replay = await post("/reset-password", { newPassword: "another passphrase again", token })
		expect(replay.status).toBeGreaterThanOrEqual(400)

		// The old session is gone; the old password no longer works; the new one does.
		expect(await (await get("/get-session", { Cookie: cookie })).json()).toBeNull()
		expect((await post("/sign-in/email", { email: "fan@example.com", password: "silver and black sundays" }, { "x-forwarded-for": "10.9.9.1" })).status).toBe(401)
		expect((await post("/sign-in/email", { email: "fan@example.com", password: "a brand new passphrase" }, { "x-forwarded-for": "10.9.9.2" })).status).toBe(200)

		// An expired link is refused.
		mailer.sent.length = 0
		await post("/request-password-reset", { email: "fan@example.com", redirectTo: `${BASE}/league/reset` }, { "x-forwarded-for": "10.9.9.3" })
		const t2 = new URL(link(mailer.sent[0])).pathname.split("/").pop() as string
		await pool.query(`update "verification" set "expiresAt" = now() - interval '1 minute'`)
		expect((await post("/reset-password", { newPassword: "yet another passphrase!", token: t2 })).status).toBeGreaterThanOrEqual(400)
	})

	it("ends a session at its expiry and on sign-out", async () => {
		await signUp("NewFan", "fan@example.com")
		await verify()
		const ok = await post("/sign-in/email", { email: "fan@example.com", password: "silver and black sundays" })
		const cookie = cookieOf(ok)
		expect((await (await get("/get-session", { Cookie: cookie })).json()).user).toBeTruthy()
		await pool.query(`update "session" set "expiresAt" = now() - interval '1 second'`)
		expect(await (await get("/get-session", { Cookie: cookie })).json()).toBeNull()

		const again = await post("/sign-in/email", { email: "fan@example.com", password: "silver and black sundays" }, { "x-forwarded-for": "10.1.1.1" })
		const c2 = cookieOf(again)
		expect((await post("/sign-out", {}, { Cookie: c2 })).status).toBe(200)
		expect(await (await get("/get-session", { Cookie: c2 })).json()).toBeNull()
	})

	it("refuses a request from another site", async () => {
		const r = await auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { Origin: "https://evil.example", Cookie: "rr-league.session_token=x", "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.co", password: "whatever password" }) }))
		expect(r.status).toBe(403)
	})

	it("will not start a session for a disabled player", async () => {
		await signUp("NewFan", "fan@example.com")
		await verify()
		await pool.query(`delete from "session"`)
		await pool.query(`update league_players set disabled_at = now(), disabled_reason = 'abuse report 12'`)
		const r = await post("/sign-in/email", { email: "fan@example.com", password: "silver and black sundays" })
		expect(r.status).toBeGreaterThanOrEqual(400)
		expect((await pool.query(`select count(*)::int n from "session"`)).rows[0].n).toBe(0)
	})

	it("upgrades a legacy player end to end: key, new account, email link, history kept", async () => {
		const key = generateKey()
		const p = await pool.query(`insert into league_players (handle, legacy_handle_lower) values ('OldTimer', 'oldtimer') returning id`)
		await pool.query(`insert into league_legacy_identities (handle_lower, player_id, key_hash, source_doc_id) values ('oldtimer', $1, $2, 'leaguePlayer.oldtimer')`, [p.rows[0].id, hashKey(key)])

		const start = await startClaim(db, { handle: "OldTimer", key, now: Date.now() })
		if (!start.ok) throw new Error("expected ok")
		expect(await peekClaim(pool, start.token, Date.now())).toMatchObject({ handle: "OldTimer" })

		const res = await post("/sign-up/email", { name: "OldTimer", email: "old@example.com", password: "my upgraded passphrase" })
		expect(res.status).toBe(200)
		const userId = (await pool.query(`select id from "user" where email = 'old@example.com'`)).rows[0].id
		expect(await bindClaim(db, { token: start.token, userId, now: Date.now() })).toMatchObject({ ok: true })
		expect((await pool.query(`select count(*)::int n from league_players`)).rows[0].n).toBe(1) // nothing created yet

		await verify()
		const row = (await pool.query(`select state, claimed_by from league_legacy_identities`)).rows[0]
		expect(row).toEqual({ state: "claimed", claimed_by: userId })
		expect((await pool.query(`select id, user_id from league_players`)).rows).toEqual([{ id: p.rows[0].id, user_id: userId }])
		const login = await post("/sign-in/email", { email: "old@example.com", password: "my upgraded passphrase" })
		expect(login.status).toBe(200)
	})
})

describe("auth options are safe by construction", () => {
	const opts = buildAuthOptions({ pool: {} as never, secret: "s".repeat(48), baseURL: "https://www.raidersrundown.com", production: true, mailer: memoryMailer(), onEmailVerified: async () => {}, isDisabled: async () => false, allow: async () => true })
	it("requires verified email, hashes with the library default, and limits reset tokens to one hour", () => {
		expect(opts.emailAndPassword).toMatchObject({ enabled: true, requireEmailVerification: true, minPasswordLength: 10, resetPasswordTokenExpiresIn: 3600, revokeSessionsOnPasswordReset: true, autoSignIn: false })
		expect(opts.emailAndPassword?.password).toBeUndefined() // the library's own scrypt, not ours
		expect(opts.emailVerification?.expiresIn).toBe(3600)
	})
	it("stores rate limits in the database, keeps telemetry off, and uses secure cookies in production", () => {
		expect(opts.rateLimit).toMatchObject({ enabled: true, storage: "database" })
		expect(opts.telemetry).toEqual({ enabled: false })
		expect(opts.advanced?.useSecureCookies).toBe(true)
		expect(opts.plugins ?? []).toEqual([]) // no admin plugin, so no impersonation endpoints exist
	})
	it("trusts only this site's origins", () => {
		expect(opts.trustedOrigins).toEqual(["https://www.raidersrundown.com", "https://raidersrundown.com"])
	})
})
