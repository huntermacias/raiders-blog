import { describe, expect, it } from "vitest"

import { CARRY_OVER, type FinalGame, START_RATING, carryOver, runElo } from "../../lib/math/elo"
import type { GameBox } from "../../lib/math/efficiency"
import { rateSeason } from "../../lib/math/model"
import { ABBRS } from "../stubs/seasonSchedule"

describe("carryOver", () => {
	it("pulls last season's ratings a third of the way back to average", () => {
		const out = carryOver({ A: 1650, B: 1350, C: 1500 })
		expect(CARRY_OVER).toBeCloseTo(2 / 3, 9)
		expect(out.A).toBeCloseTo(1500 + 100, 6)
		expect(out.B).toBeCloseTo(1500 - 100, 6)
		expect(out.C).toBe(1500)
		expect(carryOver({ A: 1600 }, 1).A).toBe(1600)
		expect(carryOver({ A: 1600 }, 0).A).toBe(START_RATING)
	})
})

describe("runElo with a starting rating and a rest/travel edge", () => {
	const game = (over: Partial<FinalGame> = {}): FinalGame => ({ week: 1, home: "AAA", away: "BBB", homeScore: 24, awayScore: 20, ...over })

	it("starts teams from the ratings given and leaves the rest at 1500", () => {
		const run = runElo([game()], { AAA: 1600 })
		const before = runElo([game()])
		// AAA was expected to win more often, so the same result moves it less.
		expect(run.log[0].shiftHome).toBeLessThan(before.log[0].shiftHome)
		expect(run.ratings.AAA).toBeGreaterThan(1600)
		expect(run.ratings.BBB).toBeLessThan(1500)
	})

	it("does not mutate the starting ratings", () => {
		const start = { AAA: 1600 }
		runElo([game()], start)
		expect(start).toEqual({ AAA: 1600 })
	})

	it("gives the home side's edge to the win expectation, so the same win earns less when the edge was big", () => {
		const plain = runElo([game()]).log[0].shiftHome
		const edged = runElo([game({ edge: 40 })]).log[0].shiftHome
		expect(edged).toBeLessThan(plain)
		expect(edged).toBeGreaterThan(0)
		expect(runElo([game({ edge: 0 })]).log[0].shiftHome).toBeCloseTo(plain, 9)
	})
})

describe("rateSeason", () => {
	const finished: FinalGame[] = Array.from({ length: 16 }, (_, i) => ({ week: 1, home: ABBRS[2 * i], away: ABBRS[2 * i + 1], homeScore: 17 + (i % 4), awayScore: 20 }))

	it("is plain Elo when there is no prior and no box scores", () => {
		const r = rateSeason(finished)
		expect(r.at(1)).toEqual(runElo(finished).byWeek[1])
		expect(r.under(1)).toEqual({})
	})

	it("starts from the prior", () => {
		const r = rateSeason(finished, { prior: { [ABBRS[0]]: 1700 } })
		const flat = rateSeason(finished)
		expect(r.at(1)[ABBRS[0]]).toBeGreaterThan(flat.at(1)[ABBRS[0]] + 100)
		expect(r.run.log).toHaveLength(16)
	})

	it("adds the box-score nudge on top of Elo", () => {
		const boxes: GameBox[] = finished.map((g, i) => ({
			id: String(i),
			week: 1,
			home: g.home,
			away: g.away,
			homeScore: g.homeScore,
			awayScore: g.awayScore,
			homeYpp: i === 0 ? 3 : 5 + (i % 2 ? 1 : -1),
			awayYpp: i === 0 ? 7 : 5 + (i % 2 ? -1 : 1),
			homeTo: 1,
			awayTo: 1,
		}))
		const r = rateSeason(finished, { boxes })
		const plain = rateSeason(finished)
		const u = r.under(1)
		expect(Object.keys(u).length).toBe(32)
		expect(r.at(1)[ABBRS[0]]).toBeCloseTo(plain.at(1)[ABBRS[0]] + u[ABBRS[0]].adj, 9)
		expect(u[ABBRS[0]].adj).not.toBe(0)
	})

	it("falls back to the latest ratings for a week with no games", () => {
		const r = rateSeason(finished)
		expect(r.at(7)).toEqual(r.run.ratings)
	})
})
