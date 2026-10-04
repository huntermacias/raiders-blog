import { describe, expect, it } from "vitest"

import { sideColors } from "../../lib/live/colors"
import { clockAtElapsed, clockText, countdown, downText, kickoffLabel, periodName, pct, signed, spotName, spreadText } from "../../lib/live/format"
import { parseScoreboard } from "../../lib/live/espn"
import { scoreboard } from "../stubs/liveFeed"

describe("live formatting", () => {
	it("names periods and clocks", () => {
		expect(periodName(0)).toBe("")
		expect(periodName(3)).toBe("Q3")
		expect(periodName(5)).toBe("OT")
		expect(periodName(6)).toBe("2OT")
		expect(clockText(252)).toBe("4:12")
		expect(clockText(0)).toBe("0:00")
		expect(clockText(null)).toBe("")
		expect(clockAtElapsed(0)).toBe("Kickoff")
		expect(clockAtElapsed(1)).toBe("Q1 14:59")
		expect(clockAtElapsed(2448)).toBe("Q3 4:12")
		expect(clockAtElapsed(3600 + 100)).toBe("OT 8:20")
	})

	it("says down and distance the way a broadcast does", () => {
		expect(downText(2, 7, 40)).toBe("2nd & 7")
		expect(downText(1, 10, 8)).toBe("1st & Goal")
		expect(downText(4, 1, 30)).toBe("4th & 1")
		expect(downText(null, 7, 40)).toBe("")
		expect(downText(0, 7, 40)).toBe("")
	})

	it("names a spot on the field from the offense's side", () => {
		expect(spotName("LV", "KC", 25)).toBe("LV 25")
		expect(spotName("LV", "KC", 62)).toBe("KC 38")
		expect(spotName("LV", "KC", 50)).toBe("50")
	})

	it("prints kickoff in Pacific time, whatever the server's zone", () => {
		expect(kickoffLabel("2026-10-04T20:25:00Z")).toBe("Sun 1:25 PM PT")
		expect(kickoffLabel(null)).toBe("")
		expect(kickoffLabel("not a date")).toBe("")
	})

	it("counts down", () => {
		expect(countdown(0)).toBe("")
		expect(countdown(-5)).toBe("")
		expect(countdown(754_000)).toBe("12:34")
		expect(countdown(2 * 3600_000 + 5 * 60_000)).toBe("2h 05m")
		expect(countdown(28 * 3600_000)).toBe("1d 4h")
	})

	it("formats the line, percentages and yardage", () => {
		const games = parseScoreboard(scoreboard)
		const live = games.find((g) => g.state === "in")!
		expect(spreadText(live)).toBe("KC -3.5")
		expect(spreadText({ ...live, odds: { homeSpread: 3, overUnder: null, label: null } })).toBe("LV -3")
		expect(spreadText({ ...live, odds: null })).toBe("")
		expect(pct(0.644)).toBe("64%")
		expect(signed(13)).toBe("+13")
		expect(signed(-2)).toBe("−2")
		expect(signed(0)).toBe("0")
	})
})

describe("sideColors", () => {
	const games = parseScoreboard(scoreboard)

	it("gives the Raiders their own color and the opponent theirs", () => {
		const lv = games.find((g) => g.id === "401872980")!
		const c = sideColors(lv)
		expect(c.away.fill).toBe("var(--lab-team)")
		expect(c.home.fill).toBe("var(--lab-opp)")
		expect(Object.keys(c.vars).some((k) => k.startsWith("--lab-opp-"))).toBe(true)
	})

	it("uses two opponent colors when neither team is the Raiders", () => {
		const other = games.find((g) => g.id === "401872965")!
		const c = sideColors(other)
		expect(c.away.fill).toBe("var(--lab-opp)")
		expect(c.home.fill).toBe("var(--lab-opp2)")
		expect(Object.keys(c.vars).some((k) => k.startsWith("--lab-opp2-"))).toBe(true)
		expect(Object.keys(c.vars).some((k) => k.startsWith("--lab-opp-"))).toBe(true)
	})
})
