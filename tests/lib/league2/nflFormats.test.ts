import { describe, expect, it } from "vitest"

import { DEFAULT_MAX_UPSETS, UPSET_V1, canCallAnotherUpset, maxConfidencePoints, planGrading, ratingsFromFinals, upsetLineFor, upsetValue, validateConfidence, validateConfidencePick, validateUpsetCall, CONFIDENCE_V1, type LeagueEvent } from "../../../lib/league2/domain"

describe("a confidence pick", () => {
	it("needs a side and a whole rank from 1 to the number of games", () => {
		expect(validateConfidencePick({ pick: "home", rank: 16 }, 16)).toBeNull()
		expect(validateConfidencePick({ pick: "away", rank: 1 }, 16)).toBeNull()
		expect(validateConfidencePick({ pick: "tie", rank: 3 }, 16)).toMatch(/Pick a team/)
		expect(validateConfidencePick({ pick: "home", rank: 0 }, 16)).toMatch(/1 to 16/)
		expect(validateConfidencePick({ pick: "home", rank: 17 }, 16)).toMatch(/1 to 16/)
		expect(validateConfidencePick({ pick: "home", rank: 2.5 }, 16)).toMatch(/1 to 16/)
		expect(validateConfidencePick({ pick: "home", rank: "3" }, 16)).toMatch(/1 to 16/)
	})
	it("adds up to the triangle number when every pick is right", () => {
		expect(maxConfidencePoints(16)).toBe(136)
		expect(maxConfidencePoints(1)).toBe(1)
	})
})

describe("a confidence slate over a week's games", () => {
	const ev = (id: string, lockAt: string): LeagueEvent => ({ id, kickoff: lockAt, lockAt: null, state: "scheduled", result: null })
	const events = { a: ev("a", "2026-10-01T00:00:00Z"), b: ev("b", "2026-10-04T00:00:00Z"), c: ev("c", "2026-10-04T00:00:00Z") }
	const before = Date.parse("2026-09-30T00:00:00Z")
	const after = Date.parse("2026-10-02T00:00:00Z")
	const slate = (...r: [string, "away" | "home", number][]) => r.map(([eventId, pick, rank]) => ({ eventId, pick, rank }))

	it("lets ranks leave gaps up to the number of games", () => {
		expect(validateConfidence(slate(["a", "home", 16], ["b", "away", 3]), [], events, before, 16)).toBeNull()
		expect(validateConfidence(slate(["a", "home", 17]), [], events, before, 16)).toMatch(/1 to 16/)
		expect(validateConfidence(slate(["a", "home", 5], ["b", "away", 5]), [], events, before, 16)).toMatch(/once/)
	})
	it("freezes the pick and rank of a game that has started", () => {
		const prev = slate(["a", "home", 16], ["b", "away", 3])
		expect(validateConfidence(slate(["a", "home", 16], ["b", "away", 7], ["c", "home", 3]), prev, events, after, 16)).toBeNull()
		expect(validateConfidence(slate(["a", "home", 15], ["b", "away", 3]), prev, events, after, 16)).toMatch(/started/)
	})
})

describe("grading a confidence pick", () => {
	const final: LeagueEvent = { id: "e", kickoff: "2026-10-04T00:00:00Z", lockAt: null, state: "final", result: { away: 17, home: 24 } }
	const entry = (pick: "away" | "home", rank: number) => [{ id: "n1", playerId: "p", eventId: "e", payload: { pick, rank } }]
	it("scores the rank when right and nothing when wrong", () => {
		const right = planGrading({ event: final, entries: entry("home", 14), existing: [], policy: CONFIDENCE_V1, now: "2026-10-05T00:00:00Z" })
		expect(right.create[0].points).toBe(14)
		const wrong = planGrading({ event: final, entries: entry("away", 14), existing: [], policy: CONFIDENCE_V1, now: "2026-10-05T00:00:00Z" })
		expect(wrong.create[0].points).toBe(0)
	})
	it("treats a tie as a push, not a loss", () => {
		const tied: LeagueEvent = { ...final, result: { away: 20, home: 20 } }
		const g = planGrading({ event: tied, entries: entry("home", 9), existing: [], policy: CONFIDENCE_V1, now: "2026-10-05T00:00:00Z" })
		expect(g.create[0].voided).toBe(true)
		expect(g.create[0].points).toBe(0)
	})
})

