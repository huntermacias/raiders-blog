import { describe, expect, it } from "vitest"

import { FLAGS_SHARE_PATH, type FlagsView, flagsHref, flagsQuery, one, readFlagsView, sizeOf } from "../../lib/lab/flagsShare"

const read = (o: Record<string, string>) => readFlagsView(o)

describe("readFlagsView", () => {
	it("needs a known kind and the fields that kind is made from", () => {
		expect(read({})).toBeNull()
		expect(read({ kind: "nope" })).toBeNull()
		expect(read({ kind: "flag" })).toBeNull()
		expect(read({ kind: "flag", id: "../etc" })).toBeNull()
		expect(read({ kind: "flag", id: "2026_04_LV_KC-123" })).toEqual({ kind: "flag", id: "2026_04_LV_KC-123" })
		expect(read({ kind: "team" })).toBeNull()
		expect(read({ kind: "team", team: "lv" })).toBeNull()
		expect(read({ kind: "team", team: "LV", season: "2026" })).toEqual({ kind: "team", team: "LV", season: 2026 })
		expect(read({ kind: "player", slug: "Quay Walker" })).toBeNull()
		expect(read({ kind: "player", slug: "quay-walker" })).toEqual({ kind: "player", slug: "quay-walker" })
		expect(read({ kind: "board", board: "worst" })).toEqual({ kind: "board", board: "worst" })
		expect(read({ kind: "board", board: "nope" })).toBeNull()
		expect(read({ kind: "penalty", ty: "roughing-the-kicker" })).toEqual({ kind: "penalty", ty: "roughing-the-kicker" })
	})

	it("needs two different teams to compare", () => {
		expect(read({ kind: "compare", a: "LV" })).toBeNull()
		expect(read({ kind: "compare", a: "LV", b: "LV" })).toBeNull()
		expect(read({ kind: "compare", a: "LV", b: "KC" })).toEqual({ kind: "compare", a: "LV", b: "KC" })
	})

	it("always has a situation to show, the score unless another is named", () => {
		expect(read({ kind: "situation" })).toEqual({ kind: "situation", dim: "score" })
		expect(read({ kind: "situation", dim: "down", team: "LV" })).toEqual({ kind: "situation", dim: "down", team: "LV" })
		expect(read({ kind: "situation", dim: "bogus" })?.dim).toBe("score")
		expect(read({ kind: "situation", team: "x1" })).toEqual({ kind: "situation", dim: "score" })
	})

	it("drops a season that is not a year", () => {
		expect(read({ kind: "team", team: "LV", season: "abc" })?.season).toBeUndefined()
		expect(read({ kind: "team", team: "LV", season: "1999" })?.season).toBeUndefined()
	})
})

describe("flagsQuery and flagsHref", () => {
	const views: FlagsView[] = [
		{ kind: "flag", id: "2026_04_LV_KC-123", season: 2026 },
		{ kind: "team", team: "LV", season: 2026 },
		{ kind: "player", slug: "quay-walker" },
		{ kind: "compare", a: "LV", b: "KC" },
		{ kind: "board", board: "types" },
		{ kind: "penalty", ty: "false-start" },
		{ kind: "situation", dim: "down", team: "LV" },
		{ kind: "situation", dim: "score" },
	]

	it("makes a query that reads back to the same view", () => {
		for (const v of views) expect(read(Object.fromEntries(new URLSearchParams(flagsQuery(v)))), flagsQuery(v)).toEqual(v)
	})

	it("puts the size first and leaves it out when none is given", () => {
		expect(flagsQuery({ kind: "team", team: "LV" })).toBe("kind=team&team=LV")
		expect(flagsQuery({ kind: "team", team: "LV" }, { size: "tall" })).toBe("size=tall&kind=team&team=LV")
		expect(flagsQuery({ kind: "situation", dim: "score" })).toBe("kind=situation")
	})

	it("opens the interactive page for the same thing", () => {
		expect(flagsHref({ kind: "team", team: "LV", season: 2025 })).toBe("/lab/flags/team/lv?season=2025")
		expect(flagsHref({ kind: "player", slug: "quay-walker" })).toBe("/lab/flags/player/quay-walker")
		expect(flagsHref({ kind: "flag", id: "2026_04_LV_KC-123" }, { team: "LV" })).toBe("/lab/flags/team/lv")
		expect(flagsHref({ kind: "flag", id: "2026_04_LV_KC-123" })).toBe("/lab/flags")
		expect(flagsHref({ kind: "compare", a: "LV", b: "KC", season: 2026 })).toBe("/lab/flags/compare?a=LV&b=KC&season=2026")
		expect(flagsHref({ kind: "board", board: "teams" })).toBe("/lab/flags?tab=teams")
		expect(flagsHref({ kind: "board", board: "teams", season: 2025 })).toBe("/lab/flags?tab=teams&season=2025")
		expect(flagsHref({ kind: "penalty", ty: "false-start" })).toBe("/lab/flags/penalty/false-start")
		expect(flagsHref({ kind: "situation", dim: "down", team: "LV" })).toBe("/lab/flags/situations?dim=down&team=LV")
		expect(flagsHref({ kind: "situation", dim: "score" })).toBe("/lab/flags/situations")
	})

	it("lands shared links under the flags path", () => {
		expect(FLAGS_SHARE_PATH).toBe("/lab/flags/share")
	})
})

describe("small helpers", () => {
	it("takes the first value of a repeated parameter and defaults the size to wide", () => {
		expect(one(["a", "b"])).toBe("a")
		expect(one("c")).toBe("c")
		expect(one(undefined)).toBeUndefined()
		expect(sizeOf("tall")).toBe("tall")
		expect(sizeOf("huge")).toBe("wide")
		expect(sizeOf(undefined)).toBe("wide")
	})
})
