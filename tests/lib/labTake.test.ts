import { describe, expect, it } from "vitest"

import { getGames } from "../../lib/lab/data"
import { labGameFor, opponentAbbr } from "../../lib/lab/match"
import { labStory } from "../../lib/lab/story"
import type { KeyPlay, LabGame, WpPoint } from "../../lib/lab/types"

const base = (over: Partial<LabGame>): LabGame => ({
	id: "x",
	week: 1,
	date: "2026-09-13",
	home: true,
	opp: "MIA",
	oppName: "Dolphins",
	score: [27, 13],
	result: "W",
	spread: 3,
	roof: null,
	wp: [[0, 0.5], [1800, 0.6], [3600, 1]],
	scores: [],
	keyPlays: [],
	drives: [],
	...over,
})

const key = (over: Partial<KeyPlay>): KeyPlay => ({ el: 600, q: 1, clock: "5:00", kind: "TD", team: "LV", wpBefore: 0.5, wpAfter: 0.6, text: "td", score: [7, 0], ...over })

describe("opponentAbbr", () => {
	it("reads full names, nicknames and abbreviations, any case", () => {
		expect(opponentAbbr("New Orleans Saints")).toBe("NO")
		expect(opponentAbbr("saints")).toBe("NO")
		expect(opponentAbbr("NO")).toBe("NO")
		expect(opponentAbbr(" Los Angeles Chargers ")).toBe("LAC")
		expect(opponentAbbr("vs. Kansas City Chiefs")).toBe("KC")
	})
	it("returns null for nothing or for a team it does not know", () => {
		expect(opponentAbbr(null)).toBeNull()
		expect(opponentAbbr("")).toBeNull()
		expect(opponentAbbr("Springfield Isotopes")).toBeNull()
	})
})

describe("labGameFor", () => {
	it("finds this season's games by opponent and date", () => {
		expect(labGameFor({ opponent: "New Orleans Saints", gameDate: "2026-09-27T20:05:00Z" })?.week).toBe(3)
		expect(labGameFor({ opponent: "Miami Dolphins", gameDate: "2026-09-13T17:00:00Z" })?.week).toBe(1)
		// Sunday night in Pacific time is already Monday in UTC.
		expect(labGameFor({ opponent: "Los Angeles Chargers", gameDate: "2026-09-21T03:20:00Z" })?.week).toBe(2)
	})

	it("returns null when the Lab does not have that game", () => {
		expect(labGameFor({ opponent: "Denver Broncos", gameDate: "2026-10-18T20:25:00Z" })).toBeNull()
		expect(labGameFor({ opponent: "nobody", gameDate: "2026-09-27T20:05:00Z" })).toBeNull()
		expect(labGameFor({ opponent: null, gameDate: "2026-09-27T20:05:00Z" })).toBeNull()
	})

	it("does not match a game a week away", () => {
		expect(labGameFor({ opponent: "New Orleans Saints", gameDate: "2026-10-11T20:05:00Z" })).toBeNull()
	})

	it("without a date, matches only when the opponent is unique", () => {
		expect(labGameFor({ opponent: "New Orleans Saints" })?.week).toBe(3)
		const twice = [base({ week: 2, opp: "DEN", date: "2026-09-20" }), base({ week: 12, opp: "DEN", date: "2026-11-29" })]
		expect(labGameFor({ opponent: "Denver Broncos" }, twice)).toBeNull()
	})

	it("picks the right meeting of a division rival", () => {
		const twice = [base({ week: 2, opp: "DEN", date: "2026-09-20" }), base({ week: 12, opp: "DEN", date: "2026-11-29" })]
		expect(labGameFor({ opponent: "Denver Broncos", gameDate: "2026-11-29T21:25:00Z" }, twice)?.week).toBe(12)
		expect(labGameFor({ opponent: "Denver Broncos", gameDate: "2026-09-20T20:05:00Z" }, twice)?.week).toBe(2)
	})
})

describe("labStory", () => {
	it("says a comeback win was a comeback", () => {
		const wp: WpPoint[] = [[0, 0.5], [1200, 0.15], [3000, 0.9]]
		const g = base({ wp, keyPlays: [key({ el: 300, kind: "TD", team: "NO", score: [0, 7], wpBefore: 0.5, wpAfter: 0.3 }), key({ el: 2000, score: [14, 7], wpBefore: 0.3, wpAfter: 0.8 })] })
		const s = labStory(g)
		expect(s.headline).toMatch(/Down to 15% in Q2, then the Raiders took it back/)
		expect(s.detail).toMatch(/moved it most/)
	})

	it("covers a win that was never in danger, and one that was close", () => {
		expect(labStory(base({ wp: [[0, 0.5], [900, 0.8], [3600, 1]], keyPlays: [key({ score: [14, 0] }), key({ score: [21, 0] })] })).headline).toMatch(/Never trailed/)
		expect(labStory(base({ wp: [[0, 0.5], [900, 0.45], [3600, 1]], keyPlays: [key({ score: [0, 3], kind: "FG", team: "MIA" }), key({ score: [3, 3], kind: "FG" }), key({ score: [10, 3] })] })).headline).toMatch(/closer than the final|never trailed|lead changes/i)
	})

	it("says a blown lead was a blown lead", () => {
		const g = base({ result: "L", score: [20, 24], wp: [[0, 0.5], [2000, 0.88], [3600, 0]], keyPlays: [key({ score: [14, 0] }), key({ el: 3000, team: "MIA", score: [14, 17], wpBefore: 0.7, wpAfter: 0.2 })] })
		expect(labStory(g).headline).toMatch(/88% chance to win in Q3, and it slipped away/)
	})

	it("handles a loss that never led and a tie", () => {
		const never = base({ result: "L", score: [3, 20], wp: [[0, 0.5], [3600, 0]], keyPlays: [key({ team: "MIA", score: [0, 7] }), key({ el: 900, kind: "FG", score: [3, 7], wpBefore: 0.3, wpAfter: 0.3 })] })
		expect(labStory(never).headline).toMatch(/never led|Led by as many as|swung/i)
		expect(labStory(base({ result: "T", score: [20, 20] })).headline).toMatch(/separate/)
	})

	it("gives every real game a clean headline", () => {
		for (const g of getGames()) {
			const s = labStory(g)
			expect(s.headline.length).toBeGreaterThan(10)
			expect(`${s.headline} ${s.detail}`).not.toMatch(/undefined|NaN|null/)
		}
	})
})
