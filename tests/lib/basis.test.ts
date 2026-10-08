import { describe, expect, it } from "vitest"

import { GROUPS, GROUP_ORDER } from "../../lib/lab/unitsKit"
import { GROUP_BASIS, SOURCES, sourceLine } from "../../lib/og/basis"

describe("what the card footers say the numbers are made of", () => {
	it("describes every position group, and nothing else", () => {
		expect(Object.keys(GROUP_BASIS).sort()).toEqual([...GROUP_ORDER].sort())
		for (const g of GROUP_ORDER) expect(GROUP_BASIS[g].split(",").length).toBe(Object.keys(GROUPS[g].stats).length)
	})
	it("names the sources and the weeks, without claiming a license", () => {
		expect(sourceLine(SOURCES.grades, 2026, 4)).toBe("Data: nflverse play-by-play, FTN charting, Pro Football Reference · 2026 through Week 4")
		for (const s of Object.values(SOURCES)) expect(s).toMatch(/nflverse/)
		expect(sourceLine(SOURCES.coaches, 2026, 4)).not.toMatch(/CC BY/)
	})
})
