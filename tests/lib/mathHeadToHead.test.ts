import { describe, expect, it } from "vitest"

import { type CompareTeam, headToHead, toCompareTeam } from "../../lib/math/headToHead"
import { buildOdds, buildReport } from "../../lib/math/report"
import { buildBoards } from "../../lib/rankings"
import { TEAMS } from "../../lib/nfl"
import { schedule } from "../stubs/seasonSchedule"

const team = (abbr: string, rating: number, blogger: number, upcoming: CompareTeam["upcoming"] = []): CompareTeam => ({
	abbr,
	name: abbr,
	nick: abbr,
	color: "#000000",
	blogger,
	math: blogger,
	rating,
	record: { w: 0, l: 0, t: 0 },
	playoffs: null,
	division: null,
	projWins: null,
	sosRank: null,
	yardageMargin: null,
	margin: null,
	turnoverMargin: null,
	upcoming,
})

describe("headToHead", () => {
	it("is even for equal ratings, and gives each side home field at its own place", () => {
		const h = headToHead(team("AAA", 1500, 1), team("BBB", 1500, 2))
		expect(h.neutral).toBeCloseTo(0.5, 5)
		expect(h.margin).toBe(0)
		expect(h.atA).toBeGreaterThan(0.5)
		expect(h.atB).toBeLessThan(0.5)
		expect(h.neutral).toBeGreaterThan(h.atB)
		expect(h.neutral).toBeLessThan(h.atA)
	})
	it("favors the better team by the rating gap (25 points is one point of margin)", () => {
		const h = headToHead(team("AAA", 1600, 5), team("BBB", 1500, 1))
		expect(h.margin).toBeCloseTo(4, 5)
		expect(h.neutral).toBeGreaterThan(0.5)
		expect(h.neutral).toBeLessThan(0.7)
		expect(h.mathPick).toBe("AAA")
		expect(h.bloggerPick).toBe("BBB")
	})
	it("finds the next scheduled meeting from team one's side", () => {
		const a = team("AAA", 1500, 1, [{ week: 7, opp: "BBB", home: true, chance: 0.61 }, { week: 9, opp: "CCC", home: false, chance: 0.4 }])
		expect(headToHead(a, team("BBB", 1500, 2)).meeting).toEqual({ week: 7, aHome: true, chance: 0.61 })
		expect(headToHead(a, team("DDD", 1500, 3)).meeting).toBeNull()
	})
})

describe("toCompareTeam", () => {
	const games = schedule(4)
	const names = TEAMS.map((t) => t.name)
	const boards = buildBoards([4].map((week) => ({ _id: `w${week}`, season: 2026, week, teams: names.map((t) => ({ team: t, note: null })) })))
	const report = buildReport(boards, games, 4, buildOdds(games, 4))

	it("keeps only what Compare needs", () => {
		const lv = report.teams.find((t) => t.abbr === "LV")!
		const c = toCompareTeam(lv)
		expect(c).toMatchObject({ abbr: "LV", nick: "Raiders", name: "Las Vegas Raiders", blogger: lv.blogger, rating: lv.rating })
		expect(c.playoffs).toBe(lv.odds!.playoffs)
		expect(c.upcoming).toBe(lv.upcoming)
		expect("results" in c).toBe(false)
		expect("rankHistory" in c).toBe(false)
	})
})
