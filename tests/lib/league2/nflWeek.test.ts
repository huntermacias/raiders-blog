import { describe, expect, it } from "vitest"

import { currentWeek, weekOneStart, weeksToSync } from "../../../lib/league2/nflWeek"

// Season opener on a Thursday evening in the US, which is already Friday in UTC.
const OPENER = "2026-09-11T00:20:00Z"
const at = (iso: string) => Date.parse(iso)

describe("NFL week calendar", () => {
	it("starts week 1 on the Tuesday before the opener, at noon UTC", () => {
		expect(new Date(weekOneStart(OPENER)).toISOString()).toBe("2026-09-08T12:00:00.000Z")
		expect(new Date(weekOneStart("2026-09-10T00:20:00Z")).toISOString()).toBe("2026-09-08T12:00:00.000Z") // a Thursday in UTC too
	})
	it("keeps Monday night in its own week and opens the next slate Tuesday morning", () => {
		expect(currentWeek(OPENER, at("2026-09-14T23:00:00Z"))).toBe(1) // Monday evening
		expect(currentWeek(OPENER, at("2026-09-15T04:00:00Z"))).toBe(1) // Monday night game still going
		expect(currentWeek(OPENER, at("2026-09-15T11:59:00Z"))).toBe(1)
		expect(currentWeek(OPENER, at("2026-09-15T12:00:00Z"))).toBe(2)
		expect(currentWeek(OPENER, at("2026-10-10T12:00:00Z"))).toBe(5)
		expect(currentWeek(OPENER, at("2026-10-17T12:00:00Z"))).toBe(6)
	})
	it("clamps before the season and after week 18", () => {
		expect(currentWeek(OPENER, at("2026-06-01T00:00:00Z"))).toBe(1)
		expect(currentWeek(OPENER, at("2027-02-01T00:00:00Z"))).toBe(18)
	})
	it("syncs last week, this week and next week, inside 1 to 18", () => {
		expect(weeksToSync(1)).toEqual([1, 2])
		expect(weeksToSync(6)).toEqual([5, 6, 7])
		expect(weeksToSync(18)).toEqual([17, 18])
	})
})
