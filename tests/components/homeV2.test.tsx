// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/urlFor", () => ({
	cardImageUrl: () => "https://cdn.example/card.jpg",
	thumbImageUrl: () => "https://cdn.example/thumb.jpg",
	hotspotPosition: () => "50% 50%",
}))

import GameReportsTeaser from "../../components/GameReportsTeaser"
import GameDayHub from "../../components/home/GameDayHub"
import SeasonGlance, { oddsNumbers } from "../../components/home/SeasonGlance"
import ReportNav from "../../components/report/ReportNav"
import { hubState, playedGames } from "../../lib/home"
import type { RootingSnapshot } from "../../lib/homeLab"
import { type GamePrediction, summarize, summarizeKeys } from "../../lib/predictions"
import { joinSchedule, scheduleRecord } from "../../lib/schedule"

afterEach(() => {
	cleanup()
	vi.restoreAllMocks()
})

const RAIDERS = "Las Vegas Raiders"
const K4 = "2026-10-04T20:25:00Z"
const K5 = "2026-10-11T17:00:00Z"
const T4 = new Date(K4).getTime()
const MONDAY = T4 + 28 * 3600_000

function doc(over: Partial<GamePrediction> = {}): GamePrediction {
	return {
		_id: "p4",
		week: 4,
		awayTeam: "Kansas City Chiefs",
		homeTeam: RAIDERS,
		kickoff: K4,
		predictedAwayScore: 20,
		predictedHomeScore: 27,
		actualAwayScore: 17,
		actualHomeScore: 24,
		readerVotesAway: 0,
		readerVotesHome: 0,
		report: { slug: "week-4-recap", title: "Raiders beat the Chiefs" },
		keys: null,
		...over,
	}
}
const next = doc({ _id: "p5", week: 5, awayTeam: "New England Patriots", kickoff: K5, actualAwayScore: undefined, actualHomeScore: undefined, report: null })

const snapshot = (over: Partial<RootingSnapshot> = {}): RootingSnapshot => ({
	nick: "Raiders",
	goal: "playoffs",
	goalPhrase: "make the playoffs",
	week: 6,
	status: "live",
	pct: "11%",
	baseline: 0.11,
	change: { text: "−3 pts", dir: "down", since: "since Week 6" },
	range: null,
	best: null,
	own: null,
	matters: 0,
	headline: "",
	updating: false,
	href: "/lab/rooting-guide?team=LV&goal=playoffs",
	...over,
})

describe("oddsNumbers", () => {
	it("is the percent and the move in points, signed", () => {
		expect(oddsNumbers(snapshot())).toEqual({ pct: 11, delta: -3 })
		expect(oddsNumbers(snapshot({ change: { text: "+6 pts", dir: "up", since: "since Week 4" } }))).toEqual({ pct: 11, delta: 6 })
		expect(oddsNumbers(snapshot({ change: { text: "No change", dir: "flat", since: "since Week 4" } }))).toEqual({ pct: 11, delta: 0 })
		expect(oddsNumbers(snapshot({ change: null }))).toEqual({ pct: 11, delta: null })
	})
	it("is nothing once the standings have settled it, or with no guide", () => {
		expect(oddsNumbers(snapshot({ status: "clinched" }))).toBeNull()
		expect(oddsNumbers(null)).toBeNull()
	})
})

describe("<SeasonGlance />", () => {
	const rows = joinSchedule(
		[
			{ week: 1, opponent: "Denver Broncos", homeAway: "home", kickoff: "2026-09-13T20:00:00Z" },
			{ week: 2, opponent: "Kansas City Chiefs", homeAway: "away", kickoff: "2026-09-20T20:00:00Z" },
		],
		[
			doc({ _id: "a", week: 1, awayTeam: "Denver Broncos", kickoff: "2026-09-13T20:00:00Z", actualAwayScore: 10, actualHomeScore: 24 }),
			doc({ _id: "b", week: 2, awayTeam: RAIDERS, homeTeam: "Kansas City Chiefs", kickoff: "2026-09-20T20:00:00Z", actualAwayScore: 13, actualHomeScore: 30 }),
		]
	)
	const picks = [doc()]
	const props = {
		record: scheduleRecord(rows),
		played: playedGames(rows),
		odds: snapshot(),
		rank: { rank: 24, change: -3, week: 7, history: [20, 21, 24] },
		summary: summarize(picks),
		keys: summarizeKeys(picks),
		stamp: 1,
	}

	it("shows the four numbers and links each to the page behind it", () => {
		render(<SeasonGlance {...props} />)
		const section = screen.getByRole("region", { name: "The season so far" })
		expect(within(section).getByText("Points per game")).toBeTruthy()
		expect(within(section).getByText("Playoff odds")).toBeTruthy()
		expect(within(section).getByText(/Power rank/)).toBeTruthy()
		expect(within(section).getByText("Pick accuracy")).toBeTruthy()
		const hrefs = within(section).getAllByRole("link").map((a) => a.getAttribute("href"))
		expect(hrefs).toEqual(expect.arrayContaining(["/schedule", "/rankings", "/predictions", "/lab/rooting-guide?team=LV&goal=playoffs"]))
	})
	it("works out the scoring margin from the games played", () => {
		render(<SeasonGlance {...props} />)
		// 24-10 and 13-30 (the second is an away game, so Raiders 13, Chiefs 30): (14 - 17) / 2 = -1.5
		expect(screen.getByText("−1.5")).toBeTruthy()
		expect(screen.getByText("18.5 for · 20.0 against")).toBeTruthy()
	})
	it("offers one share button for the season, and none before a game is played", () => {
		const { unmount } = render(<SeasonGlance {...props} />)
		expect(screen.getByRole("button", { name: /Share the season/ })).toBeTruthy()
		unmount()
		render(<SeasonGlance {...props} played={[]} record={{ w: 0, l: 0, t: 0 }} />)
		expect(screen.queryByRole("button", { name: /Share the season/ })).toBeNull()
		expect(screen.getByText("The season hasn’t started")).toBeTruthy()
	})
	it("still renders with no guide and no rankings", () => {
		render(<SeasonGlance {...props} odds={null} rank={null} />)
		expect(screen.getByText("See the picture")).toBeTruthy()
		expect(screen.getByText("See the board")).toBeTruthy()
	})
})

