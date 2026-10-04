// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import VegasBoard from "../../components/predictions/VegasBoard"
import type { LabGame } from "../../lib/lab/types"
import type { GamePrediction } from "../../lib/predictions"
import { buildVegasBoard } from "../../lib/vegas"

afterEach(cleanup)

const lab = (week: number, opp: string, date: string, home: boolean, spread: number): LabGame =>
	({ id: `w${week}`, week, date, home, opp, oppName: opp, score: [0, 0], result: "W", spread, roof: null, wp: [], scores: [], keyPlays: [], drives: [] }) as LabGame

const pick = (week: number, away: string, home: string, kickoff: string, pa: number, ph: number, aa: number, ah: number): GamePrediction => ({
	_id: `p${week}`,
	week,
	awayTeam: away,
	homeTeam: home,
	kickoff,
	predictedAwayScore: pa,
	predictedHomeScore: ph,
	actualAwayScore: aa,
	actualHomeScore: ah,
})

const labs = [lab(1, "MIA", "2026-09-13", true, 3), lab(2, "LAC", "2026-09-20", false, 6.5), lab(3, "NO", "2026-09-27", false, 3.5)]
const picks = [
	pick(1, "Miami Dolphins", "Las Vegas Raiders", "2026-09-13T20:05:00Z", 17, 24, 13, 27),
	pick(2, "Las Vegas Raiders", "Los Angeles Chargers", "2026-09-20T20:05:00Z", 20, 24, 26, 14),
	// I had them winning by 11 at New Orleans (a Saints -3.5 line), they won by 8: I took Raiders +3.5 and cashed
	pick(3, "Las Vegas Raiders", "New Orleans Saints", "2026-09-27T20:25:00Z", 28, 17, 35, 27),
]

describe("<VegasBoard />", () => {
	it("shows the ATS record, the average miss for each side and how often I was closer", () => {
		render(<VegasBoard board={buildVegasBoard(picks, labs)} season={2026} />)
		const region = screen.getByRole("region", { name: "Hunter versus Vegas" })
		expect(within(region).getByText("Against the spread")).toBeTruthy()
		expect(within(region).getByText("100%")).toBeTruthy()
		expect(within(region).getByText("8.7")).toBeTruthy() // (7 + 16 + 3) / 3
		expect(within(region).getByText("13.7")).toBeTruthy() // (11 + 18.5 + 11.5) / 3
		expect(within(region).getByText(/Games where my margin beat the line/)).toBeTruthy()
	})

	it("writes each game out in words for screen readers, newest first", () => {
		render(<VegasBoard board={buildVegasBoard(picks, labs)} season={2026} />)
		const sentences = Array.from(document.querySelectorAll("li > p.sr-only")).map((n) => n.textContent ?? "")
		expect(sentences).toHaveLength(3)
		expect(sentences[0]).toMatch(/^Week 3, at Saints\./)
		expect(sentences[0]).toContain("Closing line Saints −3.5.")
		expect(sentences[0]).toContain("I took Raiders +3.5: cashed.")
		expect(sentences[0]).toContain("My number was closer.")
		expect(sentences[2]).toMatch(/^Week 1, vs Dolphins\./)
	})

	it("hides the drawn lanes from assistive tech, so the sentence is the only read", () => {
		render(<VegasBoard board={buildVegasBoard(picks, labs)} season={2026} />)
		const row = document.querySelector("ol > li") as HTMLElement
		expect(row.querySelector('[aria-hidden="true"]')).toBeTruthy()
	})

	it("offers the numbers as a table with the side taken and both misses", () => {
		render(<VegasBoard board={buildVegasBoard(picks, labs)} season={2026} />)
		const table = screen.getByRole("table", { name: /My margin picks against the closing line/ })
		const rows = within(table).getAllByRole("row")
		expect(rows).toHaveLength(4) // header + 3 games
		expect(within(rows[3]).getByText(/Raiders \+3\.5 \(cashed\)/)).toBeTruthy()
		expect(within(rows[3]).getByText("11.5")).toBeTruthy()
	})

	it("keeps the first eight games open and tucks the rest behind a toggle", () => {
		const many = Array.from({ length: 11 }, (_, i) => ({ ...buildVegasBoard(picks, labs).games[i % 3], week: i + 1 }))
		const board = buildVegasBoard(picks, labs)
		render(<VegasBoard board={{ ...board, games: many }} season={2026} />)
		expect(screen.getByText(/Show 3 earlier games/)).toBeTruthy()
		expect(document.querySelectorAll("details ol > li")).toHaveLength(3)
	})

	it("says so, plainly, when nothing has a line yet", () => {
		render(<VegasBoard board={buildVegasBoard([], labs)} season={2026} />)
		expect(screen.getByText(/No graded Raiders game has a closing line yet/)).toBeTruthy()
		expect(screen.queryByRole("table")).toBeNull()
	})

	it("always carries the not-betting-advice note and the data source", () => {
		render(<VegasBoard board={buildVegasBoard(picks, labs)} season={2026} />)
		expect(screen.getByText(/not betting advice/)).toBeTruthy()
		expect(screen.getByText(/nflverse/)).toBeTruthy()
	})

	it("notes graded games still waiting on a line", () => {
		const board = buildVegasBoard([...picks, pick(9, "Denver Broncos", "Las Vegas Raiders", "2026-11-08T20:05:00Z", 17, 20, 10, 24)], labs)
		render(<VegasBoard board={board} season={2026} />)
		expect(screen.getByText(/1 graded game will join once the line is in/)).toBeTruthy()
	})
})
