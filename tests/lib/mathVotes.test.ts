import { describe, expect, it } from "vitest"

import { parseVoteKey, sharePct, tallyMap, voteDocId, voteKey } from "../../lib/math/votes"

describe("parseVoteKey", () => {
	it("reads week, away and home", () => {
		expect(parseVoteKey("w5-NE-LV")).toEqual({ week: 5, away: "NE", home: "LV" })
		expect(parseVoteKey("w18-KC-DEN")).toEqual({ week: 18, away: "KC", home: "DEN" })
	})
	it.each(["", "w0-NE-LV", "w19-NE-LV", "w5-NE-NE", "w5-XX-LV", "w5-ne-lv", "5-NE-LV", "w5-NE-LV-extra", "w5-NE-LV\n", "w5-N-LV"])("rejects %j", (k) => {
		expect(parseVoteKey(k)).toBeNull()
	})
	it("rejects anything that isn't a string", () => {
		expect(parseVoteKey(undefined)).toBeNull()
		expect(parseVoteKey({ toString: () => "w5-NE-LV" })).toBeNull()
		expect(parseVoteKey(5)).toBeNull()
	})
})

describe("ids and tallies", () => {
	it("makes a hyphenated, dot-free document id (a dot would make the tally private)", () => {
		const id = voteDocId(2026, { week: 5, away: "NE", home: "LV" })
		expect(id).toBe("mathvote-2026-w5-NE-LV")
		expect(id).not.toContain(".")
		expect(voteKey({ week: 5, away: "NE", home: "LV" })).toBe("w5-NE-LV")
	})
	it("keys tallies by game, skips junk rows and clamps bad counts", () => {
		const t = tallyMap([
			{ week: 5, away: "NE", home: "LV", blogger: 3, math: 7 },
			{ week: 6, away: "KC", home: "DEN", blogger: -2, math: 4.9 },
			{ week: 99, away: "KC", home: "DEN", blogger: 1, math: 1 },
			{ away: "KC", home: "DEN" },
		])
		expect(t).toEqual({ "w5-NE-LV": { blogger: 3, math: 7 }, "w6-KC-DEN": { blogger: 0, math: 4 } })
		expect(tallyMap(null)).toEqual({})
	})
	it("turns a tally into whole percents, null with no votes", () => {
		expect(sharePct({ blogger: 1, math: 3 }, "math")).toBe(75)
		expect(sharePct({ blogger: 1, math: 3 }, "blogger")).toBe(25)
		expect(sharePct({ blogger: 0, math: 0 }, "math")).toBeNull()
		expect(sharePct(undefined, "math")).toBeNull()
	})
})
