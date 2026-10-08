// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/lab/shield", () => ({ raidersLogo: null, RAIDERS_LOGO: "/raiders-shield.png", hasRaidersLogo: () => false }))
vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))

import SeasonTwinsPage, { generateMetadata } from "../../app/(user)/lab/season-twins/page"
import LabHub from "../../app/(user)/lab/page"
import SeasonTwins from "../../components/lab/SeasonTwins"
import ShareLanding, { generateMetadata as shareMetadata } from "../../app/(user)/lab/season-twins/share/page"
import { getTwinsView } from "../../lib/lab/twins"
import { findTwins } from "../../lib/lab/twinsKit"
import { fakeSeasons } from "../helpers/twinsFake"

const view = getTwinsView()!

function reducedMotion(on: boolean) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: (q: string) => ({ matches: on && /reduce/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
	})
}

const mount = () => render(<SeasonTwins modes={view.modes} season={view.season} n={view.n} first={view.first} last={view.last} start={view.start} stamp={view.stamp} />)

beforeEach(() => reducedMotion(true))
afterEach(cleanup)

const statRows = () => within(screen.getByRole("heading", { name: "Stat by stat" }).closest("section")!).getAllByRole("listitem")
const shapes = () => Array.from(document.querySelectorAll("svg[role=img] polygon")).map((p) => p.getAttribute("points"))

describe("Season twins page", () => {
	it("names the closest team in the introduction and lists them closest first", () => {
		render(<SeasonTwinsPage />)
		expect(screen.getByRole("heading", { level: 1, name: "Season twins" })).toBeTruthy()
		const top = view.modes.all!.result.twins[0]
		expect(document.body.textContent).toContain(`Right now it is the ${top.label}`)
		const list = within(screen.getByRole("heading", { name: "Closest team-seasons" }).parentElement!).getAllByRole("listitem")
		expect(list.length).toBeGreaterThanOrEqual(5)
		expect(list[0].textContent).toContain(top.label)
		expect(list[0].textContent).toMatch(/Closer than \d+(\.\d)?% of all team-seasons/)
	})

	it("has metadata and credits the data", () => {
		const meta = generateMetadata()
		expect(String(meta.title)).toContain("Season twins")
		expect(meta.alternates?.canonical).toBe("https://www.raidersrundown.com/lab/season-twins")
		render(<SeasonTwinsPage />)
		expect(document.body.textContent).toContain("nflverse")
		expect(document.body.textContent).toContain("CC BY 4.0")
	})

	it("is linked from the Lab", () => {
		render(<LabHub />)
		expect(document.querySelector('a[href="/lab/season-twins"]')).toBeTruthy()
	})
})

describe("Season twins chart", () => {
	it("draws the Raiders and the chosen twin on one spoke per stat, with a summary for screen readers", () => {
		mount()
		const svg = document.querySelector("svg[role=img]")!
		expect(svg.getAttribute("aria-label")).toMatch(/Radar chart of 18 stats/)
		expect(svg.querySelectorAll("line")).toHaveLength(18)
		expect(shapes().length).toBe(6)
	})

	it("moves the twin's shape and its story when another team is picked", () => {
		mount()
		const before = shapes()
		const story = () => screen.getByText(/started \d+-\d+/, { selector: "p" }).textContent
		const first = story()
		const buttons = screen.getAllByRole("button", { pressed: false }).filter((b) => /Closer than/.test(b.textContent ?? ""))
		fireEvent.click(buttons[0])
		expect(story()).not.toBe(first)
		expect(shapes()[4]).not.toBe(before[4])
		expect(shapes()[5]).toBe(before[5])
		expect(screen.getByRole("heading", { level: 2, name: /^The \d{4} Raiders and the \d{4} / }).textContent).toContain(view.modes.all!.result.twins[1].label)
	})

	it("switches to offense only or defense only, with half the spokes and a new set of twins", () => {
		mount()
		expect(statRows()).toHaveLength(18)
		fireEvent.click(screen.getByRole("button", { name: /Offense only/ }))
		expect(statRows()).toHaveLength(9)
		expect(document.querySelectorAll("svg[role=img] line")).toHaveLength(9)
		const off = view.modes.off!.result.twins[0].label
		expect(screen.getAllByRole("listitem")[0].textContent).toContain(off)
		fireEvent.click(screen.getByRole("button", { name: /Defense only/ }))
		expect(statRows()).toHaveLength(9)
		fireEvent.click(screen.getByRole("button", { name: /The whole team/ }))
		expect(statRows()).toHaveLength(18)
	})

	it("orders the stats by closest match when asked, and back again", () => {
		mount()
		const names = () => statRows().map((r) => r.querySelector("span")!.textContent)
		const original = names()
		fireEvent.click(screen.getByRole("button", { name: "Closest match first" }))
		const sorted = names()
		expect([...sorted].sort()).toEqual([...original].sort())
		expect(sorted).not.toEqual(original)
		fireEvent.click(screen.getByRole("button", { name: "Offense, then defense" }))
		expect(names()).toEqual(original)
	})

	it("shows every stat's number for the Raiders and the twin, and never a broken one", () => {
		mount()
		const text = document.body.textContent ?? ""
		expect(text).not.toMatch(/NaN|undefined|Infinity|null/)
		for (const row of statRows()) expect(row.textContent).toMatch(/percentile/)
	})

	it("says how far to trust the match, in numbers from the backtest", () => {
		mount()
		expect(document.body.textContent).toMatch(/We tested this on all \d+ team-seasons since \d{4}/)
		expect(document.body.textContent).toMatch(/percentage points/)
		expect(document.body.textContent).toContain("not a prediction")
	})

	it("offers the closest Raiders team when it is not among the five", () => {
		const { meta, tables } = fakeSeasons(240, { twin: 17 })
		const all = findTwins(meta, tables)!
		const modes = { all: { result: all, test: null }, off: { result: findTwins(meta, tables, "off")!, test: null }, def: { result: findTwins(meta, tables, "def")!, test: null } }
		render(<SeasonTwins modes={modes} season={2026} n={4} first={1999} last={2024} start={{ wins: 3, losses: 1 }} />)
		expect(document.body.textContent).toContain("3-1")
		expect(document.body.textContent).not.toContain("We tested this")
		const own = all.raidersTwin!
		if (!all.twins.some((t) => t.i === own.i)) {
			fireEvent.click(screen.getByRole("button", { name: /Show the closest Raiders team/ }))
			expect(screen.getByRole("heading", { level: 2, name: new RegExp(own.label) })).toBeTruthy()
		}
	})

	it("grows the shapes in with a short animation unless the reader asked for less motion", async () => {
		reducedMotion(false)
		vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] })
		mount()
		const start = shapes()[5]
		await act(async () => {
			vi.advanceTimersByTime(900)
		})
		expect(shapes()[5]).not.toBe(start)
		vi.useRealTimers()
	})
})

