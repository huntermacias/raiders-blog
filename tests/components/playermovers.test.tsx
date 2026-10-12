// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { MoverCard, MoverColumn, Move, StandoutList } from "../../components/lab/PlayerMovers"
import PlayerRoster from "../../components/lab/PlayerRoster"
import WeekBars from "../../components/lab/WeekBars"
import players from "../../data/lab/players.json"
import { type PlayerRow, type PlayersData, type Slice, risersFallers, standouts } from "../../lib/lab/playersKit"

afterEach(cleanup)

const slice = (v: number, n: number, g: number | null, pct: number | null): Slice => ({ v, n, g, pct })

const WR: PlayerRow = {
	id: "wr1", name: "Test Receiver", pos: "WR", group: "rec", games: 4,
	stats: [
		{ k: "epaTgt", season: slice(0.3, 30, 60, 80), form: slice(0.42, 13, 66, 90), earlier: slice(0.12, 17, 50, 50), delta: 16 },
		{ k: "adot", season: slice(11, 30, null, null), form: slice(12, 13, null, null), earlier: slice(10, 17, null, null) },
	],
	mover: { score: 8.5, driver: "epaTgt", stats: 4, agree: 2 },
	weekly: [{ w: 1, opp: "MIA", v: 0.1, n: 8 }, { w: 2, opp: "LAC", v: -0.2, n: 9 }, { w: 3, opp: "NO", v: null, n: 1 }, { w: 4, opp: "KC", v: 0.5, n: 7 }],
	snaps: { season: 0.5, form: 0.8, earlier: 0.3 },
}
const CB: PlayerRow = {
	id: "cb1", name: "Test Corner", pos: "CB", group: "cov", games: 3,
	stats: [{ k: "yardsTgt", season: slice(7, 16, 45, 40), form: slice(11, 7, 35, 20), earlier: slice(5, 9, 55, 70), delta: -20 }],
	mover: { score: -12.4, driver: "yardsTgt", stats: 1, agree: 1 },
	weekly: [{ w: 1, opp: "MIA", v: 4, n: 5 }, { w: 2, opp: "LAC", v: 6, n: 4 }, { w: 3, opp: "NO", v: 11, n: 7 }],
	snaps: { season: 0.9, form: 0.9, earlier: 0.9 },
}
const DATA: PlayersData = {
	season: 2026, week: 4, team: "LV", generatedAt: "2026-10-12T05:00:00Z", source: "nflverse data, CC BY 4.0", formGames: 2, formWeeks: [3, 4], defFormWeeks: [2, 3], defWeek: 3,
	games: [1, 2, 3, 4].map((w) => ({ w, opp: "XXX" })), leagueN: { rec: 80, cov: 120 }, players: [WR, CB],
}

describe("<Move />", () => {
	it("pairs the color with an arrow and words, so direction never rests on color alone", () => {
		const { container, rerender } = render(<Move score={8.5} />)
		expect(container.textContent).toContain("▲")
		expect(container.textContent).toContain("+8.5")
		expect(container.textContent).toContain("grade points up")
		rerender(<Move score={-12.4} />)
		expect(container.textContent).toContain("▼")
		expect(container.textContent).toContain("−12.4")
		expect(container.textContent).toContain("grade points down")
	})
})

describe("<MoverCard />", () => {
	it("tells the player's story: who, why, how he changed, where he sits and how his time changed", () => {
		render(<MoverCard data={DATA} player={WR} dir="up" />)
		const card = screen.getByTestId("mover-card")
		expect(card.textContent).toContain("Test Receiver")
		expect(card.textContent).toContain("WR")
		expect(card.textContent).toContain("EPA per target is +0.42 over the last 2 games (13 targets), against +0.12 before that.")
		// Four stats but only two agreed, so the card says the picture is split rather than a flat "he's hot".
		expect(card.textContent).toContain("Mixed picture: 2 of 4 stats moved the same way.")
		expect(card.textContent).toContain("Playing time is up: 30% of snaps before, 80% lately.")
		expect(card.textContent).toContain("Last 2 games")
	})

	it("draws a bar for each game and a dot for a game with too few plays", () => {
		const { container } = render(<MoverCard data={DATA} player={WR} dir="up" />)
		expect(container.querySelectorAll("svg rect")).toHaveLength(3)
		expect(container.querySelectorAll("svg circle")).toHaveLength(1)
	})

	it("says which way is better for a stat where less is good", () => {
		render(<MoverCard data={DATA} player={CB} dir="down" />)
		expect(screen.getByTestId("mover-card").textContent).toContain("lower is better")
		expect(screen.getByTestId("mover-card").textContent).toContain("Weeks 2 and 3")
	})

	it("shows nothing for a player with no mover score", () => {
		const { container } = render(<MoverCard data={DATA} player={{ ...WR, mover: null }} dir="up" />)
		expect(container.innerHTML).toBe("")
	})
})

