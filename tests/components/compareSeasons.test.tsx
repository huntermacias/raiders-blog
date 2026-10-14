// @vitest-environment jsdom
import { track } from "@vercel/analytics"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import CareerTable from "../../components/lab/players/CareerTable"
import CompareBars from "../../components/lab/players/CompareBars"
import CompareHero from "../../components/lab/players/CompareHero"
import ComparePicker from "../../components/lab/players/ComparePicker"
import CompareSeasons from "../../components/lab/players/CompareSeasons"
import { buildComparison, type CompareConfig } from "../../lib/lab/compareKit"
import { getPlayers } from "../../lib/lab/data"
import { getPlayerHistory } from "../../lib/lab/playerHistoryData"
import { searchIndex } from "../../lib/lab/playersKit"
import { careerOf, seasonsOf } from "../../lib/lab/seasonKit"

type Router = { push: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> }
const router = () => (globalThis as unknown as { __router: Router }).__router

afterEach(() => {
	cleanup()
	vi.mocked(track).mockClear()
})

const data = getPlayers()
const history = getPlayerHistory()
const x = data.players.find((p) => p.group === "qb" && seasonsOf(data, history, p.slug, "qb").length >= 4 && p.stats.some((s) => s.season.hn))!
const seasons = seasonsOf(data, history, x.slug, "qb")
const old = seasons[0]
const cfg = (extra: Partial<CompareConfig> = {}): CompareConfig => ({ a: x.slug, b: x.slug, range: "season", metrics: null, group: null, sa: null, sb: null, ...extra })

describe("<CompareSeasons />", () => {
	const side = (shown: number) => ({ name: x.name, seasons, shown })

	it("offers every season both have, links each one, and marks the one shown", () => {
		render(<CompareSeasons cfg={cfg({ sa: old, sb: old })} current={data.season} a={side(old)} b={side(old)} />)
		const nav = screen.getByRole("navigation", { name: "Season" })
		const links = within(nav).getAllByRole("link")
		expect(links.map((l) => l.textContent)).toEqual(seasons.map((s) => (s === data.season ? `${s} so far` : String(s))))
		expect(links[0].getAttribute("aria-current")).toBe("true")
		expect(links[1].getAttribute("href")).toContain(`y=${seasons[1]}`)
		// The current season is no season at all in the address.
		const now = links[links.length - 1]
		expect(now.getAttribute("href")).not.toMatch(/[&?]y[ab]?=/)
	})

	it("lets each man have his own season, and opens that part when they differ", () => {
		const { container } = render(<CompareSeasons cfg={cfg({ sa: old })} current={data.season} a={side(old)} b={side(data.season)} />)
		expect((container.querySelector("details") as HTMLDetailsElement).open).toBe(true)
		const navs = screen.getAllByRole("navigation", { name: `Season for ${x.name}` })
		expect(navs).toHaveLength(2)
		const second = within(navs[1]).getAllByRole("link")
		expect(second[1].getAttribute("href")).toContain(`ya=${old}`)
		expect(second[1].getAttribute("href")).toContain(`yb=${seasons[1]}`)
		expect(within(navs[0]).getAllByRole("link")[0].getAttribute("aria-current")).toBe("true")
		expect(within(navs[1]).getAllByRole("link").pop()!.getAttribute("aria-current")).toBe("true")
	})

	it("is closed when both are in the same season, and says it", () => {
		const { container } = render(<CompareSeasons cfg={cfg()} current={data.season} a={side(data.season)} b={side(data.season)} />)
		expect((container.querySelector("details") as HTMLDetailsElement).open).toBe(false)
		expect(container.textContent).toContain("same for both")
	})

	it("says to analytics which season was picked", () => {
		render(<CompareSeasons cfg={cfg({ sa: old, sb: old })} current={data.season} a={side(old)} b={side(old)} />)
		fireEvent.click(within(screen.getByRole("navigation", { name: "Season" })).getAllByRole("link")[1])
		expect(vi.mocked(track)).toHaveBeenCalledWith("player_compare_season", { a: x.slug, b: x.slug, season: seasons[1], kind: "both" })
	})

	it("is nothing when there is only the current season to choose", () => {
		const { container } = render(<CompareSeasons cfg={cfg()} current={data.season} a={{ name: "A", seasons: [data.season], shown: data.season }} b={{ name: "B", seasons: [data.season], shown: data.season }} />)
		expect(container.innerHTML).toBe("")
	})

	it("has no all-seasons row when the two have no season but this one in common", () => {
		render(<CompareSeasons cfg={cfg()} current={data.season} a={{ name: "A", seasons: [old, data.season], shown: data.season }} b={{ name: "B", seasons: [data.season], shown: data.season }} />)
		expect(screen.queryByRole("navigation", { name: "Season" })).toBeNull()
		expect(screen.getAllByRole("navigation", { name: /Season for/ })).toHaveLength(2)
	})
})

