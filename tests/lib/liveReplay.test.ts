import { describe, expect, it } from "vitest"

import { parseScoreboard, parseSummary } from "../../lib/live/espn"
import { gameAtPlay, nextScore, scoreStops, seriesIndexAt } from "../../lib/live/replay"
import { allPlays, wpSeries } from "../../lib/live/series"
import type { LiveGame } from "../../lib/live/types"
import { scoreboard, summary } from "../stubs/liveFeed"

// The Raiders-Chiefs stub, finished: the replay of a game that is over.
const info = parseScoreboard(scoreboard).find((g) => g.id === "401872980")!
const final: LiveGame = parseSummary(structuredClone(summary), { ...info, state: "post", detail: "Final", period: 4, clockSeconds: 0 })
const plays = allPlays(final)

describe("gameAtPlay", () => {
	it("is the finished game itself at the last play and after it", () => {
		expect(gameAtPlay(final, plays.length)).toBe(final)
		expect(gameAtPlay(final, plays.length + 5)).toBe(final)
	})

	it("starts at 0-0 in the first quarter before any play", () => {
		const g = gameAtPlay(final, 0)
		expect(g.drives).toEqual([])
		expect(g.info.away.score).toBe(0)
		expect(g.info.home.score).toBe(0)
		expect(g.info.period).toBe(1)
		expect(g.info.state).toBe("in")
	})

	it("shows only the plays played so far, with the score and clock as they were", () => {
		const k = plays.findIndex((p) => p.scoring) + 1
		const g = gameAtPlay(final, k)
		expect(allPlays(g)).toHaveLength(k)
		expect(allPlays(g).every((p, i) => p.id === plays[i].id)).toBe(true)
		expect(g.info.away.score).toBe(plays[k - 1].away)
		expect(g.info.home.score).toBe(plays[k - 1].home)
		expect(g.info.clockSeconds).toBe(plays[k - 1].clockSeconds)
	})

	it("does not give away how an unfinished drive ends", () => {
		const k = plays.findIndex((p) => p.scoring) // one play before the touchdown
		const g = gameAtPlay(final, k)
		const last = g.drives[g.drives.length - 1]
		expect(last.result).toBe("")
		expect(last.description).toMatch(/^\d+ plays?$/)
		expect(last.plays.length).toBeLessThan(final.drives.find((d) => d.id === last.id)!.plays.length)
	})

	it("puts the ball with the team that snaps next, at the next play's down and spot", () => {
		const k = 2
		const next = plays[k]
		const g = gameAtPlay(final, k)
		expect(g.info.possession).toBe(next.team)
		if (next.down != null && next.from != null) expect(g.info.situation).toMatchObject({ down: next.down, yardsToGoal: 100 - next.from })
	})

	it("leaves out the final team stats, which belong to the whole game", () => {
		expect(gameAtPlay(final, 1).stats).toEqual([])
	})
})

describe("seriesIndexAt", () => {
	const series = wpSeries(final)
	it("is the kickoff before any play and the Final sample after the last", () => {
		expect(seriesIndexAt(plays, 0, series.length)).toBe(0)
		expect(seriesIndexAt(plays, plays.length, series.length)).toBe(series.length - 1)
	})
	it("moves one sample for each timed play", () => {
		for (let k = 0; k + 1 < plays.length; k++) {
			const a = seriesIndexAt(plays, k, series.length)
			const b = seriesIndexAt(plays, k + 1, series.length)
			expect(b - a).toBeLessThanOrEqual(1)
			expect(b).toBeGreaterThanOrEqual(a)
		}
	})
	it("lands on the sample for that play's score", () => {
		for (let k = 1; k < plays.length; k++) {
			if (plays[k - 1].period <= 0) continue
			const s = series[seriesIndexAt(plays, k, series.length)]
			expect(s.away).toBe(plays[k - 1].away)
			expect(s.homeScore).toBe(plays[k - 1].home)
		}
	})
})

describe("score stops", () => {
	it("are the play counts at which a score has just happened, and next score finds the following one", () => {
		const stops = scoreStops(plays)
		expect(stops.length).toBeGreaterThan(0)
		for (const s of stops) expect(plays[s - 1].scoring).toBe(true)
		expect(nextScore(plays, 0)).toBe(stops[0])
		expect(nextScore(plays, stops[stops.length - 1])).toBeNull()
	})
})
