// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import GameDayHub from "../../components/home/GameDayHub"
import LabBand from "../../components/home/LabBand"
import { hubState, playedGames } from "../../lib/home"
import { labCopy, labTools } from "../../lib/homeLab"
import { loadRootingSnapshot } from "../../lib/homeLab.server"
import type { GamePrediction } from "../../lib/predictions"
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

const next = doc({
	_id: "p5",
	week: 5,
	awayTeam: "New England Patriots",
	homeTeam: RAIDERS,
	kickoff: K5,
	predictedAwayScore: 17,
	predictedHomeScore: 23,
	actualAwayScore: undefined,
	actualHomeScore: undefined,
	report: null,
})

function hub(picks: GamePrediction[], now = MONDAY, latest: { slug: string; title: string } | null = { slug: "week-4-recap", title: "Raiders beat the Chiefs" }) {
	const rows = joinSchedule(
		[
			{ week: 4, opponent: "Kansas City Chiefs", homeAway: "home", kickoff: K4 },
			{ week: 5, opponent: "New England Patriots", homeAway: "home", kickoff: K5, network: "CBS" },
		],
		picks
	)
	return render(<GameDayHub state={hubState(rows, now)} picks={picks} played={playedGames(rows)} record={scheduleRecord(rows)} latestReport={latest} />)
}

