import { describe, expect, it } from "vitest"

import type { LabGame } from "../../lib/lab/types"
import type { GamePrediction } from "../../lib/predictions"
import {
	atsOf,
	axisDomain,
	axisPct,
	buildVegasBoard,
	compare,
	coverOf,
	coverText,
	leanOf,
	leanText,
	lineText,
	marginText,
	raidersLine,
	signed,
	summarizeVegas,
	type VegasGame,
} from "../../lib/vegas"
import { getGames } from "../../lib/lab/data"

const lab = (over: Partial<LabGame>): LabGame =>
	({ id: "x", week: 1, date: "2026-09-13", home: true, opp: "MIA", oppName: "Dolphins", score: [27, 13], result: "W", spread: 3, roof: null, wp: [], scores: [], keyPlays: [], drives: [], ...over }) as LabGame

const pick = (over: Partial<GamePrediction>): GamePrediction => ({
	_id: "p",
	week: 1,
	awayTeam: "Miami Dolphins",
	homeTeam: "Las Vegas Raiders",
	kickoff: "2026-09-13T20:05:00Z",
	predictedAwayScore: 17,
	predictedHomeScore: 24,
	actualAwayScore: 13,
	actualHomeScore: 27,
	...over,
})

describe("raidersLine", () => {
	it("is the spread at home and its negative on the road", () => {
		expect(raidersLine(3, true)).toBe(3)
		expect(raidersLine(6.5, false)).toBe(-6.5)
	})
	it("handles a pick'em without -0, and a missing spread", () => {
		expect(Object.is(raidersLine(0, false), 0)).toBe(true)
		expect(raidersLine(null, true)).toBeNull()
		expect(raidersLine(undefined, true)).toBeNull()
		expect(raidersLine(NaN, true)).toBeNull()
	})
})

describe("cover, lean and ATS", () => {
	it("covers by the side of the line the margin lands on", () => {
		expect(coverOf(14, 3)).toBe("raiders")
		expect(coverOf(2, 3)).toBe("opponent")
		expect(coverOf(-10, -3.5)).toBe("opponent")
		expect(coverOf(3, 3)).toBe("push")
	})
	it("leans toward the side my margin favors", () => {
		expect(leanOf(7, 3)).toBe("raiders")
		expect(leanOf(1, 3)).toBe("opponent")
		expect(leanOf(3, 3)).toBeNull()
		expect(leanOf(-1, -3.5)).toBe("raiders") // losing by 1 still takes the Raiders +3.5
	})
	it("grades a lean against the cover", () => {
		expect(atsOf("raiders", "raiders")).toBe("hit")
		expect(atsOf("opponent", "raiders")).toBe("miss")
		expect(atsOf("opponent", "opponent")).toBe("hit")
		expect(atsOf("raiders", "push")).toBe("push")
		expect(atsOf(null, "raiders")).toBe("none")
	})
})

