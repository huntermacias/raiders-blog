// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import FlagCard from "../../components/lab/flags/FlagCard"
import FlagsExplorer from "../../components/lab/flags/FlagsExplorer"
import FlagsHub from "../../components/lab/flags/FlagsHub"
import { flagSeason, getFlagFiles, getRoster, hubSlice, rosterFor } from "../../lib/lab/flagsData"
import { flagsOfTeam } from "../../lib/lab/flagsData"
import { teamFlagsHref } from "../../lib/lab/flagsKit"
import { flag } from "../lib/flagsKit.test"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/lab/flags", useSearchParams: () => new URLSearchParams() }))

afterEach(() => {
	cleanup()
	push.mockClear()
})

const players = { "00-1": { n: "Alex Player", t: "LV", p: "OL", s: "alex-player" } }

describe("<FlagCard />", () => {
	it("shows who, when, the down and distance, the result and the cost, and links the player", () => {
		render(<ul><FlagCard f={flag({ ty: "Roughing the Kicker", yds: 15, dn: 4, yd: 5, tg: ["gift", "big"], u: "defense", au: 1, c: 3.9, pl: "punt" })} players={players} /></ul>)
		const card = screen.getByTestId("flag-card")
		expect(card.textContent).toMatch(/Roughing the Kicker/)
		expect(card.textContent).toMatch(/4th & 5 at LV 38/)
		expect(card.textContent).toMatch(/on a punt/)
		expect(card.textContent).toMatch(/-3\.9 pts/)
		expect(card.textContent).toMatch(/0\.9 turnovers/)
		expect(within(card).getByText("Gift first down".slice(0, 4))).toBeTruthy()
		expect(within(card).getByRole("link", { name: "A.Player" }).getAttribute("href")).toBe("/lab/flags/player/alex-player")
	})

	it("says a delay of game goes to the quarterback and a team flag is not a player's", () => {
		const { rerender } = render(<ul><FlagCard f={flag({ ck: "qb", ty: "Delay of Game", pn: "Q.Back" })} players={{}} /></ul>)
		expect(screen.getByTestId("flag-card").textContent).toMatch(/delay of game goes to the quarterback/)
		rerender(<ul><FlagCard f={flag({ ck: "team", pid: null, pn: null, ty: "Defensive Too Many Men on Field" })} players={{}} /></ul>)
		expect(screen.getByTestId("flag-card").textContent).toMatch(/Team and coaches/)
		expect(screen.getByTestId("flag-card").textContent).toMatch(/a team penalty/)
		expect(screen.queryByRole("link", { name: /Team and coaches/ })).toBeNull()
	})

	it("hides the culprit on his own page and names the team in a league list", () => {
		const { rerender } = render(<ul><FlagCard f={flag({ ds: "play text" })} players={players} showWho={false} /></ul>)
		expect(screen.getByTestId("flag-card").textContent).not.toMatch(/A\.Player/)
		rerender(<ul><FlagCard f={flag({ t: "LV" })} players={players} showTeam /></ul>)
		expect(screen.getByRole("link", { name: /LV/ }).getAttribute("href")).toBe(teamFlagsHref("LV"))
	})

	it("keeps the play text behind a disclosure", () => {
		render(<ul><FlagCard f={flag({ ds: "PENALTY on LV-1-A.Player, Offensive Holding" })} players={players} /></ul>)
		const d = screen.getByTestId("flag-card").querySelector("details")!
		expect(d.open).toBe(false)
		expect(d.textContent).toMatch(/PENALTY on LV-1/)
	})
})