describe("the upset challenge", () => {
	it("only lets the underdog be called, or a call be taken back", () => {
		expect(validateUpsetCall({ pick: "away" }, "away")).toBeNull()
		expect(validateUpsetCall({ pick: "home" }, "away")).toMatch(/underdog/)
		expect(validateUpsetCall({ pick: "none" }, "away")).toBeNull()
		expect(validateUpsetCall({ pick: "away" }, null)).toMatch(/no underdog/)
		expect(validateUpsetCall({}, "home")).toMatch(/underdog/)
	})
	it("caps the calls a player can have in a week", () => {
		expect(DEFAULT_MAX_UPSETS).toBe(5)
		expect(canCallAnotherUpset(4)).toBe(true)
		expect(canCallAnotherUpset(5)).toBe(false)
	})
	it("values an upset by how unlikely it was", () => {
		expect(upsetValue(UPSET_V1, 0.55)).toBe(1)
		expect(upsetValue(UPSET_V1, 0.65)).toBe(2)
		expect(upsetValue(UPSET_V1, 0.79)).toBe(2)
		expect(upsetValue(UPSET_V1, 0.8)).toBe(3)
		expect(upsetValue(UPSET_V1, 0.93)).toBe(3)
	})
	it("names the road team the underdog between equals, and the weaker team when ratings differ", () => {
		const level = upsetLineFor("KC", "LV", {})
		expect(level?.underdog).toBe("away")
		expect(level?.favouriteWinChance).toBeGreaterThan(0.5)
		const lopsided = upsetLineFor("KC", "LV", { KC: 1700, LV: 1400 })
		expect(lopsided?.underdog).toBe("away")
		expect(lopsided?.favouriteWinChance).toBeGreaterThan(0.85)
		const flipped = upsetLineFor("KC", "LV", { KC: 1400, LV: 1700 })
		expect(flipped?.underdog).toBe("home")
	})
	it("gives no line when the game is a dead heat", () => {
		// Home field is 48 points, so a home team rated 48 below the visitor is exactly even.
		expect(upsetLineFor("KC", "LV", { KC: 1452, LV: 1500 })).toBeNull()
	})
	it("builds ratings from finished games, starting from last year's when given", () => {
		const finals = [{ week: 1, home: "KC", away: "LV", homeScore: 31, awayScore: 10 }]
		const flat = ratingsFromFinals(finals, null)
		expect(flat.KC).toBeGreaterThan(1500)
		expect(flat.LV).toBeLessThan(1500)
		const withPrior = ratingsFromFinals(finals, { KC: 1600, LV: 1400 })
		expect(withPrior.KC).toBeGreaterThan(flat.KC)
	})
	it("scores a called upset only when it happens, by tier", () => {
		const final: LeagueEvent = { id: "e", kickoff: "2026-10-04T00:00:00Z", lockAt: null, state: "final", result: { away: 27, home: 20 } }
		const entries = [{ id: "n1", playerId: "p", eventId: "e", payload: { pick: "away" } }]
		const hit = planGrading({ event: final, entries, existing: [], policy: UPSET_V1, snapshot: { underdog: "away", favouriteWinChance: 0.84 }, now: "2026-10-05T00:00:00Z" })
		expect(hit.create[0].points).toBe(3)
		const missed: LeagueEvent = { ...final, result: { away: 13, home: 20 } }
		const miss = planGrading({ event: missed, entries, existing: [], policy: UPSET_V1, snapshot: { underdog: "away", favouriteWinChance: 0.84 }, now: "2026-10-05T00:00:00Z" })
		expect(miss.create[0].points).toBe(0)
	})
})
