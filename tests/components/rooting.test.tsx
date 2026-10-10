// @vitest-environment jsdom
import { track } from "@vercel/analytics"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import RootingControls from "../../components/rooting/RootingControls"
import RootingGame from "../../components/rooting/RootingGame"
import { OddsRange } from "../../components/rooting/parts"
import { gameFactsFor } from "../../lib/rooting/facts"
import { getGames } from "../../lib/playoffs/data"
import { getRooting } from "../../lib/rooting/data"
import { buildView } from "../../lib/rooting/view"
import { trackRooting } from "../../lib/analytics"

const router = () => (globalThis as unknown as { __router: { push: ReturnType<typeof vi.fn> } }).__router

afterEach(() => {
	cleanup()
	vi.mocked(track).mockClear()
})

const data = getRooting()!
const games = getGames()
const view = buildView({ data, schedule: games, query: { team: "LV", goal: "playoffs", week: null, scope: "all" }, season: 2026 })
const facts = gameFactsFor(games, view.recs, "LV", "playoffs")

describe("a game on the list", () => {
	it("tells you who to root for and what it is worth, in points, before it is opened", () => {
		const rec = view.recs[0]
		render(<ul><RootingGame rec={rec} rank={1} team="LV" color="#000" facts={facts[rec.gameId]} /></ul>)
		expect(screen.getByLabelText(/^Root for the /)).toBeTruthy()
		expect(screen.getByText(/pts$/, { selector: "span.font-serif" }).textContent).toMatch(/^[+−]\d+ pts$/)
		expect(screen.getByText(/-pt swing/)).toBeTruthy()
	})

	it("opens to every outcome, the baseline and the reason, reports it once, and closes again", () => {
		const rec = view.recs[0]
		render(<ul><RootingGame rec={rec} rank={3} team="LV" color="#000" facts={facts[rec.gameId]} /></ul>)
		const button = screen.getByRole("button")
		expect(button.getAttribute("aria-expanded")).toBe("false")
		const panel = document.getElementById(button.getAttribute("aria-controls") as string) as HTMLElement
		expect(panel.hidden).toBe(true)
		fireEvent.click(button)
		expect(button.getAttribute("aria-expanded")).toBe("true")
		expect(panel.hidden).toBe(false)
		const p = within(panel)
		expect(p.getByText(/your best case/)).toBeTruthy()
		expect(p.getByText("If it ends in a tie")).toBeTruthy()
		expect(p.getByText("Where you stand now")).toBeTruthy()
		expect(p.getByText(/percentage points/)).toBeTruthy()
		expect(vi.mocked(track)).toHaveBeenCalledWith("rooting_game_expanded", { week: rec.week, rank: 3 })
		fireEvent.click(button)
		expect(panel.hidden).toBe(true)
		expect(vi.mocked(track)).toHaveBeenCalledTimes(1)
	})

	it("says a tie was not worked out instead of showing a made-up number", () => {
		const rec = { ...view.recs[0], pTie: null }
		render(<ul><RootingGame rec={rec} rank={1} team="LV" color="#000" facts={facts[view.recs[0].gameId]} /></ul>)
		expect(screen.getByText("not worked out")).toBeTruthy()
	})

	it("states the error bar for a sampled swing and none for an exact one", () => {
		const rec = { ...view.recs[0], se: 0.01 }
		const { unmount } = render(<ul><RootingGame rec={rec} rank={1} team="LV" color="#000" facts={facts[rec.gameId]} /></ul>)
		expect(screen.getByText(/95% range/)).toBeTruthy()
		unmount()
		render(<ul><RootingGame rec={{ ...rec, se: 0 }} rank={1} team="LV" color="#000" facts={facts[rec.gameId]} /></ul>)
		expect(screen.getByText(/no sampling error/)).toBeTruthy()
	})
})

describe("the odds bar", () => {
	it("is described in words for a screen reader", () => {
		render(<OddsRange worst={0.2} best={0.6} baseline={0.4} color="#000" label="Chance to make the playoffs: 20% to 60%, from 40% now" />)
		expect(screen.getByRole("img", { name: /20% to 60%/ })).toBeTruthy()
	})
})

describe("the controls", () => {
	const props = { team: "LV", goal: "playoffs" as const, scope: "week" as const, week: 5, goals: view.goals, counts: { week: 4, all: 20 }, color: "#000" }

	it("makes each goal a link to a shareable address, and marks the one in use", () => {
		render(<RootingControls {...props} />)
		const links = screen.getAllByRole("link")
		const hrefs = links.map((l) => l.getAttribute("href"))
		expect(hrefs).toContain("/lab/rooting-guide?team=LV&goal=division&week=5")
		expect(hrefs).toContain("/lab/rooting-guide?team=LV&goal=bye&week=5")
		expect(hrefs).toContain("/lab/rooting-guide?team=LV&goal=playoffs&week=5&scope=all")
		expect(links.filter((l) => l.getAttribute("aria-current") === "true")).toHaveLength(2)
	})

	it("switches team through the address and reports it", () => {
		render(<RootingControls {...props} />)
		fireEvent.change(screen.getByLabelText("Team to follow"), { target: { value: "KC" } })
		expect(router().push).toHaveBeenCalledWith("/lab/rooting-guide?team=KC&goal=playoffs&week=5", { scroll: false })
		expect(vi.mocked(track)).toHaveBeenCalledWith("rooting_team_selected", { team: "KC" })
	})

	it("reports a goal change once and not a click on the goal already chosen", () => {
		render(<RootingControls {...props} />)
		const links = screen.getAllByRole("link")
		const division = links.find((l) => l.getAttribute("href")?.includes("goal=division"))!
		const playoffs = links.find((l) => l.getAttribute("aria-current") === "true" && l.getAttribute("href")?.includes("goal=playoffs") && !l.getAttribute("href")?.includes("scope"))!
		fireEvent.click(division)
		fireEvent.click(playoffs)
		const calls = vi.mocked(track).mock.calls.filter((c) => c[0] === "rooting_goal_changed")
		expect(calls).toEqual([["rooting_goal_changed", { goal: "division" }]])
	})

	it("shows the team's chance on every goal tile, and the count of games for each scope", () => {
		render(<RootingControls {...props} />)
		for (const g of view.goals) expect(screen.getAllByText(g.text).length).toBeGreaterThan(0)
		expect(screen.getByText("Week 5")).toBeTruthy()
		expect(screen.getByText("20")).toBeTruthy()
	})
})

describe("analytics", () => {
	it("passes the event name and its properties to Web Analytics, and never throws", () => {
		trackRooting("rooting_open", { team: "LV", goal: "playoffs" })
		expect(vi.mocked(track)).toHaveBeenCalledWith("rooting_open", { team: "LV", goal: "playoffs" })
		vi.mocked(track).mockImplementationOnce(() => {
			throw new Error("blocked")
		})
		expect(() => trackRooting("rooting_share_opened")).not.toThrow()
	})
})
