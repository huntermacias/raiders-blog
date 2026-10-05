import { describe, expect, it } from "vitest"

import { asOf, buildOdds, buildReport, finals } from "../../lib/math/report"
import { buildBoards } from "../../lib/rankings"
import { TEAMS } from "../../lib/nfl"
import { schedule } from "../stubs/seasonSchedule"

// Four weeks played, thirteen to go. A board for weeks 2, 3 and 4 puts the teams in table order.
const games = schedule(4)
const names = TEAMS.map((t) => t.name)
const boards = buildBoards([2, 3, 4].map((week) => ({ _id: `w${week}`, season: 2026, week, teams: names.map((team, i) => ({ team, note: i === 0 ? "Buffalo note" : null })) })))

describe("asOf / finals", () => {
	it("treats later weeks as unplayed and counts only finished games", () => {
		expect(finals(games, 2)).toHaveLength(32)
		expect(finals(games, 4)).toHaveLength(64)
		const early = asOf(games, 2)
		expect(early.filter((g) => g.homeScore == null)).toHaveLength(games.length - 32)
		expect(games.filter((g) => g.week <= 2).every((g) => g.homeScore != null)).toBe(true)
	})
})

describe("buildReport", () => {
	const odds = buildOdds(games, 4)
	const report = buildReport(boards, games, 4, odds)
	const bills = report.teams.find((t) => t.abbr === "BUF")!

	it("has a row per team on the board, in my order", () => {
		expect(report.teams).toHaveLength(32)
		expect(report.teams.map((t) => t.blogger)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1))
		expect(report.hasOdds).toBe(true)
		expect(report.sims).toBe(10_000)
	})

	it("gives each team its week-by-week ranks, mine and the math's", () => {
		expect(bills.rankHistory.map((h) => h.week)).toEqual([1, 2, 3, 4])
		expect(bills.rankHistory.map((h) => h.me)).toEqual([null, 1, 1, 1]) // no board for week 1
		expect(bills.rankHistory.every((h) => h.math >= 1 && h.math <= 32)).toBe(true)
	})

	it("lists each game with how far it moved the rating, and the rating changes add up", () => {
		expect(bills.results).toHaveLength(4)
		expect(bills.results.map((r) => r.week)).toEqual([1, 2, 3, 4])
		const sum = bills.results.reduce((a, r) => a + r.shift, 0)
		expect(sum).toBeCloseTo(bills.rating - 1500, 6)
		expect(bills.record.w + bills.record.l + bills.record.t).toBe(4)
	})

	it("lists the games still to play with a win chance for the team", () => {
		expect(bills.upcoming).toHaveLength(13)
		expect(bills.upcoming.every((u) => u.chance > 0 && u.chance < 1 && u.week > 4)).toBe(true)
	})

	it("carries the playoff numbers and a history that ends at this week", () => {
		expect(bills.odds?.playoffs).toBeGreaterThanOrEqual(0)
		expect(bills.odds?.remaining).toBe(13)
		expect(bills.odds?.history.map((h) => h.week)).toEqual([1, 2, 3, 4])
		expect(bills.odds?.history[3].playoffs).toBe(bills.odds?.playoffs)
		expect(bills.odds?.sosRank).toBeGreaterThanOrEqual(1)
		expect(bills.note).toBe("Buffalo note")
	})

	it("looks at an earlier week as it stood then", () => {
		const early = buildReport(boards, games, 3, buildOdds(games, 3))
		const b = early.teams.find((t) => t.abbr === "BUF")!
		expect(early.week).toBe(3)
		expect(b.results).toHaveLength(3)
		expect(b.upcoming).toHaveLength(14)
		expect(b.rankHistory.map((h) => h.week)).toEqual([1, 2, 3])
	})

	it("works without odds and says so", () => {
		const bare = buildReport(boards, games, 4, null)
		expect(bare.hasOdds).toBe(false)
		expect(bare.teams[0].odds).toBeNull()
		expect(bare.teams[0].results.length).toBe(4)
	})
})
