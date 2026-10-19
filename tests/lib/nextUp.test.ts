import { describe, expect, it } from "vitest"

import { kickoffMs, lineText, nextRaidersGame } from "../../lib/live/nextUp"
import type { LiveGameInfo } from "../../lib/live/types"
import type { Game } from "../../lib/playoffs/types"

const g = (week: number, away: string, home: string, date: string, time: string | null, score?: [number, number], spread?: number | null): Game => ({
	id: `2026_${week}_${away}_${home}`,
	week,
	awayTeam: away,
	homeTeam: home,
	awayScore: score ? score[0] : null,
	homeScore: score ? score[1] : null,
	status: score ? "final" : "scheduled",
	winner: score ? (score[0] > score[1] ? away : home) : null,
	tie: false,
	date,
	time,
	spread: spread ?? null,
})

const SCHEDULE = [
	g(4, "KC", "LV", "2026-10-04", "16:25", [30, 27]),
	g(5, "LV", "NE", "2026-10-11", "13:00", [17, 45]),
	g(6, "BUF", "LV", "2026-10-18", "16:25"),
	g(7, "LAR", "LV", "2026-10-25", "16:25", undefined, -7),
	g(8, "LV", "NYJ", "2026-11-01", "13:00"),
	g(7, "DAL", "GB", "2026-10-25", "13:00"),
]

const board = (state: "pre" | "in" | "post", home = "LV", away = "BUF", kickoff = "2026-10-18T20:25:00Z"): LiveGameInfo[] => [
	{
		id: "1", state, detail: "", shortDetail: "", period: 1, clockSeconds: null, kickoff,
		home: { abbr: home, name: home, score: 0, record: null, espnId: null },
		away: { abbr: away, name: away, score: 0, record: null, espnId: null },
		odds: null, venue: null, network: null, possession: null, situation: null,
	},
]

const MON = Date.parse("2026-10-19T15:00:00Z")

describe("nextRaidersGame", () => {
	it("skips a finished game the schedule hasn't caught up on, because the board shows it final", () => {
		expect(nextRaidersGame(SCHEDULE, board("post"), Date.parse("2026-10-18T22:00:00Z"))?.week).toBe(7)
	})

	it("skips it on kickoff time alone when the board is down", () => {
		expect(nextRaidersGame(SCHEDULE, null, MON)?.week).toBe(7)
	})

	it("does not skip a game that hasn't kicked off", () => {
		expect(nextRaidersGame(SCHEDULE, board("pre"), Date.parse("2026-10-18T12:00:00Z"))?.week).toBe(6)
		expect(nextRaidersGame(SCHEDULE, null, Date.parse("2026-10-18T12:00:00Z"))?.week).toBe(6)
	})

	it("moves on while the Raiders are playing", () => {
		expect(nextRaidersGame(SCHEDULE, board("in"), Date.parse("2026-10-18T21:30:00Z"))?.week).toBe(7)
	})

	it("reports the opponent, the venue and the line", () => {
		expect(nextRaidersGame(SCHEDULE, null, MON)).toEqual({ week: 7, opp: "LAR", home: true, date: "2026-10-25", time: "16:25", spread: -7 })
		expect(nextRaidersGame(SCHEDULE, null, Date.parse("2026-10-26T12:00:00Z"))).toMatchObject({ week: 8, opp: "NYJ", home: false })
	})

	it("ignores a same-teams rematch on the board from another week", () => {
		const rematch = board("post", "LV", "LAR", "2026-09-13T20:25:00Z")
		expect(nextRaidersGame(SCHEDULE, rematch, MON)?.week).toBe(7)
	})

	it("is null when the Raiders have nothing left", () => {
		expect(nextRaidersGame(SCHEDULE.slice(0, 2), null, MON)).toBeNull()
		expect(nextRaidersGame([], null, MON)).toBeNull()
	})

	it("doesn't care what order the schedule is in", () => {
		expect(nextRaidersGame(SCHEDULE.slice().reverse(), null, MON)?.week).toBe(7)
	})
})

describe("kickoffMs", () => {
	it("reads the schedule's Eastern time, with daylight time until the first Sunday of November", () => {
		expect(new Date(kickoffMs("2026-10-25", "16:25")!).toISOString()).toBe("2026-10-25T20:25:00.000Z")
		// Clocks go back at 2 a.m. on Nov. 1, 2026, so that day's 1 p.m. game is already on standard time.
		expect(new Date(kickoffMs("2026-10-31", "13:00")!).toISOString()).toBe("2026-10-31T17:00:00.000Z")
		expect(new Date(kickoffMs("2026-11-01", "13:00")!).toISOString()).toBe("2026-11-01T18:00:00.000Z")
		expect(new Date(kickoffMs("2026-11-08", "13:00")!).toISOString()).toBe("2026-11-08T18:00:00.000Z")
	})
	it("is null for a date it can't read", () => {
		expect(kickoffMs("soon", null)).toBeNull()
	})
})

describe("lineText", () => {
	const n = (home: boolean, spread: number | null) => ({ week: 7, opp: "LAR", home, date: null, time: null, spread })
	it("says who is favored from the home team's spread", () => {
		expect(lineText(n(true, -7), "Rams")).toBe("Rams favored by 7")
		expect(lineText(n(true, 3), "Rams")).toBe("Raiders favored by 3")
		expect(lineText(n(false, 3), "Jets")).toBe("Jets favored by 3")
		expect(lineText(n(false, -2.5), "Jets")).toBe("Raiders favored by 2.5")
		expect(lineText(n(true, 0), "Rams")).toBe("Pick 'em")
		expect(lineText(n(true, null), "Rams")).toBeNull()
	})
})
