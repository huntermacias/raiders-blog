import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { RawExport } from "../../../lib/league2/backfill"
import { dbFromPool, type Db } from "../../../lib/league2/db"
import { CLASSIC_TIEBREAKS, buildRows } from "../../../lib/league2/domain"
import { loadCompetition } from "../../../lib/league2/services/read"
import { submitPick } from "../../../lib/league2/services/picks"
import { claimSync, syncBtbFromFeed } from "../../../lib/league2/services/sync"
import { buildStandings } from "../../../lib/league"

const TEST_PG = process.env.LEAGUE_TEST_PG
const T0 = Date.parse("2026-10-10T12:00:00Z")
const feed = (over: Partial<RawExport> = {}): RawExport => ({
	games: [
		{ _id: "g1", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 1, awayTeam: "Las Vegas Raiders", homeTeam: "New England Patriots", kickoff: "2026-09-13T17:00:00Z", predictedAwayScore: 24, predictedHomeScore: 20, actualAwayScore: 27, actualHomeScore: 17 },
		{ _id: "g2", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 2, awayTeam: "Las Vegas Raiders", homeTeam: "Denver Broncos", kickoff: "2026-09-20T17:00:00Z", predictedAwayScore: 17, predictedHomeScore: 21, actualAwayScore: 20, actualHomeScore: 23 },
		{ _id: "g3", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 6, awayTeam: "Kansas City Chiefs", homeTeam: "Las Vegas Raiders", kickoff: "2026-10-18T20:00:00Z", predictedAwayScore: 27, predictedHomeScore: 21, actualAwayScore: null, actualHomeScore: null },
	],
	players: [
		{ _id: "leaguePlayer.ann", _createdAt: "2026-09-02T00:00:00Z", handle: "Ann", handleLower: "ann", keyHash: "a".repeat(64) },
		{ _id: "leaguePlayer.bob", _createdAt: "2026-09-03T00:00:00Z", handle: "Bobby", handleLower: "bobby", keyHash: "b".repeat(64) },
		{ _id: "leaguePlayer.cy", _createdAt: "2026-09-04T00:00:00Z", handle: "Cyrus", handleLower: "cyrus", keyHash: "c".repeat(64), banned: true },
	],
	picks: [
		{ _id: "p1", player: "ann", predictionId: "g1", awayScore: 27, homeScore: 17, pickedAt: "2026-09-10T00:00:00Z" },
		{ _id: "p2", player: "ann", predictionId: "g2", awayScore: 20, homeScore: 24, pickedAt: "2026-09-10T00:00:00Z" },
		{ _id: "p3", player: "bobby", predictionId: "g1", awayScore: 10, homeScore: 30, pickedAt: "2026-09-10T00:00:00Z" },
		{ _id: "p4", player: "bobby", predictionId: "g3", awayScore: 20, homeScore: 24, pickedAt: "2026-10-09T00:00:00Z" },
	],
	...over,
})

