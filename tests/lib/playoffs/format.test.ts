import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { divisionShort, kickoffLabel, rivalsOf } from "@/lib/playoffs/format"
import { simulateSeason } from "@/lib/playoffs/simulator"

describe("kickoff times", () => {
	it("reads the day of the week from the date itself, not from the reader's time zone", () => {
		expect(kickoffLabel("2026-10-15", "20:15")).toBe("Thu, Oct 15 · 8:15 PM ET")
		expect(kickoffLabel("2026-10-18", "13:00")).toBe("Sun, Oct 18 · 1:00 PM ET")
		expect(kickoffLabel("2027-01-10", "00:30")).toBe("Sun, Jan 10 · 12:30 AM ET")
		expect(kickoffLabel("2026-10-18", "12:00")).toBe("Sun, Oct 18 · 12:00 PM ET")
	})

	it("copes with a missing time or date", () => {
		expect(kickoffLabel("2026-10-18", null)).toBe("Sun, Oct 18")
		expect(kickoffLabel(null, "13:00")).toBe("")
		expect(kickoffLabel("soon", "13:00")).toBe("")
	})

	it("shortens division names", () => {
		expect(divisionShort("AFC West")).toBe("West")
		expect(divisionShort("NFC North")).toBe("North")
	})
})

describe("rivals in a playoff race", () => {
	const sim = simulateSeason({ games: getGames() })

	it("always includes the division rivals and never the team itself or the other conference", () => {
		const r = rivalsOf(sim, "LV")
		for (const t of ["DEN", "KC", "LAC"]) expect(r.has(t)).toBe(true)
		expect(r.has("LV")).toBe(false)
		for (const t of Array.from(r)) expect(sim.teams[t].conference).toBe("AFC")
	})

	it("adds teams from other divisions only when they sit within two places in the table", () => {
		const r = rivalsOf(sim, "LV")
		for (const t of Array.from(r)) {
			if (sim.teams[t].division === "AFC West") continue
			expect(Math.abs(sim.teams[t].rank - sim.teams.LV.rank)).toBeLessThanOrEqual(2)
		}
		const outsiders = Object.values(sim.teams).filter((t) => t.conference === "AFC" && t.division !== "AFC West" && Math.abs(t.rank - sim.teams.LV.rank) > 2)
		for (const t of outsiders) expect(r.has(t.team)).toBe(false)
		expect(rivalsOf(sim, "XXX").size).toBe(0)
	})
})
