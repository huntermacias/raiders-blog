import { describe, expect, it } from "vitest"

import { FIELD, SURFACE, TEAM_COLOR, baseColor, contrast, deltaE, inkOn, labColorVars, opponentColors, teamColorFor } from "../../lib/lab/colors"
import { TEAMS } from "../../lib/nfl"

const opponents = TEAMS.filter((t) => t.abbr !== "LV")

describe("opponent colors", () => {
	it("starts from the same team color the power rankings use", () => {
		expect(baseColor("NO")).toBe("#D3BC8D")
		expect(baseColor("KC")).toBe("#E31837")
	})

	it("falls back to a neutral accent for an unknown team", () => {
		expect(opponentColors("XXX").dark).toMatch(/^#[0-9a-f]{6}$/)
	})

	it.each(opponents.map((t) => [t.abbr]))("%s is readable on both surfaces and clearly not the Raiders color", (abbr) => {
		const c = opponentColors(abbr)
		for (const mode of ["dark", "light"] as const) {
			expect(c[mode]).toMatch(/^#[0-9a-f]{6}$/)
			// Graphics need 3:1 against what they sit on.
			expect(contrast(c[mode], SURFACE[mode])).toBeGreaterThanOrEqual(3)
			// And the two teams must be told apart.
			expect(deltaE(c[mode], TEAM_COLOR[mode])).toBeGreaterThanOrEqual(18)
		}
		// Text on a filled marker.
		expect(contrast(c.dark, c.onDark)).toBeGreaterThanOrEqual(4.5)
		expect(contrast(c.light, c.onLight)).toBeGreaterThanOrEqual(4.5)
	})

	it("keeps the hue: Miami stays aqua and the Chargers stay blue", () => {
		const [r1, , b1] = hex(opponentColors("MIA").dark)
		expect(b1).toBeGreaterThan(r1)
		const [r2, , b2] = hex(opponentColors("LAC").light)
		expect(b2).toBeGreaterThan(r2)
	})

	it("lifts a navy team on dark and leaves a bright team alone enough to still be itself", () => {
		const navy = teamColorFor("#0B2265", "dark")
		expect(contrast(navy, SURFACE.dark)).toBeGreaterThanOrEqual(4.5)
		const red = teamColorFor("#E31837", "light")
		expect(red).not.toBe("#e31837".toUpperCase())
		expect(hex(red)[0]).toBeGreaterThan(hex(red)[2])
	})

	it("picks readable ink for a fill", () => {
		expect(inkOn("#ffffff")).toBe("#0b0d10")
		expect(inkOn("#000000")).toBe("#ffffff")
	})

	it("exposes one pair of custom properties per theme", () => {
		const vars = labColorVars("NO")
		expect(Object.keys(vars).sort()).toEqual(["--lab-on-opp-dark", "--lab-on-opp-light", "--lab-opp-dark", "--lab-opp-light"])
	})
})

function hex(h: string): [number, number, number] {
	return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

describe("opponent colors on the turf", () => {
	it.each(TEAMS.map((t) => t.abbr))("%s stays clearly visible on the field in both themes", (abbr) => {
		const c = opponentColors(abbr)
		expect(contrast(c.dark, FIELD.dark)).toBeGreaterThanOrEqual(3)
		expect(contrast(c.light, FIELD.light)).toBeGreaterThanOrEqual(2.7)
	})

	it("keeps the Raiders readable on the turf too", () => {
		expect(contrast(TEAM_COLOR.dark, FIELD.dark)).toBeGreaterThanOrEqual(4.5)
		expect(contrast(TEAM_COLOR.light, FIELD.light)).toBeGreaterThanOrEqual(4.5)
	})
})
