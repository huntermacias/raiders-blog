// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { track } from "@vercel/analytics"

import SituationBoard from "../../components/lab/players/SituationBoard"
import Situations from "../../components/lab/players/Situations"
import { getPlayers } from "../../lib/lab/data"
import { getSituations } from "../../lib/lab/situationData"
import { SIT_BOARDS, cellStats, minPlaysFor, splitCell, SPLIT_CHOICES, playLine, sitBoardRows, situationView } from "../../lib/lab/situationsKit"

afterEach(cleanup)
const sit = getSituations()
const ctxs = { opp: () => "NE", result: () => ({ text: "W 31–14", won: true }) }

const bowers = situationView(sit, "brock-bowers", "rec", "te", ctxs)!
const geno = [situationView(sit, "geno-smith", "pass", "qb", ctxs)!, situationView(sit, "geno-smith", "rush", "qb", ctxs)!]

describe("<Situations />", () => {
	it("shows the read, the by-down table against the league and the grid", () => {
		render(<Situations name="Brock Bowers" views={[bowers]} />)
		expect(screen.getByTestId("situation-read").textContent).toMatch(/tight end/)
		const rows = screen.getAllByRole("row")
		expect(rows.some((r) => /3rd down/.test(r.textContent ?? ""))).toBe(true)
		expect(rows.some((r) => /Inside the 20/.test(r.textContent ?? ""))).toBe(true)
		expect(screen.getAllByText(/^lg /).length).toBeGreaterThan(5)
		const grid = screen.getByTestId("situation-grid")
		expect(within(grid).getAllByRole("button").length).toBe(16)
	})

	it("changes what the grid shows and says what is behind a cell, with a direction in words as well as color", () => {
		render(<Situations name="Brock Bowers" views={[bowers]} />)
		fireEvent.click(screen.getByRole("radio", { name: "Yards per target" }))
		expect(screen.getByRole("radio", { name: "Yards per target" }).getAttribute("aria-checked")).toBe("true")
		expect(track).toHaveBeenCalledWith("player_situation", expect.objectContaining({ player: "Brock Bowers", action: "metric", metric: "ypp" }))
		const cell = within(screen.getByTestId("situation-grid"))
			.getAllByRole("button")
			.find((b) => !(b as HTMLButtonElement).disabled && /3rd down/.test(b.getAttribute("aria-label") ?? ""))!
		expect(cell.getAttribute("aria-label")).toMatch(/league \d/)
		expect(cell.getAttribute("aria-label")).toMatch(/above|below|about|few plays/)
		fireEvent.click(cell)
		expect(screen.getByTestId("situation-pick").textContent).toMatch(/3rd down/)
		expect(screen.getByTestId("situation-pick").textContent).toMatch(/successful/)
	})

	it("draws every play of the game, success as a dot and failure as a cross, and moves to another game", () => {
		render(<Situations name="Brock Bowers" views={[bowers]} />)
		const last = bowers.games[bowers.games.length - 1]
		const chart = screen.getByTestId("game-chart")
		const marks = within(chart).getAllByRole("button")
		expect(marks).toHaveLength(last.plays.length)
		const ok = last.plays.filter((p) => p[5] === 1).length
		expect(marks.filter((m) => /^Successful\./.test(m.getAttribute("aria-label") ?? "")).length).toBe(ok)
		expect(screen.getByTestId("game-line").textContent).toContain(`${ok} of ${last.plays.length}`)
		fireEvent.click(marks[0])
		expect(screen.getByTestId("play-detail").textContent).toContain(playLine("rec", last.plays[0]))
		fireEvent.click(screen.getByRole("tab", { name: /Wk 3/ }))
		expect(within(screen.getByTestId("game-chart")).getAllByRole("button")).toHaveLength(bowers.games[0].plays.length)
		expect(track).toHaveBeenCalledWith("player_situation", expect.objectContaining({ action: "game", week: 3 }))
	})

	it("offers the same game as a table", () => {
		render(<Situations name="Brock Bowers" views={[bowers]} />)
		fireEvent.click(screen.getByRole("button", { name: "Show as a table" }))
		const table = screen.getByTestId("play-table")
		const last = bowers.games[bowers.games.length - 1]
		expect(within(table).getAllByRole("row")).toHaveLength(last.plays.length + 1)
		expect(table.textContent).toMatch(/Successful/)
		expect(screen.queryByTestId("game-chart")).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "Show the chart" }))
		expect(screen.getByTestId("game-chart")).toBeTruthy()
	})

	it("lets a quarterback switch between throwing and running", () => {
		render(<Situations name="Geno Smith" views={geno} />)
		const tabs = screen.getAllByRole("tab").filter((t) => /Passing|Rushing/.test(t.textContent ?? ""))
		expect(tabs[0].textContent).toMatch(/Passing/)
		expect(tabs[0].getAttribute("aria-selected")).toBe("true")
		expect(screen.getByRole("radio", { name: "Sack rate" })).toBeTruthy()
		fireEvent.click(tabs[1])
		expect(screen.getByRole("radio", { name: "Yards per carry" })).toBeTruthy()
		expect(track).toHaveBeenCalledWith("player_situation", expect.objectContaining({ role: "rush", action: "job" }))
	})
})


describe("<SituationBoard />", () => {
	const def = SIT_BOARDS.find((b) => b.slug === "quarterbacks-passing")!
	const rows = sitBoardRows(sit, getPlayers().players, def)
	const mins = Object.fromEntries(SPLIT_CHOICES.map((s) => [s.key, minPlaysFor(sit, def, s.key)]))
	const teams = Array.from(new Set(rows.map((r) => r.team))).sort()
	const mount = () => render(<SituationBoard role="pass" peers="quarterbacks" single="Quarterback" rows={rows} league={sit.league["pass.qb"]} mins={mins} teams={teams} />)

	const order = (split: string, key: "sr" | "x") =>
		screen.getAllByTestId("situation-row").map((tr) => {
			const name = (tr.querySelector("a")!.textContent ?? "").trim()
			const r = rows.find((x) => x.name === name)!
			return cellStats(splitCell(r.c, split, r.rz))![key]
		})

	it("ranks everyone on third down by success rate, best first, under the league average", () => {
		mount()
		const rates = order("3", "sr")
		expect(rates.length).toBeGreaterThan(10)
		expect(rates).toEqual([...rates].sort((a, b) => b - a))
		expect(screen.getByText("League average")).toBeTruthy()
		expect(screen.getAllByTestId("situation-row")[0].querySelector("td")!.textContent).toBe("1")
	})

	it("re-ranks on another number, where a sack rate puts the fewest sacks first, and on another spot", () => {
		mount()
		fireEvent.click(screen.getByRole("radio", { name: "Sack rate" }))
		const sacks = order("3", "x")
		expect(sacks).toEqual([...sacks].sort((a, b) => a - b))
		fireEvent.change(screen.getByLabelText("Situation"), { target: { value: "rz" } })
		expect(screen.getByRole("table").querySelector("caption")!.textContent).toMatch(/inside the 20/)
		const rz = order("rz", "x")
		expect(rz).toEqual([...rz].sort((a, b) => a - b))
		expect(track).toHaveBeenCalledWith("situation_board", expect.objectContaining({ action: "split", split: "rz" }))
	})

	it("filters by name and says so when nobody matches", () => {
		mount()
		fireEvent.change(screen.getByPlaceholderText("Filter by name"), { target: { value: "zzzz" } })
		expect(screen.queryAllByTestId("situation-row")).toHaveLength(0)
		expect(screen.getByText(/Nobody has/)).toBeTruthy()
	})
})
