// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import RankingsBoard from "../../components/rankings/RankingsBoard"
import GameShare from "../../components/rankings/GameShare"
import { buildBoards } from "../../lib/rankings"
import type { LiveGameInfo } from "../../lib/live/types"

const NOW = Date.parse("2026-11-08T21:00:00Z")
const team = (abbr: string, name: string, score: number) => ({ abbr, name, score, record: null, espnId: null })
const game = (over: Partial<LiveGameInfo> & { id: string }): LiveGameInfo => ({
	state: "in",
	detail: "Q3 4:12",
	shortDetail: "Q3 4:12",
	period: 3,
	clockSeconds: 252,
	kickoff: new Date(NOW - 2 * 3600_000).toISOString(),
	home: team("KC", "Kansas City Chiefs", 17),
	away: team("BUF", "Buffalo Bills", 21),
	odds: null,
	venue: null,
	network: null,
	possession: null,
	situation: null,
	...over,
})

const NAMES = ["Buffalo Bills", "Kansas City Chiefs", "Las Vegas Raiders", "Chicago Bears"]
const boards = buildBoards([
	{ _id: "w8", season: 2026, week: 8, teams: NAMES.map((t) => ({ team: t })) },
	{ _id: "w9", season: 2026, week: 9, teams: ["Chicago Bears", "Buffalo Bills", "Kansas City Chiefs", "Las Vegas Raiders"].map((t) => ({ team: t, note: `${t} note` })) },
])
const share = { url: "https://www.raidersrundown.com/rankings", stamp: 5, text: "Week 9" }

function setup(games: LiveGameInfo[] | null) {
	vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ games: games ?? [] }) })))
	return render(<RankingsBoard boards={boards} season={2026} summary="Bears take No. 1." share={share} initialGames={games} serverNow={NOW} />)
}

beforeEach(() => window.history.replaceState(null, "", "/rankings"))
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("<RankingsBoard /> with live games", () => {
	it("shows the score on each playing team's row, with words and not only colour", () => {
		setup([game({ id: "401" })])
		const list = screen.getByRole("list", { name: /week 9 power rankings/i })
		const bills = within(list).getByText("Buffalo Bills").closest("li")!
		expect(bills.getAttribute("data-live")).toBe("true")
		expect(within(bills).getByText(/leading/i)).toBeTruthy()
		const chiefs = within(list).getByText("Kansas City Chiefs").closest("li")!
		expect(within(chiefs).getByText(/trailing/i)).toBeTruthy()
		const bears = within(list).getByText("Chicago Bears").closest("li")!
		expect(bears.getAttribute("data-live")).toBeNull()
	})

	it("links a score to the game centre", () => {
		setup([game({ id: "401" })])
		const list = screen.getByRole("list", { name: /week 9 power rankings/i })
		const link = within(within(list).getByText("Buffalo Bills").closest("li")!).getAllByRole("link").find((a) => a.getAttribute("href") === "/live?game=401")
		expect(link).toBeTruthy()
	})

	it("offers a Playing now filter that keeps only the teams in a live game", () => {
		setup([game({ id: "401" })])
		fireEvent.click(screen.getByRole("button", { name: /playing now \(2\)/i }))
		const list = screen.getByRole("list", { name: /week 9 power rankings/i })
		expect(within(list).getAllByRole("listitem")).toHaveLength(2)
		expect(within(list).queryByText("Chicago Bears")).toBeNull()
	})

	it("has no Playing now filter when nothing is live", () => {
		setup([game({ id: "401", state: "post", detail: "Final", shortDetail: "Final", period: 4, clockSeconds: 0 })])
		expect(screen.queryByRole("button", { name: /playing now/i })).toBeNull()
	})

	it("searches by team name", () => {
		setup(null)
		fireEvent.change(screen.getByPlaceholderText(/find a team/i), { target: { value: "raid" } })
		const list = screen.getByRole("list", { name: /week 9 power rankings/i })
		expect(within(list).getAllByRole("listitem")).toHaveLength(1)
	})

	it("does not show scores on an earlier week's list", () => {
		setup([game({ id: "401" })])
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "8" } })
		const list = screen.getByRole("list", { name: /week 8 power rankings/i })
		expect(within(list).queryByText(/leading|trailing/i)).toBeNull()
		expect(screen.queryByTestId("scores-strip")).toBeNull()
	})

	it("renders the page without any scores when the scoreboard could not be read", () => {
		setup(null)
		expect(screen.getByRole("heading", { level: 1, name: /power rankings/i })).toBeTruthy()
		expect(screen.queryByTestId("scores-strip")).toBeNull()
	})
})

describe("<GameShare />", () => {
	const props = { gameId: "401", text: "Q3 4:12: No. 2 Bills 21, No. 5 Chiefs 17.", label: "Bills at Chiefs" }

	it("opens post, copy and save-card actions that point at the game's own link and card", () => {
		render(<GameShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: /share the bills at chiefs score/i }))
		const post = screen.getByRole("link", { name: /post/i })
		const u = new URL(post.getAttribute("href") ?? "")
		expect(u.host).toBe("twitter.com")
		expect(u.searchParams.get("text")).toBe(props.text)
		expect(u.searchParams.get("url")).toMatch(/^https:\/\/www\.raidersrundown\.com\/live\?game=401&v=\d+$/)
		const save = screen.getByRole("link", { name: /save card/i })
		expect(save.getAttribute("href")).toMatch(/^\/api\/og\?type=live&game=401&v=\d+$/)
		expect(save.hasAttribute("download")).toBe(true)
	})

	it("copies the link and says so", async () => {
		const writeText = vi.fn(async () => {})
		Object.assign(navigator, { clipboard: { writeText } })
		render(<GameShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: /share the bills at chiefs score/i }))
		fireEvent.click(screen.getByRole("button", { name: /copy link/i }))
		await screen.findByText("Copied")
		expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/live\?game=401&v=\d+$/))
	})

	it("closes back to the single button", () => {
		render(<GameShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: /share the bills at chiefs score/i }))
		fireEvent.click(screen.getByRole("button", { name: /close share options/i }))
		expect(screen.getByRole("button", { name: /share the bills at chiefs score/i })).toBeTruthy()
	})
})
