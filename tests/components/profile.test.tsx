// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import GroupTabs from "../../components/lab/players/GroupTabs"
import GradeRing from "../../components/lab/players/GradeRing"
import LeagueMap from "../../components/lab/players/LeagueMap"
import { BestWorst, BuildAgainstPeers, Ladders } from "../../components/lab/players/ProfileExtras"
import SectionNav from "../../components/lab/players/SectionNav"
import { getPlayers } from "../../lib/lab/data"
import { getPlayerLogs } from "../../lib/lab/playerData"
import { mapData } from "../../lib/lab/mapKit"
import { HEADLINE, buildVsPeers, extremeGames, ladder } from "../../lib/lab/playersKit"
import { track } from "@vercel/analytics"

afterEach(cleanup)
const data = getPlayers()
const logs = getPlayerLogs()

describe("<GradeRing />", () => {
	const dash = () => document.querySelector(".rr-ring-arc")!.getAttribute("stroke-dashoffset")
	it("fills in proportion to the 20 to 80 scale and keeps the number readable in the middle", () => {
		render(<GradeRing grade={50}>
			<b>50</b>
		</GradeRing>)
		expect(screen.getByText("50")).toBeTruthy()
		expect(Number(dash())).toBeCloseTo(50, 5)
		cleanup()
		render(<GradeRing grade={80} />)
		expect(Number(dash())).toBe(0)
		cleanup()
		render(<GradeRing grade={null} />)
		expect(Number(dash())).toBe(100)
		cleanup()
		render(<GradeRing grade={140} />)
		expect(Number(dash())).toBe(0)
	})
})

describe("<SectionNav />", () => {
	it("lists the sections as plain anchors, and hides itself when there is hardly anything to jump to", () => {
		const items = [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }]
		render(<SectionNav items={items} />)
		const nav = screen.getByTestId("section-nav")
		expect(within(nav).getByText("Beta").closest("a")!.getAttribute("href")).toBe("#b")
		expect(within(nav).getByText("Alpha").closest("a")!.getAttribute("aria-current")).toBe("true")
		cleanup()
		render(<SectionNav items={items.slice(0, 2)} />)
		expect(screen.queryByTestId("section-nav")).toBeNull()
	})
})

