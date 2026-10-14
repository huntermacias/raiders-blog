// @vitest-environment jsdom
import { track } from "@vercel/analytics"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import ShareCard from "../../components/lab/ShareCard"
import CompareBars from "../../components/lab/players/CompareBars"
import CompareControls from "../../components/lab/players/CompareControls"
import CompareHero from "../../components/lab/players/CompareHero"
import ComparePicker from "../../components/lab/players/ComparePicker"
import CompareRadar from "../../components/lab/players/CompareRadar"
import CompareShare from "../../components/lab/players/CompareShare"
import { buildComparison, configQuery, readConfig, type CompareConfig } from "../../lib/lab/compareKit"
import { getPlayers } from "../../lib/lab/data"
import { searchIndex } from "../../lib/lab/playersKit"

type Router = { push: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> }
const router = () => (globalThis as unknown as { __router: Router }).__router

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.mocked(track).mockClear()
})

const data = getPlayers()
const te = data.players.filter((p) => p.group === "te" && p.stats.length >= 4).sort((a, b) => b.games - a.games)
const cfg: CompareConfig = readConfig({ a: te[0].slug, b: te[1].slug })
const c = buildComparison(data, cfg)!

describe("<CompareHero />", () => {
	it("shows both players with their grades and the verdict between them", () => {
		render(<CompareHero data={data} c={c} />)
		const hero = screen.getByTestId("compare-hero")
		expect(within(hero).getByTestId("hero-a").textContent).toContain(c.a.name)
		expect(within(hero).getByTestId("hero-b").textContent).toContain(c.b.name)
		expect(screen.getByTestId("headline").textContent).toBe(c.headline)
		expect(screen.getByTestId("verdict")).toBeTruthy()
		// the higher grade is marked on exactly one side, and only when there is one
		const lead = c.overall.lead
		expect(screen.queryAllByText("Higher grade")).toHaveLength(lead === "a" || lead === "b" ? 1 : 0)
	})

	it("says what a lineman has instead of an overall grade", () => {
		const ol = data.players.filter((p) => p.group === "ol" && p.stats.length >= 2).sort((a, b) => b.games - a.games)
		const o = buildComparison(data, readConfig({ a: ol[0].slug, b: ol[1].slug }))!
		render(<CompareHero data={data} c={o} />)
		expect(screen.getAllByText(/No overall grade for linemen/).length).toBe(2)
	})
})

describe("<CompareBars />", () => {
	it("has a row per stat, marks who leads, and never marks a luck stat as a win", () => {
		render(<CompareBars c={c} colorA="#fff" colorB="#f00" />)
		const rows = screen.getAllByTestId("compare-row")
		expect(rows.length).toBe(c.metrics.filter((m) => m.a.pct !== null || m.b.pct !== null).length)
		for (const [i, m] of Array.from(c.metrics.entries())) {
			expect(rows[i].getAttribute("data-lead")).toBe(m.signal === "luck" ? "luck" : m.lead)
			expect(rows[i].textContent).toContain(m.a.text)
			expect(rows[i].textContent).toContain(m.b.text)
			if (m.signal === "luck") expect(rows[i].textContent).toContain("Mostly luck so far")
		}
	})

	it("opens each row onto the league spread", () => {
		const { container } = render(<CompareBars c={c} colorA="#fff" colorB="#f00" />)
		expect(container.querySelectorAll("details").length).toBe(c.metrics.length)
	})
})