describe("<GameDayHub /> after a final, with the line score", () => {
	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(MONDAY)
	})
	const picks = [doc(), next]
	const hub = (extra: Parameters<typeof GameDayHub>[0]["finalExtra"]) => {
		const rows = joinSchedule(
			[
				{ week: 4, opponent: "Kansas City Chiefs", homeAway: "home", kickoff: K4 },
				{ week: 5, opponent: "New England Patriots", homeAway: "home", kickoff: K5 },
			],
			picks
		)
		return render(<GameDayHub state={hubState(rows, MONDAY)} picks={picks} played={playedGames(rows)} record={scheduleRecord(rows)} latestReport={{ slug: "week-4-recap", title: "Raiders beat the Chiefs" }} finalExtra={extra} />)
	}

	it("draws the score by quarter, with totals that match the final", () => {
		hub({ score: [24, 17], quarters: [{ label: "1", me: 3, opp: 7 }, { label: "2", me: 7, opp: 0 }, { label: "3", me: 14, opp: 7 }, { label: "4", me: 0, opp: 3 }], halftime: "Raiders led 10–7 at the half", stamp: 1 })
		const table = screen.getByRole("table", { name: "Score by quarter" })
		const row = within(table).getByRole("row", { name: /LV/ })
		expect(Array.from(row.querySelectorAll("td")).map((c) => c.textContent)).toEqual(["3", "7", "14", "0", "24"])
		expect(screen.getByText("Raiders led 10–7 at the half")).toBeTruthy()
	})
	it("offers to share the final", () => {
		hub({ score: [24, 17], quarters: [], halftime: null, stamp: 1 })
		expect(screen.getByRole("button", { name: /Share the final/ })).toBeTruthy()
		expect(screen.queryByRole("table", { name: "Score by quarter" })).toBeNull()
	})
	it("has no share button for the final before the page can say what it was", () => {
		hub(null)
		expect(screen.queryByRole("button", { name: /Share the final/ })).toBeNull()
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders 24, Chiefs 17, final")
	})
	it("prefers the Lab's score to the Studio one", () => {
		hub({ score: [21, 35], quarters: [], halftime: null, stamp: 1 })
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders 21, Chiefs 35, final")
	})
})

describe("<GameDayHub /> before a game", () => {
	it("puts the pick on the record and offers to share it", () => {
		const rows = joinSchedule([{ week: 5, opponent: "New England Patriots", homeAway: "home", kickoff: K5 }], [next])
		render(<GameDayHub state={hubState(rows, T4)} picks={[next]} played={[]} record={{ w: 0, l: 0, t: 0 }} latestReport={null} />)
		expect(screen.getByRole("button", { name: /Share my pick/ })).toBeTruthy()
		expect(screen.queryByRole("button", { name: /Share the final/ })).toBeNull()
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders vs. Patriots")
	})
})

describe("<GameReportsTeaser /> with real scores", () => {
	const game = { _id: "g1", title: "Rams 35, Raiders 21: The Film Is Worse", slug: { current: "g-1" }, opponent: "Los Angeles Rams", gameDate: "2026-10-26T01:25:00Z", raidersScore: 35, opponentScore: 21, mainImage: { id: 1 } } as unknown as GameReport

	it("uses the Lab's score over the Studio one and says what the report is called", () => {
		render(<GameReportsTeaser games={[game]} scores={{ g1: { raiders: 21, opponent: 35 } }} />)
		const link = screen.getByRole("link", { name: /vs Los Angeles Rams/ })
		expect(link.textContent).toContain("L 21-35")
		expect(link.textContent).toContain("The Film Is Worse")
	})
	it("falls back to the Studio score when the Lab has none", () => {
		render(<GameReportsTeaser games={[game]} />)
		expect(screen.getByRole("link", { name: /vs Los Angeles Rams/ }).textContent).toContain("W 35-21")
	})
})

describe("<ReportNav /> on the home page", () => {
	it("is a labelled list of anchors and needs no progress line", () => {
		render(<ReportNav sections={[{ id: "game", label: "The final" }, { id: "season", label: "Season" }]} label="Parts of the home page" containerClass="container" />)
		const nav = screen.getByRole("navigation", { name: "Parts of the home page" })
		const links = within(nav).getAllByRole("link")
		expect(links.map((a) => a.getAttribute("href"))).toEqual(["#game", "#season"])
		expect(nav.querySelector("[role=progressbar]")).toBeNull()
	})
})