describe("profile extras", () => {
	const wr = data.players.filter((p) => p.group === "wr").sort((a, b) => b.games - a.games)[0]

	it("lays the ladder out with himself marked and everyone else linked", () => {
		const l = ladder(data, wr, HEADLINE.wr)!
		render(<Ladders group="wr" items={[{ board: l.board, rungs: l.rungs }]} peers="wide receivers" />)
		const rows = within(screen.getByTestId("ladders")).getAllByRole("listitem")
		expect(rows.length).toBe(5)
		const me = rows.filter((r) => r.getAttribute("aria-current") === "true")
		expect(me.length).toBe(1)
		expect(within(me[0]).queryByRole("link")).toBeNull()
		expect(within(rows.find((r) => r !== me[0])!).getByRole("link").getAttribute("href")).toMatch(/^\/lab\/players\//)
	})

	it("gives each size or age its own strip with a plain sentence", () => {
		const peers = data.players.filter((p) => p.group === "wr").map((p) => logs.bio[p.slug])
		const lines = buildVsPeers(wr, logs.bio[wr.slug], peers, new Date("2026-10-04"))
		expect(lines.length).toBeGreaterThan(0)
		render(<BuildAgainstPeers lines={lines} peers="wide receivers" name={wr.name} />)
		expect(screen.getAllByRole("img").length).toBe(lines.length)
		expect(screen.getAllByText(new RegExp(`${wr.name} is (shorter|taller|lighter|heavier|younger|older) than`, "i")).length).toBe(lines.length)
	})

	it("shows best and worst games with the week and the workload behind them", () => {
		const key = HEADLINE.wr
		const log = logs.logs[wr.slug]?.wr
		const ex = extremeGames(log, key, true, 1)
		if (!ex) return
		render(
			<BestWorst
				group="wr"
				calls={[{ key, label: "EPA per target", per: "targets", best: { ...ex.best, opp: "KC", result: "W 24–20", won: true }, worst: { ...ex.worst, opp: "DEN", result: null, won: null } }]}
			/>,
		)
		const box = screen.getByTestId("best-worst")
		expect(within(box).getByText(/Best game/)).toBeTruthy()
		expect(within(box).getByText(/Worst game/)).toBeTruthy()
		expect(within(box).getByText(new RegExp(`Week ${ex.best.week} KC, W 24–20`))).toBeTruthy()
	})
})

describe("<LeagueMap />", () => {
	const wr = data.players.filter((p) => p.group === "wr").sort((a, b) => b.games - a.games)[0]
	beforeEach(() => {
		vi.mocked(track).mockClear()
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => mapData(data, "wr") })))
	})
	afterEach(() => vi.unstubAllGlobals())

	it("loads the league's dots, picks the player out by name, and offers the same numbers as a table", async () => {
		render(<LeagueMap group="wr" focal={[wr.slug]} headline={HEADLINE.wr} peers="wide receivers" />)
		await waitFor(() => expect(screen.getByRole("application")).toBeTruthy())
		expect(fetch).toHaveBeenCalledWith("/lab/players/map/wr")
		const svg = screen.getByRole("application")
		expect(within(svg as unknown as HTMLElement).getAllByText(wr.name).length).toBeGreaterThan(0)
		expect(svg.querySelectorAll("circle").length).toBeGreaterThan(20)
		expect(screen.getByText("View as a table")).toBeTruthy()
		const rows = screen.getAllByRole("row")
		expect(rows.length).toBeGreaterThan(20)
		expect(screen.getByText(new RegExp(`${wr.name} is ahead of \\d+% of wide receivers`))).toBeTruthy()
	})

	it("changing an axis redraws and says so to analytics, with names only", async () => {
		render(<LeagueMap group="wr" focal={[wr.slug]} headline={HEADLINE.wr} peers="wide receivers" />)
		await waitFor(() => screen.getByRole("application"))
		const [across] = screen.getAllByRole("combobox")
		const other = Array.from((across as HTMLSelectElement).options).map((o) => o.value).find((v) => v !== (across as HTMLSelectElement).value)!
		act(() => {
			fireEvent.change(across, { target: { value: other } })
		})
		expect((across as HTMLSelectElement).value).toBe(other)
		expect(track).toHaveBeenCalledWith("lab_map_axes", expect.objectContaining({ group: "wr", x: other }))
	})

	it("walks the dots with the arrow keys and keeps one with Enter", async () => {
		render(<LeagueMap group="wr" focal={[wr.slug]} headline={HEADLINE.wr} peers="wide receivers" />)
		await waitFor(() => screen.getByRole("application"))
		const svg = screen.getByRole("application")
		act(() => {
			fireEvent.keyDown(svg, { key: "ArrowRight" })
		})
		act(() => {
			fireEvent.keyDown(svg, { key: "Enter" })
		})
		expect(screen.getByRole("link", { name: "Profile" }).getAttribute("href")).toMatch(/^\/lab\/players\//)
	})

	it("says plainly when the data cannot be loaded", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
		render(<LeagueMap group="qb" focal={[]} headline="epaDb" peers="quarterbacks" />)
		await waitFor(() => expect(screen.getByText(/could not load/i)).toBeTruthy())
	})
})

describe("<GroupTabs />", () => {
	const tabs = [
		{ id: "all", label: "Everyone", count: 2, panel: <p>everyone panel</p> },
		{ id: "wr", label: "Wide receivers", count: 3, panel: <p>receivers panel</p> },
		{ id: "te", label: "Tight ends", count: 1, panel: <p>tight ends panel</p> },
	]

	it("shows one panel at a time, keeps the others on the page, and counts a tab tap", () => {
		vi.mocked(track).mockClear()
		render(<GroupTabs tabs={tabs} label="Pick a position" event="lab_movers_tab" />)
		expect(screen.getByRole("tab", { name: /Everyone/ }).getAttribute("aria-selected")).toBe("true")
		expect(screen.getByText("everyone panel").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(false)
		expect(screen.getByText("receivers panel", { selector: "p" }).closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(true)
		act(() => {
			fireEvent.click(screen.getByRole("tab", { name: /Wide receivers/ }))
		})
		expect(screen.getByText("receivers panel").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(false)
		expect(screen.getByText("everyone panel").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(true)
		expect(track).toHaveBeenCalledWith("lab_movers_tab", { group: "wr" })
	})

	it("moves with the arrow keys and wraps around", () => {
		render(<GroupTabs tabs={tabs} label="Pick a position" event="lab_movers_tab" />)
		const first = screen.getByRole("tab", { name: /Everyone/ })
		act(() => {
			fireEvent.keyDown(first, { key: "ArrowLeft" })
		})
		expect(screen.getByRole("tab", { name: /Tight ends/ }).getAttribute("aria-selected")).toBe("true")
		act(() => {
			fireEvent.keyDown(screen.getByRole("tab", { name: /Tight ends/ }), { key: "ArrowRight" })
		})
		expect(screen.getByRole("tab", { name: /Everyone/ }).getAttribute("aria-selected")).toBe("true")
	})
})
