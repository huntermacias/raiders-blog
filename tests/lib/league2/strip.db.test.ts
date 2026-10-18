// The strip and "make this my team" routes: who gets what, what is refused, and that only the favorite team is touched.
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { RawExport } from "../../../lib/league2/backfill"
import { getRuntime, resetRuntimeForTests } from "../../../lib/league2/auth/server"
import { favoriteTeam, register, strip } from "../../../lib/league2/http/handlers"
import { submitPick } from "../../../lib/league2/services/picks"
import { syncBtbFromFeed } from "../../../lib/league2/services/sync"

const BASE = "http://localhost:3000"
const TEST_PG = process.env.LEAGUE_TEST_PG
const TABLES = `league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_upset_lines, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user"`
const DAY = 86_400_000

const send = (fn: (r: Request) => Promise<Response>, body: unknown, cookie = "", origin = BASE) =>
	fn(new Request(`${BASE}/x`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }))
const read = (cookie = "") => strip(new Request(`${BASE}/api/league/account/strip`, { headers: { "x-forwarded-for": "203.0.113.9", ...(cookie ? { cookie } : {}) } }))

;(TEST_PG ? describe : describe.skip)("the strip and the favorite-team route", () => {
	let pool: Pool
	const saved = { ...process.env }
	let cookie = ""

	const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,]+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ")
	async function account(handle: string, email: string): Promise<string> {
		const rt = getRuntime()!
		await send(register, { handle, email, password: "a long silver sentence" })
		const mail = (rt.mailer as unknown as { sent: { text: string }[] }).sent
		const link = (mail[mail.length - 1].text.match(/https?:\/\/\S+/) as RegExpMatchArray)[0]
		await rt.auth.handler(new Request(link, { headers: { Origin: BASE, "x-forwarded-for": "203.0.113.9" } }))
		const s = await rt.auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json", "x-forwarded-for": "198.51.100.5" }, body: JSON.stringify({ email, password: "a long silver sentence" }) }))
		return cookieOf(s)
	}
	const team = async (handle = "PickFan") => (await pool.query<{ t: string | null }>(`select favorite_team t from league_players where handle = $1`, [handle])).rows[0].t

	beforeAll(() => {
		if (!/test/i.test(TEST_PG as string)) throw new Error("LEAGUE_TEST_PG must point at a database with 'test' in its name")
		pool = new Pool({ connectionString: TEST_PG })
	})
	afterAll(async () => {
		await pool.query(`truncate ${TABLES} restart identity cascade`)
		await pool.end()
		process.env = saved
	})
	beforeEach(async () => {
		await pool.query(`truncate ${TABLES} restart identity cascade`)
		Object.assign(process.env, { LEAGUE_ACCOUNTS: "on", BETTER_AUTH_SECRET: "s".repeat(48), LEAGUE_DATABASE_URL: TEST_PG, BETTER_AUTH_URL: BASE, LEAGUE_ADMIN_EMAILS: "boss@example.com", LEAGUE_SEASON: "2026" })
		delete process.env.RESEND_API_KEY
		resetRuntimeForTests()
		cookie = await account("PickFan", "fan@example.com")
	})
	afterEach(() => resetRuntimeForTests())

	it("says nothing about accounts to a visitor, and does not touch the database to do it", async () => {
		const r = await read()
		expect(r.status).toBe(200)
		expect(await r.json()).toEqual({ signedIn: false })
		expect(r.headers.get("cache-control")).toBe("no-store")
		expect(await (await read("better-auth.session_token=forged.value")).json()).toEqual({ signedIn: false })
		expect((await pool.query(`select count(*)::int n from league_rate_limits where key like 'http:strip:%'`)).rows[0].n).toBe(1)
	})

	it("answers 404 while accounts are off, and refuses anything but GET", async () => {
		expect((await strip(new Request(`${BASE}/s`, { method: "POST" }))).status).toBe(405)
		delete process.env.LEAGUE_ACCOUNTS
		resetRuntimeForTests()
		expect((await read()).status).toBe(404)
		expect((await send(favoriteTeam, { favoriteTeam: "KC" })).status).toBe(404)
	})

	it("tells a signed-in player their handle and team, and nothing about the picks when there is no League season yet", async () => {
		await pool.query(`update league_players set favorite_team = 'KC' where handle = 'PickFan'`)
		const body = await (await read(cookie)).json()
		expect(body).toEqual({ signedIn: true, handle: "PickFan", favoriteTeam: "KC", next: null, rank: null })
	})

	describe("with a season on the books", () => {
		const feed = (): RawExport => ({
			games: [
				{ _id: "g1", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 1, awayTeam: "Las Vegas Raiders", homeTeam: "New England Patriots", kickoff: new Date(Date.now() - 14 * DAY).toISOString(), predictedAwayScore: 24, predictedHomeScore: 20, actualAwayScore: 27, actualHomeScore: 17 },
				{ _id: "g2", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 6, awayTeam: "Kansas City Chiefs", homeTeam: "Las Vegas Raiders", kickoff: new Date(Date.now() + 3 * DAY).toISOString(), predictedAwayScore: 27, predictedHomeScore: 21, actualAwayScore: null, actualHomeScore: null },
			],
			players: [],
			picks: [],
		})
		beforeEach(async () => {
			const rt = getRuntime()!
			await syncBtbFromFeed(rt.db, feed(), 2026, Date.now())
		})

		it("says what to do next, then that the picks are in", async () => {
			const a = await (await read(cookie)).json()
			expect(a.next).toMatchObject({ kind: "pick" })
			expect(a.next.title).toMatch(/Chiefs/)
			expect(a.rank).toBeNull()
			const rt = getRuntime()!
			const player = (await pool.query<{ id: string }>(`select id from league_players where handle = 'PickFan'`)).rows[0].id
			const g2 = (await pool.query<{ id: string }>(`select id from league_events where legacy_prediction_id = 'g2'`)).rows[0].id
			expect(await submitPick(rt.db, { competitionId: "btb-2026", playerId: player, eventId: g2, payload: { away: 20, home: 24 }, now: Date.now() })).toMatchObject({ ok: true })
			const b = await (await read(cookie)).json()
			expect(b.next).toMatchObject({ kind: "all_set" })
			expect(typeof b.next.lockAt).toBe("string")
		})
	})

	it("saves just the favorite team, leaves the privacy settings alone, and can clear it", async () => {
		await pool.query(`update league_players set show_profile = false, show_history = false where handle = 'PickFan'`)
		const r = await send(favoriteTeam, { favoriteTeam: "LV" }, cookie)
		expect(r.status).toBe(200)
		expect(await r.json()).toEqual({ ok: true, favoriteTeam: "LV" })
		expect(await team()).toBe("LV")
		expect((await pool.query(`select show_profile, show_history from league_players where handle = 'PickFan'`)).rows[0]).toEqual({ show_profile: false, show_history: false })
		expect((await (await read(cookie)).json()).favoriteTeam).toBe("LV")
		expect((await send(favoriteTeam, { favoriteTeam: null }, cookie)).status).toBe(200)
		expect(await team()).toBeNull()
	})

	it("refuses a made-up team, a visitor, another site and a missing origin, and changes nothing", async () => {
		await pool.query(`update league_players set favorite_team = 'DEN' where handle = 'PickFan'`)
		for (const bad of ["XX", "kc", 5, { a: 1 }, ["KC"]]) expect((await send(favoriteTeam, { favoriteTeam: bad }, cookie)).status).toBe(400)
		expect((await send(favoriteTeam, { favoriteTeam: "KC" })).status).toBe(401)
		expect((await send(favoriteTeam, { favoriteTeam: "KC" }, cookie, "https://evil.example")).status).toBe(403)
		expect((await favoriteTeam(new Request(`${BASE}/x`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ favoriteTeam: "KC" }) }))).status).toBe(403)
		expect(await team()).toBe("DEN")
	})

	it("only ever changes the signed-in player's own row", async () => {
		const other = await account("OtherFan", "other@example.com")
		await send(favoriteTeam, { favoriteTeam: "GB" }, other)
		await send(favoriteTeam, { favoriteTeam: "KC" }, cookie)
		expect(await team("OtherFan")).toBe("GB")
		expect(await team("PickFan")).toBe("KC")
	})
})
