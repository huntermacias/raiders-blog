// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import Slate from "../../components/math/Slate"
import type { SlateGame } from "../../lib/math/report"

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

const g = (over: Partial<SlateGame> = {}): SlateGame => ({
	key: "w5-NE-LV",
	week: 5,
	home: "LV",
	away: "NE",
	kickoff: inDays(3),
	homeChance: 0.62,
	homeMargin: 3.4,
	bloggerPick: "NE",
	mathPick: "LV",
	split: true,
	...over,
})

const slate: SlateGame[] = [
	g(),
	g({ key: "w5-KC-DEN", home: "DEN", away: "KC", homeChance: 0.3, homeMargin: -4, bloggerPick: "KC", mathPick: "KC", split: false }),
	g({ key: "w6-SEA-SF", week: 6, home: "SF", away: "SEA", homeChance: 0.5, homeMargin: 0.1, bloggerPick: null, mathPick: "SF", split: false }),
]

beforeEach(() => {
	window.localStorage.clear()
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("Slate", () => {
	it("groups games by week with the math's chance, line and both picks", () => {
		render(<Slate slate={slate} season={2026} tallies={{}} />)
		expect(screen.getByText("Week 5")).toBeTruthy()
		expect(screen.getByText("Week 6")).toBeTruthy()
		expect(screen.getByRole("img", { name: "Patriots 38 percent, Raiders 62 percent" })).toBeTruthy()
		expect(screen.getByText("LV by 3.5")).toBeTruthy()
		expect(screen.getByText("KC by 4")).toBeTruthy()
		expect(screen.getByText("Pick’em")).toBeTruthy()
		expect(screen.getAllByText("We split")).toHaveLength(1)
		expect(screen.getByText("We agree")).toBeTruthy()
	})

	it("filters to the games where we split", () => {
		render(<Slate slate={slate} season={2026} tallies={{}} />)
		const toggle = screen.getByRole("button", { name: "Only where we split (1)" })
		expect(toggle.getAttribute("aria-pressed")).toBe("false")
		fireEvent.click(toggle)
		expect(toggle.getAttribute("aria-pressed")).toBe("true")
		expect(screen.queryByText("Week 6")).toBeNull()
		expect(screen.queryByText("We agree")).toBeNull()
		expect(screen.getAllByText("We split")).toHaveLength(1)
	})

	it("offers the vote on a split game before kickoff and saves it, showing the new tally", async () => {
		const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ blogger: 3, math: 9 }) }))
		vi.stubGlobal("fetch", fetchMock)
		render(<Slate slate={slate} season={2026} tallies={{}} />)
		const math = await screen.findByRole("button", { name: "Math: Raiders" })
		expect(screen.getByRole("button", { name: "Blogger: Patriots" })).toBeTruthy()
		fireEvent.click(math)
		await screen.findByText(/Thanks, you went with the math \(Raiders\)/)
		expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toEqual({ key: "w5-NE-LV", side: "math" })
		expect(screen.getByText("Math 75%")).toBeTruthy()
		expect(screen.getByText("Blogger 25%")).toBeTruthy()
		expect(screen.getByText("12 votes")).toBeTruthy()
		expect(window.localStorage.getItem("mathvote:2026:w5-NE-LV")).toBe("math")
		expect(screen.queryByRole("button", { name: "Math: Raiders" })).toBeNull()
	})

	it("remembers an earlier vote in this browser and doesn't offer another", async () => {
		window.localStorage.setItem("mathvote:2026:w5-NE-LV", "blogger")
		render(<Slate slate={slate} season={2026} tallies={{ "w5-NE-LV": { blogger: 1, math: 1 } }} />)
		await screen.findByText(/Thanks, you went with the blogger \(Patriots\)/)
		expect(screen.getByText("Blogger 50%")).toBeTruthy()
		expect(screen.queryByRole("button", { name: /Blogger:/ })).toBeNull()
	})

	it("doesn't offer a vote on a game that has kicked off, but shows the tally if there is one", async () => {
		const closed = [g({ kickoff: inDays(-1) })]
		const { unmount } = render(<Slate slate={closed} season={2026} tallies={{ "w5-NE-LV": { blogger: 2, math: 6 } }} />)
		await screen.findByText("Math 75%")
		expect(screen.queryByRole("button", { name: /Math:/ })).toBeNull()
		unmount()
		render(<Slate slate={closed} season={2026} tallies={{}} />)
		await screen.findByText("Voting is closed for this game.")
	})

	it("says so, and offers another go, when the vote can't be saved", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
		render(<Slate slate={slate} season={2026} tallies={{}} />)
		fireEvent.click(await screen.findByRole("button", { name: "Blogger: Patriots" }))
		await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Couldn.t save your vote/))
		expect(screen.getByRole("button", { name: "Blogger: Patriots" })).toBeTruthy()
		expect(window.localStorage.getItem("mathvote:2026:w5-NE-LV")).toBeNull()
	})

	it("explains a closed window when the server answers 409", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })))
		render(<Slate slate={slate} season={2026} tallies={{}} />)
		fireEvent.click(await screen.findByRole("button", { name: "Math: Raiders" }))
		await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/closed/))
	})

	it("says there is nothing to forecast with an empty slate", () => {
		render(<Slate slate={[]} season={2026} tallies={{}} />)
		expect(screen.getByText(/No upcoming games/)).toBeTruthy()
	})

	it("has no vote buttons on games we agree on", async () => {
		render(<Slate slate={[slate[1]]} season={2026} tallies={{}} />)
		await new Promise((r) => setTimeout(r, 0))
		expect(screen.queryByText("Who do you trust?")).toBeNull()
		expect(within(screen.getByRole("list")).queryAllByRole("button")).toHaveLength(0)
	})
})
