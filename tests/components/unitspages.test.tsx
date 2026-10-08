// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))
vi.mock("next/navigation", async (orig) => ({
	...(await orig<typeof import("next/navigation")>()),
	useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }),
	usePathname: () => "/",
	notFound: () => {
		throw new Error("NEXT_NOT_FOUND")
	},
	permanentRedirect: (to: string) => {
		throw new Error(`NEXT_REDIRECT:${to}`)
	},
}))

import MatchupPage, { generateMetadata as matchupMeta, generateStaticParams } from "../../app/(user)/lab/matchup/[pair]/page"
import MatchupsPage, { generateMetadata as slateMeta } from "../../app/(user)/lab/matchups/page"
import TeamsPage, { metadata as teamsMeta } from "../../app/(user)/lab/teams/page"
import ScoutPage from "../../app/(user)/lab/scouting/[abbr]/page"
import LabHub from "../../app/(user)/lab/page"
import MatchupReport from "../../components/lab/MatchupReport"
import TeamBoard from "../../components/lab/TeamBoard"
import { getUnits } from "../../lib/lab/data"
import { boardRows } from "../../lib/lab/unitsKit"
import { pairTheme } from "../../lib/lab/unitsTheme"
import { TEAMS } from "../../lib/nfl"

afterEach(cleanup)
const data = getUnits()
const props = (pair: string) => ({ params: Promise.resolve({ pair }) })

describe("the team board", () => {
	it("lists every team once, with a rank in each position group", () => {
		render(<TeamsPage />)
		expect(screen.getByRole("heading", { level: 1, name: "How every team stacks up" })).toBeTruthy()
		const rows = screen.getAllByRole("row").slice(1)
		expect(rows).toHaveLength(32)
		for (const r of rows) expect(within(r).getAllByRole("cell").length).toBe(11)
		expect(document.body.textContent).toMatch(/Week \d+ matchups/)
		expect(String(teamsMeta.title)).toMatch(/32 teams/)
		expect(document.body.textContent).toMatch(/Pro Football Reference/)
	})

	it("sorts by a column, best first, and filters by division", () => {
		const rows = boardRows(data)
		const teams = TEAMS.map((t) => ({ abbr: t.abbr, nick: t.nick, name: t.name, division: t.division, conference: t.conference, color: t.color }))
		render(<TeamBoard rows={rows} teams={teams} n={32} />)
		const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("rowheader")[0].textContent)
		const bestAtCoverage = TEAMS.find((t) => t.abbr === Object.entries(data.teams).find(([, v]) => v.groups.cov.rank === 1)![0])!.nick
		fireEvent.click(screen.getByRole("button", { name: /CB\/S/ }))
		expect(names()[0]).toBe(bestAtCoverage)
		fireEvent.change(screen.getByLabelText("Show"), { target: { value: "AFC West" } })
		expect(names()).toHaveLength(4)
		expect(names()).toContain("Raiders")
		fireEvent.change(screen.getByLabelText("Show"), { target: { value: "NFC" } })
		expect(names()).toHaveLength(16)
	})

	it("links two chosen teams to their matchup, Raiders first", () => {
		const teams = TEAMS.map((t) => ({ abbr: t.abbr, nick: t.nick, name: t.name, division: t.division, conference: t.conference, color: t.color }))
		render(<TeamBoard rows={boardRows(data)} teams={teams} n={32} />)
		expect(screen.queryByRole("link", { name: /See the matchup/ })).toBeNull()
		fireEvent.change(screen.getByLabelText("with"), { target: { value: "NE" } })
		expect(screen.getByRole("link", { name: /See the matchup/ }).getAttribute("href")).toBe("/lab/matchup/lv-vs-ne")
		fireEvent.change(screen.getByLabelText("Compare"), { target: { value: "NE" } })
		expect(screen.queryByRole("link", { name: /See the matchup/ })).toBeNull()
	})

	it("links each team's row to its matchup with the Raiders, and the Raiders row to nothing", () => {
		const teams = TEAMS.map((t) => ({ abbr: t.abbr, nick: t.nick, name: t.name, division: t.division, conference: t.conference, color: t.color }))
		render(<TeamBoard rows={boardRows(data)} teams={teams} n={32} />)
		const row = (nick: string) => screen.getAllByRole("row").find((r) => within(r).queryAllByRole("rowheader")[0]?.textContent === nick)!
		expect(within(row("Patriots")).getByRole("link").getAttribute("href")).toBe("/lab/matchup/lv-vs-ne")
		expect(within(row("Raiders")).queryByRole("link")).toBeNull()
	})
})

