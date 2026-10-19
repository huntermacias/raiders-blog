import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { buildSeason, NFL_LEAGUE } from "@/lib/playoffs/season"
import { seedConference } from "@/lib/playoffs/standings"
import { getRooting } from "@/lib/rooting/data"
import { GOALS, SCALE } from "@/lib/rooting/types"
import { EXTRAS, extraText, rowsFor, tableRows } from "@/lib/rooting/table"
import { getUnits } from "@/lib/lab/data"

const data = getRooting()!
const games = getGames()
const ranks = Object.fromEntries(Object.entries(getUnits().teams).map(([k, t]) => [k, { off: t.overall.off?.rank ?? null, def: t.overall.def?.rank ?? null }]))
const rows = tableRows({ data, schedule: games, goal: "playoffs", ranks })

describe("the standings table", () => {
	it("has one row for each of the 32 teams", () => {
		expect(rows).toHaveLength(32)
		expect(new Set(rows.map((r) => r.team)).size).toBe(32)
	})

	it("ranks teams with the same tiebreakers as the Playoff Machine's seeding", () => {
		const season = buildSeason(NFL_LEAGUE, games, {})
		for (const c of ["AFC", "NFC"] as const) {
			const s = seedConference(season, c)
			s.seeds.forEach((team, i) => {
				const r = rows.find((x) => x.team === team)!
				expect(r.seed).toBe(i + 1)
				expect(r.confRank).toBe(i + 1)
			})
			for (const members of Object.values(s.divisions)) members.forEach((team, i) => expect(rows.find((x) => x.team === team)!.divRank).toBe(i + 1))
			const ranks = rows.filter((r) => r.conference === c).map((r) => r.confRank).sort((a, b) => a - b)
			expect(ranks).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
		}
		expect(rows.filter((r) => r.seed !== null)).toHaveLength(14)
		expect(rows.map((r) => r.leagueRank).sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1))
	})

	it("shows the chance the guide stores for the goal chosen", () => {
		for (const goal of GOALS) {
			const g = tableRows({ data, schedule: games, goal })
			for (const r of g) expect(r.odds).toBeCloseTo(data.baseline[data.teams.indexOf(r.team) * 3 + GOALS.indexOf(goal)] / SCALE, 10)
		}
	})

	it("adds up: wins so far plus expected wins left is one win per game across the league", () => {
		const total = rows.reduce((s, r) => s + r.projWins, 0)
		expect(total).toBeCloseTo(games.length, 6)
		for (const r of rows) expect(r.projWins).toBeGreaterThanOrEqual(r.w)
	})

	it("counts a game that has just ended by its real result, not the model's chance", () => {
		const open = data.games[0]
		const withModel = tableRows({ data, schedule: games, goal: "playoffs" })
		const settled = [{ gameId: open.id, away: open.away, home: open.home, awayScore: 10, homeScore: 30, source: "espn" as const }]
		const after = tableRows({ data, schedule: games, goal: "playoffs", settled })
		const p = open.pHome / SCALE
		expect(after.find((r) => r.team === open.home)!.projWins - withModel.find((r) => r.team === open.home)!.projWins).toBeCloseTo(1 - p, 10)
		expect(after.find((r) => r.team === open.away)!.projWins - withModel.find((r) => r.team === open.away)!.projWins).toBeCloseTo(-(1 - p), 10)
	})

	it("keeps points for and against from the played games", () => {
		const pf = rows.reduce((s, r) => s + r.pf, 0)
		const pa = rows.reduce((s, r) => s + r.pa, 0)
		expect(pf).toBe(pa)
	})

	it("gives each tab the right teams, best first", () => {
		const lv = rowsFor(rows, "LV", "division")
		expect(lv.map((r) => r.team).sort()).toEqual(["DEN", "KC", "LAC", "LV"])
		expect(lv.map((r) => r.divRank)).toEqual([1, 2, 3, 4])
		expect(rowsFor(rows, "LV", "conference")).toHaveLength(16)
		expect(rowsFor(rows, "LV", "conference").every((r) => r.conference === "AFC")).toBe(true)
		expect(rowsFor(rows, "LV", "league")).toHaveLength(32)
		expect(rowsFor(rows, "ZZZ", "league")).toEqual([])
	})

	it("writes every side-column choice for every team", () => {
		for (const e of EXTRAS) for (const r of rows) expect(extraText(r, e.key)).toMatch(/^([+−]?\d+(\.\d)?|0|–)$/)
	})
})
