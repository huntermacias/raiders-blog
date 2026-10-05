// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn(async () => null) }, client: { fetch: vi.fn() } }))

import GamePage, { generateMetadata as gameMeta } from "../../app/(user)/lab/[slug]/page"
import FourthPage, { generateMetadata as fourthMeta } from "../../app/(user)/lab/fourth-down/page"
import ScoutPage, { generateMetadata as scoutMeta, generateStaticParams as scoutParams } from "../../app/(user)/lab/scouting/[abbr]/page"
import ScoutingHub from "../../app/(user)/lab/scouting/page"
import TopPlaysPage, { generateMetadata as playsMeta } from "../../app/(user)/lab/top-plays/page"
import LabHub from "../../app/(user)/lab/page"

afterEach(cleanup)

describe("the Lab pages render", () => {
	it("a game page has its top plays and fourth-down report, and cards in the link preview", () => {
		render(<GamePage params={{ slug: "week-3" }} />)
		expect(screen.getByRole("heading", { name: /The five plays that decided it/ })).toBeTruthy()
		expect(screen.getByRole("heading", { name: /right calls on fourth down/ })).toBeTruthy()
		const meta = gameMeta({ params: { slug: "week-3" } })
		const images = (meta.openGraph as { images: { url: string }[] }).images.map((i) => i.url)
		expect(images).toHaveLength(3)
		expect(images.some((u) => u.includes("view=play&rank=1"))).toBe(true)
	})

	it("the season pages render with a card for the link preview", async () => {
		render(<TopPlaysPage />)
		expect(screen.getByRole("heading", { level: 1, name: /biggest plays of the season/ })).toBeTruthy()
		expect(String((playsMeta().other as Record<string, string>)["og:image"])).toContain("slug=season&view=play&rank=1")
		cleanup()
		render(<FourthPage />)
		expect(screen.getByRole("heading", { level: 1, name: /fourth-down report card/ })).toBeTruthy()
		expect(String((fourthMeta().other as Record<string, string>)["og:image"])).toContain("slug=season&view=fourth")
	})

	it("a scouting page is built for every opponent but the Raiders, and 404s on anything else", () => {
		const abbrs = scoutParams().map((p) => p.abbr)
		expect(abbrs).toHaveLength(31)
		expect(abbrs).not.toContain("lv")
		render(<ScoutPage params={{ abbr: "kc" }} />)
		expect(screen.getByRole("heading", { level: 1, name: /Raiders vs Chiefs/ })).toBeTruthy()
		expect(String((scoutMeta({ params: { abbr: "kc" } }).other as Record<string, string>)["og:image"])).toContain("type=scout&opp=KC")
		expect(() => render(<ScoutPage params={{ abbr: "zzz" }} />)).toThrow()
	})

	it("the scouting hub lists every team even when the schedule cannot be read", async () => {
		render(await ScoutingHub())
		expect(screen.getAllByRole("link", { name: /^(Chiefs|Broncos|Jaguars)$/ })).toHaveLength(3)
		expect(screen.queryByText(/Next up/)).toBeNull()
	})

	it("the hub links to the new pages", () => {
		render(<LabHub />)
		for (const href of ["/lab/top-plays", "/lab/fourth-down", "/lab/scouting"]) expect(document.querySelector(`a[href="${href}"]`)).toBeTruthy()
	})
})
