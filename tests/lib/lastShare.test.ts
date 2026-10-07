import { describe, expect, it } from "vitest"

import { DEFAULT_FILTER } from "../../lib/lab/historyKit"
import { SECTION_IDS, SHARE_KINDS, readView, viewQuery } from "../../lib/lab/lastShare"

const known = { first: 1999, last: 2025, teams: new Set(["LV", "KC", "OAK"]), rows: new Set(["2016 LV", "2021 LV", "2010 KC"]) }

describe("readView", () => {
	it("defaults to the wide chart card with no filters", () => {
		const v = readView({}, known)
		expect(v).toMatchObject({ kind: "chart", size: "wide", stat: null, pin: null, y: "spread", filter: DEFAULT_FILTER })
	})

	it("reads every part of a view", () => {
		const v = readView({ kind: "season", size: "tall", stat: "def.turnovers", scope: "all", team: "KC", po: "missed", years: "2016,2010,2016", pin: "2016-LV", y: "wins" }, known)
		expect(v).toMatchObject({ kind: "season", size: "tall", stat: "def.turnovers", pin: "2016 LV", y: "wins" })
		expect(v.filter).toEqual({ scope: "all", team: "KC", playoffs: "missed", years: [2010, 2016] })
	})

	it("drops anything that is not valid", () => {
		const v = readView({ kind: "nope", size: "huge", stat: "../etc", scope: "x", team: "ZZZ", po: "maybe", years: "1800,2099,abc,2016", pin: "2016-ZZZ", y: "up" }, known)
		expect(v).toMatchObject({ kind: "chart", size: "wide", stat: null, pin: null, y: "spread" })
		expect(v.filter).toEqual({ scope: "like", team: null, playoffs: "any", years: [2016] })
	})

	it("caps how many seasons it reads", () => {
		const years = Array.from({ length: 200 }, (_, i) => 1999 + (i % 27)).join(",")
		expect(readView({ years }, known).filter.years.length).toBeLessThanOrEqual(27)
	})
})

describe("viewQuery", () => {
	it("leaves out everything at its default", () => {
		expect(viewQuery({ stat: "def.turnovers", filter: DEFAULT_FILTER, pin: null, y: "spread" }, { kind: "chart" })).toBe("kind=chart&stat=def.turnovers")
	})

	it("round-trips through readView", () => {
		const view = { stat: "off.epa", filter: { scope: "all" as const, team: "KC", playoffs: "made" as const, years: [2010, 2016] }, pin: "2016 LV", y: "wins" as const }
		const q = viewQuery(view, { kind: "season", size: "tall" })
		expect(q).toBe("kind=season&size=tall&stat=off.epa&scope=all&team=KC&po=made&years=2010,2016&pin=2016-LV&y=wins")
		const back = readView(Object.fromEntries(new URLSearchParams(q)), known)
		expect(back).toMatchObject({ kind: "season", size: "tall", stat: "off.epa", pin: "2016 LV", y: "wins", filter: view.filter })
	})
})

describe("SECTION_IDS", () => {
	it("names a page section for every kind", () => {
		for (const k of SHARE_KINDS) expect(SECTION_IDS[k]).toBeTruthy()
	})
})
