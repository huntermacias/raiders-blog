import { describe, expect, it } from "vitest"

import { DIVISIONS, RAIDERS, TEAMS, TEAM_NAMES, teamInfo } from "../../lib/nfl"

// Studio dropdowns, the schedule join and every page that shows a team read
// from this one table. A typo here quietly breaks all of them.
describe("NFL team table", () => {
	it("has all 32 teams, with unique names, nicknames and abbreviations", () => {
		expect(TEAMS).toHaveLength(32)
		expect(new Set(TEAMS.map((t) => t.name)).size).toBe(32)
		expect(new Set(TEAMS.map((t) => t.nick)).size).toBe(32)
		expect(new Set(TEAMS.map((t) => t.abbr)).size).toBe(32)
		expect(TEAM_NAMES).toEqual(TEAMS.map((t) => t.name))
	})

	it("splits 16 and 16 across the conferences and 4 per division", () => {
		expect(TEAMS.filter((t) => t.conference === "AFC")).toHaveLength(16)
		expect(TEAMS.filter((t) => t.conference === "NFC")).toHaveLength(16)
		expect(DIVISIONS).toHaveLength(8)
		for (const d of DIVISIONS) expect(TEAMS.filter((t) => t.division === d), d).toHaveLength(4)
	})

	it("keeps each team's division consistent with its conference", () => {
		for (const t of TEAMS) {
			expect(t.division.startsWith(t.conference), `${t.name}: ${t.division} vs ${t.conference}`).toBe(true)
			expect(DIVISIONS).toContain(t.division)
		}
	})

	it("gives every team a hex color and a short uppercase abbreviation", () => {
		for (const t of TEAMS) {
			expect(t.color, t.name).toMatch(/^#[0-9A-Fa-f]{6}$/)
			expect(t.abbr, t.name).toMatch(/^[A-Z]{2,3}$/)
		}
	})

	it("includes the Raiders under the exact name Studio stores", () => {
		expect(RAIDERS).toBe("Las Vegas Raiders")
		expect(teamInfo(RAIDERS)).toMatchObject({ nick: "Raiders", abbr: "LV", division: "AFC West" })
	})
})

describe("teamInfo", () => {
	it("looks teams up by full name", () => {
		expect(teamInfo("Kansas City Chiefs")).toMatchObject({ nick: "Chiefs", abbr: "KC" })
	})

	it("returns a neutral fallback for unknown, empty or missing names instead of throwing", () => {
		expect(teamInfo("Las Vegas Rdaiers")).toMatchObject({ name: "Las Vegas Rdaiers", color: "#71717a" })
		expect(teamInfo("Las Vegas Rdaiers").abbr).toBe("LAS")
		expect(teamInfo("").abbr).toBe("TBD")
		expect(teamInfo(null).name).toBe("TBD")
		expect(teamInfo(undefined).abbr).toBe("TBD")
	})
})
