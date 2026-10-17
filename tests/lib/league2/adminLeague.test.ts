import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { RawExport } from "../../../lib/league2/backfill"
import { dbFromPool, type Db } from "../../../lib/league2/db"
import { CLASSIC_TIEBREAKS, buildRows } from "../../../lib/league2/domain"
import type { AdminContext } from "../../../lib/league2/services/admin"
import * as A from "../../../lib/league2/services/adminLeague"
import { submitPick } from "../../../lib/league2/services/picks"
import { loadCompetition } from "../../../lib/league2/services/read"
import { syncBtbFromFeed } from "../../../lib/league2/services/sync"

const TEST_PG = process.env.LEAGUE_TEST_PG
const T0 = Date.parse("2026-10-10T12:00:00Z")
const ADMIN = { userId: "admin-1" } as unknown as AdminContext
const WHY = "Checked against the box score and the league rules."

const feed = (): RawExport => ({
	games: [
		{ _id: "g1", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 1, awayTeam: "Las Vegas Raiders", homeTeam: "New England Patriots", kickoff: "2026-09-13T17:00:00Z", predictedAwayScore: 24, predictedHomeScore: 20, actualAwayScore: 27, actualHomeScore: 17 },
		{ _id: "g2", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 2, awayTeam: "Las Vegas Raiders", homeTeam: "Denver Broncos", kickoff: "2026-09-20T17:00:00Z", predictedAwayScore: 17, predictedHomeScore: 21, actualAwayScore: 20, actualHomeScore: 23 },
		{ _id: "g3", _createdAt: "2026-09-01T00:00:00Z", season: 2026, week: 6, awayTeam: "Kansas City Chiefs", homeTeam: "Las Vegas Raiders", kickoff: "2026-10-18T20:00:00Z", predictedAwayScore: 27, predictedHomeScore: 21, actualAwayScore: null, actualHomeScore: null },
	],
	players: [
		{ _id: "leaguePlayer.ann", _createdAt: "2026-09-02T00:00:00Z", handle: "Ann", handleLower: "ann", keyHash: "a".repeat(64) },
		{ _id: "leaguePlayer.bob", _createdAt: "2026-09-03T00:00:00Z", handle: "Bobby", handleLower: "bobby", keyHash: "b".repeat(64) },
	],
	picks: [
		{ _id: "p1", player: "ann", predictionId: "g1", awayScore: 27, homeScore: 17, pickedAt: "2026-09-10T00:00:00Z" },
		{ _id: "p2", player: "ann", predictionId: "g2", awayScore: 20, homeScore: 24, pickedAt: "2026-09-10T00:00:00Z" },
		{ _id: "p3", player: "bobby", predictionId: "g1", awayScore: 10, homeScore: 30, pickedAt: "2026-09-10T00:00:00Z" },
		{ _id: "p4", player: "bobby", predictionId: "g3", awayScore: 20, homeScore: 24, pickedAt: "2026-10-09T00:00:00Z" },
	],
})

const ALL = `league_audit_log, league_grades, league_entry_revisions, league_entries, league_blogger_pick_revisions, league_blogger_picks, league_result_snapshots, league_events, league_competitions, league_legacy_identities, league_handle_reservations, league_admins, league_support_cases, league_notification_prefs, league_rate_limits, league_players, "session", "account", "verification", "rateLimit", "user"`

