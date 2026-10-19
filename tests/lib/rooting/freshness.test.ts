// The committed data files, checked against each other and against the rules of the schedule. The Rooting Guide workflow runs this
// before it commits: it must never publish a guide that is missing a final score the schedule has, or a schedule that is not a real
// NFL season.

import { describe, expect, it } from "vitest"

import scheduleJson from "@/data/lab/schedule.json"
import { scheduleGames, type RawSchedule } from "@/lib/playoffs/schedule"
import { TEAMS } from "@/lib/nfl"
import { getRooting } from "@/lib/rooting/data"
import { isStale } from "@/lib/rooting/view"

const raw = scheduleJson as unknown as RawSchedule & { espnFinals?: string[] }
const games = scheduleGames(raw)
const data = getRooting()

describe("the schedule file", () => {
	it("is a whole season: 272 games, each with a unique id and two different NFL teams", () => {
		expect(games).toHaveLength(272)
		expect(new Set(games.map((g) => g.id)).size).toBe(272)
		const abbrs = new Set(TEAMS.map((t) => t.abbr))
		for (const g of games) {
			expect(abbrs.has(g.homeTeam), g.id).toBe(true)
			expect(abbrs.has(g.awayTeam), g.id).toBe(true)
			expect(g.homeTeam, g.id).not.toBe(g.awayTeam)
		}
	})

	it("gives every team 17 games, and no team two games in one week", () => {
		const per = new Map<string, number>()
		const weekly = new Map<string, number>()
		for (const g of games) {
			for (const t of [g.homeTeam, g.awayTeam]) {
				per.set(t, (per.get(t) ?? 0) + 1)
				const k = `${g.week}:${t}`
				weekly.set(k, (weekly.get(k) ?? 0) + 1)
			}
		}
		expect(per.size).toBe(32)
		per.forEach((n, t) => expect(n, t).toBe(17))
		weekly.forEach((n, k) => expect(n, k).toBe(1))
	})

	it("has sane scores and spreads", () => {
		for (const g of raw.games) {
			const hasHome = typeof g.homeScore === "number"
			const hasAway = typeof g.awayScore === "number"
			expect(hasHome, g.id).toBe(hasAway)
			if (hasHome) {
				for (const s of [g.homeScore as number, g.awayScore as number]) {
					expect(Number.isInteger(s), g.id).toBe(true)
					expect(s, g.id).toBeGreaterThanOrEqual(0)
				}
			}
			if (g.spread !== null && g.spread !== undefined) expect(Number.isFinite(g.spread), g.id).toBe(true)
		}
	})

	it("counts its own played games and last week correctly", () => {
		const finals = games.filter((g) => g.status === "final")
		expect(raw.played).toBe(finals.length)
		expect(raw.throughWeek).toBe(finals.reduce((m, g) => Math.max(m, g.week), 0))
	})

	it("only names ESPN-filled games that are now final", () => {
		const ids = new Map(games.map((g) => [g.id, g]))
		for (const id of raw.espnFinals ?? []) expect(ids.get(id)?.status, id).toBe("final")
	})

	it("is played in order: nothing is final in a week after an unplayed week by more than the game-day lag", () => {
		// Weeks run Thursday to Monday, so a later week can only have a final when every game two weeks earlier is done.
		const lastFinalWeek = games.filter((g) => g.status === "final").reduce((m, g) => Math.max(m, g.week), 0)
		for (const g of games) if (g.week <= lastFinalWeek - 2) expect(g.status, `${g.id} should be final`).toBe("final")
	})
})

describe("the guide matches the schedule", () => {
	it("exists and is well formed", () => {
		expect(data).not.toBeNull()
	})

	it("is not stale: every final score in the schedule is in the guide", () => {
		expect(isStale(data!, games)).toBe(false)
	})

	it("counts the same finals and open games as the schedule", () => {
		const finals = games.filter((g) => g.status === "final")
		expect(data!.finals).toBe(finals.length)
		expect(data!.open).toBe(games.length - finals.length)
		expect(data!.games).toHaveLength(data!.open)
		expect(data!.season).toBe(raw.season)
		expect(data!.throughWeek).toBe(raw.throughWeek)
	})

	it("lists exactly the games the schedule has not finished, and none of the finished ones", () => {
		const open = new Set(games.filter((g) => g.status !== "final").map((g) => g.id))
		expect(new Set(data!.games.map((g) => g.id))).toEqual(open)
	})

	it("dates its last final score to the latest played game", () => {
		const dates = games.filter((g) => g.status === "final" && g.date).map((g) => g.date as string).sort()
		expect(data!.lastFinal).toBe(dates[dates.length - 1] ?? null)
	})

	it("was built after the schedule it describes", () => {
		expect(Date.parse(data!.generatedAt)).toBeGreaterThanOrEqual(Date.parse(raw.generatedAt) - 60 * 60 * 1000)
	})

	it("lists each completed game as a final in the schedule, with the same score", () => {
		const byId = new Map(games.map((g) => [g.id, g]))
		for (const c of data!.completed) {
			const g = byId.get(c.id)
			expect(g?.status, c.id).toBe("final")
			expect(g?.homeScore, c.id).toBe(c.homeScore)
			expect(g?.awayScore, c.id).toBe(c.awayScore)
		}
	})
})
