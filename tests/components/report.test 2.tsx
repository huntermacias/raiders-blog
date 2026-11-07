// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

afterEach(cleanup)

import Glance, { glanceTiles } from "@/components/report/Glance"
import ReportHero from "@/components/report/ReportHero"
import ReportNav from "@/components/report/ReportNav"
import Recap from "@/components/report/Recap"
import ReportShare from "@/components/report/ReportShare"
import { placeText } from "@/components/report/NumbersSection"
import { getGames, getPlayers } from "@/lib/lab/data"
import { composeReport } from "@/lib/report/build"
import { buildRoster } from "@/lib/report/players"

const games = getGames()
const wk7 = games.find((g) => g.week === 7)!
const roster = buildRoster(getPlayers().players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, slug: p.slug, team: p.team, espn: p.espn, shot: p.shot })))
const body = [
	{ _type: "block", _key: "p1", style: "normal", markDefs: [], children: [{ _type: "span", _key: "s1", marks: [], text: "Opening paragraph." }] },
	{ _type: "block", _key: "h1", style: "h2", markDefs: [], children: [{ _type: "span", _key: "s2", marks: [], text: "The Final Word" }] },
	{ _type: "block", _key: "p2", style: "normal", markDefs: [], children: [{ _type: "span", _key: "s3", marks: [], text: "Closing paragraph." }] },
]
const input = { _id: "r7", title: "Rams 35, Raiders 21: The Film Is Worse Than the Score", description: "Four straight losses.", opponent: "Los Angeles Rams", homeAway: "home" as const, gameDate: "2026-10-26T01:25:00Z", raidersScore: 35, opponentScore: 21, body }
const view = composeReport("week-7-game-report", input, wk7, games, null, roster)
const bare = composeReport("week-9-game-report", input, null, games, null, roster)

const hero = (v: typeof view) => render(<ReportHero view={v} imageUrl="/x.jpg" imagePosition="50% 50%" author="Hunter Macias" published="Oct 25, 2026" minutes={6} actions={<button>Share</button>} homeAway="home" />)

describe("ReportHero", () => {
	it("shows the real score and calls it a loss, whatever the Studio fields say", () => {
		hero(view)
		expect(screen.getByRole("group", { name: /Final score: Rams 35, Raiders 21/ })).toBeTruthy()
		expect(screen.getByText("Loss")).toBeTruthy()
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(input.title)
		expect(screen.getByText(/6 min read/)).toBeTruthy()
		expect(screen.getByRole("table", { name: "Score by quarter" })).toBeTruthy()
	})
	it("puts the away team on the left", () => {
		const { container } = hero(view)
		const text = container.querySelector('[role="group"]')!.textContent!
		expect(text.indexOf("Rams")).toBeLessThan(text.indexOf("Raiders"))
	})
	it("has no quarter table without the Lab or the box score", () => {
		hero(bare)
		expect(screen.queryByRole("table")).toBeNull()
	})
})

describe("Glance", () => {
	it("is four tiles for a game the Lab has, none for one it has not", () => {
		expect(glanceTiles(view)).toHaveLength(4)
		expect(glanceTiles(bare)).toEqual([])
		const { container } = render(<Glance view={bare} />)
		expect(container.textContent).toBe("")
	})
	it("starts with how the half went", () => {
		const first = glanceTiles(view)[0]
		expect(first.label).toBe("At the half")
		expect(first.value).toMatch(/^\d+–\d+$/)
	})
})

describe("ReportNav", () => {
	it("is a plain list of anchors, the first marked as current", () => {
		render(<ReportNav sections={[{ id: "recap", label: "Recap" }, { id: "numbers", label: "The numbers" }]} progressFor="recap" />)
		const links = screen.getAllByRole("link")
		expect(links.map((l) => l.getAttribute("href"))).toEqual(["#recap", "#numbers"])
		expect(links[0].getAttribute("aria-current")).toBe("true")
		expect(links[1].getAttribute("aria-current")).toBeNull()
	})
})

describe("Recap", () => {
	it("gives each heading its anchor and keeps the writing", () => {
		const { container } = render(<Recap body={body} headings={view.headings} />)
		expect(container.querySelector("#the-final-word")).toBeTruthy()
		expect(screen.getByText("Opening paragraph.")).toBeTruthy()
		expect(screen.getByText("Closing paragraph.")).toBeTruthy()
	})
})

describe("ReportShare", () => {
	it("draws the report's own cards in two sizes and links back to the section", () => {
		render(<ReportShare slug="week-7-game-report" kind="stats" stamp={1} text="t" alt="Numbers card" label="Share these numbers" />)
		expect(screen.getByRole("button", { name: /Share these numbers/ })).toBeTruthy()
	})
})

describe("placeText", () => {
	it("says where a game sits in the season, in words", () => {
		expect(placeText(null)).toBeNull()
		expect(placeText({ place: 1, of: 7 })).toMatch(/best of 7/)
		expect(placeText({ place: 7, of: 7 })).toMatch(/worst of 7/)
		expect(placeText({ place: 3, of: 7 })).toMatch(/3rd-best of 7/)
	})
})