describe("<MoverColumn />", () => {
	it("lists the movers under a heading", () => {
		render(<MoverColumn data={DATA} dir="up" title="Risers" blurb="Better lately." players={[WR]} />)
		expect(screen.getByRole("heading", { name: /Risers/ })).toBeTruthy()
		expect(screen.getAllByTestId("mover-card")).toHaveLength(1)
	})

	it("says so, kindly, when nobody has moved", () => {
		render(<MoverColumn data={DATA} dir="down" title="Fallers" blurb="x" players={[]} />)
		expect(screen.queryByTestId("mover-card")).toBeNull()
		expect(screen.getByText(/Nobody has moved/)).toBeTruthy()
	})
})

describe("<WeekBars />", () => {
	it("labels every game for a screen reader and puts the number in each bar's title", () => {
		const { container } = render(<WeekBars data={DATA} player={WR} />)
		const svg = container.querySelector("svg")!
		expect(svg.getAttribute("role")).toBe("img")
		expect(svg.getAttribute("aria-label")).toContain("week 1 against MIA +0.10")
		expect(svg.getAttribute("aria-label")).toContain("week 3 against NO too few plays")
		expect(container.querySelector("title")?.textContent).toContain("Week 1 vs MIA")
	})

	it("says a defender's newest game is not posted yet, rather than blaming too few plays", () => {
		const late = { ...CB, weekly: [...CB.weekly, { w: 4, opp: "KC", v: null, n: 0 }] }
		const { container } = render(<WeekBars data={DATA} player={late} />)
		expect(container.querySelector("svg")!.getAttribute("aria-label")).toContain("week 4 against KC not posted yet")
		expect(Array.from(container.querySelectorAll("title")).map((t) => t.textContent).join("|")).toContain("defensive numbers not posted yet")
	})

	it("draws nothing for a player with no measurable game", () => {
		const { container } = render(<WeekBars data={DATA} player={{ ...WR, weekly: WR.weekly.map((w) => ({ ...w, v: null })) }} />)
		expect(container.innerHTML).toBe("")
	})
})

describe("<StandoutList />", () => {
	it("names the stat and where it ranks, with an explanation", () => {
		const items = standouts({ ...DATA, players: [{ ...WR, stats: [{ k: "epaTgt", season: slice(0.7, 30, 80, 97), form: null, earlier: null }] }] }).best
		render(<StandoutList data={DATA} items={items} tone="good" />)
		const list = screen.getByTestId("standouts-good")
		expect(list.textContent).toContain("Test Receiver")
		expect(list.textContent).toContain("97th percentile among receivers and tight ends")
		expect(list.textContent).toContain("Top 3%")
		expect(list.textContent).toContain("Expected points added")
	})

	it("explains an empty list", () => {
		render(<StandoutList data={DATA} items={[]} tone="bad" />)
		expect(screen.getByText(/bottom 15%/)).toBeTruthy()
	})
})

describe("<PlayerRoster />", () => {
	it("groups players by position and opens each into a table of all his stats", () => {
		render(<PlayerRoster data={DATA} />)
		expect(screen.getByRole("heading", { name: "Receivers" })).toBeTruthy()
		expect(screen.getByRole("heading", { name: "Secondary" })).toBeTruthy()
		expect(screen.queryByRole("heading", { name: "Quarterback" })).toBeNull()
		const lines = screen.getAllByTestId("roster-player")
		expect(lines).toHaveLength(2)
		const table = within(lines[0]).getByRole("table")
		expect(table.textContent).toContain("EPA per target")
		expect(table.textContent).toContain("style, not a grade")
	})
})

// The real file, whatever week it is: every player is listed and the page's lists are consistent with each other.
describe("with the real player data", () => {
	const real = players as unknown as PlayersData

	it("lists every player once", () => {
		render(<PlayerRoster data={real} />)
		expect(screen.queryAllByTestId("roster-player")).toHaveLength(real.players.length)
	})

	it("never lists the same player as both a riser and a faller", () => {
		const { risers, fallers } = risersFallers(real, 99)
		const ids = new Set(risers.map((p) => p.id))
		for (const p of fallers) expect(ids.has(p.id)).toBe(false)
	})
})
