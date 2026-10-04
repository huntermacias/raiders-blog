import { describe, expect, it } from "vitest"

import type { GamePrediction } from "../../lib/predictions"
import { type ScheduleGame, joinSchedule, nextGame, recordText, scheduleRecord } from "../../lib/schedule"

const CHIEFS = "Kansas City Chiefs"
const DOLPHINS = "Miami Dolphins"
const RAIDERS = "Las Vegas Raiders"

const sched = (week: number, opponent: string | null, over: Partial<ScheduleGame> = {}): ScheduleGame => ({
	week,
	opponent,
	homeAway: "home",
	kickoff: `2026-10-${String(week).padStart(2, "0")}T20:00:00Z`,
	...over,
})

function pick(over: Partial<GamePrediction> & { week: number }): GamePrediction {
	return {
		_id: `p${over.week}`,
		awayTeam: CHIEFS,
		homeTeam: RAIDERS,
		kickoff: "2026-10-01T20:00:00Z",
		predictedAwayScore: 20,
		predictedHomeScore: 27,
		...over,
	}
}

describe("joinSchedule", () => {
	it("sorts by week", () => {
		const rows = joinSchedule([sched(3, CHIEFS), sched(1, DOLPHINS), sched(2, CHIEFS)], [])
		expect(rows.map((r) => r.week)).toEqual([1, 2, 3])
	})

	it("leaves bye weeks without a pick or outcome", () => {
		const [row] = joinSchedule([{ week: 5, bye: true }], [pick({ week: 5 })])
		expect(row).toMatchObject({ bye: true, pick: null, outcome: null })
	})

	it("matches a pick by week and opponent, with the Raiders' score first", () => {
		// Raiders at home: predictedHome is the Raiders' score
		const [row] = joinSchedule([sched(4, CHIEFS)], [pick({ week: 4 })])
		expect(row.pick).toEqual({ id: "p4", raiders: 27, opponent: 20, result: "pending" })
		expect(row.outcome).toBeNull()
	})

	it("maps scores correctly when the Raiders are the away team", () => {
		const p = pick({ week: 2, awayTeam: RAIDERS, homeTeam: CHIEFS, predictedAwayScore: 24, predictedHomeScore: 17, actualAwayScore: 30, actualHomeScore: 10 })
		const [row] = joinSchedule([sched(2, CHIEFS, { homeAway: "away" })], [p])
		expect(row.pick).toMatchObject({ raiders: 24, opponent: 17, result: "hit" })
		expect(row.outcome).toEqual({ raiders: 30, opponent: 10, result: "W" })
	})

	it("derives W, L and T outcomes from the final score", () => {
		const rows = joinSchedule(
			[sched(1, CHIEFS), sched(2, CHIEFS), sched(3, CHIEFS)],
			[
				pick({ week: 1, actualAwayScore: 17, actualHomeScore: 24 }),
				pick({ week: 2, actualAwayScore: 30, actualHomeScore: 10 }),
				pick({ week: 3, actualAwayScore: 20, actualHomeScore: 20 }),
			]
		)
		expect(rows.map((r) => r.outcome?.result)).toEqual(["W", "L", "T"])
		expect(rows[1].pick?.result).toBe("miss")
		expect(rows[2].pick?.result).toBe("push")
	})

	it("does not attach a pick for a different opponent in the same week", () => {
		const [row] = joinSchedule([sched(4, DOLPHINS)], [pick({ week: 4 })])
		expect(row.pick).toBeNull()
	})

	it("attaches a pick when the schedule row has no opponent yet", () => {
		const [row] = joinSchedule([sched(4, null)], [pick({ week: 4 })])
		expect(row.pick?.id).toBe("p4")
	})

	it("ignores picks for games the Raiders aren't in", () => {
		const other = pick({ week: 4, awayTeam: "Buffalo Bills", homeTeam: DOLPHINS })
		const [row] = joinSchedule([sched(4, null)], [other])
		expect(row.pick).toBeNull()
	})

	it("carries the preview and recap links onto the row", () => {
		const p = pick({ week: 4, preview: { slug: "prev", title: "Preview" }, report: { slug: "rec", title: "Recap" }, actualAwayScore: 1, actualHomeScore: 2 })
		const [row] = joinSchedule([sched(4, CHIEFS)], [p])
		expect(row.preview).toEqual({ slug: "prev", title: "Preview" })
		expect(row.report).toEqual({ slug: "rec", title: "Recap" })
	})

	it("does not mutate its inputs", () => {
		const games = [sched(2, CHIEFS), sched(1, DOLPHINS)]
		joinSchedule(games, [])
		expect(games.map((g) => g.week)).toEqual([2, 1])
	})
})

describe("scheduleRecord / recordText", () => {
	it("counts only finished games", () => {
		const rows = joinSchedule(
			[sched(1, CHIEFS), sched(2, CHIEFS), sched(3, CHIEFS), sched(4, CHIEFS), { week: 5, bye: true }],
			[
				pick({ week: 1, actualAwayScore: 17, actualHomeScore: 24 }),
				pick({ week: 2, actualAwayScore: 30, actualHomeScore: 10 }),
				pick({ week: 3, actualAwayScore: 20, actualHomeScore: 20 }),
				pick({ week: 4 }),
			]
		)
		expect(scheduleRecord(rows)).toEqual({ w: 1, l: 1, t: 1 })
	})

	it("formats the record, adding ties only when there are some", () => {
		expect(recordText({ w: 3, l: 0, t: 0 })).toBe("3–0")
		expect(recordText({ w: 8, l: 8, t: 1 })).toBe("8–8–1")
	})
})

describe("nextGame", () => {
	const NOW = new Date("2026-10-04T12:00:00Z").getTime()
	const HOUR = 3600 * 1000

	it("returns the first game that hasn't finished", () => {
		const rows = joinSchedule(
			[sched(1, DOLPHINS), sched(4, CHIEFS, { kickoff: "2026-10-04T20:00:00Z" }), sched(5, CHIEFS, { kickoff: "2026-10-11T20:00:00Z" })],
			[pick({ week: 1, awayTeam: DOLPHINS, actualAwayScore: 10, actualHomeScore: 20 })]
		)
		expect(nextGame(rows, NOW)?.week).toBe(4)
	})

	it("skips byes and rows with no opponent", () => {
		const rows = joinSchedule([{ week: 4, bye: true }, sched(5, null), sched(6, CHIEFS, { kickoff: "2026-10-18T20:00:00Z" })], [])
		expect(nextGame(rows, NOW)?.week).toBe(6)
	})

	it("keeps a game as 'next' for four hours after kickoff, then moves on", () => {
		const rows = joinSchedule([sched(4, CHIEFS, { kickoff: "2026-10-04T12:00:00Z" }), sched(5, CHIEFS, { kickoff: "2026-10-11T12:00:00Z" })], [])
		expect(nextGame(rows, NOW + 3 * HOUR)?.week).toBe(4)
		expect(nextGame(rows, NOW + 5 * HOUR)?.week).toBe(5)
	})

	it("keeps a game with no kickoff time", () => {
		const rows = joinSchedule([sched(4, CHIEFS, { kickoff: null })], [])
		expect(nextGame(rows, NOW)?.week).toBe(4)
	})

	it("returns null when nothing is left", () => {
		expect(nextGame([], NOW)).toBeNull()
		expect(nextGame(joinSchedule([{ week: 1, bye: true }], []), NOW)).toBeNull()
	})
})
