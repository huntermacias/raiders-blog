// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import ComparePage, { generateMetadata } from "../../app/(user)/lab/players/compare/page"
import { getPlayers } from "../../lib/lab/data"

afterEach(cleanup)

const data = getPlayers()
const te = data.players.filter((p) => p.group === "te" && p.stats.length >= 4).sort((a, b) => b.games - a.games)
const qb = data.players.filter((p) => p.group === "qb" && p.stats.length >= 4).sort((a, b) => b.games - a.games)
const page = (q: Record<string, string>) => ComparePage({ searchParams: Promise.resolve(q) })

describe("the comparison page", () => {
	it("opens on debates worth having when no pair is chosen", async () => {
		render(await page({}))
		expect(screen.getByRole("heading", { level: 1, name: /Settle the debate/ })).toBeTruthy()
		const list = screen.getByTestId("debates")
		expect(within(list).getAllByRole("link").length).toBeGreaterThan(3)
		expect(within(list).getAllByRole("link")[0].getAttribute("href")).toMatch(/^\/lab\/players\/compare\?a=.+&b=.+/)
	})

	it("builds the face-off, the controls, the radar, every stat, the takeaways and the share section for a pair", async () => {
		render(await page({ a: te[0].slug, b: te[1].slug }))
		expect(screen.getByTestId("compare-hero")).toBeTruthy()
		expect(screen.getByTestId("compare-controls")).toBeTruthy()
		expect(screen.getByTestId("compare-bars")).toBeTruthy()
		expect(screen.getByTestId("takeaways").children.length).toBeGreaterThan(0)
		const share = screen.getByTestId("compare-share")
		expect(share.querySelector("img")?.getAttribute("src")).toContain(`a=${te[0].slug}&b=${te[1].slug}`)
		// the three graphics on offer: head to head always, radar and each player's case when there is enough to draw
		expect(within(share).getByRole("button", { name: "Head to head" })).toBeTruthy()
		expect(document.querySelector('link[rel="canonical"]')).toBeNull()
	})

	it("keeps the chosen stretch and stats when it draws", async () => {
		render(await page({ a: te[0].slug, b: te[1].slug, r: "form", m: "croe,yacOe" }))
		expect(screen.getAllByTestId("compare-row")).toHaveLength(2)
		expect(screen.getByTestId("compare-share").querySelector("img")?.getAttribute("src")).toContain("r=form&m=croe,yacOe")
	})

	it("explains a pair that cannot be compared and offers the debates instead", async () => {
		render(await page({ a: te[0].slug, b: qb[0].slug }))
		expect(screen.getByText(/measured on different stats/)).toBeTruthy()
		expect(screen.getByTestId("debates")).toBeTruthy()
		cleanup()
		render(await page({ a: te[0].slug, b: te[0].slug }))
		expect(screen.getByText(/one player twice/)).toBeTruthy()
	})

	it("shrugs off a mangled address", async () => {
		render(await page({ a: "../../etc", b: "<script>", r: "zzz", m: "&&&", g: "nope" }))
		expect(screen.getByTestId("debates")).toBeTruthy()
	})
})

describe("what a link to a comparison unfolds into", () => {
	it("is the comparison's own graphic, with the exact range and stats, and is not indexed", async () => {
		const meta = await generateMetadata({ searchParams: Promise.resolve({ a: te[0].slug, b: te[1].slug, r: "form", m: "croe,yacOe" }) })
		const og = meta.openGraph as { images: { url: string; width: number; height: number }[] }
		expect(og.images[0].url).toMatch(new RegExp(`^https://www\\.raidersrundown\\.com/api/og\\?type=compare&a=${te[0].slug}&b=${te[1].slug}&r=form&m=croe,yacOe&size=wide&v=\\d+$`))
		expect([og.images[0].width, og.images[0].height]).toEqual([1200, 630])
		const tw = meta.twitter as { card: string; images: { url: string }[] }
		expect(tw.card).toBe("summary_large_image")
		expect(tw.images[0].url).toBe(og.images[0].url)
		expect(meta.robots).toEqual({ index: false, follow: true })
		expect(String(meta.title)).toContain(`${te[0].name} vs ${te[1].name}`)
		expect(String(meta.description)).toMatch(/Player Lab/)
	})

	it("is the site card and stays indexable for the plain tool page", async () => {
		const meta = await generateMetadata({ searchParams: Promise.resolve({}) })
		expect(meta.robots).toBeUndefined()
		expect(JSON.stringify(meta.openGraph)).toContain("og-default-v2.png")
	})
})
