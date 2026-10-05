// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { HotTakes, Scoreboard } from "../../components/math/BloggerVsMath"
import PlayoffOdds from "../../components/math/PlayoffOdds"
import TeamTable from "../../components/math/TeamTable"
import { oddsText } from "../../components/math/charts"
import type { MathRow, Scorecard } from "../../lib/math/compare"
import { buildBoards } from "../../lib/rankings"
import { buildOdds, buildReport } from "../../lib/math/report"
import { TEAMS } from "../../lib/nfl"
import { schedule } from "../stubs/seasonSchedule"

afterEach(cleanup)

const row = (team: string, abbr: string, blogger: number, math: number): MathRow => ({ team, abbr, blogger, math, rating: 1500, gap: math - blogger })

const card = (over: Partial<Scorecard> = {}): Scorecard => ({
	blogger: { right: 18, games: 30 },
	math: { right: 17, games: 30 },
	split: { games: 2, blogger: 1, math: 1 },
	games: [
		{ week: 3, home: "IND", away: "HOU", homeScore: 19, awayScore: 17, bloggerPick: "HOU", mathPick: "IND", winner: "IND" },
		{ week: 4, home: "LV", away: "KC", homeScore: 27, awayScore: 30, bloggerPick: "KC", mathPick: "LV", winner: "KC" },
	],
	...over,
})

describe("Scoreboard", () => {
	it("shows both records, says who leads in words, and lists the disagreements", () => {
		render(<Scoreboard card={card()} />)
		expect(screen.getByText("18–12")).toBeTruthy()
		expect(screen.getByText("17–13")).toBeTruthy()
		expect(screen.getByText(/I'm ahead by 1 game\./)).toBeTruthy()
		expect(screen.getByText(/The 2 games we disagreed on/)).toBeTruthy()
		expect(screen.getByText("I was right")).toBeTruthy()
		expect(screen.getByText("The math was right")).toBeTruthy()
	})

	it("says when the math leads, or when it is level", () => {
		render(<Scoreboard card={card({ math: { right: 20, games: 30 } })} />)
		expect(screen.getByText(/The math is ahead by 2 games\./)).toBeTruthy()
		cleanup()
		render(<Scoreboard card={card({ math: { right: 18, games: 30 } })} />)
		expect(screen.getByText(/Dead even so far\./)).toBeTruthy()
	})

	it("explains an empty scoreboard instead of showing 0-0", () => {
		render(<Scoreboard card={card({ blogger: { right: 0, games: 0 }, math: { right: 0, games: 0 }, games: [], split: { games: 0, blogger: 0, math: 0 } })} />)
		expect(screen.getByText(/No games to grade yet/)).toBeTruthy()
	})
})

describe("HotTakes", () => {
	it("says which way I disagree, in the team's name", () => {
		render(<HotTakes takes={[row("Denver Broncos", "DEN", 12, 21), row("Carolina Panthers", "CAR", 23, 14)]} />)
		expect(screen.getByText("The math doesn't believe in the Broncos.")).toBeTruthy()
		expect(screen.getByText("The math loves the Panthers more than I do.")).toBeTruthy()
		expect(screen.getByText(/I have them No\. 12\. The math has them No\. 21, 9 spots lower\./)).toBeTruthy()
	})
	it("handles a week with no big disagreements", () => {
		render(<HotTakes takes={[]} />)
		expect(screen.getByText(/No big disagreements/)).toBeTruthy()
	})
})


describe("oddsText", () => {
	it("says <1% and >99% for near misses, and 0% or 100% only when no simulated season disagreed", () => {
		expect(oddsText(0, 10_000)).toBe("0%")
		expect(oddsText(1, 10_000)).toBe("100%")
		expect(oddsText(0.004, 10_000)).toBe("<1%")
		expect(oddsText(0.0001, 10_000)).toBe("<1%")
		expect(oddsText(0.996, 10_000)).toBe(">99%")
		expect(oddsText(0.426, 10_000)).toBe("43%")
	})
})

describe("team panels and playoff odds", () => {
	const games = schedule(4)
	const names = TEAMS.map((t) => t.name)
	const boards = buildBoards([2, 3, 4].map((week) => ({ _id: `w${week}`, season: 2026, week, teams: names.map((team, i) => ({ team, note: i === 0 ? "Buffalo note" : null })) })))
	const report = buildReport(boards, games, 4, buildOdds(games, 4))

	afterEach(() => {
		window.history.replaceState(null, "", "/")
	})

	it("lists every team and opens a panel on click, closing it on a second click", () => {
		render(<TeamTable teams={report.teams} hot={6} sims={report.sims} />)
		const buttons = screen.getAllByRole("button")
		expect(buttons).toHaveLength(32)
		const bills = buttons[0]
		expect(bills.getAttribute("aria-expanded")).toBe("false")
		fireEvent.click(bills)
		expect(bills.getAttribute("aria-expanded")).toBe("true")
		expect(screen.getByText("Rank by week")).toBeTruthy()
		expect(screen.getByText("Results")).toBeTruthy()
		expect(screen.getByText("Still to play")).toBeTruthy()
		expect(screen.getByText("Buffalo note")).toBeTruthy()
		expect(document.getElementById(bills.getAttribute("aria-controls")!)).toBeTruthy()
		expect(window.location.hash).toBe("#team-BUF")
		fireEvent.click(bills)
		expect(bills.getAttribute("aria-expanded")).toBe("false")
		expect(screen.queryByText("Rank by week")).toBeNull()
	})

	it("opens the team named in the address", () => {
		window.history.replaceState(null, "", "/#team-LV")
		render(<TeamTable teams={report.teams} hot={6} sims={report.sims} />)
		const open = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-expanded") === "true")
		expect(open).toHaveLength(1)
		expect(within(open[0]).getByText("Raiders")).toBeTruthy()
	})

	it("ignores an address that names no team", () => {
		window.history.replaceState(null, "", "/#team-ZZZ")
		render(<TeamTable teams={report.teams} hot={6} sims={report.sims} />)
		expect(screen.getAllByRole("button").every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true)
	})

	it("says the gap in words for screen readers", () => {
		render(<TeamTable teams={report.teams} hot={6} sims={report.sims} />)
		const gaps = report.teams.map((t) => (t.gap === 0 ? "Same" : t.gap > 0 ? `I'm ${t.gap} higher` : `I'm ${-t.gap} lower`))
		for (const g of Array.from(new Set(gaps))) expect(screen.getAllByText(g).length).toBeGreaterThan(0)
	})

	it("lays out the simulated standings by conference and division, each team linking to its panel", () => {
		render(<PlayoffOdds teams={report.teams} sims={report.sims} />)
		expect(screen.getByRole("heading", { name: "AFC" })).toBeTruthy()
		expect(screen.getByRole("heading", { name: "NFC" })).toBeTruthy()
		expect(screen.getAllByRole("table")).toHaveLength(8)
		const link = screen.getByRole("link", { name: /Raiders/ })
		expect(link.getAttribute("href")).toBe("#team-LV")
	})
})
