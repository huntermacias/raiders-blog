// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))
let path = "/lab"
vi.mock("next/navigation", async (importOriginal) => ({
	...(await importOriginal<typeof import("next/navigation")>()),
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
	usePathname: () => path,
}))

import NavMore from "../../components/NavMore"
import MoreFromLab from "../../components/lab/MoreFromLab"
import LabHub from "../../app/(user)/lab/page"
import TopPlaysPage from "../../app/(user)/lab/top-plays/page"
import MatchupsPage from "../../app/(user)/lab/matchups/page"
import { getGames } from "../../lib/lab/data"
import { gameSlug } from "../../lib/lab/data"
import { LAB_GROUPS, LAB_TOOLS } from "../../lib/lab/tools"

afterEach(() => {
	cleanup()
	path = "/lab"
})

describe("the Lab hub", () => {
	it("opens on the tools, grouped, and does not render the full game scrubber above them", () => {
		render(<LabHub />)
		const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
		const groupAt = LAB_GROUPS.map((g) => headings.indexOf(g.title))
		expect(groupAt.every((i) => i >= 0)).toBe(true)
		expect([...groupAt].sort((a, b) => a - b)).toEqual(groupAt)
		expect(headings.indexOf("Every game, week by week")).toBeGreaterThan(groupAt[groupAt.length - 1])
		// The scrubber (a slider over the win probability) lives on the game page now, not here.
		expect(document.querySelector('[role="slider"], input[type="range"]')).toBeNull()
		expect(screen.queryByRole("button", { name: /^play/i })).toBeNull()
	})

	it("links every tool once from its group, with the playoff machine first and tagged New", () => {
		render(<LabHub />)
		for (const g of LAB_GROUPS) {
			const section = document.getElementById(g.id) as HTMLElement
			expect(section, g.id).toBeTruthy()
			for (const t of LAB_TOOLS.filter((x) => x.group === g.id)) expect(section.querySelectorAll(`a[href="${t.href}"]`).length, t.href).toBe(1)
		}
		const start = within(document.getElementById("start") as HTMLElement)
		const first = start.getAllByRole("heading", { level: 3 })[0]
		expect(first.textContent).toBe("NFL Playoff Machine")
		expect(within(first.closest("a") as HTMLElement).getByText("New")).toBeTruthy()
	})

	it("shows the latest game as a card that goes to its replay, with the odds-style summary", () => {
		render(<LabHub />)
		const games = getGames()
		const latest = games[games.length - 1]
		const card = within(document.getElementById("raiders") as HTMLElement).getByRole("heading", { name: "Latest game" }).closest("a") as HTMLAnchorElement
		expect(card.getAttribute("href")).toBe(`/lab/${gameSlug(latest)}`)
		expect(card.textContent).toContain(`Week ${latest.week}`)
		expect(card.textContent).toMatch(/Lowest point/)
		expect(card.textContent).toMatch(/Scrub the win probability/)
	})

	it("has jump links to each section, and each target exists", () => {
		render(<LabHub />)
		const nav = screen.getByRole("navigation", { name: "On this page" })
		const links = within(nav).getAllByRole("link")
		expect(links.length).toBe(LAB_GROUPS.length + 1)
		for (const a of links) expect(document.getElementById((a.getAttribute("href") as string).slice(1)), a.textContent ?? "").toBeTruthy()
	})
})

describe("More from the Lab", () => {
	it("lists the other tools, never the page it is on, and links back to the hub", () => {
		render(<MoreFromLab current="/lab/top-plays" />)
		const region = screen.getByRole("region", { name: "More from the Lab" })
		const hrefs = within(region).getAllByRole("link").map((a) => a.getAttribute("href"))
		expect(hrefs).not.toContain("/lab/top-plays")
		for (const t of LAB_TOOLS.filter((x) => x.href !== "/lab/top-plays")) expect(hrefs).toContain(t.href)
		expect(hrefs).toContain("/lab")
	})

	it("is on the tool pages", () => {
		render(<TopPlaysPage />)
		const region = screen.getByRole("region", { name: "More from the Lab" })
		expect(within(region).queryByRole("link", { name: /^Top plays/ })).toBeNull()
		expect(within(region).getByRole("link", { name: /NFL Playoff Machine/ })).toBeTruthy()
		cleanup()
		render(<MatchupsPage />)
		expect(within(screen.getByRole("region", { name: "More from the Lab" })).queryByRole("link", { name: /^This week's matchups/ })).toBeNull()
	})
})

describe("the Lab menu in the header", () => {
	const items = LAB_TOOLS.map((t) => ({ href: t.href, label: t.title, hint: t.short }))

	it("keeps Lab a link to the hub, with a separate button for the menu of tools", () => {
		render(<NavMore label="Lab" labelHref="/lab" items={items} />)
		expect(screen.getByRole("link", { name: "Lab" }).getAttribute("href")).toBe("/lab")
		const button = screen.getByRole("button", { name: "Lab menu" })
		expect(button.getAttribute("aria-expanded")).toBe("false")
		fireEvent.click(button)
		expect(button.getAttribute("aria-expanded")).toBe("true")
		const panel = document.getElementById(button.getAttribute("aria-controls") as string) as HTMLElement
		expect(panel.hidden).toBe(false)
		for (const t of LAB_TOOLS) expect(within(panel).getByRole("link", { name: new RegExp(t.title.replace(/[?']/g, ".")) })).toBeTruthy()
		fireEvent.keyDown(document, { key: "Escape" })
		expect(panel.hidden).toBe(true)
	})

	it("marks the page you are on, and Lab itself on any Lab page", () => {
		path = "/lab/matchups"
		render(<NavMore label="Lab" labelHref="/lab" items={items} />)
		fireEvent.click(screen.getByRole("button", { name: "Lab menu" }))
		expect(screen.getByRole("link", { name: /This week's matchups/ }).getAttribute("aria-current")).toBe("page")
		expect(screen.getByRole("link", { name: "Lab" }).getAttribute("aria-current")).toBeNull()
	})
})
