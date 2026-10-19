// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LiveCenter from "../../components/live/LiveCenter"
import { parseScoreboard, parseSummary } from "../../lib/live/espn"
import { biggestSwings, currentHomeWp, wpSeries } from "../../lib/live/series"
import { allPlays } from "../../lib/live/series"
import { scoreboard, summary } from "../stubs/liveFeed"

// The Raiders-Chiefs game, finished (Raiders away at KC, 4 plays on the board).
const raw = parseScoreboard(scoreboard)
const LV_GAME = "401872980"
const finalInfo = { ...raw.find((g) => g.id === LV_GAME)!, state: "post" as const, detail: "Final", period: 4, clockSeconds: 0, possession: null, situation: null }
const board = raw.map((g) => (g.id === LV_GAME ? finalInfo : g))
const game = parseSummary(structuredClone(summary), finalInfo)
const series = wpSeries(game)
const response = { game, wp: { series, now: currentHomeWp(finalInfo), swings: biggestSwings(series) }, stale: false, at: 0 }
const plays = allPlays(game)

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }))
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
	Object.defineProperty(document, "hidden", { value: false, configurable: true })
	vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => (String(input).includes("/api/live/scoreboard") ? json({ games: board, featured: LV_GAME, stale: false, at: 0 }) : json(response))))
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

const scoreRegion = () => screen.getByRole("region", { name: "Score" })

describe("replaying a finished game on /live", () => {
	it("offers a replay for a finished game, and not for one that is still on", async () => {
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await flush()
		expect(screen.getByRole("button", { name: /Replay this game/ })).toBeTruthy()
	})

	it("offers no replay while the game is live", async () => {
		const live = raw.map((g) => g)
		vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => (String(input).includes("/api/live/scoreboard") ? json({ games: live, featured: LV_GAME, stale: false, at: 0 }) : json({ ...response, game: { ...game, info: raw.find((g) => g.id === LV_GAME)! } }))))
		render(<LiveCenter initialBoard={live} pinned={null} />)
		await flush()
		expect(screen.queryByRole("button", { name: /Replay this game/ })).toBeNull()
	})

	it("starts at 0-0, calls itself a replay, and steps through the plays", async () => {
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await flush()
		fireEvent.click(screen.getByRole("button", { name: /Replay this game/ }))
		const bug = within(scoreRegion())
		expect(bug.getByText("Replay")).toBeTruthy()
		expect(bug.queryByText("FINAL")).toBeNull()
		expect(screen.getByText(new RegExp(`Play 0 of ${plays.length}`))).toBeTruthy()
		// Pause, then step to the touchdown with the next-score button.
		fireEvent.click(screen.getByRole("button", { name: "Pause" }))
		fireEvent.click(screen.getByRole("button", { name: "Jump to the next score" }))
		const td = plays.findIndex((p) => p.scoring) + 1
		expect(screen.getByText(new RegExp(`Play ${td} of ${plays.length}`))).toBeTruthy()
		expect(bug.getByText(String(plays[td - 1].away))).toBeTruthy()
	})

	it("scrubs to any play and shows only the plays up to it", async () => {
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await flush()
		fireEvent.click(screen.getByRole("button", { name: /Replay this game/ }))
		fireEvent.change(screen.getByRole("slider", { name: "Replay position" }), { target: { value: "2" } })
		expect(screen.getByText(new RegExp(`Play 2 of ${plays.length}`))).toBeTruthy()
		expect(screen.queryByText(plays[plays.length - 1].text)).toBeNull()
		expect(screen.queryByText(plays[2].text)).toBeNull()
	})

	it("hides the final team stats during the replay and puts everything back when it ends", async () => {
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await flush()
		expect(screen.getByText("Total yards")).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: /Replay this game/ }))
		expect(screen.queryByText("Total yards")).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "Back to the final" }))
		expect(screen.getByText("Total yards")).toBeTruthy()
		expect(within(scoreRegion()).getByText("FINAL")).toBeTruthy()
		expect(screen.getByRole("button", { name: /Replay this game/ })).toBeTruthy()
	})

	it("plays on its own, one play at a time, and stops at the end", async () => {
		vi.useFakeTimers()
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await flush()
		fireEvent.click(screen.getByRole("button", { name: /Replay this game/ }))
		await act(async () => { await vi.advanceTimersByTimeAsync(800 / 4 + 5) })
		expect(screen.getByText(new RegExp(`Play 1 of ${plays.length}`))).toBeTruthy()
		// One play per tick: React runs the next timer only after the render that follows, so advance in small acts.
		for (let i = 0; i < plays.length * 2; i++) await act(async () => { await vi.advanceTimersByTimeAsync(250) })
		expect(screen.getByText(new RegExp(`Play ${plays.length} of ${plays.length}`))).toBeTruthy()
		expect(screen.getByRole("button", { name: "Replay from the start" })).toBeTruthy()
		expect(within(scoreRegion()).getByText("FINAL")).toBeTruthy()
	})

	it("links a Raiders game to its Lab replay when the Lab has one", async () => {
		render(<LiveCenter initialBoard={board} pinned={null} labGames={[{ week: 4, date: "2026-10-04", opp: "KC" }]} />)
		await flush()
		const link = screen.getByRole("link", { name: /Full Lab replay/ })
		expect(link.getAttribute("href")).toBe("/lab/week-4")
	})

	it("shows no Lab link when the Lab has not built that game yet", async () => {
		render(<LiveCenter initialBoard={board} pinned={null} labGames={[{ week: 3, date: "2026-09-27", opp: "NO" }]} />)
		await flush()
		expect(screen.queryByRole("link", { name: /Full Lab replay/ })).toBeNull()
	})
})