describe("compare", () => {
	it("works a home game: line +3, I had +7, they won by 14", () => {
		const g = compare(pick({}), [lab({})]) as VegasGame
		expect(g.line).toBe(3)
		expect(g.hunterMargin).toBe(7)
		expect(g.actualMargin).toBe(14)
		expect(g.cover).toBe("raiders")
		expect(g.lean).toBe("raiders")
		expect(g.ats).toBe("hit")
		expect(g.hunterError).toBe(7)
		expect(g.vegasError).toBe(11)
		expect(g.closer).toBe("hunter")
		expect(g.oppAbbr).toBe("MIA")
		expect(g.home).toBe(true)
	})

	it("works a road game as the underdog: Raiders +6.5 at LAC, won by 12", () => {
		const p = pick({
			week: 2,
			awayTeam: "Las Vegas Raiders",
			homeTeam: "Los Angeles Chargers",
			kickoff: "2026-09-20T20:05:00Z",
			predictedAwayScore: 20,
			predictedHomeScore: 24, // I had the Raiders losing by 4
			actualAwayScore: 26,
			actualHomeScore: 14,
		})
		const g = compare(p, [lab({ week: 2, date: "2026-09-20", home: false, opp: "LAC", spread: 6.5 })]) as VegasGame
		expect(g.line).toBe(-6.5)
		expect(g.hunterMargin).toBe(-4)
		expect(g.lean).toBe("raiders") // -4 is better than -6.5, so I took Raiders +6.5
		expect(g.actualMargin).toBe(12)
		expect(g.cover).toBe("raiders")
		expect(g.ats).toBe("hit")
		expect(g.hunterError).toBe(16)
		expect(g.vegasError).toBe(18.5)
		expect(g.closer).toBe("hunter")
	})

	it("calls it a miss when I leaned one way and the other side covered", () => {
		const g = compare(pick({ actualHomeScore: 17, actualAwayScore: 16 }), [lab({})]) as VegasGame // won by 1, line +3
		expect(g.cover).toBe("opponent")
		expect(g.lean).toBe("raiders")
		expect(g.ats).toBe("miss")
	})

	it("can have the market closer than me", () => {
		// I said +20, the line was +3, they won by 4
		const g = compare(pick({ predictedHomeScore: 30, predictedAwayScore: 10, actualHomeScore: 20, actualAwayScore: 16 }), [lab({})]) as VegasGame
		expect(g.hunterError).toBe(16)
		expect(g.vegasError).toBe(1)
		expect(g.closer).toBe("vegas")
	})

	it("pushes on the number, and ties when the market and I were equally far off", () => {
		// I had +7, the line was +7, they won by 7: no lean, a push, and the same miss (zero) for both
		const exact = compare(pick({ predictedHomeScore: 17, predictedAwayScore: 10, actualHomeScore: 17, actualAwayScore: 10 }), [lab({ spread: 7 })]) as VegasGame
		expect(exact.cover).toBe("push")
		expect(exact.lean).toBeNull()
		expect(exact.ats).toBe("none")
		expect(exact.closer).toBe("tie")
		// I had +10, the line was +4, they won by 7: I was off 3, the line was off 3
		const equal = compare(pick({ predictedHomeScore: 20, predictedAwayScore: 10, actualHomeScore: 17, actualAwayScore: 10 }), [lab({ spread: 4 })]) as VegasGame
		expect(equal.hunterError).toBe(3)
		expect(equal.vegasError).toBe(3)
		expect(equal.closer).toBe("tie")
		expect(equal.ats).toBe("hit") // leaned Raiders -4, they covered
	})

	it("skips picks that aren't graded or aren't Raiders games, and flags a missing line", () => {
		expect(compare(pick({ actualHomeScore: null, actualAwayScore: null }), [lab({})])).toBeNull()
		expect(compare(pick({ awayTeam: "Denver Broncos", homeTeam: "Kansas City Chiefs" }), [lab({})])).toBeNull()
		expect(compare(pick({}), [])).toBe("no-line")
		expect(compare(pick({}), [lab({ spread: null })])).toBe("no-line")
	})

	it("matches the right meeting when a rival is played twice", () => {
		const games = [lab({ id: "a", date: "2026-09-13", spread: 3 }), lab({ id: "b", date: "2026-12-20", spread: -6, week: 15 })]
		const late = compare(pick({ week: 15, kickoff: "2026-12-20T21:25:00Z" }), games) as VegasGame
		expect(late.line).toBe(-6)
		const early = compare(pick({}), games) as VegasGame
		expect(early.line).toBe(3)
	})
})

describe("summarizeVegas / buildVegasBoard", () => {
	const picks = [
		pick({ _id: "1", week: 1 }), // +7 vs +3, won by 14: hit, hunter closer
		pick({ _id: "2", week: 2, kickoff: "2026-09-20T20:05:00Z", actualHomeScore: 17, actualAwayScore: 16, predictedHomeScore: 24, predictedAwayScore: 10 }),
		pick({ _id: "3", week: 9, kickoff: "2026-11-08T20:05:00Z" }), // no lab game for this week
		pick({ _id: "4", week: 4, actualHomeScore: null, actualAwayScore: null }),
	]
	const games = [lab({}), lab({ week: 2, date: "2026-09-20", spread: 3 })]
	const board = buildVegasBoard(picks, games)

	it("keeps only comparable games, in week order, and counts the ones missing a line", () => {
		expect(board.games.map((g) => g.week)).toEqual([1, 2])
		expect(board.summary.games).toBe(2)
		expect(board.summary.missingLine).toBe(1)
	})
	it("summarizes ATS, errors and who was closer", () => {
		const s = board.summary
		expect(s.ats).toEqual({ hits: 1, misses: 1, pushes: 0, noLean: 0 })
		expect(s.atsPct).toBe(0.5)
		expect(s.hunterAvgError).toBeCloseTo((7 + 13) / 2)
		expect(s.vegasAvgError).toBeCloseTo((11 + 2) / 2)
		expect(s.closer).toEqual({ hunter: 1, vegas: 1, tie: 0 })
	})
	it("is empty and null-safe with nothing graded", () => {
		const s = summarizeVegas([])
		expect(s.games).toBe(0)
		expect(s.atsPct).toBeNull()
		expect(s.hunterAvgError).toBeNull()
		expect(s.vegasAvgError).toBeNull()
	})
	it("leaves pushes out of the ATS percentage", () => {
		const s = summarizeVegas([{ ats: "hit", closer: "tie", hunterError: 0, vegasError: 0 }, { ats: "push", closer: "tie", hunterError: 0, vegasError: 0 }] as VegasGame[])
		expect(s.atsPct).toBe(1)
		expect(s.ats.pushes).toBe(1)
	})
})