describe("<CompareRadar />", () => {
	const axes = [
		{ key: "a", label: "Alpha", short: "Alpha", a: 90, b: 40 },
		{ key: "b", label: "Beta", short: "Beta", a: 30, b: 80 },
		{ key: "c", label: "Gamma", short: "Gamma", a: 60, b: 60 },
	]
	it("draws a shape per player and gives a screen reader the same numbers as a table", () => {
		const { container } = render(<CompareRadar axes={axes} aName="Ann" bName="Bob" colorA="#fff" colorB="#f00" />)
		expect(container.querySelectorAll("svg polygon.rr-radar-shape")).toHaveLength(2)
		expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/Ann against Bob on 3 stats/)
		const rows = container.querySelectorAll("table tbody tr")
		expect(rows).toHaveLength(3)
		expect(rows[0].textContent).toContain("Alpha")
	})
	it("draws nothing for fewer than three stats", () => {
		const { container } = render(<CompareRadar axes={axes.slice(0, 2)} aName="Ann" bName="Bob" colorA="#fff" colorB="#f00" />)
		expect(container.innerHTML).toBe("")
	})
})

describe("<CompareControls />", () => {
	const ranges = [
		{ id: "season" as const, label: "Season to date", weeks: "Through Week 5" },
		{ id: "form" as const, label: "Last 2 games", weeks: "Weeks 4 and 5" },
		{ id: "earlier" as const, label: "Before that", weeks: "Weeks 1 to 3", disabled: true },
	]
	const options = [
		{ key: "epaTgt", label: "EPA per target", luck: true },
		{ key: "croe", label: "Catches over expected", luck: false },
		{ key: "share", label: "Share of the passes", luck: false },
	]
	const props = { cfg, ranges, options, selected: ["epaTgt", "croe"], defaults: ["epaTgt", "croe"], max: 3 }

	it("links each stretch of games to the same comparison, and greys out one with nothing in it", () => {
		render(<CompareControls {...props} />)
		const links = screen.getAllByRole("link")
		expect(links).toHaveLength(2)
		expect(links[1].getAttribute("href")).toBe(`/lab/players/compare?${configQuery({ ...cfg, range: "form" })}`)
		expect(screen.getByText("Before that").closest("a")).toBeNull()
		expect(links[0].getAttribute("aria-current")).toBe("true")
	})

	it("puts the chosen stats in the address as they are ticked, in the catalog's order", () => {
		render(<CompareControls {...props} />)
		fireEvent.click(screen.getByLabelText(/Share of the passes/))
		expect(router().replace).toHaveBeenCalledTimes(1)
		const url = router().replace.mock.calls[0][0] as string
		expect(url).toContain("m=epaTgt,croe,share")
		expect(vi.mocked(track)).toHaveBeenCalledWith("player_compare_metrics", expect.objectContaining({ count: 3, custom: true }))
	})

	it("stops at the maximum and never lets the last stat be unticked", () => {
		render(<CompareControls {...props} max={2} />)
		expect((screen.getByLabelText(/Share of the passes/) as HTMLInputElement).disabled).toBe(true)
		cleanup()
		render(<CompareControls {...props} selected={["croe"]} />)
		expect((screen.getByLabelText(/Catches over expected/) as HTMLInputElement).disabled).toBe(true)
	})

	it("goes back to a short address when the default stats are restored", () => {
		render(<CompareControls {...props} selected={["croe"]} />)
		fireEvent.click(screen.getByRole("button", { name: /Reset to the default stats/ }))
		const url = router().replace.mock.calls[0][0] as string
		expect(url).not.toContain("m=")
	})
})

describe("<ComparePicker />", () => {
	const index = searchIndex(data)
	it("swaps the two players and opens the swapped comparison, keeping the stretch of games", () => {
		const a = index.find((e) => e.slug === te[0].slug)!
		const b = index.find((e) => e.slug === te[1].slug)!
		render(<ComparePicker index={index} a={a} b={b} range="form" />)
		fireEvent.click(screen.getAllByRole("button", { name: /Swap/ })[0])
		expect(router().push).toHaveBeenCalledWith(`/lab/players/compare?a=${b.slug}&b=${a.slug}&r=form`)
		expect(vi.mocked(track)).toHaveBeenCalledWith("player_compare_swap", { a: a.slug, b: b.slug })
	})
	it("cannot compare until both are chosen", () => {
		render(<ComparePicker index={index} />)
		expect((screen.getByRole("button", { name: "Compare" }) as HTMLButtonElement).disabled).toBe(true)
	})
})

