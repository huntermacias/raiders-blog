// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LiveCenter from "../../components/live/LiveCenter"
import { parseScoreboard, parseSummary } from "../../lib/live/espn"
import { biggestSwings, currentHomeWp, wpSeries } from "../../lib/live/series"
import { play, scoreboard, summary } from "../stubs/liveFeed"

const board = parseScoreboard(scoreboard)
const LV_GAME = "401872980"

/** What /api/live/game answers for a game, built the way the route builds it. */
function gameResponse(id: string, extraPlays: ReturnType<typeof play>[] = []) {
	const info = board.find((g) => g.id === id)!
	const raw = id === LV_GAME ? structuredClone(summary) : { boxscore: { teams: [] }, drives: { previous: [] } }
	if (extraPlays.length) (raw as typeof summary).drives.current.plays.push(...(extraPlays as never[]))
	const game = parseSummary(raw, info)
	const series = wpSeries(game)
	return { game, wp: { series, now: currentHomeWp(info), swings: biggestSwings(series) }, stale: false, at: 0 }
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))

type Handler = (url: string) => Promise<Response>
function stubFetch(handler: Handler) {
	const fn = vi.fn((input: RequestInfo | URL) => handler(String(input)))
	vi.stubGlobal("fetch", fn)
	return fn
}
const normal: Handler = (url) => {
	if (url.includes("/api/live/scoreboard")) return json({ games: board, featured: LV_GAME, stale: false, at: 0 })
	const id = new URL(url, "http://x").searchParams.get("id") ?? ""
	return json(gameResponse(id))
}

const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
	Object.defineProperty(document, "hidden", { value: false, configurable: true })
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

const scoreRegion = () => screen.getByRole("region", { name: "Score" })

