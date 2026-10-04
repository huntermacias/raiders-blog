import { describe, expect, it } from "vitest"

import { GAME_WINDOW_MS, countdownParts, hubState, minutesFromWords, playedGames, readingMinutes } from "../../lib/home"
import type { GamePrediction } from "../../lib/predictions"
import { type ScheduleGame, joinSchedule } from "../../lib/schedule"

const KICKOFF = "2026-10-04T20:25:00Z"
const T = new Date(KICKOFF).getTime()

const g = (week: number, kickoff: string | null, over: Partial<ScheduleGame> = {}): ScheduleGame => ({
	week,
	opponent: "Kansas City Chiefs",
	homeAway: "home",
	kickoff,
	...over,
})

describe("hubState", () => {
	const rows = joinSchedule([g(4, KICKOFF), g(5, "2026-10-11T17:00:00Z", { opponent: "New England Patriots" })], [])

	it("is 'next' before kickoff, naming the upcoming game", () => {
		const s = hubState(rows, T - 60_000)
		expect(s.kind).toBe("next")
		expect(s.kind === "next" && s.game.week).toBe(4)
	})

	it("is 'live' from kickoff until the four-hour window closes", () => {
		expect(hubState(rows, T).kind).toBe("live")
		expect(hubState(rows, T + GAME_WINDOW_MS - 1).kind).toBe("live")
	})

	it("moves on to the following game once the window has closed", () => {
		const s = hubState(rows, T + GAME_WINDOW_MS)
		expect(s.kind).toBe("next")
		expect(s.kind === "next" && s.game.week).toBe(5)
	})

	it("is never 'live' for a game that already has a final score", () => {
		const finished: GamePrediction = {
			_id: "p4",
			week: 4,
			awayTeam: "Kansas City Chiefs",
			homeTeam: "Las Vegas Raiders",
			kickoff: KICKOFF,
			predictedAwayScore: 20,
			predictedHomeScore: 27,
			actualAwayScore: 17,
			actualHomeScore: 24,
		}
		const r = joinSchedule([g(4, KICKOFF), g(5, "2026-10-11T17:00:00Z")], [finished])
		const s = hubState(r, T + 3_600_000)
		expect(s.kind).toBe("next")
		expect(s.kind === "next" && s.game.week).toBe(5)
	})

	it("ignores byes and games with no opponent or an unreadable kickoff when looking for live", () => {
		const odd = joinSchedule([{ week: 4, bye: true }, g(5, "not a date"), g(6, KICKOFF, { opponent: null })], [])
		expect(hubState(odd, T + 1000).kind).not.toBe("live")
	})

	it("is 'idle' with no schedule or nothing left to play", () => {
		expect(hubState([], T)).toEqual({ kind: "idle" })
		expect(hubState(rows, new Date("2027-02-01T00:00:00Z").getTime())).toEqual({ kind: "idle" })
	})
})

describe("playedGames", () => {
	it("returns finished games, oldest week first, without byes", () => {
		const mk = (week: number, away: number | null, home: number | null): GamePrediction => ({
			_id: `p${week}`,
			week,
			awayTeam: "Kansas City Chiefs",
			homeTeam: "Las Vegas Raiders",
			kickoff: KICKOFF,
			predictedAwayScore: 10,
			predictedHomeScore: 20,
			actualAwayScore: away,
			actualHomeScore: home,
		})
		const rows = joinSchedule(
			[g(3, KICKOFF), g(1, KICKOFF), { week: 2, bye: true }, g(4, KICKOFF)],
			[mk(3, 10, 20), mk(1, 10, 20), mk(4, null, null)]
		)
		expect(playedGames(rows).map((r) => r.week)).toEqual([1, 3])
	})
})

describe("minutesFromWords", () => {
	it("rounds to the nearest minute at 225 words a minute", () => {
		expect(minutesFromWords(225)).toBe(1)
		expect(minutesFromWords(2827)).toBe(13)
		expect(minutesFromWords(3195)).toBe(14)
	})

	it("never goes below one minute and survives bad input", () => {
		expect(minutesFromWords(0)).toBe(1)
		expect(minutesFromWords(40)).toBe(1)
		expect(minutesFromWords(Number.NaN)).toBe(1)
		expect(minutesFromWords(Number.POSITIVE_INFINITY)).toBe(1)
	})

	it("accepts a different reading speed", () => {
		expect(minutesFromWords(1000, 200)).toBe(5)
	})
})

describe("readingMinutes", () => {
	const block = (text: string) => ({ _type: "block", children: [{ _type: "span", text }] })
	const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ")

	it("counts words across blocks and spans", () => {
		expect(readingMinutes([block(words(225)), block(words(225))])).toBe(2)
		expect(readingMinutes([{ children: [{ text: words(100) }, { text: words(125) }] }])).toBe(1)
	})

	it("ignores blocks without text, such as images", () => {
		expect(readingMinutes([{ _type: "image" }, block(words(450))])).toBe(2)
	})

	it("collapses extra whitespace and ignores empty spans", () => {
		expect(readingMinutes([block("  one   two \n three  "), { children: [{ text: "   " }] }])).toBe(1)
	})

	it("returns one minute for a missing or non-array body", () => {
		expect(readingMinutes(undefined)).toBe(1)
		expect(readingMinutes(null)).toBe(1)
		expect(readingMinutes("text")).toBe(1)
		expect(readingMinutes([])).toBe(1)
	})
})

describe("countdownParts", () => {
	it("splits a duration into days, hours, minutes and seconds", () => {
		expect(countdownParts(((2 * 24 + 3) * 60 + 4) * 60_000 + 5_000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 })
	})

	it("floors partial seconds", () => {
		expect(countdownParts(1999).seconds).toBe(1)
	})

	it("never goes negative once kickoff has passed", () => {
		expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
		expect(countdownParts(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
	})
})
