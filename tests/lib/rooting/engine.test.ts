import { describe, expect, it } from "vitest"

import { cannotTakeTopSeed, cannotWinDivision, clinchStatuses } from "@/lib/playoffs/clinching"
import { seedConference } from "@/lib/playoffs/standings"
import { simulateOdds } from "@/lib/playoffs/odds"
import { getGames } from "@/lib/playoffs/data"
import { makeContext, resultsKey, simulateBaseline, simulateConditional, simulateTie, flipped, resultSwing } from "@/lib/rooting/engine"
import { actionable, goalStatus, rankGames } from "@/lib/rooting/guide"
import { SCALE } from "@/lib/rooting/types"
import { TINY, beat, played, scheduled, seasonOf } from "../playoffs/fixtures"
import { dataFor, goalIdx } from "./helpers"

// TINY: X1 and X2 share a division, Y1 and Y2 the other; three of the four teams make it (two division winners and one wild card).
// X1 is 2-0, X2 is 1-1 (it lost to Y2). Two games are left: X1 hosts X2 (week 10) and Y1 hosts Y2 (week 10).
function fixture() {
	const decider = scheduled("X1", "X2")
	const other = scheduled("Y1", "Y2")
	const games = [beat("X1", "Y1", 1), beat("X1", "Y2", 2), beat("X2", "Y1", 3), beat("Y2", "X2", 4), decider, other]
	return { games, decider, other }
}

describe("conditional odds", () => {
	const { games, decider, other } = fixture()
	const ctx = makeContext(games, TINY)
	const cond = simulateConditional(ctx)
	const idx = (id: string) => ctx.open.findIndex((g) => g.id === id)
	const f = (team: string, goal: 0 | 1 | 2) => ctx.teamIndex.get(team)! * 3 + goal

	it("counts every ending exactly when few games are left", () => {
		expect(cond.exact).toBe(true)
		expect(cond.sims).toBe(0)
		// Two games, four endings: the sample size of each side is 2 endings.
		expect(cond.games[idx(decider.id)].n).toEqual([2, 2])
	})

	it("gives P(goal | home wins) and P(goal | away wins) that follow the standings", () => {
		const g = cond.games[idx(decider.id)]
		// X1 wins the game and the division; X2 wins it, and the two are 2-1 each with X2 ahead on head-to-head.
		expect(g.H[f("X1", 1)]).toBeCloseTo(1, 10)
		expect(g.A[f("X1", 1)]).toBeCloseTo(0, 10)
		expect(g.H[f("X2", 1)]).toBeCloseTo(0, 10)
		expect(g.A[f("X2", 1)]).toBeCloseTo(1, 10)
	})

	it("has a baseline equal to the weighted average of the conditionals", () => {
		const g = cond.games[idx(decider.id)]
		const pHome = ctx.chances[idx(decider.id)]
		for (let k = 0; k < ctx.size; k++) {
			expect(cond.baseline[k]).toBeCloseTo(pHome * g.H[k] + (1 - pHome) * g.A[k], 10)
		}
	})

	it("says a game does not matter to a goal it cannot touch", () => {
		// Who wins Y1 v Y2 cannot change who wins the X division.
		const g = cond.games[idx(other.id)]
		expect(g.H[f("X1", 1)]).toBeCloseTo(g.A[f("X1", 1)], 10)
	})

	it("works out a tie by forcing the game, on the same dice", () => {
		const tie = simulateTie(ctx, idx(decider.id))
		// A tie leaves X1 at 2-0-1 against X2 at 1-1-1: X1 still wins the division.
		expect(tie[f("X1", 1)]).toBeCloseTo(1, 10)
		expect(tie[f("X2", 1)]).toBeCloseTo(0, 10)
	})

	it("gives the same answer twice (common random numbers, no clock)", () => {
		const again = simulateConditional(makeContext(games, TINY))
		expect(again).toEqual(cond)
	})

	it("agrees with itself when sampled instead of enumerated", () => {
		const sampled = simulateConditional(ctx, { sims: 30000, exactMax: 0 })
		expect(sampled.exact).toBe(false)
		for (let k = 0; k < ctx.size; k++) expect(Math.abs(sampled.baseline[k] - cond.baseline[k])).toBeLessThan(0.02)
		const a = sampled.games[idx(decider.id)]
		expect(a.H[f("X1", 1)]).toBeCloseTo(1, 2)
		expect(a.A[f("X1", 1)]).toBeCloseTo(0, 2)
	})
})

