// @vitest-environment jsdom
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))

import WillItLast from "../../components/lab/WillItLast"
import WillItLastPage, { generateMetadata } from "../../app/(user)/lab/will-it-last/page"
import ShareLanding, { generateMetadata as shareMetadata } from "../../app/(user)/lab/will-it-last/share/page"
import LabHub from "../../app/(user)/lab/page"
import { getHistoryView } from "../../lib/lab/history"
import { DEFAULT_FILTER, analyze, checklist as buildChecklist, recordText, seasonGames, seasonOf, teamLabel } from "../../lib/lab/historyKit"
import { fakeLeague } from "../helpers/historyFake"

const view = getHistoryView()!

function mount(extra: { raidersLogo?: string | null } = {}) {
	return render(<WillItLast meta={view.meta} tables={view.tables} standouts={view.standouts} checklist={view.checklist} season={view.season} n={view.n} first={view.first} last={view.last} stamp={123} start={view.start} {...extra} />)
}

/** The same chart on a small made-up league, for things that must not depend on this week's real numbers. */
function mountFake(edit?: (meta: ReturnType<typeof fakeLeague>["meta"]) => void) {
	const { meta, table } = fakeLeague(400, 0.3)
	edit?.(meta)
	return render(<WillItLast meta={meta} tables={[table]} standouts={[table.key]} checklist={buildChecklist(meta, [table])} season={2026} n={4} first={2000} last={2024} stamp={1} start={{ wins: 3, losses: 1 }} />)
}

const svg = () => document.querySelector("svg[role=img]")!
/** How many circles a dots path draws. */
const dotsIn = (kind: string) => (svg().querySelector(`path[data-dots="${kind}"]`)!.getAttribute("d")!.match(/M/g) ?? []).length
const pathD = (kind: string) => svg().querySelector(`path[data-dots="${kind}"]`)!.getAttribute("d")
const MADE = "made"
const MISSED = "missed"
const FAINT = "faint"

// jsdom has no PointerEvent, and the chart reads the pointer's position.
if (typeof window !== "undefined" && !("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { configurable: true, writable: true, value: class extends MouseEvent {} })

/** Point at the middle of the nth Raiders ring. */
function pointAt(el: Element) {
	const r = svg().getBoundingClientRect()
	return { clientX: r.left + Number(el.getAttribute("cx")), clientY: r.top + Number(el.getAttribute("cy")) }
}

function reducedMotion(on: boolean) {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: (q: string) => ({ matches: on && /reduce/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }),
	})
}

beforeEach(() => reducedMotion(false))
afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