describe("display helpers", () => {
	it("signs with a real minus", () => {
		expect(signed(-3.5)).toBe("−3.5")
		expect(signed(7)).toBe("+7")
		expect(signed(0)).toBe("0")
	})
	it("names the line from the favorite's side", () => {
		expect(lineText(3, "Dolphins")).toBe("Raiders −3")
		expect(lineText(-6.5, "Chargers")).toBe("Chargers −6.5")
		expect(lineText(0, "Saints")).toBe("Pick’em")
	})
	it("names the side I took", () => {
		expect(leanText({ lean: "raiders", line: 3, oppNick: "Dolphins" })).toBe("Raiders −3")
		expect(leanText({ lean: "raiders", line: -3.5, oppNick: "Saints" })).toBe("Raiders +3.5")
		expect(leanText({ lean: "opponent", line: -3.5, oppNick: "Saints" })).toBe("Saints −3.5")
		expect(leanText({ lean: "opponent", line: 3, oppNick: "Dolphins" })).toBe("Dolphins +3")
		expect(leanText({ lean: null, line: 3, oppNick: "Dolphins" })).toBeNull()
	})
	it("says who covered and by how much", () => {
		expect(coverText({ cover: "raiders", actualMargin: 8, line: -3.5, oppNick: "Saints" })).toBe("Raiders covered by 11.5")
		expect(coverText({ cover: "opponent", actualMargin: 1, line: 3, oppNick: "Dolphins" })).toBe("Dolphins covered by 2")
		expect(coverText({ cover: "push", actualMargin: 3, line: 3, oppNick: "Dolphins" })).toBe("Pushed")
	})
	it("words a margin", () => {
		expect(marginText(7, "Saints")).toBe("Raiders by 7")
		expect(marginText(-3, "Saints")).toBe("Saints by 3")
		expect(marginText(0, "Saints")).toBe("Tie")
	})
})

describe("axis", () => {
	const g = (line: number, hm: number, am: number) => ({ line, hunterMargin: hm, actualMargin: am }) as VegasGame
	it("includes every marker and zero, on whole-touchdown lines", () => {
		const d = axisDomain([g(-6.5, -4, 12), g(3, 7, 14)])
		expect(d.lo).toBeLessThanOrEqual(-6.5)
		expect(d.hi).toBeGreaterThanOrEqual(14)
		expect(Math.abs(d.lo % 7)).toBe(0)
		expect(Math.abs(d.hi % 7)).toBe(0)
		expect(d.ticks).toContain(0)
		expect(d.ticks[0]).toBe(d.lo)
		expect(d.ticks[d.ticks.length - 1]).toBe(d.hi)
	})
	it("has a sensible minimum width with no games", () => {
		const d = axisDomain([])
		expect(d.hi - d.lo).toBeGreaterThanOrEqual(21)
	})
	it("places values as percentages and clamps outliers", () => {
		const d = { lo: -14, hi: 14 }
		expect(axisPct(0, d)).toBe(50)
		expect(axisPct(-14, d)).toBe(0)
		expect(axisPct(14, d)).toBe(100)
		expect(axisPct(99, d)).toBe(100)
	})
})

describe("real season data", () => {
	it("every Lab game has a spread, so its Raiders-side line is a finite number", () => {
		for (const g of getGames()) {
			const line = raidersLine(g.spread, g.home)
			expect(line, `week ${g.week}`).not.toBeNull()
			expect(Number.isFinite(line as number)).toBe(true)
		}
	})
})
