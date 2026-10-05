import { describe, expect, it } from "vitest"

import { compareBoard, gradeBoards, hotTakes, ratingRanks } from "../../lib/math/compare"
import { type FinalGame, HOME_FIELD, START_RATING, expected, homeWinProbability, runElo } from "../../lib/math/elo"
import { buildBoards } from "../../lib/rankings"
import { TEAMS } from "../../lib/nfl"

const g = (week: number, home: string, away: string, homeScore: number, awayScore: number): FinalGame => ({ week, home, away, homeScore, awayScore })

describe("elo", () => {
	it("is zero-sum: what the winner gains the loser gives up", () => {
		const { ratings } = runElo([g(1, "LV", "KC", 27, 20)])
		expect(ratings.LV + ratings.KC).toBeCloseTo(2 * START_RATING, 6)
		expect(ratings.LV).toBeGreaterThan(START_RATING)
	})

	it("treats the home field as worth something: an equal-rated home team is a favorite", () => {
		expect(expected(0)).toBeCloseTo(0.5, 6)
		expect(homeWinProbability(1500, 1500)).toBeGreaterThan(0.55)
		expect(homeWinProbability(1500, 1500)).toBeCloseTo(expected(HOME_FIELD), 6)
	})

	it("moves ratings more for a blowout than a one-score game", () => {
		const close = runElo([g(1, "LV", "KC", 21, 20)]).ratings.LV
		const blowout = runElo([g(1, "LV", "KC", 45, 10)]).ratings.LV
		expect(blowout - START_RATING).toBeGreaterThan(close - START_RATING)
	})

	it("rewards an away win over a home win against the same opponent", () => {
		const away = runElo([g(1, "KC", "LV", 20, 27)]).ratings.LV
		const home = runElo([g(1, "LV", "KC", 27, 20)]).ratings.LV
		expect(away).toBeGreaterThan(home)
	})

	it("splits a tie fairly and records ratings after each week and games played", () => {
		const run = runElo([g(1, "LV", "KC", 17, 17), g(2, "LV", "DEN", 30, 10)])
		expect(Object.keys(run.byWeek).map(Number)).toEqual([1, 2])
		expect(run.byWeek[1].LV).toBeLessThan(START_RATING) // the home team "should" have won a tie game
		expect(run.byWeek[1].KC).toBeGreaterThan(START_RATING)
		expect(run.byWeek[2].LV).toBeGreaterThan(run.byWeek[1].LV)
		expect(run.played).toMatchObject({ LV: 2, KC: 1, DEN: 1 })
	})
})

describe("compareBoard", () => {
	const names = TEAMS.slice(0, 6).map((t) => t.name)
	const board = buildBoards([{ _id: "w1", season: 2026, week: 1, teams: names.map((team) => ({ team })) }])[0]

	it("ranks the math among the teams on the board and signs the gap", () => {
		const [a, b, c, d, e, f] = TEAMS.slice(0, 6).map((t) => t.abbr)
		// The board's last team has the best rating, its first the worst.
		const ratings = { [a]: 1400, [b]: 1450, [c]: 1500, [d]: 1550, [e]: 1600, [f]: 1650 }
		const rows = compareBoard(board, ratings)
		expect(rows.map((r) => r.blogger)).toEqual([1, 2, 3, 4, 5, 6])
		expect(rows.map((r) => r.math)).toEqual([6, 5, 4, 3, 2, 1])
		expect(rows[0].gap).toBe(5) // I have team one at No. 1, the math has it at No. 6: I'm higher
		expect(rows[5].gap).toBe(-5)
		expect(hotTakes(rows, 4).map((r) => r.abbr)).toEqual([a, f])
		expect(hotTakes(rows, 6)).toEqual([])
	})

	it("keeps the board order when ratings are level", () => {
		const m = ratingRanks({}, names)
		expect(Array.from(m.values())).toEqual([1, 2, 3, 4, 5, 6])
	})
})

describe("gradeBoards", () => {
	const abbr = (i: number) => TEAMS[i].abbr
	const team = (i: number) => TEAMS[i].name
	// Week 1 board: team 0 > team 1 > team 2 > team 3.
	const boards = buildBoards([{ _id: "w1", season: 2026, week: 1, teams: [0, 1, 2, 3].map((i) => ({ team: team(i) })) }])
	// Ratings after week 1 disagree with the board about teams 2 and 3.
	const byWeek = { 1: { [abbr(0)]: 1520, [abbr(1)]: 1510, [abbr(2)]: 1480, [abbr(3)]: 1530 } }

	it("grades week N rankings on week N+1 games, for both sides", () => {
		const games = [
			g(2, abbr(0), abbr(1), 24, 17), // both pick team 0: right
			g(2, abbr(2), abbr(3), 10, 20), // I pick team 2, the math picks team 3; team 3 wins: math right
			g(1, abbr(0), abbr(3), 99, 0), // week 1 games aren't graded by the week 1 board
		]
		const card = gradeBoards(boards, games, byWeek)
		expect(card.blogger).toEqual({ right: 1, games: 2 })
		expect(card.math).toEqual({ right: 2, games: 2 })
		expect(card.split).toEqual({ games: 1, blogger: 0, math: 1 })
		expect(card.games.map((x) => x.week)).toEqual([2, 2])
	})

	it("skips ties and games with a team that isn't on the board", () => {
		const card = gradeBoards(boards, [g(2, abbr(0), abbr(1), 20, 20), g(2, abbr(0), abbr(9), 24, 3)], byWeek)
		expect(card.blogger.games).toBe(0)
	})

	it("skips a board whose week has no ratings yet", () => {
		expect(gradeBoards(boards, [g(2, abbr(0), abbr(1), 24, 17)], {}).blogger.games).toBe(0)
	})
})