describe("<WillItLast />", () => {
	it("has a tab for each of the Raiders' standout stats and starts on the first", () => {
		mount()
		const tabs = within(screen.getByRole("group", { name: "Choose a stat" })).getAllByRole("button")
		expect(tabs).toHaveLength(view.standouts.length)
		expect(tabs[0].getAttribute("aria-pressed")).toBe("true")
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(view.stories[0].headline)
		expect(screen.getByText(view.stories[0].verdict.text)).toBeTruthy()
	})

	it("switches stat from the tabs, and the share link follows", () => {
		mount()
		const tabs = within(screen.getByRole("group", { name: "Choose a stat" })).getAllByRole("button")
		fireEvent.click(tabs[1])
		expect(tabs[1].getAttribute("aria-pressed")).toBe("true")
		expect(tabs[0].getAttribute("aria-pressed")).toBe("false")
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(view.stories[1].headline)
		fireEvent.click(screen.getByRole("button", { name: /Share: The chart/ }))
		const img = document.querySelector('img[src^="/api/og"]') as HTMLImageElement
		expect(img.getAttribute("src")).toBe(`/api/og?type=last&kind=chart&stat=${encodeURIComponent(view.stories[1].key)}&size=wide&v=123`)
	})


	it("offers every other stat under 'More stats', grouped, and a pick from there joins the tabs", () => {
		mount()
		const more = screen.getByText(/^More stats \(/).closest("details")!
		expect(more.textContent).toContain("Offense")
		expect(more.textContent).toContain("Defense")
		expect(more.textContent).toContain("Overall")
		expect(within(more).getAllByRole("button")).toHaveLength(view.tables.length)
		const other = view.tables.find((t) => !view.standouts.includes(t.key) && t.key === "net.points")!
		fireEvent.click(within(more).getByRole("button", { name: new RegExp(`^${other.label}`) }))
		const tabs = within(screen.getByRole("group", { name: "Choose a stat" })).getAllByRole("button")
		expect(tabs).toHaveLength(view.standouts.length + 1)
		expect(tabs[tabs.length - 1].getAttribute("aria-pressed")).toBe("true")
		const a = analyze(view.meta, other, view.season)!
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(a.headline)
	})

	it("draws playoff teams filled, teams that missed hollow, everyone else faint, and a ring for every Raiders team", () => {
		mount()
		const s = view.stories[0]
		const members = s.rows.filter((r) => r.inGroup && !r.raiders)
		expect(dotsIn(MADE)).toBe(members.filter((r) => r.po).length)
		expect(dotsIn(MISSED)).toBe(members.filter((r) => !r.po).length)
		expect(dotsIn(FAINT)).toBe(s.rows.filter((r) => !r.inGroup && !r.raiders).length)
		expect(svg().querySelectorAll("g > circle")).toHaveLength(view.last - view.first + 1)
		expect(svg().textContent).toContain(`${view.season} Raiders ${s.valueText}`)
		expect(svg().textContent).toContain("league average")
	})

	it("explains the dots in a legend that does not lean on color alone", () => {
		mount()
		const legend = screen.getByRole("list", { name: "Legend" })
		expect(legend.textContent).toContain("Made the playoffs")
		expect(legend.textContent).toContain("Missed the playoffs")
		expect(legend.textContent).toContain("An earlier Raiders team")
		expect(legend.textContent).toContain("Not in the group you picked")
	})

	it("jumps to the end with reduced motion, and the scrubber moves the dots", () => {
		reducedMotion(true)
		mount()
		const slider = screen.getByRole("slider") as HTMLInputElement
		const x0 = pathD(MADE)
		fireEvent.click(screen.getByRole("button", { name: "Play" }))
		expect(slider.value).toBe("100")
		expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy()
		expect(pathD(MADE)).not.toEqual(x0)
		fireEvent.change(slider, { target: { value: "0" } })
		expect(pathD(MADE)).toEqual(x0)
		expect(slider.getAttribute("aria-valuetext")).toBe(`Games 1\u2013${view.n}, the first ${view.n} games`)
		fireEvent.change(slider, { target: { value: "100" } })
		expect(slider.getAttribute("aria-valuetext")).toBe(`Games ${view.n + 1}\u2013${seasonGames(view.season)}, the rest of the season`)
	})

	it("plays on its own over a few seconds and can be paused", () => {
		vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] })
		mount()
		fireEvent.click(screen.getByRole("button", { name: "Play" }))
		expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy()
		act(() => {
			vi.advanceTimersByTime(1200)
		})
		const mid = Number((screen.getByRole("slider") as HTMLInputElement).value)
		expect(mid).toBeGreaterThan(5)
		expect(mid).toBeLessThan(95)
		fireEvent.click(screen.getByRole("button", { name: "Pause" }))
		const held = (screen.getByRole("slider") as HTMLInputElement).value
		act(() => {
			vi.advanceTimersByTime(1500)
		})
		expect((screen.getByRole("slider") as HTMLInputElement).value).toBe(held)
		fireEvent.click(screen.getByRole("button", { name: "Play" }))
		act(() => {
			vi.advanceTimersByTime(6000)
		})
		expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("100")
		expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy()
	})

	it("shows a team's record, number and playoff result when its dot is hovered", () => {
		mountFake()
		expect(screen.getByText(/Hover or tap a dot/)).toBeTruthy()
		const ring = svg().querySelector("g > circle")!
		fireEvent.pointerMove(svg(), pointAt(ring))
		const line = document.querySelector("[aria-live=polite]")!.textContent!
		expect(line).toMatch(/^\d{4} Raiders: /)
		expect(line).toMatch(/through 4 games \(\d-\d\)/)
		expect(line).toMatch(/Finished \d+-\d+, (made|missed) the playoffs\./)
		const tip = document.querySelector('[role="presentation"]')!
		expect(tip.textContent).toMatch(/Started \d-\d/)
		expect(tip.textContent).toMatch(/Finished \d+-\d+, (made|missed) the playoffs/)
		fireEvent.pointerLeave(svg())
		expect(screen.getByText(/Hover or tap a dot/)).toBeTruthy()
		expect(document.querySelector('[role="presentation"]')).toBeNull()
	})

	it("lists a chip for every Raiders season, and picking one spotlights it with its start and finish", () => {
		mount()
		const chips = within(screen.getByRole("group", { name: "Raiders seasons" })).getAllByRole("button")
		expect(chips).toHaveLength(view.last - view.first + 1)
		expect(chips[0].textContent).toContain(String(view.first))
		const c2016 = chips.find((c) => c.textContent!.startsWith("2016"))!
		expect(c2016.getAttribute("aria-label")).toMatch(/^2016 Raiders: started \d-\d, finished 12-4, made the playoffs$/)
		fireEvent.click(c2016)
		expect(c2016.getAttribute("aria-pressed")).toBe("true")
		const note = document.body.textContent!
		expect(note).toMatch(/2016 Raiders: .* through \d+ games \(\d-\d\), .* after\. Finished 12-4, made the playoffs\./)
		expect(svg().textContent).toContain("2016")
		fireEvent.click(c2016)
		expect(c2016.getAttribute("aria-pressed")).toBe("false")
		const c2021 = chips.find((c) => c.textContent!.startsWith("2021"))!
		expect(c2021.getAttribute("aria-label")).toMatch(/finished 10-7, made the playoffs$/)
	})

	it("filters by who the teams are, which team, and whether they made the playoffs", () => {
		mount()
		const s0 = view.stories[0]
		fireEvent.click(screen.getByRole("button", { name: "Made playoffs" }))
		const a = analyze(view.meta, view.tables.find((t) => t.key === s0.key)!, view.season, { ...DEFAULT_FILTER, playoffs: "made" })!
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(a.headline)
		expect(dotsIn(MISSED) + dotsIn(MADE)).toBe(a.groupSize - a.rows.filter((r) => r.inGroup && r.raiders).length)
		expect(dotsIn(MISSED)).toBe(0)
		fireEvent.click(screen.getByRole("button", { name: `Every team since ${view.first}` }))
		expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("made the playoffs")
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "LV" } })
		expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Raiders team-seasons that made the playoffs")
		expect(document.body.textContent).toMatch(/Raiders seasons in this group/)
		fireEvent.click(screen.getByRole("button", { name: "Reset filters" }))
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(s0.headline)
		expect(screen.queryByRole("button", { name: "Reset filters" })).toBeNull()
	})

	it("lets a fan pick any of the 32 teams", () => {
		mount()
		const options = within(screen.getByRole("combobox")).getAllByRole("option")
		expect(options).toHaveLength(33)
		expect(options[1].textContent).toBe("Raiders")
		expect(options.map((o) => o.textContent)).toContain("Patriots")
	})

	it("says so, and drops the numbers, when no team matches", () => {
		// A league where no Raiders team ever made the playoffs.
		mountFake((m) => m.teams.forEach((t, i) => t.endsWith(" LV") && (m.po[i] = 0)))
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "LV" } })
		fireEvent.click(screen.getByRole("button", { name: "Made playoffs" }))
		expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^No Raiders team-seasons that made the playoffs match these filters/)
		expect(document.body.textContent).toContain("No team-seasons match these filters.")
		expect(document.querySelector("dl")).toBeNull()
		expect(screen.queryByText("What that meant in wins and playoffs")).toBeNull()
		expect(dotsIn(MADE) + dotsIn(MISSED)).toBe(0)
		// The fifths and the checklist do not depend on the filters, so they are still there.
		expect(screen.getByRole("heading", { name: /How often teams made the playoffs, by / })).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Reset filters" }))
		expect(document.querySelector("dl")).toBeTruthy()
	})

	it("shows how often teams made the playoffs by fifth, with the Raiders' fifth marked", () => {
		mount()
		const section = screen.getByRole("heading", { name: /How often teams made the playoffs, by / }).closest("section")!
		const items = within(section).getAllByRole("listitem")
		expect(items).toHaveLength(5)
		const s = view.stories[0]
		expect(items[s.raidersFifth].textContent).toContain("The Raiders are here")
		expect(items.filter((i) => i.textContent!.includes("The Raiders are here"))).toHaveLength(1)
		expect(section.textContent).toContain(`${Math.round(s.fifths[0].rate * 100)}%`)
		expect(section.textContent).toMatch(/a pattern, not a cause/)
	})

	it("ranks every stat by how much it has mattered for the playoffs, and selecting one charts it", () => {
		mount()
		const section = screen.getByRole("heading", { name: /playoff checklist/ }).closest("section")!
		const items = within(section).getAllByRole("button", { pressed: false }).filter((b) => b.closest("li"))
		expect(items.length).toBeGreaterThanOrEqual(7)
		const labels = items.map((b) => b.textContent!)
		expect(labels[0]).toContain(view.checklist[0].label)
		const show = within(section).getByRole("button", { name: /Show every stat \(\d+\)/ })
		fireEvent.click(show)
		expect(within(section).getAllByRole("listitem")).toHaveLength(view.checklist.length)
		const last = view.checklist[view.checklist.length - 1]
		fireEvent.click(within(section).getByText(last.label).closest("button")!)
		const t = view.tables.find((x) => x.key === last.key)!
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(analyze(view.meta, t, view.season)!.headline)
		expect(within(section).getByRole("button", { name: /Show fewer stats/ })).toBeTruthy()
	})

	it("lists the highlighted teams in a table for anyone who cannot use the chart, with records and playoffs", () => {
		mount()
		const rows = document.querySelectorAll("details tbody tr")
		expect(rows).toHaveLength(Math.min(300, view.stories[0].groupSize))
		expect(document.querySelector("details caption")!.textContent).toMatch(/Highlighted teams/)
		const heads = Array.from(document.querySelectorAll("details thead th")).map((h) => h.textContent)
		expect(heads).toEqual(["Team", `First ${view.n} games`, "Rest of season", "Move", "Finished", "Playoffs"])
		expect(rows[0].textContent).toMatch(/\d+-\d+/)
		expect(rows[0].textContent).toMatch(/Made it|Missed/)
	})

	it("shows the numbers that sum it up", () => {
		mount()
		const s = view.stories[0]
		const cards = document.querySelector("dl")!.textContent!
		expect(cards).toContain(s.startText)
		expect(cards).toContain(s.restText)
		expect(cards).toContain(s.typicalText)
		expect(cards).toContain(`${Math.round(s.toward * 100)}%`)
	})

	it("carries the Rundown logo and the Raiders' record in the card header", () => {
		mount()
		const logo = document.querySelector('img[src="/logo-rr.png"]')
		expect(logo).toBeTruthy()
		expect(screen.getByText("Raiders Rundown")).toBeTruthy()
		expect(document.body.textContent).toContain(`${view.start!.wins}-${view.start!.losses} after ${view.n} games`)
	})

	it("explains how to read it: one dot per team, which way is better, and what play does", () => {
		mount()
		const steps = within(screen.getByRole("list", { name: "How to read this chart" })).getAllByRole("listitem")
		expect(steps).toHaveLength(3)
		const s = view.stories[0]
		expect(steps[0].textContent).toMatch(/One dot is one team/)
		expect(steps[0].textContent).toMatch(/Filled blue dots made the playoffs, hollow orange rings did not/)
		expect(steps[1].textContent).toContain(s.higherIsBetter ? "Further right is better" : "Further left is better")
		expect(steps[2].textContent).toContain(`after ${view.n} games`)
		expect(steps[2].textContent).toContain(`${seasonGames(view.season) - view.n} games left`)
		expect(document.body.textContent).toContain(s.higherIsBetter ? "Worse" : "Better")
	})

	it("narrates the replay: first games at the start, the finish at the end", () => {
		reducedMotion(true)
		mount()
		expect(document.body.textContent).toContain(`highlighted teams stood after their first ${view.n} games`)
		fireEvent.click(screen.getByRole("button", { name: "Play" }))
		expect(document.body.textContent).toContain("Where they finished.")
		expect(document.body.textContent).toContain("the league average")
		fireEvent.change(screen.getByRole("slider"), { target: { value: "50" } })
		expect(document.body.textContent).toContain("Now the rest of their seasons play out")
	})

	it("translates the stat into wins and playoffs", () => {
		mount()
		const panel = screen.getByRole("heading", { name: "What that meant in wins and playoffs" }).closest("section")!
		const s = view.stories[0]
		expect(panel.textContent).toContain(s.winsLine)
		expect(panel.textContent).toContain(`${Math.round(s.outcomes.playoffs * 100)}%`)
		expect(panel.textContent).toContain(`the Raiders now: ${view.start!.wins}-${view.start!.losses}`)
		expect(panel.textContent).toMatch(/For scale: at \d+%, a team wins about/)
		fireEvent.click(within(screen.getByRole("group", { name: "Choose a stat" })).getAllByRole("button")[1])
		expect(panel.textContent).toContain(view.stories[1].winsLine)
	})

	it("has a share window for every part of the page, and the card follows the filters and the pinned team", () => {
		mount()
		for (const name of ["The chart", "Wins and playoffs", "Playoff odds by fifth", "The playoff checklist"]) expect(screen.getByRole("button", { name: `Share: ${name}` })).toBeTruthy()
		fireEvent.click(screen.getByRole("button", { name: "Made playoffs" }))
		fireEvent.click(screen.getByRole("button", { name: /Share: Wins and playoffs/ }))
		const dialog = screen.getByRole("dialog")
		const img = dialog.querySelector("img") as HTMLImageElement
		expect(img.getAttribute("src")).toMatch(/^\/api\/og\?type=last&kind=wins&stat=[^&]+&po=made&size=wide&v=123$/)
		fireEvent.click(within(dialog).getByRole("button", { name: /Tall/ }))
		expect((dialog.querySelector("img") as HTMLImageElement).getAttribute("src")).toContain("&size=tall")
		expect(within(dialog).getByRole("link", { name: /Save image/ }).getAttribute("download")).toMatch(/^raiders-will-it-last-wins-.*-tall\.png$/)
		fireEvent.keyDown(document, { key: "Escape" })
		expect(screen.queryByRole("dialog")).toBeNull()
	})

	it("shares a pinned team's season with the pin in the link", () => {
		mount()
		fireEvent.click(within(screen.getByRole("group", { name: "Raiders seasons" })).getAllByRole("button")[0])
		const section = screen.getByRole("region", { name: "Pinned team" })
		fireEvent.click(within(section).getByRole("button", { name: /Share: A team's season/ }))
		const src = (screen.getByRole("dialog").querySelector("img") as HTMLImageElement).getAttribute("src")!
		expect(src).toMatch(/kind=season/)
		expect(src).toMatch(/pin=\d{4}-(LV|OAK)/)
	})

	it("copies a link that carries the view", async () => {
		const writeText = vi.fn(async () => {})
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
		mount()
		fireEvent.click(screen.getByRole("button", { name: /Share: The chart/ }))
		await act(async () => {
			fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Copy link/ }))
		})
		expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/lab\/will-it-last\/share\?kind=chart&stat=/))
		expect(screen.getByText("Link copied")).toBeTruthy()
	})

	it("reopens a shared view: the stat, the filters and the pinned season", () => {
		const q = `kind=wins&stat=${encodeURIComponent(view.stories[1].key)}&po=made&scope=all&years=2016,2021`
		window.history.replaceState(null, "", `/lab/will-it-last?${q}`)
		try {
			mount()
			expect(within(screen.getByRole("group", { name: "Choose a stat" })).getAllByRole("button")[1].getAttribute("aria-pressed")).toBe("true")
			expect(screen.getByRole("button", { name: "Made playoffs" }).getAttribute("aria-pressed")).toBe("true")
			expect(screen.getByRole("button", { name: /Every team since/ }).getAttribute("aria-pressed")).toBe("true")
		} finally {
			window.history.replaceState(null, "", "/")
		}
	})
})

