// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import Compare from "../../components/math/Compare"
import { type CompareTeam, toCompareTeam } from "../../lib/math/headToHead"
import { buildOdds, buildReport } from "../../lib/math/report"
import { buildBoards } from "../../lib/rankings"
import { TEAMS } from "../../lib/nfl"
import { schedule } from "../stubs/seasonSchedule"

afterEach(cleanup)

const games = schedule(4)
const names = TEAMS.map((t) => t.name)
const boards = buildBoards([4].map((week) => ({ _id: `w${week}`, season: 2026, week, teams: names.map((team) => ({ team, note: null })) })))
const report = buildReport(boards, games, 4, buildOdds(games, 4))
const teams: CompareTeam[] = report.teams.map(toCompareTeam)

describe("Compare", () => {
	it("starts on the two teams it is given, with a neutral-field verdict", () => {
		render(<Compare teams={teams} sims={report.sims} initial={["LV", "KC"]} />)
		expect((screen.getByLabelText("Team one") as HTMLSelectElement).value).toBe("LV")
		expect((screen.getByLabelText("Team two") as HTMLSelectElement).value).toBe("KC")
		expect(screen.getByText(/On a neutral field the math gives the (Raiders|Chiefs) a \d+% chance\./)).toBeTruthy()
		expect(screen.getByRole("table")).toBeTruthy()
		expect(screen.getByText("Make the playoffs")).toBeTruthy()
		expect(screen.getByText("Projected wins")).toBeTruthy()
	})

	it("lists all 32 teams in each menu", () => {
		render(<Compare teams={teams} sims={report.sims} />)
		expect(within(screen.getByLabelText("Team one")).getAllByRole("option")).toHaveLength(32)
	})

	it("swaps the two teams", () => {
		render(<Compare teams={teams} sims={report.sims} initial={["LV", "KC"]} />)
		fireEvent.click(screen.getByRole("button", { name: "Swap the two teams" }))
		expect((screen.getByLabelText("Team one") as HTMLSelectElement).value).toBe("KC")
		expect((screen.getByLabelText("Team two") as HTMLSelectElement).value).toBe("LV")
	})

	it("asks for two different teams when the same one is picked twice", () => {
		render(<Compare teams={teams} sims={report.sims} initial={["LV", "KC"]} />)
		fireEvent.change(screen.getByLabelText("Team two"), { target: { value: "LV" } })
		expect(screen.getByText("Pick two different teams to compare.")).toBeTruthy()
		expect(screen.queryByRole("table")).toBeNull()
	})

	it("says the better number is better in words, not only in bold", () => {
		render(<Compare teams={teams} sims={report.sims} initial={["LV", "KC"]} />)
		expect(screen.getAllByText("(better)").length).toBeGreaterThan(0)
	})

	it("leaves out odds rows when the simulation isn't available", () => {
		const bare = teams.map((t) => ({ ...t, playoffs: null, division: null, projWins: null, sosRank: null }))
		render(<Compare teams={bare} sims={0} initial={["LV", "KC"]} />)
		expect(screen.queryByText("Make the playoffs")).toBeNull()
		expect(screen.getByText("Math rating")).toBeTruthy()
	})

	it("mentions a scheduled meeting when there is one", () => {
		const a = teams.find((t) => t.abbr === "LV")!
		const opp = a.upcoming[0].opp
		render(<Compare teams={teams} sims={report.sims} initial={["LV", opp]} />)
		expect(screen.getByText(new RegExp(`They meet in Week ${a.upcoming[0].week}`))).toBeTruthy()
	})
})
