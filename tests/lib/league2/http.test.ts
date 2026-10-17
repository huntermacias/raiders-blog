import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { getRuntime, resetRuntimeForTests } from "../../../lib/league2/auth/server"
import { admin, claimRegister, claimStart, handle, me, register } from "../../../lib/league2/http/handlers"
import { memoryMailer } from "../../../lib/league2/mail"
import { generateKey, hashKey } from "../../../lib/league.server"

const BASE = "http://localhost:3000"
const post = (fn: (r: Request) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
	fn(new Request(`${BASE}/x`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers }, body: JSON.stringify(body) }))

describe("account routes are off by default", () => {
	beforeEach(() => {
		delete process.env.LEAGUE_ACCOUNTS
		resetRuntimeForTests()
	})
	it("answers 404 everywhere and touches nothing", async () => {
		for (const fn of [register, claimStart, claimRegister, handle, admin]) expect((await post(fn, {})).status).toBe(404)
		expect((await me(new Request(`${BASE}/me`))).status).toBe(404)
	})
	it("stays off if the secret is too short", () => {
		process.env.LEAGUE_ACCOUNTS = "on"
		process.env.BETTER_AUTH_SECRET = "short"
		process.env.LEAGUE_DATABASE_URL = "postgresql://x@localhost/none_test"
		resetRuntimeForTests()
		expect(getRuntime()).toBeNull()
		delete process.env.LEAGUE_ACCOUNTS
		delete process.env.LEAGUE_DATABASE_URL
		resetRuntimeForTests()
	})
})