describe("<WillItLast /> game ruler, seasons, pinning and the other new controls", () => {
	it("says which games the slider is showing, at the start, in between and at the end", () => {
		reducedMotion(true)
		mount()
		const g = seasonGames(view.season)
		const a = `Games 1\u2013${view.n}`
		const b = `Games ${view.n + 1}\u2013${g}`
		const slider = screen.getByRole("slider") as HTMLInputElement
		fireEvent.change(slider, { target: { value: "0" } })
		const pill = () => document.querySelector("p.rounded-full.bg-lab-ink")!.textContent
		expect(pill()).toBe(a)
		fireEvent.change(slider, { target: { value: "50" } })
		expect(pill()).toBe(`${a} \u2192 ${b}`)
		expect(slider.getAttribute("aria-valuetext")).toMatch(/^Moving from games 1.*to games \d+.*50% of the way$/)
		fireEvent.change(slider, { target: { value: "100" } })
		expect(pill()).toBe(b)
		// The ruler has a box for every game in the season, labeled in two blocks.
		const ruler = slider.parentElement!.querySelector("[aria-hidden]")!
		expect(ruler.querySelectorAll(".flex-1")).toHaveLength(g)
		expect(ruler.textContent).toContain(a)
		expect(ruler.textContent).toContain(b)
		expect(document.body.textContent).toContain("Teams before 2021 played 16 games")
	})

	it("shows the group average and the share closer to average moving with the slider", () => {
		reducedMotion(true)
		mount()
		const s = view.stories[0]
		const toolbar = () => document.querySelector("p.rounded-full.bg-lab-ink")!.parentElement!.parentElement!.textContent!
		const slider = screen.getByRole("slider")
		fireEvent.change(slider, { target: { value: "0" } })
		expect(toolbar()).toContain(s.startText)
		expect(toolbar()).toContain("Closer to average0%")
		expect(svg().textContent).toContain(`group average ${s.startText}`)
		fireEvent.change(slider, { target: { value: "100" } })
		expect(toolbar()).toContain(s.restText)
		expect(toolbar()).toContain(`${Math.round(s.toward * 100)}%`)
		expect(svg().textContent).toContain(`group average ${s.restText}`)
	})

	it("filters by season with presets and a grid of every year", () => {
		mount()
		const seasons = screen.getByRole("group", { name: "Seasons" })
		expect(within(seasons).getByRole("button", { name: "All seasons" }).getAttribute("aria-pressed")).toBe("true")
		const grid = within(seasons).getByRole("group", { name: "Pick years" })
		expect(within(grid).getAllByRole("button")).toHaveLength(view.last - view.first + 1)
		fireEvent.click(screen.getByRole("button", { name: `Every team since ${view.first}` }))
		fireEvent.click(within(seasons).getByRole("button", { name: "2010s" }))
		expect(within(seasons).getByRole("button", { name: "2010s" }).getAttribute("aria-pressed")).toBe("true")
		expect(within(seasons).getByRole("button", { name: "All seasons" }).getAttribute("aria-pressed")).toBe("false")
		const t = view.tables.find((x) => x.key === view.stories[0].key)!
		const a = analyze(view.meta, t, view.season, { ...DEFAULT_FILTER, scope: "all", years: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019] })!
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(a.headline)
		expect(a.headline).toContain("from 2010 to 2019")
		expect(dotsIn(MADE) + dotsIn(MISSED)).toBe(a.rows.filter((r) => r.inGroup && !r.raiders).length)
		// Any mix of single years from the grid.
		fireEvent.click(within(grid).getByRole("button", { name: "2016" }))
		expect(within(grid).getByRole("button", { name: "2016" }).getAttribute("aria-pressed")).toBe("false")
		fireEvent.click(within(grid).getByRole("button", { name: "2010" }))
		expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("teams in 8 chosen seasons")
		fireEvent.click(screen.getByRole("button", { name: "Reset filters" }))
		expect(within(seasons).getByRole("button", { name: "All seasons" }).getAttribute("aria-pressed")).toBe("true")
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(view.stories[0].headline)
	})

	it("can show a single year of the league", () => {
		mount()
		const grid = screen.getByRole("group", { name: "Pick years" })
		fireEvent.click(screen.getByRole("button", { name: `Every team since ${view.first}` }))
		fireEvent.click(within(grid).getByRole("button", { name: "2021" }))
		expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^32 teams in 2021\./)
		expect(dotsIn(MADE) + dotsIn(MISSED)).toBe(31)
	})

	it("can spread the dots by final wins, with a wins scale, and back", () => {
		reducedMotion(true)
		mount()
		const before = pathD(MADE)
		expect(svg().textContent).not.toContain("12 wins")
		fireEvent.click(screen.getByRole("button", { name: "Final wins" }))
		expect(screen.getByRole("button", { name: "Final wins" }).getAttribute("aria-pressed")).toBe("true")
		expect(svg().textContent).toContain("12 wins")
		expect(pathD(MADE)).not.toEqual(before)
		fireEvent.click(screen.getByRole("button", { name: "Nothing (spread out)" }))
		expect(pathD(MADE)).toEqual(before)
		expect(svg().textContent).not.toContain("12 wins")
	})

	it("pins a team from the chart, steps through the teams, and clears", () => {
		mount()
		expect(screen.queryByRole("region", { name: "Pinned team" })).toBeNull()
		const ring = svg().querySelector("g > circle")!
		fireEvent.click(svg(), pointAt(ring))
		const card = screen.getByRole("region", { name: "Pinned team" })
		expect(card.textContent).toMatch(/\d{4} Raiders/)
		expect(card.textContent).toMatch(/Finished \d+-\d+/)
		expect(card.textContent).toMatch(/Toward average|Away from average/)
		expect(svg().textContent).toMatch(/\d{4} Raiders/)
		const first = card.querySelector("p")!.textContent
		fireEvent.click(within(card).getByRole("button", { name: "Next team" }))
		expect(screen.getByRole("region", { name: "Pinned team" }).querySelector("p")!.textContent).not.toBe(first)
		fireEvent.click(within(screen.getByRole("region", { name: "Pinned team" })).getByRole("button", { name: "Previous team" }))
		fireEvent.click(within(screen.getByRole("region", { name: "Pinned team" })).getByRole("button", { name: "Clear the pinned team" }))
		expect(screen.queryByRole("region", { name: "Pinned team" })).toBeNull()
		// Clicking the same dot twice pins and unpins it.
		fireEvent.click(svg(), pointAt(ring))
		fireEvent.click(svg(), pointAt(ring))
		expect(screen.queryByRole("region", { name: "Pinned team" })).toBeNull()
	})

	it("pins a Raiders season from its chip, and offers every team that year", () => {
		mount()
		const chip = within(screen.getByRole("group", { name: "Raiders seasons" })).getAllByRole("button").find((c) => c.textContent!.startsWith("2016"))!
		fireEvent.click(chip)
		const card = screen.getByRole("region", { name: "Pinned team" })
		expect(card.textContent).toContain("2016 Raiders")
		expect(card.textContent).toContain("Finished 12-4, made the playoffs")
		fireEvent.click(within(card).getByRole("button", { name: "Show all 32 teams from 2016" }))
		expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^32 teams in 2016\./)
		expect(screen.getByRole("region", { name: "Pinned team" })).toBeTruthy()
	})

	it("sorts and searches the table of teams, and a row pins its dot", () => {
		mount()
		const table = document.querySelector("details table")!
		const rows = () => Array.from(table.querySelectorAll("tbody tr"))
		const total = rows().length
		const restHead = within(table as HTMLElement).getByRole("button", { name: /Rest of season/ })
		fireEvent.click(restHead)
		expect(restHead.closest("th")!.getAttribute("aria-sort")).toBe("descending")
		const rest = rows().map((r) => r.querySelectorAll("td")[1].textContent!)
		expect(rest.length).toBe(total)
		fireEvent.click(restHead)
		expect(restHead.closest("th")!.getAttribute("aria-sort")).toBe("ascending")
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "raiders" } })
		const found = rows()
		expect(found.length).toBeGreaterThan(0)
		expect(found.length).toBeLessThanOrEqual(view.last - view.first + 1)
		expect(found.every((r) => /Raiders/.test(r.textContent!))).toBe(true)
		fireEvent.click(within(found[0] as HTMLElement).getByRole("button"))
		expect(screen.getByRole("region", { name: "Pinned team" }).textContent).toMatch(/Raiders/)
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such team" } })
		expect(rows()).toHaveLength(0)
		expect(document.body.textContent).toContain("0 teams.")
	})

	it("puts the Raiders shield next to the Rundown logo and on the Raiders marker when the site has the file", () => {
		mount({ raidersLogo: "/raiders-shield.png" })
		const header = document.querySelector('img[src="/logo-rr.png"]')!.closest("div.flex.flex-wrap")!
		expect(header.querySelector('img[src="/raiders-shield.png"]')).toBeTruthy()
		expect(svg().querySelector('image[href="/raiders-shield.png"]')).toBeTruthy()
		fireEvent.click(within(screen.getByRole("group", { name: "Raiders seasons" })).getAllByRole("button")[0])
		expect(screen.getByRole("region", { name: "Pinned team" }).querySelector('img[src="/raiders-shield.png"]')).toBeTruthy()
		expect(document.querySelector('img[src="/raiders-shield.png"]')!.getAttribute("alt")).toBe("")
	})

	it("shows no logo and nothing broken when the file is not there", () => {
		mount()
		expect(document.querySelector("[data-raiders-logo]")).toBeNull()
		expect(svg().querySelector("image")).toBeNull()
	})
})

