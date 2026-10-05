// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import ClipPanel from "../../components/lab/ClipPanel"
import FourthDownReport from "../../components/lab/FourthDownReport"
import ScoutReport from "../../components/lab/ScoutReport"
import TopPlays from "../../components/lab/TopPlays"
import { clipFor, sizeText, type GameClip } from "../../lib/lab/clips"
import { getFourthDown, getGames } from "../../lib/lab/data"
import { fourthGameFor } from "../../lib/lab/fourthDown"
import { seasonTopPlays, topPlaysFor } from "../../lib/lab/topPlays"

afterEach(cleanup)
const games = getGames()

describe("<TopPlays />", () => {
	it("lists the plays in rank order with who each one helped, and a card for the first", () => {
		const plays = topPlaysFor(games[2], "LV", 5)
		render(<TopPlays plays={plays} scope="week-3" stamp={123} />)
		const items = screen.getAllByRole("listitem")
		expect(items).toHaveLength(5)
		expect(within(items[0]).getByText("1")).toBeTruthy()
		expect(screen.getAllByText(/^[+−]\d+ pts/).length).toBe(5)
		const img = screen.getByRole("img", { name: /of win probability for the/ }) as HTMLImageElement
		expect(img.getAttribute("src")).toBe("/api/og?type=lab&slug=week-3&view=play&rank=1&v=123")
		expect(screen.getAllByRole("link", { name: /Share card for this play/ })[1].getAttribute("href")).toContain("rank=2")
	})

	it("says in words how the chance to win moved, so the bar is not the only cue", () => {
		const plays = topPlaysFor(games[0], "LV", 1)
		render(<TopPlays plays={plays} scope="week-1" stamp={1} card={false} />)
		expect(screen.getByRole("img", { name: /chance to win went from \d+% to \d+%/ })).toBeTruthy()
	})

	it("links each season play to its game", () => {
		render(<TopPlays plays={seasonTopPlays(games, "LV", 3)} scope="season" stamp={1} linkGames />)
		expect(screen.getAllByRole("link", { name: /Week \d vs / })).toHaveLength(3)
	})

	it("renders nothing without plays", () => {
		const { container } = render(<TopPlays plays={[]} scope="week-1" stamp={1} />)
		expect(container.textContent).toBe("")
	})
})

describe("<FourthDownReport />", () => {
	it("shows every decision with a verdict in words, the estimate caveat and a card", () => {
		const fg = fourthGameFor(2)!
		render(<FourthDownReport game={fg} scope="week-2" stamp={9} />)
		expect(screen.getAllByRole("listitem")).toHaveLength(fg.decisions.length)
		expect(screen.getAllByText(/Best call|Toss-up|Questionable|Costly|Not graded/).length).toBeGreaterThanOrEqual(fg.decisions.length)
		expect(screen.getByText(/These are estimates/)).toBeTruthy()
		expect((screen.getByRole("img", { name: /Fourth-down report/ }) as HTMLImageElement).getAttribute("src")).toBe("/api/og?type=lab&slug=week-2&view=fourth&v=9")
	})

	it("makes clear the counts are the Raiders' own fourth downs, and how many could be judged", () => {
		const fg = fourthGameFor(3)!
		render(<FourthDownReport game={fg} scope="week-3" stamp={1} />)
		expect(screen.getByText("Raiders' 4th downs")).toBeTruthy()
		expect(screen.getByText(`${fg.summary.graded} of ${fg.summary.decisions}`)).toBeTruthy()
		expect(screen.queryByText("Fourth downs")).toBeNull()
	})

	it("shows what each option was worth and which one was chosen", () => {
		const fg = getFourthDown().games.find((g) => g.decisions.some((d) => d.verdict === "questionable"))!
		render(<FourthDownReport game={fg} scope="x" stamp={1} />)
		expect(screen.getAllByText(/\(chosen\)/).length).toBeGreaterThan(0)
		expect(screen.getAllByText(/similar$/).length).toBeGreaterThan(0)
	})
})

describe("<ScoutReport />", () => {
	it("gives the watch list, both matchup blocks and a card for an opponent", () => {
		render(<ScoutReport abbr="KC" stamp={5} week={5} />)
		expect(screen.getByText(/Raiders offense vs Chiefs defense/)).toBeTruthy()
		expect(screen.getByText(/Chiefs offense vs Raiders defense/)).toBeTruthy()
		expect((screen.getByRole("img", { name: /Scouting report: Raiders vs Chiefs/ }) as HTMLImageElement).getAttribute("src")).toBe("/api/og?type=scout&opp=KC&week=5&v=5")
		expect(screen.getByText(/1st is always best/)).toBeTruthy()
	})

	it("is brief on the hub and links to the full report", () => {
		render(<ScoutReport abbr="DEN" stamp={5} compact />)
		expect(screen.getByRole("link", { name: /Full Broncos report/ }).getAttribute("href")).toBe("/lab/scouting/den")
		expect(screen.queryByText(/Raiders offense vs/)).toBeNull()
	})

	it("renders nothing for a team with no numbers", () => {
		const { container } = render(<ScoutReport abbr="ZZZ" stamp={1} />)
		expect(container.textContent).toBe("")
	})
})

describe("<ClipPanel />", () => {
	const clip: GameClip = {
		week: 4, hash: "x", seconds: 13.4,
		files: { landscape: "/lab/clips/week-4-landscape.mp4", vertical: "/lab/clips/week-4-vertical.mp4", square: "/lab/clips/week-4-square.mp4", gif: "/lab/clips/week-4.gif", poster: "/lab/clips/week-4-poster.jpg" },
		bytes: { landscape: 186831, vertical: 213503, square: 151390, gif: 1_300_000, poster: 62174 },
	}

	it("plays the landscape clip and offers every size to save, with its size", () => {
		const { container } = render(<ClipPanel clip={clip} title="Week 4" />)
		const video = container.querySelector("video")!
		expect(video.getAttribute("poster")).toBe(clip.files.poster)
		expect(video.querySelector("source")!.getAttribute("src")).toBe(clip.files.landscape)
		expect(video.getAttribute("aria-label")).toMatch(/13 seconds/)
		const links = screen.getAllByRole("link")
		expect(links.map((l) => l.getAttribute("href"))).toEqual([clip.files.landscape, clip.files.vertical, clip.files.square, clip.files.gif])
		expect(links.every((l) => l.hasAttribute("download"))).toBe(true)
		expect(screen.getByText("187 KB")).toBeTruthy()
		expect(screen.getByText("1.3 MB")).toBeTruthy()
		expect(screen.getByText(/Reels, TikTok/)).toBeTruthy()
	})

	it("formats sizes and finds a game's clip only when the manifest lists it", () => {
		expect(sizeText(0)).toBe("")
		expect(sizeText(500)).toBe("1 KB")
		expect(clipFor(9999)).toBeNull()
	})
})