describe("a comparison of a man against himself", () => {
	const c = buildComparison(data, cfg({ sa: old }), history)!

	it("puts the season on each side of the hero", () => {
		render(<CompareHero data={data} c={c} />)
		expect(screen.getByTestId("season-tag-a").textContent).toMatch(new RegExp(`${old} season`, "i"))
		expect(screen.getByTestId("season-tag-b").textContent).toMatch(new RegExp(`${data.season} so far`, "i"))
		expect(screen.getByTestId("hero-a").getAttribute("aria-label")).toContain(String(old))
	})

	it("names the season of each side in the stat rows and opens each onto its own season's league", () => {
		const { container } = render(<CompareBars c={c} colorA="#fff" colorB="#f00" />)
		expect(container.textContent).toContain(`${x.name} (${old})`)
		const first = container.querySelector("details") as HTMLDetailsElement
		expect(first.textContent).toContain(`${old} league`)
		expect(first.textContent).toContain(`${data.season} league`)
	})
})

describe("<ComparePicker /> with seasons", () => {
	const index = searchIndex(data)
	const e = index.find((i) => i.slug === x.slug)!

	it("keeps the seasons when the pair is swapped, each with its man", () => {
		render(<ComparePicker index={index} a={e} b={e} sa={old} sb={null} />)
		fireEvent.click(screen.getAllByRole("button", { name: /Swap/ })[0])
		expect(router().push).toHaveBeenCalledWith(`/lab/players/compare?a=${x.slug}&b=${x.slug}&yb=${old}`)
	})

	it("opens the pair in the same seasons", () => {
		render(<ComparePicker index={index} a={e} b={e} sa={old} sb={old} />)
		fireEvent.submit(screen.getByRole("form", { name: "Choose two players to compare" }))
		expect(router().push).toHaveBeenCalledWith(`/lab/players/compare?a=${x.slug}&b=${x.slug}&y=${old}`)
	})
})

describe("<CareerTable />", () => {
	const row = x
	const career = careerOf(data, history, row)!

	it("has a row for each season, newest first, with the current one marked", () => {
		render(<CareerTable career={career} group={row.group} name={row.name} data={data} usesHistory />)
		const rows = screen.getAllByTestId("career-row")
		expect(rows.map((r) => r.getAttribute("data-season"))).toEqual(career.rows.map((r) => String(r.season)).reverse())
		expect(rows[0].getAttribute("aria-current")).toBe("true")
		expect(rows[0].textContent).toContain(`through Week ${data.week}`)
		expect(screen.getByTestId("career").textContent).toContain("start from the seasons above")
	})

	it("leaves out the note about starting from earlier seasons when none was used, and the link when none is given", () => {
		render(<CareerTable career={career} group={row.group} name={row.name} data={data} usesHistory={false} />)
		expect(screen.getByTestId("career").textContent).not.toContain("start from the seasons above")
		expect(screen.queryByTestId("career-self")).toBeNull()
	})

	it("links to the man against himself", () => {
		render(<CareerTable career={career} group={row.group} name={row.name} data={data} usesHistory selfHref={{ href: "/lab/players/compare?a=x&b=x&ya=2024", season: 2024 }} />)
		const a = screen.getByTestId("career-self")
		expect(a.getAttribute("href")).toBe("/lab/players/compare?a=x&b=x&ya=2024")
		expect(a.textContent).toContain("in 2024 against")
	})
})