describe("Season twins sharing", () => {
	afterEach(() => window.history.replaceState(null, "", "/"))

	it("has a Share button that opens a window with the card, both sizes, and a link back to the same twin", () => {
		mount()
		fireEvent.click(screen.getByRole("button", { name: "Share: Season twins" }))
		const dialog = screen.getByRole("dialog")
		const img = dialog.querySelector("img")!
		expect(img.getAttribute("src")).toMatch(/^\/api\/og\?type=twins&twin=\d{4}-[A-Z]{2,3}&size=wide&v=\d+$/)
		fireEvent.click(within(dialog).getByRole("button", { name: /Tall/ }))
		expect(dialog.querySelector("img")!.getAttribute("src")).toContain("&size=tall")
		const save = within(dialog).getByRole("link", { name: /Save image/ })
		expect(save.getAttribute("download")).toMatch(/^raiders-season-twins-\d{4}-[a-z]{2,3}-tall\.png$/)
	})

	it("puts the match and the twin in the card and the file name as they change", () => {
		mount()
		fireEvent.click(screen.getByRole("button", { name: /Offense only/ }))
		fireEvent.click(screen.getByRole("button", { name: "Share: Season twins" }))
		expect(screen.getByRole("dialog").querySelector("img")!.getAttribute("src")).toContain("mode=off")
	})

	it("copies a link to the share page that carries the same view", async () => {
		const writeText = vi.fn(async () => {})
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
		mount()
		fireEvent.click(screen.getByRole("button", { name: "Share: Season twins" }))
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /Copy link/ }))
		})
		expect(writeText).toHaveBeenCalledTimes(1)
		expect(String(writeText.mock.calls[0]?.[0 as never])).toMatch(/\/lab\/season-twins\/share\?twin=\d{4}-[A-Z]{2,3}$/)
	})

	it("opens on the match and twin a shared link names", () => {
		const off = view.modes.off!.result.twins[2]
		window.history.replaceState(null, "", `/lab/season-twins?mode=off&twin=${off.row.replace(" ", "-")}`)
		mount()
		expect(screen.getByRole("button", { name: /Offense only/ }).getAttribute("aria-pressed")).toBe("true")
		expect(screen.getByRole("heading", { level: 2, name: /^The \d{4} Raiders and the / }).textContent).toContain(off.label)
	})

	it("ignores a link that names a team that is not there", () => {
		window.history.replaceState(null, "", "/lab/season-twins?mode=net&twin=1850-ZZZ")
		mount()
		expect(screen.getByRole("button", { name: /The whole team/ }).getAttribute("aria-pressed")).toBe("true")
		expect(screen.getByRole("heading", { level: 2, name: /^The \d{4} Raiders and the / }).textContent).toContain(view.modes.all!.result.twins[0].label)
	})

	it("lands a shared link on a page that carries the card and sends the reader on", async () => {
		const props = { searchParams: Promise.resolve({ mode: "def", twin: view.modes.def!.result.twins[1].row.replace(" ", "-"), size: "tall" }) }
		const meta = await shareMetadata(props)
		const images = (meta.openGraph as { images: string[] }).images
		expect(images[0]).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=twins&size=wide&mode=def&twin=\d{4}-[A-Z]{2,3}&v=\d+$/)
		expect(meta.robots).toEqual({ index: false, follow: true })
		expect(meta.alternates?.canonical).toBe("https://www.raidersrundown.com/lab/season-twins")
		const replace = vi.fn()
		Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, replace } })
		render(await ShareLanding(props))
		expect(screen.getByRole("link", { name: /Open the interactive page/ }).getAttribute("href")).toMatch(/^\/lab\/season-twins\?mode=def&twin=\d{4}-[A-Z]{2,3}#print-heading$/)
		expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/lab\/season-twins\?mode=def&twin=/))
	})

	it("falls back to the default card for a link with nothing valid in it", async () => {
		const meta = await shareMetadata({ searchParams: Promise.resolve({ twin: "../x", mode: "z" }) })
		expect((meta.openGraph as { images: string[] }).images[0]).toMatch(/type=twins&size=wide&v=\d+$/)
	})

	it("has the page's own card in its link preview", () => {
		const images = (generateMetadata().openGraph as { images: string[] }).images
		expect(images[0]).toMatch(/\/api\/og\?type=twins&v=\d+$/)
	})
})