describe("a matchup page", () => {
	it("builds every Raiders pairing and every game on the slate ahead of time", () => {
		const params = generateStaticParams().map((p) => p.pair)
		expect(params).toContain("lv-vs-ne")
		expect(params.filter((p) => p.startsWith("lv-vs-"))).toHaveLength(31)
		for (const g of data.slate!.games) expect(params.some((p) => p.includes(g.home.toLowerCase()) && p.includes(g.away.toLowerCase()))).toBe(true)
		expect(new Set(params).size).toBe(params.length)
	})

	it("shows the game, the eight pairings, the coaches, the style and the injuries", async () => {
		render(await MatchupPage(props("lv-vs-ne")))
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Raiders vs Patriots: position-group matchup")
		for (const h of ["On paper", "Position group by position group", "Tale of the tape", "The coaches", "How each team plays", "Who is missing"]) expect(screen.getByRole("heading", { name: h })).toBeTruthy()
		expect(document.body.textContent).toMatch(/Week \d+: Raiders at Patriots/)
		expect(document.body.textContent).toMatch(/Patriots favored by/)
		expect(document.body.textContent).toContain("Klint Kubiak")
		expect(document.body.textContent).toContain("Mike Vrabel")
		expect(screen.getAllByText(/Raiders big edge|Raiders edge|Patriots big edge|Patriots edge|^Even$/).length).toBeGreaterThanOrEqual(8)
		expect(document.querySelectorAll("details").length).toBe(8)
		expect(document.body.textContent).toMatch(/Pro Football Reference/)
		expect(screen.getByRole("button", { name: /Share/ })).toBeTruthy()
	})

	it("sends a link with the teams the other way round to the one address", async () => {
		await expect(MatchupPage(props("ne-vs-lv"))).rejects.toThrow("NEXT_REDIRECT:/lab/matchup/lv-vs-ne")
		await expect(MatchupPage(props("ne-vs-kc"))).rejects.toThrow("NEXT_REDIRECT:/lab/matchup/kc-vs-ne")
	})

	it("404s a pair that is not two different teams", async () => {
		for (const bad of ["lv-vs-lv", "lv-vs-zz", "lv", "lv-vs-ne-vs-kc", "../etc"]) await expect(MatchupPage(props(bad))).rejects.toThrow("NEXT_NOT_FOUND")
	})

	it("has metadata with the card and one canonical address", async () => {
		const meta = await matchupMeta(props("lv-vs-ne"))
		expect(meta.alternates?.canonical).toBe("https://www.raidersrundown.com/lab/matchup/lv-vs-ne")
		expect(String(meta.title)).toContain("Raiders vs Patriots")
		expect(JSON.stringify(meta.openGraph?.images)).toContain("/api/og?type=matchup&a=LV&b=NE")
		expect(String((await matchupMeta(props("ne-vs-lv"))).alternates?.canonical)).toBe("https://www.raidersrundown.com/lab/matchup/lv-vs-ne")
		expect(String((await matchupMeta(props("nope"))).title)).toContain("Lab")
	})

	it("says when the injury report is older than the game", async () => {
		render(await MatchupPage(props("lv-vs-ne")))
		const older = data.teams.LV.injuries.week! < data.slate!.week
		expect(document.body.textContent?.includes("the Week " + data.slate!.week + " report is not out yet")).toBe(older)
	})
})

describe("the slate", () => {
	it("has a card for every game, the Raiders' first, each linking to its matchup", () => {
		render(<MatchupsPage />)
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(`Week ${data.slate!.week} matchups`)
		const cards = screen.getAllByRole("listitem").filter((li) => li.querySelector("h3"))
		expect(cards).toHaveLength(data.slate!.games.length)
		expect(cards[0].textContent).toContain("Raiders")
		const hrefs = screen.getAllByRole("link", { name: /Full matchup/ }).map((a) => a.getAttribute("href"))
		expect(hrefs[0]).toMatch(/^\/lab\/matchup\/lv-vs-/)
		expect(new Set(hrefs).size).toBe(hrefs.length)
		expect(String(slateMeta().title)).toContain(`Week ${data.slate!.week}`)
	})
})

describe("the scouting report for a team", () => {
	it("adds the position-group comparison and links to the whole matchup", async () => {
		render(await ScoutPage({ params: Promise.resolve({ abbr: "ne" }) }))
		expect(screen.getByRole("heading", { name: "Tale of the tape" })).toBeTruthy()
		expect(screen.getByRole("heading", { name: "On paper" })).toBeTruthy()
		expect(screen.queryByRole("heading", { name: "The coaches" })).toBeNull()
		expect(screen.getByRole("link", { name: /All eight pairings/ }).getAttribute("href")).toBe("/lab/matchup/lv-vs-ne")
	})
})

describe("the report on its own", () => {
	it("renders nothing for a team with no table", () => {
		const { container } = render(<MatchupReport a="LV" b="ZZ" theme={pairTheme("LV", "NE")} />)
		expect(container.innerHTML).toBe("")
	})
	it("colors two teams that are not the Raiders with the two opponent colors", () => {
		const t = pairTheme("KC", "BUF")
		expect(t.className).toContain("lab-opp2")
		expect(t.color.KC).toBe("var(--lab-opp)")
		expect(t.color.BUF).toBe("var(--lab-opp2)")
		expect(pairTheme("NE", "LV").color.LV).toBe("var(--lab-team)")
	})
})

describe("the Lab hub", () => {
	it("links to the board and the slate", () => {
		render(<LabHub />)
		expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(expect.arrayContaining(["/lab/teams", "/lab/matchups"]))
	})
})
