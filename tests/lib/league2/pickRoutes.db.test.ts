// The pick route for the three NFL formats, over HTTP against a real database: who may save what, and what is refused.
import { Pool } from "pg"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { getRuntime, resetRuntimeForTests } from "../../../lib/league2/auth/server"
import { CONFIDENCE_COMPETITION, NFL_COMPETITION, UPSET_COMPETITION } from "../../../lib/league2/competitions"
import { pick, register } from "../../../lib/league2/http/handlers"
import { syncNflFromFeed } from "../../../lib/league2/services/syncNfl"

const BASE = "http://localhost:3000"
const SEASON = Number(process.env.LEAGUE_SEASON) || 2026
const TEST_PG = process.env.LEAGUE_TEST_PG
const TABLES = `league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_upset_lines, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user"`

const send = (fn: (r: Request) => Promise<Response>, body: unknown, cookie = "") =>
	fn(new Request(`${BASE}/x`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }))

;(TEST_PG ? describe : describe.skip)("the pick route for the NFL formats", () => {
	let pool: Pool
	const saved = { ...process.env }
	let cookie = ""
	let ids: string[] = []

	const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,]+=)/).map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ")

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
		Object.assign(process.env, { LEAGUE_ACCOUNTS: "on", BETTER_AUTH_SECRET: "s".repeat(48), LEAGUE_DATABASE_URL: TEST_PG, BETTER_AUTH_URL: BASE, LEAGUE_ADMIN_EMAILS: "boss@example.com" })
		delete process.env.RESEND_API_KEY
		resetRuntimeForTests()
		const rt = getRuntime()!
		// Three games a few days out, in week 7. Ratings make Las Vegas a big underdog at Kansas City and Buffalo a small one.
		const kick = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()
		await syncNflFromFeed(
			rt.db,
			[
				{ id: "t1", week: 7, kickoff: kick(3), home: "KC", away: "LV", homeScore: null, awayScore: null },
				{ id: "t2", week: 7, kickoff: kick(3), home: "BUF", away: "MIA", homeScore: null, awayScore: null },
				{ id: "t3", week: 7, kickoff: kick(4), home: "DEN", away: "LAC", homeScore: null, awayScore: null },
			],
			SEASON,
			Date.now(),
			{ currentWeek: 7, priorRatings: { KC: 1700, LV: 1400, BUF: 1520, MIA: 1500, DEN: 1500, LAC: 1500 } }
		)
		await pool.query(`update league_competitions set enabled = true`)
		ids = (await pool.query<{ id: string }>(`select id from league_events where nfl_game_id in ('t1','t2','t3') order by nfl_game_id`)).rows.map((r) => r.id)

		await send(register, { handle: "PickFan", email: "fan@example.com", password: "a long silver sentence" })
		const mail = (rt.mailer as unknown as { sent: { text: string }[] }).sent
		const link = (mail[mail.length - 1].text.match(/https?:\/\/\S+/) as RegExpMatchArray)[0]
		await rt.auth.handler(new Request(link, { headers: { Origin: BASE, "x-forwarded-for": "203.0.113.9" } }))
		const s = await rt.auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { Origin: BASE, "Content-Type": "application/json", "x-forwarded-for": "198.51.100.5" }, body: JSON.stringify({ email: "fan@example.com", password: "a long silver sentence" }) }))
		cookie = cookieOf(s)
	})
	afterEach(() => resetRuntimeForTests())

	const entries = async (comp: string) => (await pool.query(`select payload from league_entries where competition_id = $1 order by event_id`, [comp])).rows.map((r) => r.payload)

	it("has the three competitions, and the ratings put Las Vegas as the underdog at Kansas City", async () => {
		const c = await pool.query<{ id: string }>(`select id from league_competitions order by id`)
		expect(c.rows.map((r) => r.id)).toEqual([CONFIDENCE_COMPETITION(SEASON), NFL_COMPETITION(SEASON), UPSET_COMPETITION(SEASON)].sort())
		const line = await pool.query(`select underdog from league_upset_lines where event_id = $1`, [ids[0]])
		expect(line.rows[0].underdog).toBe("away")
	})

	it("needs a signed-in player", async () => {
		expect((await send(pick, { competition: "winners", eventId: ids[0], payload: { pick: "home" } })).status).toBe(401)
		expect((await send(pick, { competition: "confidence", items: [] })).status).toBe(401)
	})

	it("saves a game winner", async () => {
		const r = await send(pick, { competition: "winners", eventId: ids[0], payload: { pick: "home" } }, cookie)
		expect(r.status).toBe(200)
		expect(await entries(NFL_COMPETITION(SEASON))).toEqual([{ pick: "home" }])
	})

	it("saves a confidence slate in one request, swaps ranks atomically, and refuses a repeated rank", async () => {
		const slate = (a: number, b: number) => ({ competition: "confidence", items: [{ eventId: ids[0], pick: "home", rank: a }, { eventId: ids[1], pick: "away", rank: b }] })
		const first = await send(pick, slate(3, 1), cookie)
		expect(first.status).toBe(200)
		expect(await first.json()).toMatchObject({ ok: true, saved: 2, changed: 2 })
		expect((await send(pick, slate(1, 3), cookie)).status).toBe(200) // a swap
		expect((await pool.query(`select count(*)::int as n from league_entries where competition_id = $1`, [CONFIDENCE_COMPETITION(SEASON)])).rows[0].n).toBe(2)
		const dup = await send(pick, slate(2, 2), cookie)
		expect(dup.status).toBe(400)
		// The refused slate changed nothing.
		const now = await pool.query(`select payload from league_entries where competition_id = $1 and event_id = $2`, [CONFIDENCE_COMPETITION(SEASON), ids[0]])
		expect(now.rows[0].payload).toEqual({ pick: "home", rank: 1 })
		expect((await send(pick, { competition: "confidence", items: [{ eventId: ids[0], pick: "home", rank: 9 }] }, cookie)).status).toBe(400) // beyond the number of games
		expect((await send(pick, { competition: "confidence", eventId: ids[0], payload: { pick: "home", rank: 1 } }, cookie)).status).toBe(400) // one at a time is not how a slate is saved
	})

	it("lets a player call the underdog, never the favourite, and take a call back", async () => {
		const call = (eventId: string, p: string) => send(pick, { competition: "upset", eventId, payload: { pick: p } }, cookie)
		expect((await call(ids[0], "home")).status).toBe(400) // the favourite
		expect((await call(ids[0], "away")).status).toBe(200)
		expect(await entries(UPSET_COMPETITION(SEASON))).toEqual([{ pick: "away" }])
		expect((await call(ids[0], "none")).status).toBe(200)
		expect(await entries(UPSET_COMPETITION(SEASON))).toEqual([{ pick: "none" }])
	})

	it("stops at the weekly cap, and a taken-back call frees the slot", async () => {
		await pool.query(`update league_competitions set config = '{"maxUpsets": 1}'::jsonb where id = $1`, [UPSET_COMPETITION(SEASON)])
		const lines = await pool.query<{ event_id: string; underdog: string }>(`select event_id, underdog from league_upset_lines order by event_id`)
		const dog = (id: string) => lines.rows.find((l) => l.event_id === id)!.underdog
		const call = (eventId: string, p: string) => send(pick, { competition: "upset", eventId, payload: { pick: p } }, cookie)
		expect((await call(ids[0], dog(ids[0]))).status).toBe(200)
		expect((await call(ids[1], dog(ids[1]))).status).toBe(400)
		expect((await call(ids[0], "none")).status).toBe(200)
		expect((await call(ids[1], dog(ids[1]))).status).toBe(200)
	})

	it("answers 404 for a format an admin has not switched on", async () => {
		await pool.query(`update league_competitions set enabled = false where id = $1`, [CONFIDENCE_COMPETITION(SEASON)])
		const r = await send(pick, { competition: "confidence", items: [{ eventId: ids[0], pick: "home", rank: 1 }] }, cookie)
		expect(r.status).toBe(404)
	})
})
