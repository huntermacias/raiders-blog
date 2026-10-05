import { describe, expect, it } from "vitest"

import { COORDS, KNOWN, SITUATIONAL_SCALE, TRAVEL_PER_1000_MILES, annotate, miles, restPoints } from "../../lib/math/situation"

describe("miles", () => {
	it("measures the great-circle distance between home cities", () => {
		expect(miles("LV", "BUF")).toBeGreaterThan(1950)
		expect(miles("LV", "BUF")).toBeLessThan(2150)
		expect(miles("NYG", "NYJ")).toBe(0) // same stadium
		expect(miles("LAR", "LAC")).toBe(0)
		expect(miles("KC", "LV")).toBeCloseTo(miles("LV", "KC"), 6)
	})
	it("is zero for a team it doesn't know, and every team in the table has coordinates", () => {
		expect(miles("LV", "XXX")).toBe(0)
		expect(KNOWN.filter((a) => !COORDS[a])).toEqual([])
		expect(KNOWN).toHaveLength(32)
	})
})

describe("restPoints", () => {
	it("is neutral without a previous game and for a normal week", () => {
		expect(restPoints(null)).toBe(0)
		expect(restPoints(7)).toBe(0)
		expect(restPoints(6)).toBe(0)
		expect(restPoints(8)).toBe(0)
	})
	it("costs a short week and rewards extra rest and a bye", () => {
		expect(restPoints(4)).toBeLessThan(0)
		expect(restPoints(5)).toBeLessThan(0)
		expect(restPoints(10)).toBeGreaterThan(0)
		expect(restPoints(14)).toBeGreaterThan(restPoints(10))
	})
})

describe("annotate", () => {
	// KC and BUF both open at home on Sunday; in week 2 KC visits Las Vegas on a Thursday night, four days later.
	const games = [
		{ week: 1, home: "KC", away: "DEN", kickoff: "2026-09-13T17:00Z" },
		{ week: 1, home: "BUF", away: "MIA", kickoff: "2026-09-13T17:00Z" },
		{ week: 2, home: "LV", away: "KC", kickoff: "2026-09-18T00:15Z" }, // Thursday night in Eastern time: four days after Sunday
	]

	it("works out each side's rest and the visitor's travel for the home team's edge (at full strength)", () => {
		const out = annotate(games, 1)
		const lv = out[2]
		const expected = restPoints(null) - restPoints(4) + (TRAVEL_PER_1000_MILES * miles("KC", "LV")) / 1000
		expect(lv.edge).toBeCloseTo(expected, 6)
		expect(lv.edge).toBeGreaterThan(15) // visitors on a short week and a long way from home
		// First games have no rest information, so only travel counts there.
		expect(out[0].edge).toBeCloseTo((TRAVEL_PER_1000_MILES * miles("DEN", "KC")) / 1000, 6)
	})

	it("keeps late-night kickoffs on their Eastern day (Sunday night to Thursday night is four days, not five)", () => {
		const sundayNight = { week: 1, home: "BUF", away: "KC", kickoff: "2026-09-21T00:20Z" } // Sunday 8:20 pm Eastern
		const thursdayNight = { week: 2, home: "LV", away: "BUF", kickoff: "2026-09-25T00:15Z" } // Thursday 8:15 pm Eastern
		const out = annotate([sundayNight, thursdayNight], 1)
		expect(out[1].edge).toBeCloseTo(0 - restPoints(4) + (TRAVEL_PER_1000_MILES * miles("BUF", "LV")) / 1000, 6)
	})

	it("treats a bye as extra rest", () => {
		const out = annotate(
			[
				{ week: 1, home: "KC", away: "DEN", kickoff: "2026-09-13T17:00Z" },
				{ week: 1, home: "BUF", away: "MIA", kickoff: "2026-09-13T17:00Z" },
				{ week: 3, home: "KC", away: "BUF", kickoff: "2026-09-27T17:00Z" }, // KC: 14 days; BUF: 14 days too
				{ week: 2, home: "MIA", away: "DEN", kickoff: "2026-09-20T17:00Z" }, // DEN played week 2, so 7 days of rest
			],
			1
		)
		// KC and BUF both had a bye (14 days), so rest cancels and only travel is left.
		expect(out[2].edge).toBeCloseTo((TRAVEL_PER_1000_MILES * miles("BUF", "KC")) / 1000, 6)
	})

	it("scales the edge, defaults to half strength, and switches off at zero", () => {
		const full = annotate(games, 1)[2].edge
		expect(annotate(games, 0).every((g) => g.edge === 0)).toBe(true)
		expect(annotate(games)[2].edge).toBeCloseTo(full * SITUATIONAL_SCALE, 6)
		expect(SITUATIONAL_SCALE).toBeGreaterThan(0)
		expect(SITUATIONAL_SCALE).toBeLessThan(1)
	})

	it("still counts travel when there is no kickoff time, and doesn't change the games it is given", () => {
		const bare = [{ week: 1, home: "LV", away: "BUF" }]
		const out = annotate(bare, 1)
		expect(out[0].edge).toBeCloseTo((TRAVEL_PER_1000_MILES * miles("BUF", "LV")) / 1000, 6)
		expect(bare[0]).not.toHaveProperty("edge")
		expect(out[0]).toMatchObject({ week: 1, home: "LV", away: "BUF" })
	})
})
