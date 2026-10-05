import { describe, expect, it } from "vitest"

import { kickoffText, lineText, oddsText } from "../../lib/math/format"
import { cardFileName, cardPath, hourStamp, pagePath, xIntent } from "../../lib/math/share"

describe("pagePath and cardPath", () => {
	it("builds the plain page and the Raiders card by default", () => {
		expect(pagePath()).toBe("/rankings/math")
		expect(cardPath()).toBe("/api/og?type=math")
	})
	it("carries a team, a week and the model", () => {
		expect(pagePath({ team: "lv", week: 4, model: "season" })).toBe("/rankings/math?team=LV&week=4&model=season")
		expect(cardPath({ take: "kc", week: 4 }, 99)).toBe("/api/og?take=KC&week=4&type=math&v=99")
	})
	it("lets a team win over a take, and drops the full model and bad values", () => {
		expect(pagePath({ team: "LV", take: "KC", model: "full" })).toBe("/rankings/math?team=LV")
		expect(pagePath({ team: "../x", week: 40 })).toBe("/rankings/math")
		expect(pagePath({ week: 4.5 })).toBe("/rankings/math")
	})
	it("names the download after the view", () => {
		expect(cardFileName()).toBe("raiders-rundown-raiders-vs-math.png")
		expect(cardFileName({ team: "LV", week: 4 })).toBe("raiders-rundown-lv-week-4.png")
		expect(cardFileName({ take: "KC" })).toBe("raiders-rundown-take-kc.png")
	})
	it("stamps by the hour and builds an X intent", () => {
		expect(hourStamp(3_600_000 * 5 + 10)).toBe(5)
		expect(xIntent("a b", "https://x.test/?q=1")).toBe("https://twitter.com/intent/tweet?text=a+b&url=https%3A%2F%2Fx.test%2F%3Fq%3D1")
	})
})

describe("format", () => {
	it("says the line to the nearest half point", () => {
		expect(lineText(3.4, "LV", "KC")).toBe("LV by 3.5")
		expect(lineText(-7.1, "LV", "KC")).toBe("KC by 7")
		expect(lineText(0.2, "LV", "KC")).toBe("Pick’em")
		expect(lineText(-0.1, "LV", "KC")).toBe("Pick’em")
	})
	it("prints a kickoff in Pacific time, or just the day when ESPN has no time yet", () => {
		expect(kickoffText("2026-10-11T20:25:00Z")).toBe("Sun, Oct 11, 1:25 PM PT")
		expect(kickoffText("2026-12-27T05:00:00Z")).toBe("Sun, Dec 27 · time TBD")
		expect(kickoffText(null)).toBe("")
		expect(kickoffText("nonsense")).toBe("")
	})
	it("keeps oddsText's near-miss wording", () => {
		expect(oddsText(0.004)).toBe("<1%")
		expect(oddsText(0.996)).toBe(">99%")
		expect(oddsText(0.426)).toBe("43%")
	})
})