;(TEST_PG ? describe : describe.skip)("syncing the Sanity League into Postgres", () => {
	let pool: Pool
	let db: Db
	const sync = (f = feed(), now = T0) => syncBtbFromFeed(db, f, 2026, now)
	const count = async (t: string) => (await pool.query(`select count(*)::int n from ${t}`)).rows[0].n as number

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
		await pool.query(`update league_sync_state set ran_at = 'epoch'`)
	})

	it("loads everything once and reproduces the live standings", async () => {
		const r = await sync()
		expect(r).toMatchObject({ playersAdded: 3, gamesAdded: 3, picksAdded: 4, bloggerPicksAdded: 3, graded: 3 })
		expect(await count("league_legacy_identities")).toBe(3)
		expect((await pool.query(`select disabled_reason from league_players where handle = 'Cyrus'`)).rows[0].disabled_reason).toMatch(/Banned/)

		const f = feed()
		const live = buildStandings(f.games as never, f.players.filter((p) => !p.banned).map((p) => ({ handle: p.handle, lower: p.handleLower, joinedAt: p._createdAt })), f.picks.map((p) => ({ player: p.player, predictionId: p.predictionId, awayScore: p.awayScore, homeScore: p.homeScore })))
		const data = await loadCompetition(db, "btb-2026", null)
		const rows = buildRows(data.grades, data.players.filter((p) => !p.disabled), CLASSIC_TIEBREAKS)
		expect(rows.map((x) => [x.handle, x.rank, x.points, x.games, x.correct, x.exact])).toEqual(live.map((x) => [x.handle, x.rank, x.points, x.games, x.correct, x.exact]))
	})

	it("is idempotent: a second run changes nothing", async () => {
		await sync()
		const before = [await count("league_entries"), await count("league_grades"), await count("league_events"), await count("league_entry_revisions")]
		const r = await sync()
		expect(r).toMatchObject({ playersAdded: 0, gamesAdded: 0, picksAdded: 0, picksRevised: 0, bloggerPicksAdded: 0, resultsApplied: 0, graded: 0 })
		expect([await count("league_entries"), await count("league_grades"), await count("league_events"), await count("league_entry_revisions")]).toEqual(before)
	})

	it("follows new picks, a pick change before kickoff, and a new final result", async () => {
		await sync()
		const f = feed()
		f.games[2] = { ...f.games[2], actualAwayScore: 24, actualHomeScore: 28 }
		f.picks = f.picks.concat([{ _id: "p5", player: "ann", predictionId: "g3", awayScore: 21, homeScore: 25, pickedAt: "2026-10-10T10:00:00Z" }])
		f.picks[3] = { ...f.picks[3], awayScore: 17, homeScore: 31, pickedAt: "2026-10-10T11:00:00Z" }
		const r = await sync(f, T0)
		expect(r).toMatchObject({ picksAdded: 1, picksRevised: 1, resultsApplied: 1, graded: 2 })
		expect((await pool.query(`select count(*)::int n from league_entry_revisions r join league_entries e on e.id = r.entry_id join league_players p on p.id = e.player_id where p.handle = 'Bobby' and e.event_id in (select id from league_events where legacy_prediction_id = 'g3')`)).rows[0].n).toBe(2)
	})

	it("a corrected final adds a superseding grade and leaves the old one", async () => {
		await sync()
		const f = feed()
		f.games[0] = { ...f.games[0], actualAwayScore: 27, actualHomeScore: 20 }
		const r = await sync(f)
		expect(r.resultsApplied).toBe(1)
		const g = await pool.query(`select count(*)::int n, (select count(*)::int from league_current_grades where event_id = (select id from league_events where legacy_prediction_id = 'g1')) as cur from league_grades where event_id = (select id from league_events where legacy_prediction_id = 'g1')`)
		expect(g.rows[0]).toEqual({ n: 4, cur: 2 })
		expect((await pool.query(`select count(*)::int n from league_result_snapshots where event_id = (select id from league_events where legacy_prediction_id = 'g1')`)).rows[0].n).toBe(2)
	})

	it("does not apply a change to the blogger's pick after its lock; it logs it for an admin", async () => {
		await sync()
		const f = feed()
		f.games[0] = { ...f.games[0], predictedAwayScore: 30, predictedHomeScore: 3 }
		const r = await sync(f, T0)
		expect(r.bloggerDrift).toEqual(["g1"])
		expect((await pool.query(`select away, home from league_blogger_picks where event_id = (select id from league_events where legacy_prediction_id = 'g1')`)).rows[0]).toEqual({ away: 24, home: 20 })
		expect((await pool.query(`select count(*)::int n from league_audit_log where action = 'sync.blogger_pick_drift'`)).rows[0].n).toBe(1)
		// Before its lock the change is a revision.
		const g3 = feed()
		g3.games[2] = { ...g3.games[2], predictedAwayScore: 14, predictedHomeScore: 30 }
		await sync(g3, T0)
		expect((await pool.query(`select away, home from league_blogger_picks where event_id = (select id from league_events where legacy_prediction_id = 'g3')`)).rows[0]).toEqual({ away: 14, home: 30 })
	})

	it("ignores old-flow picks from a player who already upgraded, and keeps a no-timestamp pick made before kickoff", async () => {
		await sync()
		await pool.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('u1', 'Ann', 'ann@example.com', true, now(), now())`)
		await pool.query(`update league_legacy_identities set state = 'claimed', claimed_by = 'u1', claimed_at = now() where handle_lower = 'ann'`)
		const f = feed()
		f.picks = f.picks.concat([
			{ _id: "p6", player: "ann", predictionId: "g3", awayScore: 5, homeScore: 9, pickedAt: "2026-10-10T10:00:00Z" },
			{ _id: "p7", player: "bobby", predictionId: "g2", awayScore: 5, homeScore: 9 }, // game already played; no timestamp
		])
		const r = await sync(f)
		expect(r.picksAdded).toBe(1)
		expect(r.picksIgnored).toBe(3) // all three of Ann's: she has upgraded
		expect((await pool.query(`select count(*)::int n from league_entries e join league_players p on p.id = e.player_id where p.handle = 'Ann' and e.event_id = (select id from league_events where legacy_prediction_id = 'g3')`)).rows[0].n).toBe(0)
	})

	it("claims a sync job for one caller at a time", async () => {
		const ran = await Promise.all([1, 2, 3, 4, 5].map(() => claimSync(pool, "btb", 60_000)))
		expect(ran.filter(Boolean).length).toBe(1)
		expect(await claimSync(pool, "btb", 60_000)).toBe(false)
	})
})

;(TEST_PG ? describe : describe.skip)("saving picks", () => {
	let pool: Pool
	let db: Db
	let ann: string
	let g3: string
	let g1: string
	beforeAll(async () => {
		pool = new Pool({ connectionString: TEST_PG })
		db = dbFromPool(pool)
	})
	afterAll(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
		await pool.end()
	})
	beforeEach(async () => {
		await pool.query(`truncate league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user" restart identity cascade`)
		await syncBtbFromFeed(db, feed(), 2026, T0)
		ann = (await pool.query(`select id from league_players where handle = 'Ann'`)).rows[0].id
		g3 = (await pool.query(`select id from league_events where legacy_prediction_id = 'g3'`)).rows[0].id
		g1 = (await pool.query(`select id from league_events where legacy_prediction_id = 'g1'`)).rows[0].id
	})
	const pick = (eventId: unknown, payload: unknown, now = T0, playerId = ann) => submitPick(db, { competitionId: "btb-2026", playerId, eventId, payload, now })

	it("creates, then revises, then treats a repeat as nothing", async () => {
		expect(await pick(g3, { away: 20, home: 24 })).toMatchObject({ ok: true, change: "created" })
		expect(await pick(g3, { away: 20, home: 24 })).toMatchObject({ ok: true, change: "unchanged" })
		expect(await pick(g3, { away: 21, home: 24 }, T0 + 1000)).toMatchObject({ ok: true, change: "revised" })
		expect((await pool.query(`select count(*)::int n from league_entry_revisions where entry_id = (select id from league_entries where player_id = $1 and event_id = $2)`, [ann, g3])).rows[0].n).toBe(2)
	})

	it("refuses after kickoff, for a played game, for a tie, junk, an unknown game and a disabled player", async () => {
		expect(await pick(g3, { away: 20, home: 24 }, Date.parse("2026-10-18T20:00:00Z"))).toMatchObject({ ok: false, error: "closed" })
		expect(await pick(g1, { away: 20, home: 24 })).toMatchObject({ ok: false, error: "closed" })
		expect(await pick(g3, { away: 20, home: 20 })).toMatchObject({ ok: false, error: "invalid" })
		expect(await pick(g3, { away: -1, home: 24 })).toMatchObject({ ok: false, error: "invalid" })
		expect(await pick(g3, { away: "9", home: 24 })).toMatchObject({ ok: false, error: "invalid" })
		expect(await pick("not-an-id", { away: 1, home: 2 })).toMatchObject({ ok: false, error: "not_found" })
		expect(await pick("00000000-0000-0000-0000-000000000000", { away: 1, home: 2 })).toMatchObject({ ok: false, error: "not_found" })
		const cy = (await pool.query(`select id from league_players where handle = 'Cyrus'`)).rows[0].id
		expect(await pick(g3, { away: 1, home: 2 }, T0, cy)).toMatchObject({ ok: false, error: "not_allowed" })
		expect(await pool.query(`select 1 from league_entries where event_id = $1 and player_id = $2`, [g3, cy])).toHaveProperty("rowCount", 0)
	})

	it("follows a postponement: moving the lock keeps picks and extends the window", async () => {
		await pick(g3, { away: 20, home: 24 })
		await pool.query(`update league_events set state = 'postponed', lock_at = '2026-10-19T20:00:00Z' where id = $1`, [g3])
		expect(await pick(g3, { away: 22, home: 24 }, Date.parse("2026-10-18T21:00:00Z"))).toMatchObject({ ok: true, change: "revised" })
	})

	it("two simultaneous submissions end with exactly one entry", async () => {
		const r = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => pick(g3, { away: 10 + i, home: 30 })))
		expect(r.every((x) => x.ok)).toBe(true)
		expect((await pool.query(`select count(*)::int n from league_entries where player_id = $1 and event_id = $2`, [ann, g3])).rows[0].n).toBe(1)
	})
})