const TEST_PG = process.env.LEAGUE_TEST_PG
;(TEST_PG ? describe : describe.skip)("account routes against a real database", () => {
	let pool: Pool
	const saved = { ...process.env }
	const mail = () => (getRuntime()!.mailer as ReturnType<typeof memoryMailer>).sent
	const linkOf = (m: { text: string }) => (m.text.match(/https?:\/\/\S+/) as RegExpMatchArray)[0]
	const verify = async () => {
		const u = new URL(linkOf(mail()[mail().length - 1]))
		return getRuntime()!.auth.handler(new Request(u.toString(), { headers: { Origin: BASE, "x-forwarded-for": "203.0.113.9" } }))
	}
	const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,]+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ")
	const signIn = (email: string, password: string) => getRuntime()!.auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json", "x-forwarded-for": "198.51.100.5" }, body: JSON.stringify({ email, password }) }))

	beforeAll(() => {
		if (!/test/i.test(TEST_PG as string)) throw new Error("LEAGUE_TEST_PG must point at a database with 'test' in its name")
		pool = new Pool({ connectionString: TEST_PG })
	})
	afterAll(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
		await pool.end()
		process.env = saved
	})
	beforeEach(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
		process.env.LEAGUE_ACCOUNTS = "on"
		process.env.BETTER_AUTH_SECRET = "s".repeat(48)
		process.env.LEAGUE_DATABASE_URL = TEST_PG
		process.env.BETTER_AUTH_URL = BASE
		process.env.LEAGUE_ADMIN_EMAILS = "boss@example.com"
		delete process.env.RESEND_API_KEY
		resetRuntimeForTests()
	})
	afterEach(() => resetRuntimeForTests())

	it("registers, confirms by email, and /me then shows the player", async () => {
		const r = await post(register, { handle: "SilverFan", email: "fan@example.com", password: "a long silver sentence" })
		expect(r.status).toBe(200)
		expect(mail().length).toBe(1)
		await verify()
		const s = await signIn("fan@example.com", "a long silver sentence")
		expect(s.status).toBe(200)
		const who = await (await me(new Request(`${BASE}/me`, { headers: { cookie: cookieOf(s) } }))).json()
		expect(who).toMatchObject({ signedIn: true, player: { handle: "SilverFan" }, needsHandle: false, admin: false })
		expect((await (await me(new Request(`${BASE}/me`))).json()).signedIn).toBe(false)
	})

	it("refuses other sites, a missing origin, weak passwords and bad addresses", async () => {
		const ok = { handle: "SilverFan", email: "fan@example.com", password: "a long silver sentence" }
		expect((await post(register, ok, { Origin: "https://evil.example" })).status).toBe(403)
		expect((await register(new Request(`${BASE}/x`, { method: "POST", body: JSON.stringify(ok) }))).status).toBe(403)
		expect((await post(register, { ...ok, password: "password1234" })).status).toBe(400)
		expect((await post(register, { ...ok, email: "nope" })).status).toBe(400)
		expect((await register(new Request(`${BASE}/x`, { method: "GET", headers: { Origin: BASE } }))).status).toBe(405)
		expect(mail().length).toBe(0)
	})

	it("gives the same answer whether or not the email already has an account", async () => {
		const a = await post(register, { handle: "FanOne", email: "same@example.com", password: "a long silver sentence" })
		await verify()
		const b = await post(register, { handle: "FanTwo", email: "same@example.com", password: "another long sentence" })
		expect(b.status).toBe(a.status)
		expect(await b.json()).toEqual(await a.json())
		expect(mail()[mail().length - 1].to).toBe("same@example.com") // the owner is told, the visitor is not
	})

	it("says a taken handle is taken, and rate-limits sign-ups from one address", async () => {
		await post(register, { handle: "FanOne", email: "one@example.com", password: "a long silver sentence" })
		await verify()
		const taken = await post(register, { handle: "fanone", email: "two@example.com", password: "a long silver sentence" })
		expect(taken.status).toBe(409)
		let last = 0
		for (let i = 0; i < 12; i++) last = (await post(register, { handle: `Fan${i}x`, email: `f${i}@example.com`, password: "a long silver sentence" }, { "x-forwarded-for": "192.0.2.1" })).status
		expect(last).toBe(429)
	})

	it("upgrades a legacy player over HTTP and keeps the history", async () => {
		const key = generateKey()
		const p = await pool.query(`insert into league_players (handle, legacy_handle_lower) values ('OldTimer', 'oldtimer') returning id`)
		await pool.query(`insert into league_legacy_identities (handle_lower, player_id, key_hash, source_doc_id) values ('oldtimer', $1, $2, 'leaguePlayer.oldtimer')`, [p.rows[0].id, hashKey(key)])
		const bad = await post(claimStart, { handle: "OldTimer", key: "RR-WRONG" })
		expect(bad.status).toBe(400)
		expect((await post(claimStart, { handle: "nobody", key: "RR-WRONG" })).status).toBe(400)
		const start = await (await post(claimStart, { handle: "OldTimer", key })).json()
		expect(start.ok).toBe(true)
		const reg = await post(claimRegister, { token: start.token, email: "old@example.com", password: "my upgraded passphrase" })
		expect(reg.status).toBe(200)
		await verify()
		const s = await signIn("old@example.com", "my upgraded passphrase")
		expect(s.status).toBe(200)
		const who = await (await me(new Request(`${BASE}/me`, { headers: { cookie: cookieOf(s) } }))).json()
		expect(who.player).toMatchObject({ id: p.rows[0].id, handle: "OldTimer" })
		// The key no longer opens anything.
		expect((await post(claimStart, { handle: "OldTimer", key })).status).toBe(409)
		expect((await post(claimRegister, { token: start.token, email: "x@example.com", password: "my upgraded passphrase" })).status).toBe(400)
	})

	it("admin routes hide from everyone but a verified, allow-listed, table-listed admin", async () => {
		await post(register, { handle: "BossMan", email: "boss@example.com", password: "a long silver sentence" })
		await verify()
		await post(register, { handle: "Regular", email: "reg@example.com", password: "a long silver sentence" })
		await verify()
		const boss = cookieOf(await signIn("boss@example.com", "a long silver sentence"))
		const reg = cookieOf(await signIn("reg@example.com", "a long silver sentence"))
		const call = (cookie: string, b: unknown) => post(admin, b, cookie ? { cookie } : {})

		expect((await call("", { action: "search", query: "reg" })).status).toBe(404)
		expect((await call(reg, { action: "search", query: "reg" })).status).toBe(404)
		// On the allow-list but not in the table: still hidden.
		expect((await call(boss, { action: "search", query: "reg" })).status).toBe(404)
		const uid = (await pool.query(`select id from "user" where email='boss@example.com'`)).rows[0].id
		await pool.query(`insert into league_admins (user_id, added_by) values ($1, 'seeded by hand')`, [uid])
		const found = await (await call(boss, { action: "search", query: "reg" })).json()
		expect(found.members.map((m: { handle: string }) => m.handle)).toEqual(["Regular"])
		expect(JSON.stringify(found)).not.toContain("reg@example.com") // masked
		expect((await call(boss, { action: "nonsense" })).status).toBe(400)

		const pid = found.members[0].playerId
		expect((await call(boss, { action: "disable", playerId: pid, reason: "short" })).status).toBe(400)
		expect((await call(boss, { action: "disable", playerId: pid, reason: "repeated abuse reports, case 14" })).status).toBe(200)
		expect((await signIn("reg@example.com", "a long silver sentence")).status).toBeGreaterThanOrEqual(400)
		expect((await pool.query(`select actor, reason from league_audit_log where action = 'account.disable'`)).rows).toEqual([{ actor: uid, reason: "repeated abuse reports, case 14" }])
	})
})
