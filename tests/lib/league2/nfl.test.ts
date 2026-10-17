import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { dbFromPool, type Db } from "../../../lib/league2/db"
import type { AdminContext } from "../../../lib/league2/services/admin"
import { correctResult, setCompetitionEnabled } from "../../../lib/league2/services/adminLeague"
import { submitPick } from "../../../lib/league2/services/picks"
import { loadCompetition } from "../../../lib/league2/services/read"
import { type NflFeedGame, syncNflFromFeed } from "../../../lib/league2/services/syncNfl"
import { buildNflWeek } from "../../../lib/league2/view/nfl"

const TEST_PG = process.env.LEAGUE_TEST_PG
const T0 = Date.parse("2026-10-14T12:00:00Z")
const ADMIN = { userId: "admin-1" } as unknown as AdminContext
const COMP = "nfl-winners-2026"
const ALL = `league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user"`

const feed = (over: Partial<NflFeedGame>[] = []): NflFeedGame[] => {
	const base: NflFeedGame[] = [
		{ id: "401", week: 6, kickoff: "2026-10-18T17:00:00Z", home: "NYJ", away: "BUF", homeScore: null, awayScore: null },
		{ id: "402", week: 6, kickoff: "2026-10-18T20:25:00Z", home: "LV", away: "KC", homeScore: null, awayScore: null },
		{ id: "301", week: 5, kickoff: "2026-10-11T17:00:00Z", home: "LV", away: "DEN", homeScore: 24, awayScore: 20 },
		{ id: "302", week: 5, kickoff: "2026-10-12T00:20:00Z", home: "LAC", away: "PIT", homeScore: 17, awayScore: 17 },
	]
	return base.map((g, i) => ({ ...g, ...(over[i] ?? {}) }))
}

