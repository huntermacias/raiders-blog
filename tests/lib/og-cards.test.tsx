import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import { describe, expect, it } from "vitest"

import { OG_HEIGHT, OG_WIDTH, clip, renderCard, type CardSpec } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"

describe("clip", () => {
	it("leaves short text alone and collapses whitespace", () => {
		expect(clip("  Raiders   win ", 50)).toBe("Raiders win")
	})

	it("cuts at a word boundary and adds an ellipsis", () => {
		const out = clip("The Raiders offensive line has a problem nobody wants to talk about", 40)
		expect(out.endsWith("…")).toBe(true)
		expect(out.length).toBeLessThanOrEqual(41)
		expect(out).not.toMatch(/\s…$/)
	})

	it("hard-cuts a single very long word", () => {
		const out = clip("a".repeat(100), 20)
		expect(out).toBe(`${"a".repeat(20)}…`)
	})
})

const SPECS: [string, CardSpec][] = [
	["article", { type: "article", eyebrow: "Preview", title: "How the Raiders beat the Chiefs" }],
	["article with a very long title", { type: "article", eyebrow: "News & Analysis", title: "word ".repeat(60) }],
	["game", { type: "game", title: "Raiders 24, Saints 17", opponent: "Saints", raidersScore: 24, opponentScore: 17 }],
	["pick (pending)", { type: "pick", week: 4, awayNick: "Raiders", homeNick: "Chiefs", awayAbbr: "LV", homeAbbr: "KC", predictedAway: 24, predictedHome: 21, final: null }],
	["pick (graded)", { type: "pick", week: 4, awayNick: "Raiders", homeNick: "Chiefs", awayAbbr: "LV", homeAbbr: "KC", predictedAway: 24, predictedHome: 21, final: { away: 27, home: 20, result: "hit" } }],
	["rankings", { type: "rankings", season: 2026, week: 4, raidersRank: 22, change: 3 }],
	["rankings, no raiders row", { type: "rankings", season: 2026, week: 1, raidersRank: null, change: null }],
	["league", { type: "league", season: 2026, players: 87 }],
	["league (no players yet)", { type: "league", season: 2026 }],
	["league player", { type: "league", season: 2026, handle: "SilverAndBlack", rank: 14, ranked: 212, points: 143, vs: { w: 5, l: 3, t: 1 } }],
	["league player with a long handle and no rank", { type: "league", season: 2026, handle: "A_Very_Long_Name1", rank: null, points: null, vs: null }],
	["scoreboard", { type: "scoreboard", season: 2026, hits: 2, misses: 1, accuracy: 2 / 3, keys: { hit: 5, miss: 4 }, flags: { hit: 1, miss: 1 } }],
	["empty scoreboard", { type: "scoreboard", season: 2026, hits: 0, misses: 0, accuracy: null }],
]

describe("share cards", () => {
	it("has the 1200x630 size social networks expect", () => {
		expect([OG_WIDTH, OG_HEIGHT]).toEqual([1200, 630])
	})

	it("ships its fonts inline (no files to find at runtime)", () => {
		const fonts = ogFonts()
		expect(fonts.length).toBeGreaterThanOrEqual(2)
		for (const f of fonts) expect(f.data.byteLength).toBeGreaterThan(1000)
	})

	it.each(SPECS)("renders a %s card to a 1200x630 PNG", async (_label, spec) => {
		const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() })
		const image = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render()
		expect(image.width).toBe(1200)
		expect(image.height).toBe(630)
		const png = image.asPng()
		expect(Array.from(png.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
		expect(png.length).toBeGreaterThan(5_000)
	}, 90_000)
})
