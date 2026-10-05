// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { GapTable, HotTakes, Scoreboard } from "../../components/math/BloggerVsMath"
import type { MathRow, Scorecard } from "../../lib/math/compare"

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

describe("GapTable", () => {
	const rows = [row("Las Vegas Raiders", "LV", 6, 7), row("Denver Broncos", "DEN", 12, 21), row("Carolina Panthers", "CAR", 23, 14)]

	it("is a real table with one row per team and the gap said in words for screen readers", () => {
		render(<GapTable rows={rows} hot={6} />)
		const table = screen.getByRole("table")
		expect(within(table).getAllByRole("row")).toHaveLength(4)
		expect(within(table).getByText("I'm 9 higher")).toBeTruthy()
		expect(within(table).getByText("I'm 9 lower")).toBeTruthy()
		expect(within(table).getByText("I'm 1 higher")).toBeTruthy()
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
