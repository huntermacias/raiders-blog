import { describe, expect, it } from "vitest"

import { driveBars, driveSummary, finalScore, halftimeLine, headingId, headings, quarterLine, scoreAtHalf, trimLead, turningPoints } from "../../lib/report/story"
import type { Drive, KeyPlay } from "../../lib/lab/types"

const block = (text: string, style = "normal", key = text) => ({ _type: "block", _key: key, style, children: [{ _type: "span", text }] })

describe("finalScore", () => {
	it("trusts the Lab over a Studio score typed the wrong way round", () => {
		const s = finalScore({ raiders: 35, opponent: 21 }, { score: [21, 35] })
		expect(s).toMatchObject({ raiders: 21, opponent: 35, source: "lab", studioWrong: true })
	})
	it("falls back to the ESPN line score, then to Studio", () => {
		const q = [7, 7, 7, 7].map((n) => ({ raiders: n, opponent: n - 1 }))
		expect(finalScore({ raiders: 0, opponent: 0 }, null, q)).toMatchObject({ raiders: 28, opponent: 24, source: "espn", studioWrong: true })
		expect(finalScore({ raiders: 17, opponent: 20 }, null, null)).toMatchObject({ raiders: 17, opponent: 20, source: "studio", studioWrong: false })
		// A partial line score (a game in progress) is not a final.
		expect(finalScore({ raiders: 17, opponent: 20 }, null, q.slice(0, 2)).source).toBe("studio")
	})
	it("does not flag a Studio score that agrees", () => {
		expect(finalScore({ raiders: 21, opponent: 35 }, { score: [21, 35] }).studioWrong).toBe(false)
	})
})

describe("headings", () => {
	it("makes short, unique anchors", () => {
		expect(headingId("The Raiders' Offense Isn't Working!")).toBe("the-raiders-offense-isnt-working")
		expect(headingId("???")).toBe("section")
		const hs = headings([block("Defense", "h2"), block("Offense", "h2"), block("Defense", "h3"), block("body"), block("", "h2")])
		expect(hs.map((h) => h.id)).toEqual(["defense", "offense", "defense-2"])
		expect(hs.map((h) => h.level)).toEqual([2, 2, 3])
	})
	it("copes with a missing body", () => {
		expect(headings(undefined)).toEqual([])
	})
})

describe("trimLead", () => {
	it("drops a dateline, a scoreline and empty paragraphs at the very top, never the writing", () => {
		const body = [block(""), block("Week 7 Game Report | October 25 | Allegiant Stadium"), block("Rams 35, Raiders 21"), block("The film is worse than the score."), block("Rams 35, Raiders 21")]
		const out = trimLead(body)
		expect(out).toHaveLength(2)
		expect((out[0] as ReturnType<typeof block>).children[0].text).toBe("The film is worse than the score.")
	})
	it("stops at a heading or an image", () => {
		const body = [block("Intro", "h2"), block("Rams 35, Raiders 21")]
		expect(trimLead(body)).toHaveLength(2)
		expect(trimLead([{ _type: "image" }, block("x")])).toHaveLength(2)
		expect(trimLead(null)).toEqual([])
	})
})

const play = (el: number, swing: number, extra: Partial<KeyPlay> = {}): KeyPlay =>
	({ el, clock: "", kind: "touchdown", team: "LV", text: `play ${el}`, score: [0, 0], wpBefore: 50, wpAfter: 50 + swing, ...extra }) as KeyPlay

describe("turningPoints", () => {
	it("keeps the biggest swings, in the order they happened", () => {
		const keyPlays = [play(100, 3), play(200, -30), play(300, 12), play(2000, -20), play(3000, 1)]
		const pts = turningPoints({ keyPlays }, 3)
		expect(pts.map((p) => p.el)).toEqual([200, 300, 2000])
		expect(pts[0].q).toBe("Q1")
		expect(pts[2].q).toBe("Q3")
	})
	it("is empty when nothing has a win probability", () => {
		expect(turningPoints({ keyPlays: [] })).toEqual([])
	})
})

describe("scores by quarter", () => {
	const scores: [number, number, number][] = [
		[300, 0, 7],
		[1000, 3, 7],
		[1700, 3, 14],
		[2000, 6, 14],
		[3500, 9, 14],
	]
	it("splits points by quarter and adds overtime when there was some", () => {
		expect(quarterLine({ scores, score: [9, 14] }).map((q) => [q.label, q.me, q.opp])).toEqual([["Q1", 0, 7], ["Q2", 3, 7], ["Q3", 3, 0], ["Q4", 3, 0]])
		const ot = quarterLine({ scores, score: [12, 14] })
		expect(ot[ot.length - 1]).toEqual({ label: "OT", me: 3, opp: 0 })
	})
	it("reads the score and the story at the half", () => {
		expect(scoreAtHalf({ scores })).toEqual([3, 14])
		expect(halftimeLine({ scores, oppName: "Rams", score: [9, 14] })).toBe("Rams led 14–3 at the half")
		expect(halftimeLine({ scores: [[1900, 3, 0]], oppName: "Rams", score: [3, 0] })).toBeNull()
		expect(halftimeLine({ scores: [[500, 7, 7]], oppName: "Rams", score: [7, 7] })).toBe("Tied 7–7 at the half")
	})
})

const drive = (n: number, team: string, result: string, plays = 5, yards = 30): Drive => ({ n, team, q: 1, clock: "10:00", result, plays: Array.from({ length: plays }, () => ({}) as never), yards, top: "2:00", start: 25 }) as Drive

describe("drives", () => {
	it("tags whose drive it was and which ones scored", () => {
		const bars = driveBars([drive(1, "LV", "Touchdown"), drive(2, "LA", "Punt"), drive(3, "LA", "Field goal"), drive(4, "LV", "Missed field goal")], "LV")
		expect(bars.map((b) => [b.mine, b.scored])).toEqual([[true, true], [false, false], [false, true], [true, false]])
		expect(driveSummary(bars, true)).toMatchObject({ drives: 2, scoringDrives: 1, points: 7 })
		expect(driveSummary(bars, false)).toMatchObject({ drives: 2, scoringDrives: 1, points: 3, yards: 60, plays: 10 })
	})
})