;(TEST_PG ? describe : describe.skip)("the public NFL winners league", () => {
	let pool: Pool
	let db: Db
	let ann: string
	let bob: string
	const ev = async (nfl: string) => (await pool.query(`select id from league_events where nfl_game_id = $1`, [nfl])).rows[0].id as string
	const view = async (me: string | null, now = T0, week: number | null = 5) => buildNflWeek(await loadCompetition(db, COMP, me), 2026, me ? { id: me } : null, now, week)!

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

	it("creates the competition switched off, with full team names, and is idempotent", async () => {
		const r = await syncNflFromFeed(db, feed(), 2026, T0)
		expect(r).toMatchObject({ gamesAdded: 4, resultsApplied: 0, skipped: 0 })
		expect((await pool.query(`select enabled, kind, policy_family from league_competitions where id = $1`, [COMP])).rows[0]).toEqual({ enabled: false, kind: "weekly-winners", policy_family: "nfl-winner" })
		expect((await pool.query(`select away_team, home_team from league_events where nfl_game_id = '402'`)).rows[0]).toEqual({ away_team: "Kansas City Chiefs", home_team: "Las Vegas Raiders" })
		const again = await syncNflFromFeed(db, feed(), 2026, T0 + 1000)
		expect(again).toMatchObject({ gamesAdded: 0, kickoffsMoved: 0, resultsApplied: 0, graded: 0 })
		expect((await pool.query(`select count(*)::int n from league_events`)).rows[0].n).toBe(4)
	})

	it("skips games it cannot trust instead of guessing", async () => {
		const bad = feed([{ kickoff: "soon" }, { week: 40 }, { home: "LV", away: "LV" }])
		const r = await syncNflFromFeed(db, bad, 2026, T0)
		expect(r.skipped).toBe(3)
		expect(r.gamesAdded).toBe(1)
	})

	it("follows a moved kickoff while open, applies a final once, and leaves a corrected score alone", async () => {
		await syncNflFromFeed(db, feed(), 2026, T0)
		const moved = await syncNflFromFeed(db, feed([{ kickoff: "2026-10-18T18:00:00Z" }]), 2026, T0)
		expect(moved.kickoffsMoved).toBe(1)
		const done = await syncNflFromFeed(db, feed([{ homeScore: 21, awayScore: 10 }]), 2026, T0)
		expect(done.resultsApplied).toBe(1)
		await correctResult(db, ADMIN, await ev("401"), 10, 24, "ESPN posted the wrong home score for a while.", T0)
		const after = await syncNflFromFeed(db, feed([{ homeScore: 21, awayScore: 10 }]), 2026, T0 + 5000)
		expect(after.resultsApplied).toBe(0)
		expect((await pool.query(`select home_score from league_events where nfl_game_id = '401'`)).rows[0].home_score).toBe(24)
	})

	it("takes winner picks only when the competition is on, and only before the lock", async () => {
		await syncNflFromFeed(db, feed(), 2026, T0)
		const g = await ev("401")
		const pick = (now: number, p: unknown = "home") => submitPick(db, { competitionId: COMP, playerId: ann, eventId: g, payload: { pick: p }, now })
		expect(await pick(T0)).toMatchObject({ ok: false, error: "not_found" }) // switched off
		await setCompetitionEnabled(db, ADMIN, COMP, true, "Opening the NFL league for the season.", T0)
		expect(await pick(T0)).toMatchObject({ ok: true, change: "created" })
		expect(await pick(T0 + 1000, "away")).toMatchObject({ ok: true, change: "revised" })
		expect(await pick(T0 + 2000, "away")).toMatchObject({ ok: true, change: "unchanged" })
		expect(await pick(T0, "draw")).toMatchObject({ ok: false, error: "invalid" })
		expect(await pick(Date.parse("2026-10-18T17:00:00Z"))).toMatchObject({ ok: false, error: "closed" })
		// A Beat the Blogger score pick cannot be sent here, and a winner pick cannot be sent to a missing game.
		expect(await submitPick(db, { competitionId: COMP, playerId: ann, eventId: g, payload: { away: 20, home: 10 }, now: T0 })).toMatchObject({ ok: false })
		expect(await submitPick(db, { competitionId: COMP, playerId: ann, eventId: "00000000-0000-0000-0000-000000000000", payload: { pick: "home" }, now: T0 })).toMatchObject({ ok: false, error: "not_found" })
		expect((await pool.query(`select count(*)::int n from league_entry_revisions`)).rows[0].n).toBe(2)
	})

	it("a game that ends grades each pick, calls a tie a push, and builds the board and the champion", async () => {
		// Week 5 before its games: no scores yet.
		const pre = feed([{}, {}, { homeScore: null, awayScore: null }, { homeScore: null, awayScore: null }])
		await syncNflFromFeed(db, pre, 2026, T0)
		await setCompetitionEnabled(db, ADMIN, COMP, true, "Opening the NFL league for the season.", T0)
		const early = Date.parse("2026-10-10T00:00:00Z")
		const put = async (p: string, e: string, pk: string) => expect(await submitPick(db, { competitionId: COMP, playerId: p, eventId: e, payload: { pick: pk }, now: early })).toMatchObject({ ok: true })
		await put(ann, await ev("301"), "home")
		await put(ann, await ev("302"), "home")
		await put(bob, await ev("301"), "away")
		await put(bob, await ev("302"), "away")
		const r = await syncNflFromFeed(db, feed(), 2026, T0 + 60_000) // the real finals arrive
		expect(r.resultsApplied).toBe(2)
		expect(r.graded).toBe(4)
		const a = await view(ann)
		expect(a.games.map((g) => [g.away.abbr, g.outcome])).toEqual([["DEN", "correct"], ["PIT", "push"]])
		expect(a.summary).toMatchObject({ correct: 1, pushes: 1, total: 2 })
		const b = await view(bob)
		expect(b.games.map((g) => g.outcome)).toEqual(["wrong", "push"])
		expect(b.weekBoard.rows.map((x) => [x.handle, x.rank, x.points, x.games])).toEqual([["Ann", 1, 1, 1], ["Bobby", 2, 0, 1]])
		expect(a.champions).toEqual([{ week: 5, handles: ["Ann"], points: 1 }])
		// A visitor sees the same boards and none of the picks.
		const v = await view(null)
		expect(v.games.every((g) => g.pick === null)).toBe(true)
		expect(v.weekBoard.rows).toHaveLength(2)
		// Running the sync again changes nothing.
		expect(await syncNflFromFeed(db, feed(), 2026, T0 + 120_000)).toMatchObject({ resultsApplied: 0, graded: 0 })
	})

	it("the crowd split appears only after kickoff", async () => {
		await syncNflFromFeed(db, feed(), 2026, T0)
		await setCompetitionEnabled(db, ADMIN, COMP, true, "Opening the NFL league for the season.", T0)
		const g = await ev("401")
		await submitPick(db, { competitionId: COMP, playerId: ann, eventId: g, payload: { pick: "home" }, now: T0 })
		await submitPick(db, { competitionId: COMP, playerId: bob, eventId: g, payload: { pick: "away" }, now: T0 })
		const before = await view(ann, T0, 6)
		expect(before.games.find((x) => x.eventId === g)!.crowd).toBeNull()
		const after = await view(ann, Date.parse("2026-10-18T17:30:00Z"), 6)
		expect(after.games.find((x) => x.eventId === g)!.crowd).toEqual({ away: 1, home: 1, total: 2 })
	})
})
