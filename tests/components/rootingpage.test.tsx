// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))

const board = vi.hoisted(() => ({ value: [] as unknown[], fail: false }))
vi.mock("../../lib/live/service", () => ({
	getScoreboard: vi.fn(async () => {
		if (board.fail) throw new Error("ESPN is down")
		return { value: board.value }
	}),
}))

import RootingGuidePage, { generateMetadata } from "../../app/(user)/lab/rooting-guide/page"
import { getGames } from "../../lib/playoffs/data"
import { NFL_LEAGUE } from "../../lib/playoffs/season"
import { teamByAbbr } from "../../lib/nfl"
import { getRooting } from "../../lib/rooting/data"
import { GOALS } from "../../lib/rooting/types"

afterEach(() => {
	cleanup()
	board.value = []
	board.fail = false
})

const TEAMS = NFL_LEAGUE.teams.map((t) => t.id)
const props = (sp: Record<string, string>) => ({ searchParams: Promise.resolve(sp) })
const imageOf = (meta: Awaited<ReturnType<typeof generateMetadata>>) => ((meta.openGraph as { images: string[] }).images ?? [])[0]

describe("the page's metadata, for every team", () => {
	it("has its own title, description, canonical address and card, and the same card for X", async () => {
		const titles = new Set<string>()
		const descriptions = new Set<string>()
		for (const team of TEAMS) {
			const meta = await generateMetadata(props({ team }))
			const nick = teamByAbbr(team).nick
			expect(meta.title, team).toContain(`${nick} Sunday Rooting Guide`)
			expect(meta.title).toContain("Raiders Rundown")
			titles.add(String(meta.title))
			descriptions.add(String(meta.description))
			expect(meta.alternates?.canonical).toBe(team === "LV" ? "https://www.raidersrundown.com/lab/rooting-guide" : `https://www.raidersrundown.com/lab/rooting-guide?team=${team}`)
			const image = imageOf(meta)
			expect(image).toMatch(new RegExp(`^https://www\\.raidersrundown\\.com/api/og\\?type=rooting&team=${team}&goal=playoffs&week=\\d+&size=wide&v=\\d+$`))
			expect((meta.twitter as { card: string; images: string[] }).card).toBe("summary_large_image")
			expect((meta.twitter as { images: string[] }).images[0]).toBe(image)
			expect(String(meta.description).length).toBeGreaterThan(60)
		}
		expect(titles.size).toBe(32)
		expect(descriptions.size).toBe(32)
	})

	it("names the goal in the card and keeps the canonical page the same for every goal and week", async () => {
		for (const goal of GOALS) {
			const meta = await generateMetadata(props({ team: "KC", goal, week: "3" }))
			expect(imageOf(meta)).toContain(`goal=${goal}`)
			expect(meta.alternates?.canonical).toBe("https://www.raidersrundown.com/lab/rooting-guide?team=KC")
		}
	})

	it("says what matters most in the description, in points and not percent growth", async () => {
		const meta = await generateMetadata(props({ team: "LV", goal: "playoffs" }))
		expect(String(meta.description)).toMatch(/chance to make the playoffs is \d+%|<1%|>99%/)
		expect(String(meta.description)).toMatch(/\+\d+ pts/)
	})

	it("falls back to a true page for a bad team or goal", async () => {
		const meta = await generateMetadata(props({ team: "ZZZ", goal: "nope", week: "x" }))
		expect(meta.title).toContain("Raiders Sunday Rooting Guide")
		expect(imageOf(meta)).toContain("team=LV&goal=playoffs")
	})
})

describe("the page, rendered on the server", () => {
	it("explains itself in the HTML, with links to the Playoff Machine and the team page", async () => {
		render(await RootingGuidePage(props({ team: "LV" })))
		expect(screen.getByRole("heading", { level: 1, name: "Sunday Rooting Guide" })).toBeTruthy()
		expect(screen.getByRole("heading", { name: /How the Sunday Rooting Guide works/ })).toBeTruthy()
		expect(screen.getByRole("heading", { name: /What it does not know/ })).toBeTruthy()
		const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"))
		expect(hrefs.some((h) => h?.startsWith("/lab/playoff-machine"))).toBe(true)
		expect(hrefs).toContain("/lab/teams?team=LV")
		expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain("Sunday Rooting Guide")
	})

	it("lists the ranked games with a root-for call for any team", async () => {
		render(await RootingGuidePage(props({ team: "KC", goal: "bye", scope: "all" })))
		expect(screen.getByRole("heading", { level: 2, name: /All remaining games: who to root for/ })).toBeTruthy()
		expect(screen.getAllByLabelText(/^Root for the /).length).toBeGreaterThan(0)
		expect(screen.getByLabelText("Team to follow")).toHaveProperty("value", "KC")
	})

	it("renders every team and goal without throwing", async () => {
		for (const team of TEAMS) {
			for (const goal of GOALS) {
				const { unmount } = render(await RootingGuidePage(props({ team, goal })))
				expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
				unmount()
			}
		}
	}, 60_000)

	it("takes a game off the list when ESPN says it has ended, and says so", async () => {
		const data = getRooting()!
		const open = data.games[0]
		board.value = [{ state: "post", home: { abbr: open.home, score: 30, name: "" }, away: { abbr: open.away, score: 13, name: "" } }]
		render(await RootingGuidePage(props({ team: open.home, scope: "all" })))
		expect(screen.getByRole("heading", { name: "Just finished" })).toBeTruthy()
		expect(screen.getByText(new RegExp(`${open.away} 13, ${open.home} 30`))).toBeTruthy()
		expect(screen.getAllByRole("status").some((n) => /just ended/.test(n.textContent ?? ""))).toBe(true)
	})

	it("still works when ESPN does not answer", async () => {
		board.fail = true
		render(await RootingGuidePage(props({ team: "LV" })))
		expect(screen.getByRole("heading", { level: 1 })).toBeTruthy()
		expect(screen.queryByRole("heading", { name: "Just finished" })).toBeNull()
	})

	it("tells the reader when the link was made for another week", async () => {
		render(await RootingGuidePage(props({ team: "LV", week: "2" })))
		expect(screen.getAllByRole("status").some((n) => /made for Week 2/.test(n.textContent ?? ""))).toBe(true)
	})

	it("uses the schedule the Playoff Machine uses", () => {
		expect(getGames().length).toBe(getRooting()!.finals + getRooting()!.open)
	})
})