describe("rooting recommendations by goal", () => {
	const { games, decider, other } = fixture()
	const data = dataFor(games, TINY)

	it("ranks the game that decides the division first for the teams in it, and says who to root for", () => {
		const recs = actionable(rankGames(data, "X1", "division"))
		expect(recs[0].gameId).toBe(decider.id)
		expect(recs[0].rootFor).toBe("X1")
		expect(recs[0].yours).toBe(true)
		expect(recs[0].gain).toBeGreaterThan(0)
		expect(recs[0].spread).toBeCloseTo(1, 3)
		const x2 = actionable(rankGames(data, "X2", "division"))
		expect(x2[0].rootFor).toBe("X2")
	})

	it("leaves a game out of the list for a goal it cannot change, instead of inventing a swing", () => {
		const recs = rankGames(data, "X1", "division")
		const y = recs.find((r) => r.gameId === other.id)!
		expect(y.impact).toBe("none")
		expect(y.rootFor).toBeNull()
		expect(actionable(recs).map((r) => r.gameId)).not.toContain(other.id)
	})

	it("changes the list with the goal: the other division's game matters for the other division's race", () => {
		const y1 = actionable(rankGames(data, "Y1", "division"))
		expect(y1[0].gameId).toBe(other.id)
		expect(y1[0].rootFor).toBe("Y1")
		expect(actionable(rankGames(data, "X1", "division")).map((r) => r.gameId)).not.toEqual(y1.map((r) => r.gameId))
	})

	it("reports the tie outcome beside the two wins", () => {
		const rec = rankGames(data, "X1", "division").find((r) => r.gameId === decider.id)!
		expect(rec.pTie).not.toBeNull()
		expect(rec.pTie as number).toBeCloseTo(1, 3)
	})

	it("has no exact error bar when everything was counted, and a real one when sampled", () => {
		expect(rankGames(data, "X1", "division")[0].se).toBe(0)
		const sampled = dataFor(games, TINY, { sims: 20000, exactMax: 0 })
		const rec = rankGames(sampled, "X1", "division").find((r) => r.gameId === decider.id)!
		expect(rec.se).toBeGreaterThanOrEqual(0)
		expect(rec.thin).toBe(false)
	})

	it("does not recommend on a noise-sized difference when sampled", () => {
		// The Y game is worth nothing to X1; sampled with the same dice, the two sides still agree to within noise.
		const sampled = dataFor(games, TINY, { sims: 4000, exactMax: 0 })
		const y = rankGames(sampled, "X1", "division").find((r) => r.gameId === other.id)!
		expect(y.spread).toBeLessThan(0.05)
		expect(y.impact).toBe("none")
	})
})

describe("sharing the Playoff Machine's engine", () => {
	it("matches the Playoff Machine's own odds for the same seasons", () => {
		const games = getGames()
		const sims = 600
		const ctx = makeContext(games)
		const mine = simulateConditional(ctx, { sims, exactMax: 0 })
		const theirs = simulateOdds({ games, predictions: {}, sims, track: "LV", trackGames: 0 })
		const t = ctx.teamIndex.get("LV")!
		expect(mine.baseline[t * 3]).toBeCloseTo(theirs.teams.LV.playoffs, 10)
		expect(mine.baseline[t * 3 + 1]).toBeCloseTo(theirs.teams.LV.division, 10)
		expect(mine.baseline[t * 3 + 2]).toBeCloseTo(theirs.teams.LV.bye, 10)
	})
})

describe("what a finished result was worth", () => {
	it("flips a decided game and leaves a tie alone", () => {
		const g = beat("X1", "Y1", 1)
		const f = flipped(g)!
		expect(f.winner).toBe("Y1")
		expect(f.homeScore).toBe(0)
		expect(flipped(played("X1", "Y1", 20, 20))).toBeNull()
	})

	it("measures a result as the difference between the world with it and the world without", () => {
		const { games } = fixture()
		const decided = games.find((g) => g.homeTeam === "X2")!
		const swing = resultSwing(games, decided.id, { sims: 500 }, TINY)!
		const ctx = makeContext(games, TINY)
		// X2 beat Y1 in week 3. Had Y1 won, Y1 would have a better record, so the result helps X2 and hurts Y1.
		expect(swing[ctx.teamIndex.get("Y1")! * 3 + 1]).toBeLessThanOrEqual(0)
		expect(swing.length).toBe(ctx.size)
	})
})

