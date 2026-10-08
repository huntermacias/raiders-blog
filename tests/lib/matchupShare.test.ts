import { describe, expect, it } from "vitest"

import { BOARD_SORTS, MATCHUP_VIEWS, VIEW_NAMES, VIEW_SECTION, boardQuery, isBoardSort, isMatchupView, matchupQuery, readBoardQuery, readMatchupQuery, viewText } from "../../lib/lab/matchupShare"

describe("matchup share links", () => {
	it("reads a matchup request, upper-casing the teams and defaulting to the overview", () => {
		expect(readMatchupQuery({ a: "lv", b: "ne" })).toEqual({ a: "LV", b: "NE", view: "overview" })
		expect(readMatchupQuery({ a: "LV", b: "NE", view: "tape" })).toEqual({ a: "LV", b: "NE", view: "tape" })
		expect(readMatchupQuery({ a: "LV", b: "NE", view: "nope" })?.view).toBe("overview")
	})

	it("refuses anything that is not two different team codes", () => {
		for (const bad of [{ a: "LV" }, { b: "NE" }, { a: "LV", b: "LV" }, { a: "L", b: "NE" }, { a: "LVLV", b: "NE" }, { a: "../x", b: "NE" }, { a: "L V", b: "NE" }, {}]) expect(readMatchupQuery(bad)).toBeNull()
	})

	it("builds a query that reads back the same", () => {
		for (const view of MATCHUP_VIEWS) {
			const q = new URLSearchParams(matchupQuery("LV", "NE", view))
			expect(readMatchupQuery({ a: q.get("a")!, b: q.get("b")!, view: q.get("view")! })).toEqual({ a: "LV", b: "NE", view })
		}
	})

	it("has a section, a name and words for every part of a matchup", () => {
		for (const view of MATCHUP_VIEWS) {
			expect(isMatchupView(view)).toBe(true)
			expect(VIEW_SECTION[view]).toMatch(/-heading$/)
			expect(VIEW_NAMES[view].length).toBeGreaterThan(3)
			const w = viewText(view, { a: "Raiders", b: "Patriots" }, "Raiders have the edge.")
			expect(w.text).toContain("Raiders vs Patriots")
			expect(w.alt).toContain("Raiders vs Patriots")
		}
		expect(new Set(MATCHUP_VIEWS.map((v) => VIEW_SECTION[v])).size).toBe(MATCHUP_VIEWS.length)
		expect(isMatchupView("bogus")).toBe(false)
		expect(isMatchupView(undefined)).toBe(false)
	})
})

describe("board share links", () => {
	const known = { shows: new Set(["AFC", "NFC", "AFC West"]), teams: new Set(["LV", "KC"]) }

	it("reads a sort, a group of teams and a team, and drops anything it does not know", () => {
		expect(readBoardQuery({ sort: "rush", show: "AFC West", team: "LV" }, known)).toEqual({ sort: "rush", show: "AFC West", team: "LV" })
		expect(readBoardQuery({}, known)).toEqual({ sort: "composite", show: null, team: null })
		expect(readBoardQuery({ sort: "bogus", show: "Mars", team: "ZZZ" }, known)).toEqual({ sort: "composite", show: null, team: null })
		expect(readBoardQuery({ team: "lv" }, known).team).toBeNull()
	})

	it("builds the shortest query that says the same, and nothing for the default view", () => {
		expect(boardQuery({ sort: "composite", show: null, team: null })).toBe("")
		expect(boardQuery({ sort: "rush" })).toBe("sort=rush")
		expect(boardQuery({ sort: "cov", show: "AFC West", team: "LV" })).toBe("sort=cov&show=AFC%20West&team=LV")
	})

	it("knows every column the board can be sorted by", () => {
		for (const s of BOARD_SORTS) expect(isBoardSort(s)).toBe(true)
		expect(isBoardSort("nope")).toBe(false)
	})
})