describe("<FlagsExplorer />", () => {
	const mk = (season: number, list = [flag({ c: 1 }), flag({ c: 3, dn: 4, tg: ["gift", "big"], u: "defense", au: 1 }), flag({ c: 2, dn: 1, ty: "False Start", yds: 5 })]) => ({ season, week: 5, turnoverCost: 4.4, flags: list })
	const base = [mk(2026), { ...mk(2025, [flag({ c: 0.4 })]), flags: [flag({ c: 0.4 })] }]

	it("shows the season's totals and lists the costly flags first", () => {
		render(<FlagsExplorer seasons={base} players={players} subject={{ kind: "team", name: "Raiders" }} />)
		const t = screen.getByTestId("flag-totals").textContent ?? ""
		expect(t).toMatch(/Flags3/)
		expect(t).toMatch(/Cost6\.0/)
		expect(t).toMatch(/Costly flags1/)
		const costly = screen.getByRole("heading", { name: "Costly flags" }).closest("section")!
		expect(within(costly).getAllByTestId("flag-card")).toHaveLength(1)
	})

	it("switches seasons and says so when a team has no costly flag", () => {
		render(<FlagsExplorer seasons={base} players={players} subject={{ kind: "team", name: "Raiders" }} />)
		fireEvent.click(screen.getByRole("button", { name: "2025" }))
		expect(screen.getByTestId("flag-totals").textContent).toMatch(/Flags1/)
		expect(screen.getByText(/None so far in 2025/)).toBeTruthy()
	})

	it("filters the log by down and costly, and sorts it", () => {
		render(<FlagsExplorer seasons={[base[0]]} players={players} subject={{ kind: "team", name: "Raiders" }} />)
		const log = screen.getByRole("heading", { name: "Every flag" }).closest("section")!
		expect(within(log).getAllByTestId("flag-card")).toHaveLength(3)
		fireEvent.click(within(log).getByRole("button", { name: "4th" }))
		expect(within(log).getAllByTestId("flag-card")).toHaveLength(1)
		expect(within(log).getByRole("button", { name: "4th" }).getAttribute("aria-pressed")).toBe("true")
		fireEvent.click(within(log).getByRole("button", { name: "4th" }))
		fireEvent.click(within(log).getByRole("button", { name: "Costly only" }))
		expect(within(log).getAllByTestId("flag-card")).toHaveLength(1)
		fireEvent.click(within(log).getByRole("button", { name: "Costly only" }))
		fireEvent.click(within(log).getByRole("button", { name: "Costliest" }))
		expect(within(log).getAllByTestId("flag-card")[0].textContent).toMatch(/-3\.0 pts/)
	})

	it("pages through a long log twenty at a time", () => {
		const many = Array.from({ length: 45 }, (_, i) => flag({ c: 0.1 + i / 100 }))
		render(<FlagsExplorer seasons={[mk(2026, many)]} players={players} subject={{ kind: "team", name: "Raiders" }} />)
		const log = screen.getByRole("heading", { name: "Every flag" }).closest("section")!
		expect(within(log).getAllByTestId("flag-card")).toHaveLength(20)
		fireEvent.click(within(log).getByRole("button", { name: "Show 20 more" }))
		expect(within(log).getAllByTestId("flag-card")).toHaveLength(40)
		fireEvent.click(within(log).getByRole("button", { name: "Show 5 more" }))
		expect(within(log).getAllByTestId("flag-card")).toHaveLength(45)
	})

	it("lists a team's players with a link to each, and counts the team flags apart", () => {
		const list = [flag({ pid: "00-1", c: 1 }), flag({ ck: "team", pid: null, pn: null, ty: "Illegal Substitution", c: 0.3 })]
		render(<FlagsExplorer seasons={[mk(2026, list)]} players={players} subject={{ kind: "team", name: "Raiders" }} />)
		const who = screen.getByRole("heading", { name: "Who gets them" }).closest("section")!
		expect(within(who).getByRole("link", { name: "Alex Player" }).getAttribute("href")).toBe("/lab/flags/player/alex-player")
		expect(who.textContent).toMatch(/1 more is the team's and its coaches'/)
	})

	it("leaves the players table off a player's own page and names the season when there is nothing", () => {
		render(<FlagsExplorer seasons={[mk(2026)]} players={players} subject={{ kind: "player", name: "Alex Player" }} />)
		expect(screen.queryByRole("heading", { name: "Who gets them" })).toBeNull()
		cleanup()
		render(<FlagsExplorer seasons={[mk(2026, [])]} players={players} subject={{ kind: "player", name: "Alex Player" }} />)
		expect(screen.getByText(/No accepted penalties in 2026 for Alex Player/)).toBeTruthy()
	})

	it("says where a team ranks, with the worst first", () => {
		render(<FlagsExplorer seasons={[{ ...mk(2026), rank: { rank: 3, of: 32 } }]} players={players} subject={{ kind: "team", name: "Raiders" }} />)
		expect(screen.getByText(/The Raiders rank 3rd of 32 teams/)).toBeTruthy()
	})

	it("works on the real files: the Raiders' page has its flags, costly ones first and every table labelled", () => {
		const files = getFlagFiles()
		const seasons = files.map((f) => ({ season: f.season, week: f.week, turnoverCost: f.turnoverCost, flags: flagsOfTeam(f, "LV") }))
		render(<FlagsExplorer seasons={seasons} players={rosterFor(seasons.flatMap((s) => s.flags))} subject={{ kind: "team", name: "Raiders" }} />)
		expect(screen.getByTestId("flag-totals").textContent).toMatch(new RegExp(`^Flags${seasons[0].flags.length}\\d+ yards`))
		for (const region of Array.from(document.querySelectorAll("[role=region]"))) expect(region.getAttribute("aria-label")).toBeTruthy()
	})
})

