import { describe, expect, it } from "vitest"

import { parseScoreboard } from "../../lib/live/espn"
import type { LiveGameInfo } from "../../lib/live/types"
import { FINAL_MS, SOON_MS, raidersGame, stripDelay, stripFor, wpLabel } from "../../lib/liveStrip"
import { scoreboard } from "../stubs/liveFeed"

const board = parseScoreboard(scoreboard)
const mine = board.find((g) => g.home.abbr === "LV" || g.away.abbr === "LV")!
const HOUR = 3600_000
const KICK = Date.parse("2026-10-04T20:25:00Z")

function game(over: Partial<LiveGameInfo>, swap = false): LiveGameInfo {
	const base = { ...structuredClone(mine), kickoff: new Date(KICK).toISOString(), ...over }
	if (swap) [base.home, base.away] = [base.away, base.home]
	return base
}
const others = board.filter((g) => g !== mine && g.home.abbr !== "LV" && g.away.abbr !== "LV")

describe("raidersGame", () => {
	it("finds the Raiders' game wherever it sits on the board", () => {
		expect(raidersGame(board)?.id).toBe(mine.id)
		expect(raidersGame(others)).toBeNull()
		expect(raidersGame([])).toBeNull()
	})
})

describe("stripFor", () => {
	it("shows nothing when the Raiders aren't on the board, or there is no board", () => {
		expect(stripFor(others, KICK)).toBeNull()
		expect(stripFor(null, KICK)).toBeNull()
		expect(stripFor(undefined, KICK)).toBeNull()
	})

	it("goes live while the game is on, with the Raiders first and their win probability", () => {
		const g = game({ state: "in", period: 3, clockSeconds: 252, shortDetail: "Q3 4:12" })
		g.home.abbr = "LV"
		g.away.abbr = "KC"
		g.home.score = 17
		g.away.score = 14
		const m = stripFor([g], KICK + HOUR)!
		expect(m.kind).toBe("live")
		expect(m.raiders).toMatchObject({ abbr: "LV", score: 17 })
		expect(m.opp).toMatchObject({ abbr: "KC", score: 14 })
		expect(m.status).toBe("Q3 4:12")
		expect(m.ahead).toBe("raiders")
		expect(m.wp).toBeGreaterThan(0.5)
		expect(m.wpText).toMatch(/^\d+%$/)
		expect(m.href).toBe(`/live?game=${g.id}`)
		expect(m.cta).toBe("Follow live")
		expect(m.label).toContain("Raiders 17")
	})

	it("puts the Raiders' score first even when they are the away team", () => {
		const g = game({ state: "in", period: 2, clockSeconds: 300 })
		g.away.abbr = "LV"
		g.home.abbr = "KC"
		g.away.score = 3
		g.home.score = 10
		const m = stripFor([g], KICK + HOUR)!
		expect(m.raiders.score).toBe(3)
		expect(m.opp.score).toBe(10)
		expect(m.ahead).toBe("opp")
		expect(m.atHome).toBe(false)
		// Trailing by a touchdown, the Raiders are the underdog in the win probability.
		expect(m.wp).toBeLessThan(0.5)
	})

	it("says Halftime at the break", () => {
		const g = game({ state: "in", period: 2, clockSeconds: 0, shortDetail: "Halftime", detail: "Halftime" })
		expect(stripFor([g], KICK + 2 * HOUR)!.status).toBe("Halftime")
	})

	it("calls a tied game tied", () => {
		const g = game({ state: "in", period: 4, clockSeconds: 60 })
		g.home.score = g.away.score = 20
		expect(stripFor([g], KICK + 3 * HOUR)!.ahead).toBe("tied")
	})

	it("is a quiet kickoff note in the three hours before the game", () => {
		const g = game({ state: "pre", period: 0, clockSeconds: null })
		const m = stripFor([g], KICK - 2 * HOUR)!
		expect(m.kind).toBe("soon")
		expect(m.wp).toBeNull()
		expect(m.status).toMatch(/PT$/)
		expect(m.cta).toBe("Game center")
		expect(stripFor([g], KICK - SOON_MS - 60_000)).toBeNull()
		expect(stripFor([g], KICK - SOON_MS + 60_000)).not.toBeNull()
	})

	it("keeps the note up for a late kickoff but not for a game that never starts", () => {
		const g = game({ state: "pre" })
		expect(stripFor([g], KICK + 20 * 60_000)?.kind).toBe("soon")
		expect(stripFor([g], KICK + 7 * HOUR)).toBeNull()
	})

	it("shows the final for a day, then goes away", () => {
		const g = game({ state: "post", period: 4, clockSeconds: 0 })
		g.home.score = 24
		g.away.score = 20
		const m = stripFor([g], KICK + 5 * HOUR)!
		expect(m.kind).toBe("final")
		expect(m.status).toBe("Final")
		expect(m.cta).toBe("Relive the game")
		expect(stripFor([g], KICK + FINAL_MS - 60_000)).not.toBeNull()
		expect(stripFor([g], KICK + FINAL_MS + 60_000)).toBeNull()
	})

	it("marks overtime finals", () => {
		const g = game({ state: "post", period: 5 })
		expect(stripFor([g], KICK + 5 * HOUR)!.status).toBe("Final/OT")
	})

	it("shows nothing for a game with no usable kickoff unless it is live", () => {
		expect(stripFor([game({ state: "post", kickoff: null })], KICK)).toBeNull()
		expect(stripFor([game({ state: "pre", kickoff: "nonsense" })], KICK)).toBeNull()
		expect(stripFor([game({ state: "in", kickoff: null })], KICK)?.kind).toBe("live")
	})
})

describe("stripDelay", () => {
	it("polls every 20 seconds live and every 45 in the pregame note", () => {
		expect(stripDelay([game({ state: "in" })], KICK + HOUR)).toBe(20_000)
		expect(stripDelay([game({ state: "pre" })], KICK - HOUR)).toBe(45_000)
	})
	it("stops once the final is showing or there is nothing to show", () => {
		expect(stripDelay([game({ state: "post" })], KICK + 5 * HOUR)).toBeNull()
		expect(stripDelay(others, KICK)).toBeNull()
		expect(stripDelay(null, KICK)).toBeNull()
	})
	it("checks back on a game that hasn't reached its window yet, never sooner than a minute or later than 15", () => {
		const pre = game({ state: "pre" })
		expect(stripDelay([pre], KICK - 10 * HOUR)).toBe(15 * 60_000)
		expect(stripDelay([pre], KICK - SOON_MS - 10_000)).toBe(60_000)
	})
})

describe("wpLabel", () => {
	it("never prints a sure thing", () => {
		expect(wpLabel(0.004)).toBe("<1%")
		expect(wpLabel(0.996)).toBe(">99%")
		expect(wpLabel(0.5)).toBe("50%")
		expect(wpLabel(0.794)).toBe("79%")
	})
})
