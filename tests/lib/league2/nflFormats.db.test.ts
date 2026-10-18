import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { CONFIDENCE_COMPETITION, NFL_COMPETITION, UPSET_COMPETITION } from "../../../lib/league2/competitions"
import { dbFromPool, type Db } from "../../../lib/league2/db"
import type { AdminContext } from "../../../lib/league2/services/admin"
import { correctResult } from "../../../lib/league2/services/adminLeague"
import { saveConfidenceWeek, submitPick } from "../../../lib/league2/services/picks"
import { type NflFeedGame, syncNflFromFeed } from "../../../lib/league2/services/syncNfl"

const TEST_PG = process.env.LEAGUE_TEST_PG
const T0 = Date.parse("2026-10-14T12:00:00Z")
const ADMIN = { userId: "admin-1" } as unknown as AdminContext
const CONF = CONFIDENCE_COMPETITION(2026)
const UPS = UPSET_COMPETITION(2026)
const ALL = `league_audit_log, league_grades, league_entry_revisions, league_entries, league_upset_lines, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user"`

const PAIRS: [string, string][] = [["BUF", "NYJ"], ["KC", "LV"], ["MIA", "NE"], ["DEN", "LAC"], ["BAL", "PIT"], ["CIN", "CLE"], ["HOU", "IND"]]
// Week 5 is finished (so there are ratings to work from); week 6 is open, one game after another, starting Sunday Oct 18.
const feed = (): NflFeedGame[] => [
	{ id: "w5a", week: 5, kickoff: "2026-10-11T17:00:00Z", home: "KC", away: "DEN", homeScore: 31, awayScore: 10 },
	{ id: "w5b", week: 5, kickoff: "2026-10-11T20:00:00Z", home: "NE", away: "MIA", homeScore: 27, awayScore: 24 },
	...PAIRS.map(([away, home], i) => ({ id: `w6-${i}`, week: 6, kickoff: new Date(Date.parse("2026-10-18T17:00:00Z") + i * 3 * 3_600_000).toISOString(), home, away, homeScore: null, awayScore: null })),
]

