import { describe, expect, it } from "vitest"

import { TEAMS } from "../../lib/nfl"
import { ABBRS, schedule } from "../stubs/seasonSchedule"
import { expectedMargin, mulberry32, simulateSeason, sosRanks, winChance } from "../../lib/math/season"

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const inConf = (c: string) => TEAMS.filter((t) => t.conference === c).map((t) => t.abbr)

describe("win model", () => {
	it("gives the home team an edge when the ratings are level", () => {
		expect(expectedMargin(1500, 1500)).toBeCloseTo(1.92, 2)
		expect(winChance(1500, 1500)).toBeGreaterThan(0.55)
		expect(winChance(1600, 1500)).toBeGreaterThan(winChance(1500, 1500))
		expect(winChance(1500, 1500) + winChance(1500 + 0, 1500 + 0)).toBeGreaterThan(1)
	})
})

describe("simulateSeason", () => {
	const games = schedule(0)
	const res = simulateSeason(games, {}, { sims: 4000, seed: 7 })

	it("hands out exactly seven playoff spots, four division titles and one top seed per conference", () => {
		for (const c of ["AFC", "NFC"]) {
			const abbrs = inConf(c)
			expect(sum(abbrs.map((a) => res.teams[a].playoffs))).toBeCloseTo(7, 6)
			expect(sum(abbrs.map((a) => res.teams[a].division))).toBeCloseTo(4, 6)
			expect(sum(abbrs.map((a) => res.teams[a].topSeed))).toBeCloseTo(1, 6)
		}
	})

	it("hands out one win per game", () => {
		expect(sum(ABBRS.map((a) => res.teams[a].projWins))).toBeCloseTo(games.length, 6)
	})

	it("spreads each team's final wins over a distribution that sums to one", () => {
		for (const a of ABBRS) expect(sum(res.teams[a].winsDist)).toBeCloseTo(1, 6)
	})

	it("is repeatable for a seed and different for another", () => {
		const again = simulateSeason(games, {}, { sims: 4000, seed: 7 })
		const other = simulateSeason(games, {}, { sims: 4000, seed: 8 })
		expect(again.teams.LV.playoffs).toBe(res.teams.LV.playoffs)
		expect(other.teams.LV.playoffs).not.toBe(res.teams.LV.playoffs)
	})

	it("rewards a strong rating and punishes a weak one", () => {
		const r = simulateSeason(games, { LV: 1700, MIA: 1300 }, { sims: 4000, seed: 7 })
		expect(r.teams.LV.projWins).toBeGreaterThan(r.teams.KC.projWins + 2)
		expect(r.teams.LV.playoffs).toBeGreaterThan(0.85)
		expect(r.teams.MIA.playoffs).toBeLessThan(0.05)
	})

	it("counts results already played instead of replaying them", () => {
		// Everyone has played 17 weeks: nothing is left to simulate, so the odds are 0 or 1 and wins are the record.
		const done = simulateSeason(schedule(17), {}, { sims: 200, seed: 1 })
		for (const a of ABBRS) {
			const t = done.teams[a]
			expect(t.remaining).toBe(0)
			expect(t.projWins).toBeCloseTo(t.record.w + t.record.t / 2, 6)
			expect([0, 1]).toContain(t.playoffs)
		}
		expect(sum(inConf("AFC").map((a) => done.teams[a].playoffs))).toBe(7)
	})

	it("counts played games toward the record and leaves the rest to the simulation", () => {
		const part = simulateSeason(schedule(4), {}, { sims: 500, seed: 1 })
		for (const a of ABBRS) {
			const t = part.teams[a]
			expect(t.record.w + t.record.l + t.record.t).toBe(4)
			expect(t.remaining).toBe(13)
			expect(t.projWins).toBeGreaterThan(t.record.w)
		}
	})

	it("ignores games between teams it doesn't know", () => {
		const r = simulateSeason([...games, { week: 1, home: "XXX", away: "YYY", homeScore: 1, awayScore: 0 }], {}, { sims: 100, seed: 1 })
		expect(Object.keys(r.teams)).toHaveLength(32)
	})
})

describe("sosRanks / mulberry32", () => {
	it("ranks the hardest remaining schedule first", () => {
		const r = simulateSeason(schedule(0), { KC: 1700, MIA: 1300 }, { sims: 50, seed: 1 })
		const ranks = sosRanks(r)
		expect(Object.keys(ranks)).toHaveLength(32)
		// The team that plays KC the most-favourable way has a harder schedule than the team facing MIA.
		expect(ranks.KC).toBeGreaterThan(1) // KC doesn't face itself
		expect(ranks.MIA).toBeLessThan(33)
	})
	it("makes values in [0, 1) the same way every time", () => {
		const a = mulberry32(5)
		const b = mulberry32(5)
		const xs = Array.from({ length: 5 }, () => a())
		expect(xs).toEqual(Array.from({ length: 5 }, () => b()))
		expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
	})
})
