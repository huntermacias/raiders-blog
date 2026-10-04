// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LiveStrip from "../../components/home/LiveStrip"
import { parseScoreboard } from "../../lib/live/espn"
import type { LiveGameInfo } from "../../lib/live/types"
import { scoreboard } from "../stubs/liveFeed"

const board = parseScoreboard(scoreboard)
const mine = board.find((g) => g.home.abbr === "LV" || g.away.abbr === "LV")!
const KICK = Date.parse("2026-10-04T20:25:00Z")

function game(over: Partial<LiveGameInfo>): LiveGameInfo {
	return { ...structuredClone(mine), kickoff: new Date(KICK).toISOString(), ...over }
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
	vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
})
afterEach(() => {
	cleanup()
	vi.useRealTimers()
	vi.unstubAllGlobals()
})

function at(ms: number) {
	vi.setSystemTime(ms)
	return ms
}

describe("LiveStrip", () => {
	it("renders nothing when the Raiders aren't playing around now", () => {
		const others = board.filter((g) => g.home.abbr !== "LV" && g.away.abbr !== "LV")
		const { container } = render(<LiveStrip initialBoard={others} serverNow={at(KICK)} />)
		expect(container.firstChild).toBeNull()
	})

	it("renders nothing without a board (the feed was down)", () => {
		const { container } = render(<LiveStrip initialBoard={null} serverNow={at(KICK)} />)
		expect(container.firstChild).toBeNull()
	})

	it("shows the live score as a link to that game's page", () => {
		const g = game({ state: "in", period: 3, clockSeconds: 252, shortDetail: "Q3 4:12" })
		g.home.abbr = "LV"
		g.away.abbr = "KC"
		g.home.score = 17
		g.away.score = 14
		render(<LiveStrip initialBoard={[g]} serverNow={at(KICK + 3600_000)} />)
		const link = screen.getByRole("link")
		expect(link.getAttribute("href")).toBe(`/live?game=${g.id}`)
		expect(link.getAttribute("aria-label")).toMatch(/Live, Q3 4:12: Raiders 17, .* 14\. Follow live\./)
		expect(link.textContent).toContain("17")
		expect(link.textContent).toContain("14")
		expect(link.textContent).toContain("Follow live")
		expect(link.textContent).toMatch(/\d+%/)
	})

	it("shows a calm kickoff note before the game, with no score", () => {
		render(<LiveStrip initialBoard={[game({ state: "pre", period: 0, clockSeconds: null })]} serverNow={at(KICK - 3600_000)} />)
		const link = screen.getByRole("link")
		expect(link.textContent).toMatch(/Next up/)
		expect(link.textContent).toMatch(/PT/)
		expect(link.textContent).not.toMatch(/win probability/)
		expect(link.textContent).toContain("Game center")
	})

	it("shows the final afterwards, then drops out a day later", () => {
		const g = game({ state: "post", period: 4, clockSeconds: 0 })
		g.home.score = 24
		g.away.score = 20
		const { container, unmount } = render(<LiveStrip initialBoard={[g]} serverNow={at(KICK + 5 * 3600_000)} />)
		expect(screen.getByRole("link").textContent).toContain("Relive the game")
		unmount()
		const later = render(<LiveStrip initialBoard={[g]} serverNow={at(KICK + 30 * 3600_000)} />)
		expect(later.container.firstChild).toBeNull()
		expect(container).toBeTruthy()
	})

	it("doesn't ask the server for anything until its first delay has passed", () => {
		render(<LiveStrip initialBoard={[game({ state: "in" })]} serverNow={at(KICK + 3600_000)} />)
		expect(fetch).not.toHaveBeenCalled()
		vi.advanceTimersByTime(20_001)
		expect(fetch).toHaveBeenCalledWith("/api/live/scoreboard", expect.anything())
	})
})

describe("homepage wiring", () => {
	// The calendar card was once imported and never rendered. Guard the page itself.
	const src = readFileSync("app/(user)/page.tsx", "utf8")
	it("renders the strip and feeds it the server's scoreboard", () => {
		expect(src).toMatch(/<LiveStrip initialBoard=\{board\} serverNow=\{Date\.now\(\)\} \/>/)
	})
	it("gives the feed a deadline so a slow ESPN can't hold the homepage up", () => {
		expect(src).toMatch(/setTimeout\(\(\) => resolve\(null\), 1500\)/)
	})
})