describe("clinching and elimination", () => {
	// X1 has won all three division games it played and X2 has lost them all, with only Y1 v Y2 left.
	const games = [beat("X1", "X2", 1), beat("X1", "Y1", 2), beat("X1", "Y2", 3), beat("Y1", "X2", 4), beat("Y2", "X2", 5), scheduled("Y1", "Y2")]
	const season = seasonOf(games, TINY)

	it("says a team that cannot catch the leader cannot win the division, and never the reverse", () => {
		expect(cannotWinDivision(season, "X2")).toBe(true)
		expect(cannotWinDivision(season, "X1")).toBe(false)
		expect(cannotWinDivision(season, "Y1")).toBe(false)
	})

	it("says the same about the top seed", () => {
		expect(cannotTakeTopSeed(season, "X2")).toBe(true)
		expect(cannotTakeTopSeed(season, "X1")).toBe(false)
	})

	it("turns those proofs into a status instead of a probability", () => {
		const seedings = (["AFC"] as const).map((c) => seedConference(season, c))
		const proof = clinchStatuses(season, seedings).get("X1")!
		expect(goalStatus({ ...proof, cannotWinDivision: false, cannotTakeTopSeed: false }, "division")).toBe("clinched")
		const x2 = clinchStatuses(season, seedings).get("X2")!
		expect(goalStatus({ ...x2, cannotWinDivision: true, cannotTakeTopSeed: true }, "division")).toBe("out")
		expect(goalStatus({ ...x2, cannotWinDivision: true, cannotTakeTopSeed: true }, "bye")).toBe("out")
	})

	it("never says out when a team can still reach the goal", () => {
		const open = [scheduled("X1", "X2"), scheduled("Y1", "Y2")]
		const s = seasonOf([beat("X1", "Y1", 1), beat("X2", "Y2", 2), ...open], TINY)
		for (const t of ["X1", "X2", "Y1", "Y2"]) {
			expect(cannotWinDivision(s, t), t).toBe(false)
		}
	})
})

describe("the results key", () => {
	const { games } = fixture()

	it("is the same for the same results, and changes when a final score arrives", () => {
		expect(resultsKey(games)).toBe(resultsKey([...games].reverse()))
		const next = games.map((g, i) => (i === games.length - 1 ? { ...g, homeScore: 21, awayScore: 20, status: "final" as const, winner: g.homeTeam } : g))
		expect(resultsKey(next)).not.toBe(resultsKey(games))
	})

	it("changes when a score is corrected, but not when only the kickoff or the spread moves", () => {
		const fixed = games.map((g, i) => (i === 0 ? { ...g, homeScore: (g.homeScore ?? 0) + 1 } : g))
		expect(resultsKey(fixed)).not.toBe(resultsKey(games))
		const moved = games.map((g) => (g.status === "final" ? g : { ...g, week: g.week + 1, spread: 3 }))
		expect(resultsKey(moved)).toBe(resultsKey(games))
	})

	it("changes with the settings, so a bigger sample is not mistaken for the old one", () => {
		expect(resultsKey(games, { sims: 1000 })).not.toBe(resultsKey(games, { sims: 2000 }))
	})
})

describe("baseline", () => {
	it("is a probability for every team and goal, and each division has exactly one winner", () => {
		const { games } = fixture()
		const ctx = makeContext(games, TINY)
		const base = simulateBaseline(ctx)
		for (const v of base) {
			expect(v).toBeGreaterThanOrEqual(0)
			expect(v).toBeLessThanOrEqual(1)
		}
		const f = (team: string) => base[ctx.teamIndex.get(team)! * 3 + 1]
		expect(f("X1") + f("X2")).toBeCloseTo(1, 10)
		expect(f("Y1") + f("Y2")).toBeCloseTo(1, 10)
		expect(SCALE).toBe(10000)
		expect(goalIdx).toBeTypeOf("function")
	})
})