describe("the Will it last? page", () => {
	it("renders the chart, the bottom line and the data credit", () => {
		render(<WillItLastPage />)
		expect(screen.getByRole("heading", { level: 1, name: "Will it last?" })).toBeTruthy()
		expect(screen.getByRole("heading", { name: view.bottomLine.title })).toBeTruthy()
		expect(document.body.textContent).toMatch(/nflverse/)
		expect(document.body.textContent).toMatch(/CC BY 4\.0/)
		expect(document.body.textContent).toContain(`${view.first} to ${view.last}`)
	})

	it("puts a card for the first stat in the link preview", () => {
		const meta = generateMetadata()
		const images = (meta.openGraph as { images: string[] }).images
		expect(images[0]).toContain(`/api/og?type=last&stat=${encodeURIComponent(view.stories[0].key)}`)
		expect(meta.alternates?.canonical).toBe("https://www.raidersrundown.com/lab/will-it-last")
	})

	it("shows the Raiders shield only when /public has it", () => {
		render(<WillItLastPage />)
		const has = existsSync(resolve(__dirname, "../../public/raiders-shield.png"))
		expect(!!document.querySelector("[data-raiders-logo]")).toBe(has)
	})

	it("is linked from the Lab", () => {
		render(<LabHub />)
		expect(document.querySelector('a[href="/lab/will-it-last"]')).toBeTruthy()
	})
})