;(TEST_PG ? describe : describe.skip)("the confidence and upset formats", () => {
	let pool: Pool
	let db: Db
	let ann: string
	let bob: string
	const ev = async (nfl: string) => (await pool.query(`select id from league_events where nfl_game_id = $1`, [nfl])).rows[0].id as string
	const week6 = async () => Promise.all(PAIRS.map((_, i) => ev(`w6-${i}`)))
	const line = async (nfl: string) => (await pool.query(`select underdog, favourite_win_chance::float as p from league_upset_lines l join league_events e on e.id = l.event_id where e.nfl_game_id = $1`, [nfl])).rows[0] as { underdog: "away" | "home"; p: number }
	const enable = () => pool.query(`update league_competitions set enabled = true`)
	const sync = (g: NflFeedGame[] = feed(), now = T0) => syncNflFromFeed(db, g, 2026, now, { currentWeek: 6, priorRatings: null })
	const conf = (player: string, items: unknown, now = T0) => saveConfidenceWeek(db, { competitionId: CONF, playerId: player, items, now })
	const call = async (player: string, nfl: string, pick: string, now = T0) => submitPick(db, { competitionId: UPS, playerId: player, eventId: await ev(nfl), payload: { pick }, now })

	beforeAll(() => {
		if (!/test/i.test(TEST_PG as string)) throw new Error("LEAGUE_TEST_PG must point at a database with 'test' in its name")
		pool = new Pool({ connectionString: TEST_PG })
		db = dbFromPool(pool)
	})
	afterAll(async () => {
		await pool.query(`truncate ${ALL} restart identity cascade`)
		await pool.end()
	})
	beforeEach(async () => {
		await pool.query(`truncate ${ALL} restart identity cascade`)
		ann = (await pool.query(`insert into league_players (handle, joined_at) values ('Ann', '2026-09-01') returning id`)).rows[0].id
		bob = (await pool.query(`insert into league_players (handle, joined_at) values ('Bobby', '2026-09-02') returning id`)).rows[0].id
	})

	it("creates both competitions switched off, and the upset one with its cap", async () => {
		await sync()
		const r = await pool.query(`select id, kind, policy_family, enabled, config from league_competitions where id in ($1, $2) order by id`, [CONF, UPS])
		expect(r.rows).toEqual([
			{ id: CONF, kind: "confidence", policy_family: "nfl-confidence", enabled: false, config: {} },
			{ id: UPS, kind: "upset", policy_family: "nfl-upset", enabled: false, config: { maxUpsets: 5 } },
		])
		expect((await pool.query(`select kind from league_competitions where id = $1`, [NFL_COMPETITION(2026)])).rows[0].kind).toBe("weekly-winners")
	})

	it("refuses picks while a competition is switched off", async () => {
		await sync()
		expect(await conf(ann, [{ eventId: await ev("w6-0"), pick: "home", rank: 7 }])).toMatchObject({ ok: false, error: "not_found" })
		expect(await call(ann, "w6-0", "away")).toMatchObject({ ok: false, error: "not_found" })
	})

	describe("upset lines", () => {
		it("sets a line for every game of an open week, once, from the finished games", async () => {
			const r = await sync()
			expect(r.linesSet).toBe(7)
			// KC beat DEN by 21 at home, so KC is rated well above DEN and the road team LV is KC's... KC is away at LV here.
			const kc = await line("w6-1")
			expect(["away", "home"]).toContain(kc.underdog)
			expect(kc.p).toBeGreaterThan(0.5)
			expect(kc.p).toBeLessThan(1)
			const again = await sync(feed(), T0 + 60_000)
			expect(again.linesSet).toBe(0)
			expect((await pool.query(`select count(*)::int n from league_upset_lines`)).rows[0].n).toBe(7)
		})
		it("leaves weeks that have not opened, and games already played, without a line", async () => {
			const next = [...feed(), { id: "w7-0", week: 7, kickoff: "2026-10-25T17:00:00Z", home: "LV", away: "KC", homeScore: null, awayScore: null }]
			await sync(next)
			expect((await pool.query(`select count(*)::int n from league_upset_lines l join league_events e on e.id = l.event_id where e.week = 7`)).rows[0].n).toBe(0)
			expect((await pool.query(`select count(*)::int n from league_upset_lines l join league_events e on e.id = l.event_id where e.week = 5`)).rows[0].n).toBe(0)
		})
		it("never lets a line change or disappear", async () => {
			await sync()
			await expect(pool.query(`update league_upset_lines set underdog = 'home'`)).rejects.toThrow(/never changed/)
			await expect(pool.query(`delete from league_upset_lines`)).rejects.toThrow(/never changed/)
		})
		it("keeps the line even when ratings move after a result comes in", async () => {
			await sync()
			const before = await line("w6-1")
			const played = feed().map((g) => (g.id === "w6-0" ? { ...g, homeScore: 3, awayScore: 40 } : g))
			await sync(played, T0 + 5 * 24 * 3_600_000)
			expect(await line("w6-1")).toEqual(before)
		})
	})

	describe("confidence picks", () => {
		beforeEach(async () => {
			await sync()
			await enable()
		})
		it("saves a ranked slate, lets two ranks be swapped in one save, and is quiet when nothing changes", async () => {
			const [a, b, c] = await week6()
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 7 }, { eventId: b, pick: "away", rank: 6 }, { eventId: c, pick: "home", rank: 5 }])).toMatchObject({ ok: true, saved: 3, changed: 3 })
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 6 }, { eventId: b, pick: "away", rank: 7 }])).toMatchObject({ ok: true, changed: 2 })
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 6 }, { eventId: b, pick: "away", rank: 7 }])).toMatchObject({ ok: true, changed: 0 })
			const r = await pool.query(`select payload from league_entries where player_id = $1 and event_id = $2`, [ann, a])
			expect(r.rows[0].payload).toEqual({ pick: "home", rank: 6 })
			expect((await pool.query(`select count(*)::int n from league_entry_revisions r join league_entries n on n.id = r.entry_id where n.event_id = $1`, [a])).rows[0].n).toBe(2)
		})
		it("rejects a rank used twice, a rank beyond the week's games, and a rank a different game already holds", async () => {
			const [a, b] = await week6()
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 3 }, { eventId: b, pick: "away", rank: 3 }])).toMatchObject({ ok: false, message: expect.stringMatching(/once/) })
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 8 }])).toMatchObject({ ok: false, message: expect.stringMatching(/1 to 7/) })
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 4 }])).toMatchObject({ ok: true })
			expect(await conf(ann, [{ eventId: b, pick: "away", rank: 4 }])).toMatchObject({ ok: false, message: expect.stringMatching(/once/) })
			expect((await pool.query(`select count(*)::int n from league_entries`)).rows[0].n).toBe(1)
		})
		it("writes nothing when any part of the slate is bad", async () => {
			const [a, b] = await week6()
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 2 }, { eventId: b, pick: "sideways", rank: 1 }])).toMatchObject({ ok: false })
			expect((await pool.query(`select count(*)::int n from league_entries`)).rows[0].n).toBe(0)
		})
		it("freezes a game's pick and rank once it has started, but lets the rest be re-ranked", async () => {
			const [a, b, c] = await week6()
			await conf(ann, [{ eventId: a, pick: "home", rank: 7 }, { eventId: b, pick: "away", rank: 6 }])
			const afterFirst = Date.parse("2026-10-18T17:30:00Z")
			expect(await conf(ann, [{ eventId: a, pick: "away", rank: 7 }], afterFirst)).toMatchObject({ ok: false, error: "closed" })
			expect(await conf(ann, [{ eventId: b, pick: "away", rank: 7 }], afterFirst)).toMatchObject({ ok: false, message: expect.stringMatching(/once/) })
			expect(await conf(ann, [{ eventId: b, pick: "home", rank: 5 }, { eventId: c, pick: "home", rank: 6 }], afterFirst)).toMatchObject({ ok: true })
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 7 }], afterFirst)).toMatchObject({ ok: true, changed: 0 })
		})
		it("will not take a pick on a game that has already started, from someone who never picked it", async () => {
			const [a] = await week6()
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 1 }], Date.parse("2026-10-18T18:00:00Z"))).toMatchObject({ ok: false, error: "closed" })
		})
		it("keeps one week's picks together and refuses games from two weeks at once", async () => {
			const [a] = await week6()
			const old = await ev("w5a")
			expect(await conf(ann, [{ eventId: a, pick: "home", rank: 1 }, { eventId: old, pick: "home", rank: 2 }])).toMatchObject({ ok: false, message: expect.stringMatching(/one week/) })
			expect(await conf(ann, [{ eventId: "00000000-0000-0000-0000-000000000000", pick: "home", rank: 1 }])).toMatchObject({ ok: false, error: "not_found" })
			expect(await conf(ann, "nope")).toMatchObject({ ok: false })
			expect(await conf(ann, [])).toMatchObject({ ok: false })
		})
		it("scores each correct pick at its rank, counts a tie as a push, and ranks players", async () => {
			const ids = await week6()
			await conf(ann, ids.map((id, i) => ({ eventId: id, pick: "home", rank: 7 - i })))
			await conf(bob, ids.map((id, i) => ({ eventId: id, pick: "away", rank: 7 - i })))
			const done = feed().map((g) => (g.week === 6 ? { ...g, homeScore: g.id === "w6-3" ? 20 : 24, awayScore: g.id === "w6-3" ? 20 : 17 } : g))
			const r = await sync(done, Date.parse("2026-10-20T12:00:00Z"))
			expect(r.resultsApplied).toBe(7)
			const rows = (await pool.query(`select p.handle, sum(g.points)::int pts, count(*) filter (where g.voided)::int pushes from league_current_grades g join league_players p on p.id = g.player_id join league_entries n on n.id = g.entry_id where n.competition_id = $1 group by p.handle order by p.handle`, [CONF])).rows
			// Ann picked every home side: ranks 7,6,5,(4 is the tie),3,2,1 -> 7+6+5+3+2+1 = 24. Bob picked the road side every time: nothing.
			expect(rows).toEqual([{ handle: "Ann", pts: 24, pushes: 1 }, { handle: "Bobby", pts: 0, pushes: 1 }])
		})
	})

	describe("upset calls", () => {
		beforeEach(async () => {
			await sync()
			await enable()
		})
		it("takes a call on the underdog, refuses one on the favourite, and lets it be taken back", async () => {
			const u = (await line("w6-0")).underdog
			const fav = u === "away" ? "home" : "away"
			expect(await call(ann, "w6-0", fav)).toMatchObject({ ok: false, message: expect.stringMatching(/underdog/) })
			expect(await call(ann, "w6-0", u)).toMatchObject({ ok: true, change: "created" })
			expect(await call(ann, "w6-0", u)).toMatchObject({ ok: true, change: "unchanged" })
			expect(await call(ann, "w6-0", "none")).toMatchObject({ ok: true, change: "revised" })
			expect(await call(ann, "w6-0", "sideways")).toMatchObject({ ok: false })
		})
		it("stops at five calls a week, counts a taken-back call as free, and lets a changed mind stay within the cap", async () => {
			const under = async (i: number) => (await line(`w6-${i}`)).underdog
			for (let i = 0; i < 5; i++) expect(await call(ann, `w6-${i}`, await under(i))).toMatchObject({ ok: true })
			expect(await call(ann, "w6-5", await under(5))).toMatchObject({ ok: false, message: expect.stringMatching(/up to 5/) })
			expect(await call(ann, "w6-0", await under(0))).toMatchObject({ ok: true, change: "unchanged" })
			expect(await call(ann, "w6-0", "none")).toMatchObject({ ok: true })
			expect(await call(ann, "w6-5", await under(5))).toMatchObject({ ok: true })
			expect(await call(ann, "w6-6", await under(6))).toMatchObject({ ok: false })
			// Another player has their own five.
			expect(await call(bob, "w6-6", await under(6))).toMatchObject({ ok: true })
		})
		it("holds the cap even when two calls arrive together", async () => {
			const under = async (i: number) => (await line(`w6-${i}`)).underdog
			for (let i = 0; i < 4; i++) await call(ann, `w6-${i}`, await under(i))
			const [x, y] = await Promise.all([call(ann, "w6-4", await under(4)), call(ann, "w6-5", await under(5))])
			expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1)
		})
		it("offers no call on a game without a line", async () => {
			const next = [...feed(), { id: "w7-0", week: 7, kickoff: "2026-10-25T17:00:00Z", home: "LV", away: "KC", homeScore: null, awayScore: null }]
			await sync(next)
			await enable()
			expect(await call(ann, "w7-0", "away")).toMatchObject({ ok: false, message: expect.stringMatching(/when its week opens/) })
		})
		it("scores a hit by its tier, nothing for a miss, ignores taken-back calls, and regrades after a correction", async () => {
			const ids = await week6()
			const u = async (i: number) => (await line(`w6-${i}`)).underdog
			// Ann calls three games; Bob calls the first and takes back the second.
			await call(ann, "w6-0", await u(0))
			await call(ann, "w6-1", await u(1))
			await call(ann, "w6-2", await u(2))
			await call(bob, "w6-0", await u(0))
			await call(bob, "w6-1", await u(1))
			await call(bob, "w6-1", "none")
			// The underdog wins games 0 and 1 and loses game 2.
			const score = async (k: number, underdogWins: boolean) => {
				const underdogScore = underdogWins ? 27 : 13
				return (await u(k)) === "away" ? { homeScore: 20, awayScore: underdogScore } : { homeScore: underdogScore, awayScore: 20 }
			}
			const scores = [await score(0, true), await score(1, true), await score(2, false)]
			const results = feed().map((g) => {
				const m = /^w6-(\d)$/.exec(g.id)
				return m && Number(m[1]) < 3 ? { ...g, ...scores[Number(m[1])] } : g
			})
			await sync(results, Date.parse("2026-10-20T12:00:00Z"))
			const pts = async (player: string) => Number((await pool.query(`select coalesce(sum(g.points), 0)::int s from league_current_grades g join league_entries n on n.id = g.entry_id where n.competition_id = $1 and g.player_id = $2`, [UPS, player])).rows[0].s)
			const tier = (p: number) => (p >= 0.8 ? 3 : p >= 0.65 ? 2 : 1)
			const v0 = tier((await line("w6-0")).p)
			const v1 = tier((await line("w6-1")).p)
			expect(await pts(ann)).toBe(v0 + v1)
			expect(await pts(bob)).toBe(v0)
			// Bob's taken-back call was never graded at all.
			expect((await pool.query(`select count(*)::int n from league_grades g join league_entries n on n.id = g.entry_id where n.competition_id = $1 and g.player_id = $2`, [UPS, bob])).rows[0].n).toBe(1)
			// An admin correction: the underdog actually lost game 0. Every format regrades from the one result.
			const loses = (await u(0)) === "away" ? { away: 3, home: 30 } : { away: 30, home: 3 }
			const r = await correctResult(db, ADMIN, ids[0], loses.away, loses.home, "score was entered wrong at first", Date.parse("2026-10-21T12:00:00Z"))
			expect(r.ok).toBe(true)
			expect(await pts(ann)).toBe(v1)
			expect(await pts(bob)).toBe(0)
		})
	})
})