;(TEST_PG ? describe : describe.skip)("competition administration", () => {
	let pool: Pool
	let db: Db
	const ev = async (legacy: string) => (await pool.query(`select id from league_events where legacy_prediction_id = $1`, [legacy])).rows[0].id as string
	const entryOf = async (handle: string, legacy: string) => (await pool.query(`select n.id from league_entries n join league_players p on p.id = n.player_id join league_events e on e.id = n.event_id where p.handle = $1 and e.legacy_prediction_id = $2`, [handle, legacy])).rows[0].id as string
	const board = async () => {
		const d = await loadCompetition(db, "btb-2026", null)
		return buildRows(d.grades, d.players.filter((p) => !p.disabled), CLASSIC_TIEBREAKS).map((r) => [r.handle, r.points, r.games])
	}
	const audits = async (action: string) => (await pool.query(`select count(*)::int n from league_audit_log where action = $1`, [action])).rows[0].n as number

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
		// Test-only: published rule versions are never deleted in normal operation, so lift the guard to reset.
		await pool.query(`alter table league_scoring_policies disable trigger league_policy_guard`)
		await pool.query(`delete from league_scoring_policies where version > 1`)
		await pool.query(`update league_scoring_policies set frozen_at = null where id <> 'btb-classic-v1'`)
		await pool.query(`alter table league_scoring_policies enable trigger league_policy_guard`)
		await pool.query(`update league_sync_state set ran_at = 'epoch'`)
		await syncBtbFromFeed(db, feed(), 2026, T0)
	})

	it("cancelling a game voids its grades, leaves the history, and can be undone", async () => {
		const before = await board()
		const g1 = await ev("g1")
		await expect(A.cancelEvent(db, ADMIN, g1, "short", T0)).rejects.toThrow(/reason/)
		expect(await audits("event.cancel")).toBe(0)

		const r = await A.cancelEvent(db, ADMIN, g1, WHY, T0)
		expect(r).toMatchObject({ ok: true, noop: false, graded: 2 })
		const after = await board()
		expect(after).not.toEqual(before)
		expect((await pool.query(`select count(*)::int n from league_grades where event_id = $1`, [g1])).rows[0].n).toBe(4) // old two kept
		expect(await A.cancelEvent(db, ADMIN, g1, WHY, T0)).toMatchObject({ noop: true })

		const back = await A.restoreEvent(db, ADMIN, g1, WHY, T0)
		expect(back).toMatchObject({ ok: true, state: "final" })
		expect(await board()).toEqual(before)
		expect(await audits("event.cancel")).toBe(1)
		expect(await audits("event.restore")).toBe(1)
	})

	it("a corrected score regrades everyone, keeps the old grades, and survives the next sync until released", async () => {
		const g1 = await ev("g1")
		const before = await board()
		const r = await A.correctResult(db, ADMIN, g1, 10, 30, WHY, T0)
		expect(r).toMatchObject({ ok: true, noop: false, graded: 2 })
		expect(await board()).not.toEqual(before)
		expect((await pool.query(`select count(*)::int n from league_grades where event_id = $1`, [g1])).rows[0].n).toBe(4)
		expect((await pool.query(`select away_score a, home_score h, result_pinned_by p from league_events where id = $1`, [g1])).rows[0]).toEqual({ a: 10, h: 30, p: "admin-1" })
		expect(await audits("result.correct")).toBe(1)

		// The feed still says 27-17. A sync must not put it back.
		await pool.query(`update league_sync_state set ran_at = 'epoch'`)
		const s = await syncBtbFromFeed(db, feed(), 2026, T0 + 1000)
		expect(s.resultsApplied).toBe(0)
		expect((await pool.query(`select away_score a from league_events where id = $1`, [g1])).rows[0].a).toBe(10)

		// Release the pin: the feed takes over again.
		await A.releaseResultPin(db, ADMIN, g1, WHY, T0)
		await pool.query(`update league_sync_state set ran_at = 'epoch'`)
		expect((await syncBtbFromFeed(db, feed(), 2026, T0 + 2000)).resultsApplied).toBe(1)
		expect(await board()).toEqual(before)
	})

	it("refuses nonsense scores and a result on a cancelled game", async () => {
		const g1 = await ev("g1")
		expect(await A.correctResult(db, ADMIN, g1, -1, 3, WHY, T0)).toMatchObject({ ok: false })
		expect(await A.correctResult(db, ADMIN, g1, 3, 100, WHY, T0)).toMatchObject({ ok: false })
		await A.cancelEvent(db, ADMIN, g1, WHY, T0)
		expect(await A.correctResult(db, ADMIN, g1, 3, 4, WHY, T0)).toMatchObject({ ok: false })
	})

	it("moving a lock reopens picking, within sensible bounds, and not for a finished game", async () => {
		const g3 = await ev("g3")
		const ann = (await pool.query(`select id from league_players where handle = 'Ann'`)).rows[0].id as string
		const late = Date.parse("2026-10-18T21:00:00Z")
		expect(await submitPick(db, { competitionId: "btb-2026", playerId: ann, eventId: g3, payload: { away: 20, home: 24 }, now: late })).toMatchObject({ ok: false, error: "closed" })
		expect(await A.moveLock(db, ADMIN, g3, "2026-10-18T22:00:00Z", WHY, T0)).toMatchObject({ ok: true, noop: false })
		expect(await submitPick(db, { competitionId: "btb-2026", playerId: ann, eventId: g3, payload: { away: 20, home: 24 }, now: late })).toMatchObject({ ok: true })
		expect(await A.moveLock(db, ADMIN, g3, "2027-01-01T00:00:00Z", WHY, T0)).toMatchObject({ ok: false })
		expect(await A.moveLock(db, ADMIN, g3, "not a date", WHY, T0)).toMatchObject({ ok: false })
		expect(await A.moveLock(db, ADMIN, await ev("g1"), "2026-09-13T18:00:00Z", WHY, T0)).toMatchObject({ ok: false })
		expect(await A.moveLock(db, ADMIN, g3, null, WHY, T0)).toMatchObject({ ok: true })
		expect(await audits("event.move_lock")).toBe(2)
	})

	it("the blogger's pick can change before the lock quietly, and after it only with a reason that stays on record", async () => {
		const g3 = await ev("g3")
		expect(await A.correctBloggerPick(db, ADMIN, g3, 14, 30, "", T0)).toMatchObject({ ok: true, change: "revised", afterLock: false })
		const g1 = await ev("g1")
		expect(await A.correctBloggerPick(db, ADMIN, g1, 30, 3, "", T0)).toMatchObject({ ok: false })
		expect(await A.correctBloggerPick(db, ADMIN, g1, 3, 3, WHY, T0)).toMatchObject({ ok: false }) // a tie
		expect(await A.correctBloggerPick(db, ADMIN, g1, 30, 3, "Typo when entering the pick.", T0)).toMatchObject({ ok: true, afterLock: true })
		const rev = (await pool.query(`select n, after_lock, reason, actor from league_blogger_pick_revisions where event_id = $1 order by n`, [g1])).rows
		expect(rev[rev.length - 1]).toMatchObject({ after_lock: true, reason: "Typo when entering the pick.", actor: "admin-1" })
		expect((await pool.query(`select count(*)::int n from league_blogger_picks where event_id = $1`, [g1])).rows[0].n).toBe(1)
		const adm = await A.adminEvents(db, ADMIN, "btb-2026")
		expect(adm.find((e) => e.id === g1)?.blogger).toEqual({ away: 30, home: 3, afterLockRevisions: 1 })
	})

	it("voiding a graded pick removes its points, keeps the pick, blocks edits, and restores cleanly", async () => {
		const before = await board()
		const e = await entryOf("Ann", "g1")
		await expect(A.voidEntry(db, ADMIN, e, "no", T0)).rejects.toThrow(/reason/)
		expect(await A.voidEntry(db, ADMIN, e, WHY, T0)).toMatchObject({ ok: true, noop: false })
		expect(await board()).not.toEqual(before)
		expect((await pool.query(`select count(*)::int n from league_entries where id = $1`, [e])).rows[0].n).toBe(1)
		const ann = (await pool.query(`select id from league_players where handle = 'Ann'`)).rows[0].id as string
		expect(await submitPick(db, { competitionId: "btb-2026", playerId: ann, eventId: await ev("g1"), payload: { away: 1, home: 2 }, now: Date.parse("2026-09-01T00:00:00Z") })).toMatchObject({ ok: false, error: "not_allowed" })
		expect(await A.voidEntry(db, ADMIN, e, WHY, T0)).toMatchObject({ noop: true })
		expect(await A.restoreEntry(db, ADMIN, e, WHY, T0)).toMatchObject({ ok: true, noop: false })
		expect(await board()).toEqual(before)
	})

	it("a voided pick that was never graded is skipped when the game ends", async () => {
		const e = await entryOf("Bobby", "g3")
		await A.voidEntry(db, ADMIN, e, WHY, T0)
		const d = await loadCompetition(db, "btb-2026", null)
		expect(d.tallies[await ev("g3")]?.entries ?? 0).toBe(0)
		await A.correctResult(db, ADMIN, await ev("g3"), 21, 24, WHY, T0)
		expect((await pool.query(`select count(*)::int n from league_grades where entry_id = $1`, [e])).rows[0].n).toBe(0)
	})

	it("recalculating adds nothing on healthy data and rebuilds grades that went missing", async () => {
		const first = await A.recalculate(db, ADMIN, "btb-2026", WHY, T0)
		expect(first).toMatchObject({ ok: true, report: { created: 0, finalWithoutGrade: 0, duplicateCurrent: 0 } })
		const good = await board()
		await pool.query(`truncate league_grades`) // test-only: the table is append-only in normal operation
		const heal = await A.recalculate(db, ADMIN, "btb-2026", WHY, T0)
		expect(heal).toMatchObject({ ok: true, report: { created: 3, finalWithoutGrade: 0 } })
		expect(await board()).toEqual(good)
		expect(await A.recalculate(db, ADMIN, "nope", WHY, T0)).toMatchObject({ ok: false })
	})

	it("turning a competition off stops picks and is audited with a reason", async () => {
		const ann = (await pool.query(`select id from league_players where handle = 'Ann'`)).rows[0].id as string
		expect(await A.setCompetitionEnabled(db, ADMIN, "btb-2026", false, WHY, T0)).toMatchObject({ ok: true, noop: false })
		expect(await submitPick(db, { competitionId: "btb-2026", playerId: ann, eventId: await ev("g3"), payload: { away: 20, home: 24 }, now: T0 })).toMatchObject({ ok: false, error: "not_found" })
		expect(await A.setCompetitionEnabled(db, ADMIN, "btb-2026", false, WHY, T0)).toMatchObject({ noop: true })
		await A.setCompetitionEnabled(db, ADMIN, "btb-2026", true, WHY, T0)
		expect(await audits("competition.configure")).toBe(2)
	})

	it("publishes the next rule version only for the future, validates it, and never rescores played games", async () => {
		const rules = { winner: 12, margin: [{ max: 0, pts: 12 }, { max: 3, pts: 6 }], exactScore: 5 }
		const soon = new Date(T0 + 60_000).toISOString()
		expect(await A.publishPolicyVersion(db, ADMIN, "btb-classic", rules, soon, WHY, T0)).toMatchObject({ ok: false })
		expect(await A.publishPolicyVersion(db, ADMIN, "btb-classic", { winner: -1, margin: [], exactScore: 1 }, "2026-12-01T00:00:00Z", WHY, T0)).toMatchObject({ ok: false })
		expect(await A.publishPolicyVersion(db, ADMIN, "btb-classic", { winner: 10, margin: [{ max: 3, pts: 6 }, { max: 3, pts: 1 }], exactScore: 5 }, "2026-12-01T00:00:00Z", WHY, T0)).toMatchObject({ ok: false })
		expect(await A.publishPolicyVersion(db, ADMIN, "nope", rules, "2026-12-01T00:00:00Z", WHY, T0)).toMatchObject({ ok: false })
		const before = await board()
		const ok = await A.publishPolicyVersion(db, ADMIN, "btb-classic", rules, "2026-12-01T00:00:00Z", WHY, T0)
		expect(ok).toEqual({ ok: true, id: "btb-classic-v2" })
		expect((await pool.query(`select frozen_at is not null f from league_scoring_policies where id = 'btb-classic-v2'`)).rows[0].f).toBe(true)
		await A.recalculate(db, ADMIN, "btb-2026", WHY, T0)
		expect(await board()).toEqual(before) // every game so far locked before the new rules apply
		await expect(pool.query(`update league_scoring_policies set rules = '{}' where id = 'btb-classic-v2'`)).rejects.toThrow(/frozen/)
		expect(await audits("policy.revise")).toBe(1)
	})

	it("freezes a draft rule set once", async () => {
		expect(await A.freezePolicyVersion(db, ADMIN, "nfl-winner-v1", WHY, T0)).toMatchObject({ ok: true, noop: false })
		expect(await A.freezePolicyVersion(db, ADMIN, "nfl-winner-v1", WHY, T0)).toMatchObject({ noop: true })
		expect(await A.freezePolicyVersion(db, ADMIN, "missing", WHY, T0)).toMatchObject({ ok: false })
	})

	it("reports competitions, games, a member's picks, and pages through the audit trail", async () => {
		await A.cancelEvent(db, ADMIN, await ev("g1"), WHY, T0)
		await A.moveLock(db, ADMIN, await ev("g3"), "2026-10-18T22:00:00Z", WHY, T0)
		const o = await A.adminOverview(db, ADMIN)
		expect(o.competitions.find((c) => c.id === "btb-2026")).toMatchObject({ enabled: true, events: 3, entries: 4 })
		expect(o.sync.map((s) => s.key).sort()).toEqual(["btb", "nfl"])
		expect(o.policies.find((p) => p.id === "btb-classic-v1")?.frozenAt).not.toBeNull()
		const evs = await A.adminEvents(db, ADMIN, "btb-2026")
		expect(evs.map((e) => [e.week, e.state, e.entries])).toEqual([[1, "cancelled", 2], [2, "final", 1], [6, "scheduled", 1]])
		const ann = (await pool.query(`select id from league_players where handle = 'Ann'`)).rows[0].id as string
		const mine = await A.memberEntries(db, ADMIN, ann)
		expect(mine).toHaveLength(2)
		const page1 = await A.auditLog(db, ADMIN, { limit: 2 })
		const page2 = await A.auditLog(db, ADMIN, { limit: 2, beforeId: page1[page1.length - 1].id })
		expect(page1.length).toBe(2)
		expect(page2.every((r) => r.id < page1[1].id)).toBe(true)
		expect((await A.auditLog(db, ADMIN, { action: "event.move" })).map((r) => r.action)).toEqual(["event.move_lock"])
		expect((await A.auditLog(db, ADMIN, { subject: "event:" })).length).toBeGreaterThanOrEqual(2)
		// A % typed into the filter is a literal, not a wildcard.
		expect(await A.auditLog(db, ADMIN, { action: "%" })).toEqual([])
	})
})
