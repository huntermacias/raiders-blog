import { describe, expect, it } from "vitest"

import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { ROOTING_PATH, SITE_URL, canonicalFor, guidePath, guideQuery, readQuery, readTeam, readWeek } from "@/lib/rooting/share"
import { GOALS } from "@/lib/rooting/types"

const TEAMS: ReadonlySet<string> = new Set(NFL_LEAGUE.teams.map((t) => t.id))

describe("the guide's address", () => {
	it("round-trips every team, goal and week through the URL", () => {
		expect(TEAMS.size).toBe(32)
		for (const team of Array.from(TEAMS)) {
			for (const goal of GOALS) {
				for (const week of [null, 1, 8, 18]) {
					for (const scope of ["week", "all"] as const) {
						const q = guideQuery({ team, goal, week, scope })
						const back = readQuery(Object.fromEntries(new URLSearchParams(q)), TEAMS)
						expect(back, q).toEqual({ team, goal, week, scope })
					}
				}
			}
		}
	})

	it("always names the team and the goal, and leaves out a week or scope that is not set", () => {
		expect(guideQuery({ team: "LV", goal: "playoffs" })).toBe("team=LV&goal=playoffs")
		expect(guideQuery({ team: "KC", goal: "bye", week: 8 })).toBe("team=KC&goal=bye&week=8")
		expect(guideQuery({ team: "KC", goal: "bye", scope: "week" })).toBe("team=KC&goal=bye")
		expect(guideQuery({ team: "KC", goal: "bye", scope: "all" })).toBe("team=KC&goal=bye&scope=all")
		expect(guidePath({ team: "LV", goal: "division", week: 8 })).toBe(`${ROOTING_PATH}?team=LV&goal=division&week=8`)
	})

	it("reads a bad link as the Raiders, the playoffs and this week, never as an error", () => {
		expect(readQuery({}, TEAMS)).toEqual({ team: "LV", goal: "playoffs", week: null, scope: "week" })
		expect(readQuery({ team: "ZZZ", goal: "everything", week: "99", scope: "x" }, TEAMS)).toEqual({ team: "LV", goal: "playoffs", week: null, scope: "week" })
		expect(readQuery({ team: ["kc", "den"], goal: ["DIVISION"] }, TEAMS)).toMatchObject({ team: "KC", goal: "division" })
		expect(readTeam(" den ", TEAMS)).toBe("DEN")
		expect(readTeam(undefined, TEAMS)).toBe("LV")
		expect(readWeek("0")).toBeNull()
		expect(readWeek("23")).toBeNull()
		expect(readWeek("7.5")).toBeNull()
		expect(readWeek("22")).toBe(22)
	})

	it("files each team under one canonical page, so goal and week variants are not separate pages", () => {
		expect(canonicalFor("LV")).toBe(`${SITE_URL}${ROOTING_PATH}`)
		expect(canonicalFor("KC")).toBe(`${SITE_URL}${ROOTING_PATH}?team=KC`)
		const all = new Set(Array.from(TEAMS).map(canonicalFor))
		expect(all.size).toBe(32)
	})
})
