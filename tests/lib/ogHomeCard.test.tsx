// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

import { cardSize, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { OG_TYPES, checkOg } from "../../lib/og/guard"
import { type HomeCardSpec, HOME_LOGO_TEAM, homeCardSize, homeQuery, parseHomeQuery, renderHomeCard, streakText } from "../../lib/og/homeCard"

vi.setConfig({ testTimeout: 60_000 })

const base: Omit<HomeCardSpec, "type" | "logo" | "kind"> = {
	week: 7,
	record: { w: 3, l: 4, t: 0 },
	results: ["W", "W", "W", "L", "L", "L", "L"],
	odds: { pct: 11, delta: -3 },
	rank: { n: 24, change: -3 },
	picks: { hits: 5, misses: 2, pct: 71 },
	streak: { kind: "miss", length: 1 },
}
const read = (q: string) => {
	const p = new URLSearchParams(q)
	return parseHomeQuery((k) => p.get(k) ?? undefined)
}

describe("the card's address", () => {
	it("reads back exactly what it was built from", () => {
		expect(read(homeQuery(base))).toEqual({ ...base, type: "home", kind: "season" })
	})
	it("carries no odds, rank or picks when there are none", () => {
		const q = homeQuery({ ...base, odds: null, rank: null, picks: null, streak: null })
		const spec = read(q)!
		expect(spec.odds).toBeNull()
		expect(spec.rank).toBeNull()
		expect(spec.picks).toBeNull()
		expect(spec.streak).toBeNull()
		expect(q).not.toContain("odds")
	})
	it("refuses a record that is not whole numbers", () => {
		expect(read("kind=season&wk=7&w=abc&l=4&t=0")).toBeNull()
		expect(read("kind=season&wk=7&w=3.5&l=4&t=0")).toBeNull()
		expect(read("kind=season&wk=7&w=3&l=4")).toBeNull()
		expect(read("kind=season&wk=7&w=300&l=4&t=0")).toBeNull()
		expect(read("kind=team&wk=7&w=3&l=4&t=0")).toBeNull()
	})
	it("drops a stat that is out of range instead of drawing it", () => {
		const spec = read("wk=7&w=3&l=4&t=0&odds=250&rank=99&hit=0&miss=0&sk=up&sl=2")!
		expect(spec.odds).toBeNull()
		expect(spec.rank).toBeNull()
		expect(spec.picks).toBeNull()
		expect(spec.streak).toBeNull()
	})
	it("only ever draws W, L and T for the games", () => {
		expect(read("wk=3&w=1&l=1&t=1&res=WL<script>T")!.results).toEqual(["W", "L", "T"])
	})
})

describe("streak wording", () => {
	it("does not call one result a streak", () => {
		expect(streakText({ kind: "miss", length: 1 })).toBe("Last pick missed")
		expect(streakText({ kind: "hit", length: 1 })).toBe("Last pick right")
		expect(streakText({ kind: "hit", length: 4 })).toBe("4 straight picks right")
		expect(streakText({ kind: "miss", length: 2 })).toBe("2 straight picks missed")
	})
})

describe("drawing", () => {
	const spec = (over: Partial<HomeCardSpec> = {}): HomeCardSpec => ({ ...base, type: "home", kind: "season", logo: null, ...over })
	const draw = async (s: HomeCardSpec) => {
		const { width, height } = homeCardSize()
		const svg = await satori(renderHomeCard(s), { width, height, fonts: ogFonts() as never })
		return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render()
	}
	it("draws the season card at 1200x630", async () => {
		const png = await draw(spec())
		expect(png.width).toBe(1200)
		expect(png.height).toBe(630)
		expect(png.asPng().length).toBeGreaterThan(10_000)
	})
	it("draws with nothing but a record", async () => {
		const png = await draw(spec({ odds: null, rank: null, picks: null, streak: null, results: [] }))
		expect(png.asPng().length).toBeGreaterThan(10_000)
	})
	it("draws a full 17-game season and a tie", async () => {
		const results = Array.from({ length: 17 }, (_, i) => (i % 5 === 0 ? "L" : i % 7 === 0 ? "T" : "W")) as ("W" | "L" | "T")[]
		expect((await draw(spec({ results, record: { w: 12, l: 4, t: 1 }, week: 17 }))).asPng().length).toBeGreaterThan(10_000)
	})
	it("goes through the shared card renderer", () => {
		expect(cardSize(spec() as never)).toEqual({ width: 1200, height: 630 })
		expect(renderCard(spec() as never)).toBeTruthy()
	})
	it("uses the Raiders' logo", () => {
		expect(HOME_LOGO_TEAM).toBe("LV")
	})
})

describe("guard", () => {
	it("lets the route draw home cards", () => {
		expect(OG_TYPES as readonly string[]).toContain("home")
		expect(checkOg(`?type=home&${homeQuery(base)}`, "Mozilla/5.0 (Macintosh) Safari/605.1.15")).toEqual({ action: "allow" })
	})
})
