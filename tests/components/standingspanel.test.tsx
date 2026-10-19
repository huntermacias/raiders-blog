// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import StandingsPanel from "@/components/rooting/StandingsPanel"
import { getGames } from "@/lib/playoffs/data"
import { getRooting } from "@/lib/rooting/data"
import { tableRows } from "@/lib/rooting/table"
import { getUnits } from "@/lib/lab/data"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/lab/rooting-guide" }))

const ranks = Object.fromEntries(Object.entries(getUnits().teams).map(([k, t]) => [k, { off: t.overall.off?.rank ?? null, def: t.overall.def?.rank ?? null }]))
const rows = tableRows({ data: getRooting()!, schedule: getGames(), goal: "playoffs", ranks })
const show = () => render(<StandingsPanel rows={rows} team="LV" goal="playoffs" goalShort="Playoffs" week={6} color="#a5acaf" />)

afterEach(cleanup)

describe("<StandingsPanel />", () => {
	it("opens on the conference with the team marked and links every row to its own guide", () => {
		show()
		expect(screen.getByRole("tab", { name: "Conference" }).getAttribute("aria-selected")).toBe("true")
		const body = screen.getAllByRole("row").slice(1)
		expect(body).toHaveLength(16)
		const link = screen.getByRole("link", { name: /Raiders/ })
		expect(link.getAttribute("aria-current")).toBe("true")
		expect(link.getAttribute("href")).toContain("team=LV")
		expect(screen.getByRole("link", { name: /Chiefs/ }).getAttribute("href")).toContain("team=KC")
	})

	it("switches between division, conference and league", () => {
		show()
		fireEvent.click(screen.getByRole("tab", { name: "Division" }))
		expect(screen.getAllByRole("row").slice(1)).toHaveLength(4)
		fireEvent.click(screen.getByRole("tab", { name: "League" }))
		expect(screen.getAllByRole("row").slice(1)).toHaveLength(32)
		fireEvent.click(screen.getByRole("tab", { name: "Conference" }))
		expect(screen.getAllByRole("row").slice(1)).toHaveLength(16)
	})

	it("moves between tabs with the arrow keys", () => {
		show()
		fireEvent.keyDown(screen.getByRole("tab", { name: "Conference" }), { key: "ArrowRight" })
		expect(screen.getByRole("tab", { name: "League" }).getAttribute("aria-selected")).toBe("true")
		fireEvent.keyDown(screen.getByRole("tab", { name: "League" }), { key: "ArrowLeft" })
		expect(screen.getByRole("tab", { name: "Conference" }).getAttribute("aria-selected")).toBe("true")
	})

	it("changes the side column when another number is chosen", () => {
		show()
		const lv = rows.find((r) => r.team === "LV")!
		const row = () => within(screen.getByRole("link", { name: /Raiders/ }).closest("tr") as HTMLElement)
		expect(row().getByText(lv.projWins.toFixed(1))).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Defense" }))
		expect(screen.getByRole("button", { name: "Defense" }).getAttribute("aria-pressed")).toBe("true")
		expect(row().queryByText(lv.projWins.toFixed(1))).toBeNull()
		expect(row().getByText(String(lv.defRank))).toBeTruthy()
	})

	it("marks the playoff cut and the seeds in the conference view", () => {
		show()
		expect(screen.getAllByText(/\d seed$/)).toHaveLength(7)
	})

	it("is hidden below the desktop breakpoint", () => {
		const { container } = show()
		expect(container.querySelector("aside")?.className).toMatch(/\bhidden\b.*\blg:block\b/)
	})
})