describe("<CompareShare />", () => {
	const query = configQuery(cfg)
	const variants = [
		{ id: "h2h", name: "Head to head", hint: "h", params: "f=h2h" },
		{ id: "radar", name: "Radar", hint: "r", params: "f=radar" },
		{ id: "spot-a", name: "A's case", hint: "s", params: "f=spot&side=a" },
	]
	const props = { query, stamp: 77, text: "A vs B: close.", a: { slug: te[0].slug, name: te[0].name }, b: { slug: te[1].slug, name: te[1].name }, group: "te", variants }

	it("previews the graphic for the exact comparison and switches graphic with the choice", () => {
		render(<CompareShare {...props} />)
		const img = () => screen.getByTestId("compare-share").querySelector("img") as HTMLImageElement
		expect(img().getAttribute("src")).toBe(`/api/og?type=compare&${query}&f=h2h&size=wide&v=77`)
		fireEvent.click(screen.getByRole("button", { name: "Radar" }))
		expect(img().getAttribute("src")).toContain("f=radar")
		expect(screen.getByRole("button", { name: "Radar" }).getAttribute("aria-pressed")).toBe("true")
	})

	it("posts the comparison's own link to X with campaign tracking, and counts it", () => {
		const open = vi.fn()
		vi.stubGlobal("open", open)
		render(<CompareShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: /Post the link on X/ }))
		const u = new URL(open.mock.calls[0][0] as string)
		expect(u.searchParams.get("text")).toBe(props.text)
		const shared = new URL(u.searchParams.get("url") as string)
		expect(shared.origin + shared.pathname).toBe("https://www.raidersrundown.com/lab/players/compare")
		expect(shared.searchParams.get("a")).toBe(te[0].slug)
		expect(shared.searchParams.get("b")).toBe(te[1].slug)
		expect(shared.searchParams.get("utm_campaign")).toBe("compare_share")
		expect(vi.mocked(track)).toHaveBeenCalledWith("player_compare_share", expect.objectContaining({ method: "x", format: "h2h" }))
	})

	it("copies the link to the exact comparison", async () => {
		const writeText = vi.fn(async () => undefined)
		vi.stubGlobal("navigator", { clipboard: { writeText } })
		render(<CompareShare {...props} />)
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /Copy the link/ }))
		})
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`/lab/players/compare?${query}`))
	})

	it("opens the share window on the same graphic, saved at twice the size", () => {
		render(<CompareShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: "Radar" }))
		fireEvent.click(screen.getByRole("button", { name: /Save or share the graphic/ }))
		const dialog = screen.getByRole("dialog")
		expect(within(dialog).getByRole("button", { name: "Radar" }).getAttribute("aria-pressed")).toBe("true")
		const save = within(dialog).getByRole("link", { name: /Save HD image/ })
		expect(save.getAttribute("href")).toContain("f=radar")
		expect(save.getAttribute("href")).toContain("scale=2")
		expect(save.getAttribute("download")).toBe(`raiders-rundown-${te[0].slug}-vs-${te[1].slug}-radar-wide-hd.png`)
	})
})

describe("<ShareCard /> with no variants", () => {
	it("is unchanged for the other cards: no choice of picture, normal size, no scale", () => {
		render(<ShareCard target={{ type: "player", query: "slug=x", sharePath: "/p", name: "X", file: "x" }} stamp={1} text="t" alt="a" sizes={["wide"]} />)
		fireEvent.click(screen.getByRole("button", { name: /Share: X/ }))
		const dialog = screen.getByRole("dialog")
		expect(within(dialog).queryByRole("group", { name: "Which picture" })).toBeNull()
		expect(within(dialog).getByRole("link", { name: /Save image/ }).getAttribute("href")).toBe("/api/og?type=player&slug=x&size=wide&v=1")
	})
})
