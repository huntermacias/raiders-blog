import { describe, expect, it } from "vitest"

import { EFF_CAP, type GameBox, parseBox, underlying } from "../../lib/math/efficiency"
import { ABBRS } from "../stubs/seasonSchedule"

const summary = (over: { completed?: boolean; homeYpp?: string | null; awayYpp?: string | null; homeAbbr?: string } = {}) => ({
	header: {
		competitions: [
			{
				status: { type: { completed: over.completed ?? true } },
				competitors: [
					{ homeAway: "home", score: "27", team: { id: "13", abbreviation: over.homeAbbr ?? "LV" } },
					{ homeAway: "away", score: "30", team: { id: "12", abbreviation: "KC" } },
				],
			},
		],
	},
	boxscore: {
		teams: [
			{ team: { id: "12" }, statistics: [{ name: "yardsPerPlay", displayValue: over.awayYpp === undefined ? "6.9" : over.awayYpp ?? "" }, { name: "turnovers", displayValue: "0" }] },
			{ team: { id: "13" }, statistics: [{ name: "yardsPerPlay", displayValue: over.homeYpp === undefined ? "5.6" : over.homeYpp ?? "" }, { name: "turnovers", displayValue: "2" }] },
		],
	},
})

describe("parseBox", () => {
	it("reads a finished game's yards per play, turnovers and score for each side", () => {
		expect(parseBox(summary(), { id: "401872976", week: 4 })).toEqual({
			id: "401872976",
			week: 4,
			home: "LV",
			away: "KC",
			homeScore: 27,
			awayScore: 30,
			homeYpp: 5.6,
			awayYpp: 6.9,
			homeTo: 2,
			awayTo: 0,
		})
	})
	it("uses the site's abbreviation for Washington", () => {
		expect(parseBox(summary({ homeAbbr: "WSH" }), { id: "1", week: 1 })?.home).toBe("WAS")
	})
	it("returns null unless the game is final and both yards-per-play numbers are there", () => {
		expect(parseBox(summary({ completed: false }), { id: "1", week: 1 })).toBeNull()
		expect(parseBox(summary({ homeYpp: null }), { id: "1", week: 1 })).toBeNull()
		expect(parseBox(summary({ awayYpp: "0.0" }), { id: "1", week: 1 })).toBeNull()
		expect(parseBox({}, { id: "1", week: 1 })).toBeNull()
		expect(parseBox(null, { id: "1", week: 1 })).toBeNull()
	})
})

/** Sixteen games, one per pair of teams, each team playing once in `week`. */
function round(week: number, f: (home: string, away: string, i: number) => Partial<GameBox>): GameBox[] {
	return Array.from({ length: 16 }, (_, i) => ({
		id: `${week}-${i}`,
		week,
		home: ABBRS[2 * i],
		away: ABBRS[2 * i + 1],
		homeScore: 20,
		awayScore: 20,
		homeYpp: 5,
		awayYpp: 5,
		homeTo: 1,
		awayTo: 1,
		...f(ABBRS[2 * i], ABBRS[2 * i + 1], i),
	}))
}

describe("underlying", () => {
	it("says nothing until enough teams have a box score", () => {
		expect(underlying(round(1, () => ({})).slice(0, 3), 1)).toEqual({})
		expect(underlying([], 1)).toEqual({})
	})

	it("marks down a team that wins without the yardage to back it up, and marks up one that loses despite it", () => {
		// Home teams win by 10 with fewer yards per play in game 0; in game 1 the home team loses by 10 while outgaining the visitor.
		const boxes = round(1, (_h, _a, i) => {
			if (i === 0) return { homeScore: 30, awayScore: 20, homeYpp: 4.0, awayYpp: 6.0 }
			if (i === 1) return { homeScore: 20, awayScore: 30, homeYpp: 6.5, awayYpp: 4.0 }
			// the rest have yardage and scores that agree, so the league-wide spread is meaningful
			const big = i % 2 === 0
			return { homeScore: big ? 31 : 17, awayScore: big ? 17 : 31, homeYpp: big ? 6.5 : 4.5, awayYpp: big ? 4.5 : 6.5 }
		})
		const u = underlying(boxes, 1)
		expect(u[ABBRS[0]].adj).toBeLessThan(0) // won, but outgained
		expect(u[ABBRS[1]].adj).toBeGreaterThan(0) // lost, but outgained them
		expect(u[ABBRS[2]].adj).toBeGreaterThan(0) // lost, but outgained
		expect(u[ABBRS[0]].margin).toBe(10)
		expect(u[ABBRS[0]].netYpp).toBeCloseTo(-2, 6)
		expect(u[ABBRS[0]].games).toBe(1)
	})

	it("is zero-sum in spirit: the average nudge across the league is near zero", () => {
		const boxes = [...round(1, (_h, _a, i) => ({ homeScore: 20 + i, awayScore: 17, homeYpp: 5 + (i % 5) * 0.3, awayYpp: 5 })), ...round(2, (_h, _a, i) => ({ homeScore: 20, awayScore: 20 + i, homeYpp: 5, awayYpp: 5 + (i % 3) * 0.4 }))]
		const u = underlying(boxes, 2)
		const total = Object.values(u).reduce((s, x) => s + x.adj, 0)
		expect(Math.abs(total / Object.keys(u).length)).toBeLessThan(2)
	})

	it("trusts it more as games pile up, never beyond the cap, and counts only the weeks asked for", () => {
		const lucky = (week: number) => round(week, (_h, _a, i) => (i === 0 ? { homeScore: 40, awayScore: 10, homeYpp: 3.5, awayYpp: 6.5 } : { homeScore: i % 2 ? 31 : 17, awayScore: i % 2 ? 17 : 31, homeYpp: i % 2 ? 6 : 4, awayYpp: i % 2 ? 4 : 6 }))
		const one = underlying(lucky(1), 1)[ABBRS[0]]
		const boxes = [1, 2, 3, 4, 5, 6].flatMap(lucky)
		const six = underlying(boxes, 6)[ABBRS[0]]
		expect(Math.abs(six.adj)).toBeGreaterThan(Math.abs(one.adj))
		expect(Math.abs(six.adj)).toBeLessThanOrEqual(EFF_CAP)
		expect(underlying(boxes, 1)[ABBRS[0]].games).toBe(1)
		expect(underlying(boxes, 3)[ABBRS[0]].games).toBe(3)
		const strong = underlying(boxes, 6, { weight: 50, cap: 10 })[ABBRS[0]]
		expect(Math.abs(strong.adj)).toBe(10)
	})

	it("reports turnover margin as takeaways minus giveaways per game, without using it in the rating", () => {
		const base = round(1, () => ({ homeScore: 20, awayScore: 20, homeYpp: 5, awayYpp: 5 }))
		const withTurnovers = round(1, (_h, _a, i) => (i === 0 ? { homeTo: 4, awayTo: 0 } : {}))
		const a = underlying(base, 1)
		const b = underlying(withTurnovers, 1)
		expect(b[ABBRS[0]].turnoverMargin).toBe(-4)
		expect(b[ABBRS[1]].turnoverMargin).toBe(4)
		expect(b[ABBRS[0]].adj).toBeCloseTo(a[ABBRS[0]].adj, 9)
	})
})