describe("<FlagsHub />", () => {
	const files = getFlagFiles()
	const slices = files.map((f) => hubSlice(f))
	const roster = rosterFor(slices.flatMap((s) => [...s.latest, ...s.worst]))
	const teams = [{ abbr: "LV", name: "Las Vegas Raiders" }, { abbr: "KC", name: "Kansas City Chiefs" }]

	it("opens on the latest costly flags and shows the league's totals", () => {
		render(<FlagsHub slices={slices} roster={roster} teams={teams} />)
		expect(within(screen.getByRole("tabpanel")).getAllByTestId("flag-card")).toHaveLength(slices[0].latest.length)
		expect(screen.getByTestId("flag-league-totals").textContent).toMatch(new RegExp(`Flags${slices[0].totals.flags}`))
	})

	it("takes a fan to their team's page from the picker", () => {
		render(<FlagsHub slices={slices} roster={roster} teams={teams} />)
		fireEvent.change(screen.getByLabelText("Find your team"), { target: { value: "KC" } })
		expect(push).toHaveBeenCalledWith("/lab/flags/team/kc")
	})

	it("ranks teams and players, with a link to each page, and sorts by what is asked", () => {
		render(<FlagsHub slices={slices} roster={roster} teams={teams} />)
		fireEvent.click(screen.getByRole("tab", { name: "Teams" }))
		const rows = within(screen.getByRole("tabpanel")).getAllByRole("row")
		expect(rows).toHaveLength(33)
		expect(within(rows[1]).getByRole("link").getAttribute("href")).toMatch(/^\/lab\/flags\/team\/[a-z]+$/)
		fireEvent.click(screen.getByRole("button", { name: "Flags" }))
		const flagsCol = within(screen.getByRole("tabpanel")).getAllByRole("row").slice(1).map((r) => Number(within(r).getAllByRole("cell")[1].textContent))
		expect(flagsCol).toEqual([...flagsCol].sort((a, b) => b - a))
		fireEvent.click(screen.getByRole("tab", { name: "Players" }))
		expect(within(screen.getByRole("tabpanel")).getAllByRole("row").length).toBeGreaterThan(20)
	})

	it("finds a player by name and by team code", () => {
		render(<FlagsHub slices={slices} roster={roster} teams={teams} />)
		fireEvent.click(screen.getByRole("tab", { name: "Players" }))
		const first = slices[0].players[0]
		fireEvent.change(screen.getByLabelText("Find a player or team code"), { target: { value: first.label.slice(0, 5) } })
		expect(within(screen.getByRole("tabpanel")).getAllByRole("link").some((a) => a.textContent === first.label)).toBe(true)
		fireEvent.change(screen.getByLabelText("Find a player or team code"), { target: { value: "zzzzzz" } })
		expect(screen.getByText(/Nobody matches/)).toBeTruthy()
	})

	it("switches seasons", () => {
		render(<FlagsHub slices={slices} roster={roster} teams={teams} />)
		fireEvent.click(screen.getByRole("button", { name: String(slices[1].season) }))
		expect(screen.getByTestId("flag-league-totals").textContent).toMatch(new RegExp(`Flags${slices[1].totals.flags}`))
	})
})

describe("the real data", () => {
	it("has the Raiders in it", () => {
		const f = flagSeason(2026)!
		expect(flagsOfTeam(f, "LV").length).toBeGreaterThan(5)
		expect(Object.keys(getRoster().byId).length).toBeGreaterThan(500)
	})
})