describe("<GameDayHub /> after a final", () => {
	beforeEach(() => {
		vi.spyOn(Date, "now").mockReturnValue(MONDAY)
	})

	it("leads with the score and the result, and labels the section as the final", () => {
		hub([doc(), next])
		expect(screen.getByRole("region", { name: "Week 4 final" })).toBeTruthy()
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders 24, Chiefs 17, final")
		expect(screen.getByText("Final")).toBeTruthy()
		expect(screen.getAllByText("Win").length).toBeGreaterThan(0)
		expect(screen.queryByText("Next game")).toBeNull()
	})

	it("calls a loss a loss", () => {
		hub([doc({ actualAwayScore: 31, actualHomeScore: 10 }), next])
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders 10, Chiefs 31, final")
		expect(screen.getAllByText("Loss").length).toBeGreaterThan(0)
	})

	it("grades the pick in public: the winner and how far off the margin was", () => {
		hub([doc(), next])
		// Picked 27-20 (margin 7), final 24-17 (margin 7): right on the margin.
		expect(screen.getByText("Called the winner.")).toBeTruthy()
		expect(screen.getByText(/I had the Raiders 27, Chiefs 20, and had the margin exactly/)).toBeTruthy()
	})

	it("owns a miss", () => {
		hub([doc({ predictedAwayScore: 24, predictedHomeScore: 20 }), next])
		expect(screen.getByText("Missed the winner.")).toBeTruthy()
		expect(screen.getByText(/off by 11 on the margin/)).toBeTruthy()
	})

	it("links the recap when there is one, and the scoreboard when there is not", () => {
		const { unmount } = hub([doc(), next])
		const recap = screen.getByRole("link", { name: /Read the Week 4 recap/ }) as HTMLAnchorElement
		expect(recap.getAttribute("href")).toBe("/games/week-4-recap")
		unmount()
		hub([doc({ report: null }), next], MONDAY, null)
		expect(screen.queryByRole("link", { name: /Read the Week 4 recap/ })).toBeNull()
		expect((screen.getByRole("link", { name: /See every pick graded/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/predictions")
	})

	it("points at the playoff picture", () => {
		hub([doc(), next])
		expect((screen.getByRole("link", { name: /What it did to the playoff race/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/lab/rooting-guide")
	})

	it("shows what is next, with a clock, and offers the vote for that game", () => {
		hub([doc(), next])
		expect(screen.getByText("Up next · Week 5")).toBeTruthy()
		expect(screen.getByText(/CBS/)).toBeTruthy()
		expect(screen.getByRole("timer")).toBeTruthy()
		expect(screen.getByText("Your turn · Week 5")).toBeTruthy()
		expect(screen.getByRole("button", { name: "Pick the Raiders to win" })).toBeTruthy()
	})

	it("does not repeat the recap in the right column", () => {
		hub([doc(), next])
		expect(screen.queryByText("Latest recap")).toBeNull()
		cleanup()
		hub([doc(), next], MONDAY, { slug: "older", title: "An older recap" })
		expect(screen.getByText("Latest recap")).toBeTruthy()
	})

	it("is the plain next-game hub again after the window", () => {
		hub([doc(), next], T4 + 80 * 3600_000)
		expect(screen.getByText("Next game")).toBeTruthy()
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders vs. Patriots")
	})

	it("works with no pick on the record: just the score", () => {
		hub([doc({ _id: "x", report: null })].map((d) => ({ ...d })), MONDAY, null)
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Raiders 24, Chiefs 17, final")
	})
})

describe("<LabBand />", () => {
	it("shows the odds, the best game to root for and the tools for the phase", () => {
		const snapshot = loadRootingSnapshot()
		expect(snapshot).not.toBeNull()
		render(<LabBand copy={labCopy("late", snapshot?.week ?? 6)} snapshot={snapshot} tools={labTools("late").map((tool) => ({ tool, badges: [] }))} />)
		const section = screen.getByRole("region", { name: /Game week in the Lab/ })
		expect(within(section).getByText(/chance to make the playoffs/)).toBeTruthy()
		expect(within(section).getByText(/A model estimate/)).toBeTruthy()
		// It says when the odds were last rebuilt, from the data file's own date.
		const stamp = section.querySelector("time")
		expect(stamp?.getAttribute("datetime")).toBe(snapshot!.updatedAt)
		expect(stamp?.textContent).toMatch(/ET$/)
		const links = within(section).getAllByRole("link").map((a) => a.getAttribute("href"))
		expect(links).toContain("/lab")
		expect(links).toContain("/lab/matchups")
		expect(links.some((h) => h?.startsWith("/lab/rooting-guide?team=LV&goal="))).toBe(true)
	})

	it("renders the tools alone when the guide has no data", () => {
		render(<LabBand copy={labCopy("idle", null)} snapshot={null} tools={labTools("idle").map((tool) => ({ tool, badges: ["New"] }))} />)
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("The Lab")
		expect(screen.queryByText(/chance to/)).toBeNull()
		expect(screen.getAllByText("New").length).toBeGreaterThan(0)
	})

	it("says plainly when the standings have settled the question", () => {
		render(
			<LabBand
				copy={labCopy("final", 6)}
				snapshot={{
					nick: "Raiders",
					goal: "playoffs",
					goalPhrase: "make the playoffs",
					week: 6,
					status: "clinched",
					pct: "Clinched",
					baseline: 1,
					change: null,
					best: null,
					own: null,
					matters: 0,
					headline: "The Raiders have clinched a playoff spot.",
					updating: false,
					href: "/lab/rooting-guide?team=LV&goal=playoffs",
				}}
				tools={[]}
			/>
		)
		expect(screen.getByText("Clinched")).toBeTruthy()
		expect(screen.getByText("The Raiders have clinched a playoff spot.")).toBeTruthy()
		expect(screen.queryByRole("img")).toBeNull()
	})

	it("shows the move since last week with its direction", () => {
		const snapshot = {
			nick: "Raiders",
			goal: "playoffs" as const,
			goalPhrase: "make the playoffs",
			week: 6,
			status: "live" as const,
			pct: "41%",
			baseline: 0.41,
			change: { text: "+6 pts", dir: "up" as const, since: "since Week 4" },
			best: { gameId: "g", rootFor: "DEN", against: "LAC", forNick: "Broncos", againstNick: "Chargers", matchup: "Chargers at Broncos", gain: "+4 pts", small: false },
			own: { opp: "Patriots", venue: "vs" as const, win: "+8 pts", loss: "−5 pts" },
			matters: 5,
			headline: "",
			updating: true,
			href: "/lab/rooting-guide?team=LV&goal=playoffs",
		}
		render(<LabBand copy={labCopy("live", 6)} snapshot={snapshot} tools={[]} />)
		expect(screen.getByText("41%")).toBeTruthy()
		expect(screen.getByText("+6 pts")).toBeTruthy()
		expect(screen.getByText("Root for the Broncos")).toBeTruthy()
		expect(screen.getByText("Chargers at Broncos")).toBeTruthy()
		expect(screen.getByText(/A final score is still being worked in/)).toBeTruthy()
		expect((screen.getByRole("link", { name: /See all 5 games that matter/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/lab/rooting-guide?team=LV&goal=playoffs")
		expect(screen.getByRole("img", { name: "41 percent" })).toBeTruthy()
	})
})