describe("<LiveCenter />", () => {
	it("leads with the Raiders game: score, clock and who has the ball", async () => {
		stubFetch(normal)
		render(<LiveCenter initialBoard={board} pinned={null} />)
		const bug = within(scoreRegion())
		expect(bug.getByText("20")).toBeTruthy()
		expect(bug.getByText("17")).toBeTruthy()
		expect(bug.getByText("Q3")).toBeTruthy()
		expect(bug.getByText("4:12")).toBeTruthy()
		expect(bug.getByText("2nd & 7")).toBeTruthy()
		expect(bug.getByText(/LV ball at KC 38/)).toBeTruthy()
		expect(bug.getByText(/Line: KC -3.5/)).toBeTruthy()
		expect(await screen.findByText("Play by play")).toBeTruthy()
		expect(screen.getByText(/Win probability/i)).toBeTruthy()
	})

	it("shows the plays grouped by drive and can filter to the big ones", async () => {
		stubFetch(normal)
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await screen.findByText("Play by play")
		// The feed is the scrolling list; the swings list also quotes plays, so look only inside it.
		const feed = () => within(document.querySelector(".overflow-y-auto") as HTMLElement)
		// Newest drives are open and older ones fold up; a click on a drive's header opens it.
		expect(feed().getByText(/Rush for 4 yards/)).toBeTruthy()
		expect(feed().queryByText(/Run up the middle for 3 yards/)).toBeNull()
		fireEvent.click(feed().getByRole("button", { name: /9 plays|75 yards/ }))
		expect(feed().getByText(/Run up the middle for 3 yards/)).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Scoring" }))
		expect(feed().getByText(/Touchdown pass for 40 yards/)).toBeTruthy()
		expect(feed().queryByText(/Run up the middle for 3 yards/)).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "Big plays" }))
		expect(feed().getByText(/Pass deep right for 32 yards/)).toBeTruthy()
		expect(feed().queryByText(/Run up the middle for 3 yards/)).toBeNull()
	})

	it("describes the field for screen readers", async () => {
		stubFetch(normal)
		render(<LiveCenter initialBoard={board} pinned={null} />)
		const field = await screen.findByRole("img", { name: /LV has the ball, 2nd & 7 at KC 38/ })
		expect(field).toBeTruthy()
	})

	it("switches games from the picker and asks for that game", async () => {
		const fetchFn = stubFetch(normal)
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await screen.findByText("Play by play")
		fireEvent.click(screen.getByRole("button", { name: /IND/ }))
		await flush()
		expect(fetchFn.mock.calls.some(([u]) => String(u).includes("id=401872965"))).toBe(true)
		expect(within(scoreRegion()).getAllByText(/Indianapolis/).length).toBeGreaterThan(0)
		expect(within(scoreRegion()).getAllByText(/Pregame|Kickoff/).length).toBeGreaterThan(0)
	})

	it("shows Hunter's note over a Raiders game only", async () => {
		stubFetch(normal)
		const note = { title: "Live: Raiders at Chiefs", slug: "live-lv-kc", body: "Halftime: the line is holding up.", postedAt: "2026-10-04T21:05:00Z" }
		render(<LiveCenter initialBoard={board} pinned={note} />)
		expect(screen.getByText(/the line is holding up/)).toBeTruthy()
		expect(screen.getByRole("link", { name: /Full thread/ }).getAttribute("href")).toBe("/live/live-lv-kc")
		fireEvent.click(screen.getByRole("button", { name: /IND/ }))
		await flush()
		expect(screen.queryByText(/the line is holding up/)).toBeNull()
	})

	it("says so, with a retry, when the game feed is down", async () => {
		const fetchFn = stubFetch((url) => (url.includes("/api/live/scoreboard") ? normal(url) : json({ message: "down" }, 502)))
		render(<LiveCenter initialBoard={board} pinned={null} />)
		expect(await screen.findByText(/isn't answering/)).toBeTruthy()
		const before = fetchFn.mock.calls.length
		fireEvent.click(screen.getByRole("button", { name: "Try again" }))
		await flush()
		expect(fetchFn.mock.calls.length).toBeGreaterThan(before)
		// The scoreboard from the server is still on screen.
		expect(within(scoreRegion()).getByText("20")).toBeTruthy()
	})

	it("explains an empty week and a dead feed", async () => {
		stubFetch(() => json({ games: [], featured: null, stale: false, at: 0 }))
		render(<LiveCenter initialBoard={[]} pinned={null} />)
		expect(screen.getByText("No games on the board.")).toBeTruthy()
		cleanup()
		stubFetch(() => json({ message: "down" }, 502))
		render(<LiveCenter initialBoard={null} pinned={null} />)
		expect(await screen.findByText(/unavailable right now/)).toBeTruthy()
	})

	it("announces a touchdown that arrives while you watch, but not the plays that were already there", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
		let calls = 0
		stubFetch((url) => {
			if (url.includes("/api/live/scoreboard")) return json({ games: board, featured: LV_GAME, stale: false, at: 0 })
			calls++
			const td = play("p9", 20, { type: { text: "Rushing Touchdown" }, text: "Rush up the middle for 6 yards, TOUCHDOWN.", scoringPlay: true, statYardage: 6, period: { number: 3 }, awayScore: 27, homeScore: 17, clock: { displayValue: "3:50" } })
			return json(gameResponse(LV_GAME, calls > 1 ? [td] : []))
		})
		render(<LiveCenter initialBoard={board} pinned={null} />)
		await flush()
		// The first load shows the existing touchdown pass without a banner.
		expect(screen.queryByText("Touchdown", { selector: "p" })).toBeNull()
		await act(async () => {
			await vi.advanceTimersByTimeAsync(12_500)
		})
		expect(screen.getAllByText(/TOUCHDOWN/).length).toBeGreaterThan(0)
		expect(document.querySelector(".lab-banner")?.textContent).toMatch(/Touchdown/i)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_500)
		})
		expect(document.querySelector(".lab-banner")).toBeNull()
	})

	it("stops polling a finished game", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] })
		const done = board.find((g) => g.state === "post")!
		const fetchFn = stubFetch((url) => {
			if (url.includes("/api/live/scoreboard")) return json({ games: [done], featured: done.id, stale: false, at: 0 })
			return json(gameResponse(done.id))
		})
		render(<LiveCenter initialBoard={[done]} pinned={null} />)
		await flush()
		const gameCalls = () => fetchFn.mock.calls.filter(([u]) => String(u).includes("/api/live/game")).length
		const n = gameCalls()
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000)
		})
		expect(gameCalls()).toBe(n)
		expect(within(scoreRegion()).getAllByText(/Final|FINAL/).length).toBeGreaterThan(0)
	})
})
