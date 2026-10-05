import { describe, expect, it } from "vitest"

import { asOf, buildOdds, buildReport, finals, plainOdds } from "../../lib/math/report"
import type { GameBox } from "../../lib/math/efficiency"
import { annotate } from "../../lib/math/situation"
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


describe("the slate", () => {
	const report = buildReport(boards, games, 4, buildOdds(games, 4))

	it("lists the games still to play from this week and the next, soonest first", () => {
		expect(report.slate).toHaveLength(16) // week 5 only: every week-4 game is final
		expect(report.slate.every((g) => g.week === 5)).toBe(true)
		const times = report.slate.map((g) => g.kickoff)
		expect(times).toEqual(times.slice().sort())
	})

	it("includes this week's games that are not final yet, ahead of the next week's", () => {
		const open = games.map((g, i) => (g.week === 4 && i % 16 === 0 ? { ...g, homeScore: null, awayScore: null } : g))
		const r = buildReport(boards, open, 4, null)
		expect(r.slate.filter((g) => g.week === 4)).toHaveLength(1)
		expect(r.slate[0].week).toBe(4)
		expect(r.slate.filter((g) => g.week === 5)).toHaveLength(16)
	})

	it("gives each game a key, a chance, a margin and the two picks", () => {
		const g = report.slate[0]
		expect(g.key).toBe(`w5-${g.away}-${g.home}`)
		expect(g.homeChance).toBeGreaterThan(0)
		expect(g.homeChance).toBeLessThan(1)
		expect(Math.sign(g.homeMargin)).toBe(Math.sign(g.homeChance - 0.5))
		expect([g.home, g.away]).toContain(g.mathPick)
		expect(g.mathPick).toBe(g.homeChance >= 0.5 ? g.home : g.away)
		// My board is in table order, so the higher-ranked team is the one earlier in TEAMS.
		const rank = (a: string) => report.teams.find((t) => t.abbr === a)!.blogger
		expect(g.bloggerPick).toBe(rank(g.home) < rank(g.away) ? g.home : g.away)
		expect(g.split).toBe(g.bloggerPick !== g.mathPick)
	})

	it("is empty when nothing is left to play, whatever the schedule says about later weeks", () => {
		const done = schedule(17)
		const late = buildBoards([{ _id: "w17", season: 2026, week: 17, teams: names.map((team) => ({ team, note: null })) }])
		expect(buildReport(late, done, 17, null).slate).toEqual([])
	})

	it("counts rest and travel in the chance when the games carry an edge", () => {
		const plain = buildReport(boards, games, 4, null).slate
		const edged = buildReport(boards, games.map((g) => ({ ...g, edge: g.week === 5 ? 200 : 0 })), 4, null).slate
		expect(edged.every((g, i) => g.homeChance > plain[i].homeChance)).toBe(true)
	})
})

describe("the fuller model", () => {
	const annotated = annotate(games)
	const prior = Object.fromEntries(TEAMS.map((t, i) => [t.abbr, 1500 + (16 - i) * 8]))
	const boxes: GameBox[] = finals(annotated, 4).map((g, i) => ({
		id: String(i),
		week: g.week,
		home: g.home,
		away: g.away,
		homeScore: g.homeScore,
		awayScore: g.awayScore,
		homeYpp: 5 + (i % 3) * 0.5,
		awayYpp: 5 + (i % 4) * 0.4,
		homeTo: i % 3,
		awayTo: i % 2,
	}))
	const model = { prior, boxes }
	const plain = plainOdds(annotated, 4)
	const full = buildReport(boards, annotated, 4, buildOdds(annotated, 4, model), model, plain)
	const flat = buildReport(boards, annotated, 4, buildOdds(annotated, 4), {}, null)

	it("starts from last season's ratings", () => {
		const first = TEAMS[0].abbr
		// The best team on last year's board still rates higher than the same team with no prior.
		expect(full.teams.find((t) => t.abbr === first)!.rating).toBeGreaterThan(flat.teams.find((t) => t.abbr === first)!.rating)
		expect(full.basis).toEqual({ prior: true, boxes: boxes.length, situational: true })
		expect(flat.basis.prior).toBe(false)
		expect(flat.basis.boxes).toBe(0)
	})

	it("carries each team's box-score view, and none without box scores", () => {
		expect(full.teams.every((t) => t.under && t.under.games === 4)).toBe(true)
		expect(flat.teams.every((t) => t.under === null)).toBe(true)
	})

	it("sets the results-only odds beside the full ones", () => {
		const t = full.teams[0]
		expect(t.odds?.plain).not.toBeNull()
		expect(t.odds?.plain?.playoffs).toBeCloseTo(plain[t.abbr].playoffs, 9)
		expect(flat.teams[0].odds?.plain).toBeNull()
		// The results-only simulation matches what the page shows when there is no extra model.
		expect(plain[t.abbr].playoffs).toBeCloseTo(buildOdds(annotated, 4).now.teams[t.abbr].playoffs, 9)
	})

	it("changes the odds, the way a prior should", () => {
		const first = TEAMS[0].abbr
		expect(full.teams.find((t) => t.abbr === first)!.odds!.playoffs).not.toBe(flat.teams.find((t) => t.abbr === first)!.odds!.playoffs)
	})
})
