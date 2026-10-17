import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

import { type RawExport, planBackfill, validateBackfill } from "../../../lib/league2/backfill"
import { planToSql } from "../../../lib/league2/backfillSql"
import { uuidV5 } from "../../../lib/league2/ids"

function rng(seed: number) {
	let s = seed >>> 0
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0
		return s / 4294967296
	}
}

/** A believable export: 12 players (one banned), 8 games (6 final), skipped games, edited picks. */
function exportFor(seed: number): RawExport {
	const r = rng(seed)
	const games = Array.from({ length: 8 }, (_, i) => {
		const final = i < 6
		return {
			_id: `game-${i}`,
			_createdAt: `2026-09-0${i + 1}T12:00:00Z`,
			season: 2026,
			week: i + 1,
			awayTeam: "Las Vegas Raiders",
			homeTeam: `Team ${i}`,
			kickoff: `2026-09-${String(10 + i)}T17:00:00Z`,
			predictedAwayScore: 10 + Math.floor(r() * 20),
			predictedHomeScore: 10 + Math.floor(r() * 20),
			actualAwayScore: final ? Math.floor(r() * 35) : null,
			actualHomeScore: final ? Math.floor(r() * 35) : null,
		}
	})
	const players = Array.from({ length: 12 }, (_, i) => ({
		_id: `leaguePlayer.player${i}`,
		_createdAt: `2026-09-${String(1 + i).padStart(2, "0")}T08:00:00Z`,
		handle: `Player${i}`,
		handleLower: `player${i}`,
		keyHash: `hash${i}`.padEnd(64, "0"),
		banned: i === 11,
	}))
	const picks: RawExport["picks"] = []
	players.forEach((p) =>
		games.forEach((g) => {
			if (r() < 0.2) return
			const a = Math.floor(r() * 35)
			const h = a + 1 + Math.floor(r() * 10)
			picks.push({ _id: `leaguePick.${p.handleLower}.${g._id}`, player: p.handleLower, predictionId: g._id, awayScore: a, homeScore: h, pickedAt: `2026-09-${String(5 + (picks.length % 5)).padStart(2, "0")}T10:00:00Z` })
		})
	)
	return { games, players, picks }
}

describe("backfill plan", () => {
	for (const seed of [11, 12, 13]) {
		it(`reproduces the live standings, ranks and blogger total (seed ${seed})`, () => {
			const raw = exportFor(seed)
			const plan = planBackfill(raw, "2026-10-17T00:00:00Z")
			const report = validateBackfill(raw, plan)
			expect(report.problems).toEqual([])
			expect(report.ok).toBe(true)
			expect(plan.entries.length).toBe(raw.picks.length)
			expect(plan.players.length).toBe(12)
			expect(plan.players.filter((p) => p.disabledAt).map((p) => p.legacyHandleLower)).toEqual(["player11"])
			expect(report.counts.finalGames).toBe(6)
		})
	}

	it("is deterministic: planning twice gives identical rows, so re-importing changes nothing", () => {
		const raw = exportFor(1)
		expect(JSON.stringify(planBackfill(raw, "2026-10-17T00:00:00Z"))).toBe(JSON.stringify(planBackfill(raw, "2026-10-17T00:00:00Z")))
		expect(uuidV5("player:amy")).toBe(uuidV5("player:amy"))
		expect(uuidV5("player:amy")).not.toBe(uuidV5("player:bo"))
		expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2")
	})

	it("keeps each player's original join date and legacy key hash, state unclaimed", () => {
		const raw = exportFor(2)
		const plan = planBackfill(raw, "2026-10-17T00:00:00Z")
		raw.players.forEach((p) => {
			const player = plan.players.find((x) => x.legacyHandleLower === p.handleLower)!
			expect(player.joinedAt).toBe(p._createdAt)
			expect(plan.legacy.find((l) => l.handleLower === p.handleLower)).toMatchObject({ keyHash: p.keyHash, playerId: player.id, sourceDocId: p._id })
		})
	})

	it("does not drop a pick silently: orphans are listed and block validation", () => {
		const raw = exportFor(3)
		raw.picks.push({ _id: "o1", player: "player1", predictionId: "deleted-game", awayScore: 10, homeScore: 20 })
		raw.picks.push({ _id: "o2", player: "ghost", predictionId: "game-0", awayScore: 10, homeScore: 20 })
		raw.picks.push({ _id: "o3", player: "player2", predictionId: "game-1", awayScore: 14, homeScore: 14 })
		const plan = planBackfill(raw, "2026-10-17T00:00:00Z")
		expect(plan.orphans.map((o) => o.kind).sort()).toEqual(["pick_without_game", "pick_without_player", "tie_pick"].concat(plan.orphans.some((o) => o.kind === "duplicate_pick") ? ["duplicate_pick"] : []).sort())
		const report = validateBackfill(raw, plan)
		expect(report.ok).toBe(false)
		expect(report.problems.length).toBeGreaterThanOrEqual(3)
	})

	it("catches a changed total", () => {
		const raw = exportFor(4)
		const plan = planBackfill(raw, "2026-10-17T00:00:00Z")
		plan.grades[0] = { ...plan.grades[0], points: plan.grades[0].points + 1 }
		expect(validateBackfill(raw, plan).ok).toBe(false)
	})

	it("handles an empty league", () => {
		const raw: RawExport = { games: [], players: [], picks: [] }
		const plan = planBackfill(raw, "2026-10-17T00:00:00Z")
		expect(validateBackfill(raw, plan).ok).toBe(true)
		expect(planToSql(plan)).toContain("nothing to import")
	})

	it("escapes quotes in the SQL it writes", () => {
		const raw = exportFor(5)
		raw.games[0].homeTeam = "Team O'Brien"
		expect(planToSql(planBackfill(raw, "2026-10-17T00:00:00Z"))).toContain("'Team O''Brien'")
	})
})

const TEST_PG = process.env.LEAGUE_TEST_PG
;(TEST_PG ? describe : describe.skip)("loading the plan into a real Postgres", () => {
	const psql = (sql: string, file = false) => execFileSync("psql", [TEST_PG as string, "-v", "ON_ERROR_STOP=1", "-q", "-X", "-t", "-A", file ? "-f" : "-c", sql], { encoding: "utf8" }).trim()

	it("loads in one transaction, is idempotent, and the database's own standings match", () => {
		const raw = exportFor(21)
		const plan = planBackfill(raw, "2026-10-17T00:00:00Z")
		const sql = planToSql(plan)
		// Wrap in an outer transaction we roll back: the script's own begin/commit are swapped for a savepoint.
		const body = sql.replace(/^begin;/, "savepoint load;").replace(/commit;\s*$/, "")
		const check = `
			select count(*) from league_players;
			select count(*) from league_entries;
			select count(*) from league_grades;
			select count(*) from league_current_grades;
			select sum(points) from league_current_grades c join league_players p on p.id = c.player_id where p.disabled_at is null;`
		const out = psql(`begin;\n${body}\n${body}\n${check}\nrollback;`.replace(/^begin;/, "begin;"), false)
		const lines = out.split("\n").filter((l) => /^\d+$/.test(l))
		expect(Number(lines[0])).toBe(12)
		expect(Number(lines[1])).toBe(plan.entries.length)
		expect(Number(lines[2])).toBe(plan.grades.length) // the second pass added nothing
		expect(Number(lines[3])).toBe(plan.grades.length)
		const expectedPoints = plan.grades.filter((g) => !plan.players.find((p) => p.id === g.playerId)!.disabledAt).reduce((n, g) => n + g.points, 0)
		expect(Number(lines[4])).toBe(expectedPoints)
	})
})
