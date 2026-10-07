// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))

import WillItLast from "../../components/lab/WillItLast"
import WillItLastPage, { generateMetadata } from "../../app/(user)/lab/will-it-last/page"
import LabHub from "../../app/(user)/lab/page"
import { getHistoryView } from "../../lib/lab/history"

const view = getHistoryView()!

function mount() {
	return render(<WillItLast stories={view.stories} season={view.season} n={view.n} first={view.first} last={view.last} stamp={123} start={view.start} />)
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
		expect(tabs).toHaveLength(view.stories.length)
		expect(tabs[0].getAttribute("aria-pressed")).toBe("true")
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(view.stories[0].headline)
		expect(screen.getByText(view.stories[0].verdict.text)).toBeTruthy()
	})

	it("switches stat from the tabs, and the share card follows", () => {
		mount()
		const tabs = within(screen.getByRole("group", { name: "Choose a stat" })).getAllByRole("button")
		fireEvent.click(tabs[1])
		expect(tabs[1].getAttribute("aria-pressed")).toBe("true")
		expect(tabs[0].getAttribute("aria-pressed")).toBe("false")
		expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(view.stories[1].headline)
		const img = document.querySelector("img[src^=\"/api/og\"]") as HTMLImageElement
		expect(img.getAttribute("src")).toBe(`/api/og?type=last&stat=${encodeURIComponent(view.stories[1].key)}&n=${view.n}&v=123`)
	})

	it("draws a dot per team, a ring for each team that moved away, and marks the Raiders", () => {
		mount()
		const svg = document.querySelector("svg[role=img]")!
		const s = view.stories[0]
		const visual = Array.from(svg.querySelectorAll("circle")).filter((c) => c.getAttribute("fill") !== "transparent")
		expect(visual).toHaveLength(s.dots.length)
		expect(svg.querySelectorAll("circle[fill=transparent]")).toHaveLength(s.dots.length)
		expect(svg.textContent).toContain(`${view.season} Raiders ${s.valueText}`)
		expect(svg.textContent).toContain("league average")
	})

	it("jumps to the end with reduced motion, and the scrubber moves the dots", () => {
		reducedMotion(true)
		mount()
		const slider = screen.getByRole("slider") as HTMLInputElement
		const x0 = Array.from(document.querySelectorAll("svg[role=img] circle[fill=transparent]")).map((c) => c.getAttribute("cx"))
		fireEvent.click(screen.getByRole("button", { name: "Play" }))
		expect(slider.value).toBe("100")
		expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy()
		const x1 = Array.from(document.querySelectorAll("svg[role=img] circle[fill=transparent]")).map((c) => c.getAttribute("cx"))
		expect(x1).not.toEqual(x0)
		fireEvent.change(slider, { target: { value: "0" } })
		expect(Array.from(document.querySelectorAll("svg[role=img] circle[fill=transparent]")).map((c) => c.getAttribute("cx"))).toEqual(x0)
		expect(slider.getAttribute("aria-valuetext")).toBe(`First ${view.n} games`)
		fireEvent.change(slider, { target: { value: "100" } })
		expect(slider.getAttribute("aria-valuetext")).toBe("Rest of the season")
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

	it("names a team when its dot is hovered", () => {
		mount()
		const hit = document.querySelectorAll("svg[role=img] circle[fill=transparent]")[0]
		expect(screen.getByText(/Hover or tap a dot/)).toBeTruthy()
		fireEvent.pointerEnter(hit)
		const first = view.stories[0].dots[0]
		expect(document.querySelector("[aria-live=polite]")!.textContent).toMatch(new RegExp(`^${first.team.split(" ")[0]} `))
	})

	it("lists every team in a table for anyone who cannot use the chart", () => {
		mount()
		const rows = document.querySelectorAll("details tbody tr")
		expect(rows).toHaveLength(view.stories[0].dots.length)
		expect(document.querySelector("details caption")!.textContent).toMatch(/Teams since 1999/)
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
		expect(steps[1].textContent).toContain(s.higherIsBetter ? "Further right is better" : "Further left is better")
		expect(steps[2].textContent).toContain(`after ${view.n} games`)
		expect(steps[2].textContent).toContain(`${17 - view.n} games left`)
		expect(document.body.textContent).toContain(s.higherIsBetter ? "Worse" : "Better")
	})

	it("narrates the replay: first games at the start, the finish at the end", () => {
		reducedMotion(true)
		mount()
		expect(document.body.textContent).toContain(`Where each team stood after its first ${view.n} games`)
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

	it("copies the page link", async () => {
		const writeText = vi.fn(async () => {})
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
		mount()
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /Copy link/ }))
		})
		expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/lab\/will-it-last$/))
		expect(screen.getByRole("button", { name: /Link copied/ })).toBeTruthy()
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

	it("is linked from the Lab", () => {
		render(<LabHub />)
		expect(document.querySelector('a[href="/lab/will-it-last"]')).toBeTruthy()
	})
})