describe("the share landing page", () => {
	it("puts the card for the shared part in the link preview and sends the reader on to the same chart", async () => {
		const props = { searchParams: Promise.resolve({ kind: "wins", stat: view.stories[1].key, po: "made", size: "tall" }) }
		const meta = await shareMetadata(props)
		const image = (meta.openGraph?.images as string[])[0]
		const url = new URL(image)
		expect(url.pathname).toBe("/api/og")
		expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: "last", kind: "wins", stat: view.stories[1].key, po: "made", size: "wide" })
		expect((meta.twitter as { card: string }).card).toBe("summary_large_image")
		expect(meta.robots).toEqual({ index: false, follow: true })
		expect(String(meta.title)).toContain("Wins and playoffs")
		const replace = vi.fn()
		Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, replace } })
		render(await ShareLanding(props))
		expect(replace).toHaveBeenCalledWith(`/lab/will-it-last?kind=wins&stat=${encodeURIComponent(view.stories[1].key)}&po=made#wins-heading`)
		expect(screen.getAllByRole("link", { name: /Open the interactive chart/ })[0].getAttribute("href")).toContain("#wins-heading")
	})

	it("ignores a made-up view and still gives a card", async () => {
		const meta = await shareMetadata({ searchParams: Promise.resolve({ kind: "x", stat: "../y", team: "ZZZ" }) })
		const url = new URL((meta.openGraph?.images as string[])[0])
		expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: "last", kind: "chart", size: "wide", stat: view.stories[0].key })
	})
})
