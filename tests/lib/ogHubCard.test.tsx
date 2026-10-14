// @vitest-environment node
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { describe, expect, it, vi } from "vitest"

import { getHub } from "../../lib/lab/hub"
import { cardSize, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { buildHubSpec } from "../../lib/og/hubCard"
import { insightSpec, type InsightQuery } from "../../lib/og/insightSpecs"

vi.setConfig({ testTimeout: 120_000 })

const hub = getHub()
const q = { type: "hub", slug: "", view: "", rank: "", opp: "", week: "" } as InsightQuery

describe("the Lab Report card", () => {
	it("holds the record, the odds and up to five findings with their numbers", () => {
		const s = buildHubSpec(hub.drops, hub.pulse, 2026)!
		expect(s.type).toBe("hub")
		expect(s.record).toBe(hub.pulse.record)
		expect(s.oddsText).toBe(hub.pulse.oddsText)
		expect(s.rows.length).toBeGreaterThanOrEqual(3)
		expect(s.rows.length).toBeLessThanOrEqual(5)
		expect(s.rows.some((r) => r.kicker === "The playoff race")).toBe(false)
		for (const r of s.rows) {
			expect(r.headline.length).toBeGreaterThan(10)
			if (r.initials) expect(r.headshot).toMatch(/^https:\/\//)
		}
	})

	it("is not made from fewer than three findings", () => {
		expect(buildHubSpec(hub.drops.slice(0, 2), hub.pulse, 2026)).toBeNull()
	})

	it("is what /api/og?type=hub asks for", () => {
		const s = insightSpec(q)!
		expect(s.type).toBe("hub")
		expect(cardSize(s)).toEqual({ width: 1200, height: 630 })
	})

	it("draws as a 1200x630 picture, with faces or without", async () => {
		const spec = insightSpec(q)!
		const svg = await satori(renderCard(spec), { width: 1200, height: 630, fonts: ogFonts() })
		const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng()
		const v = new DataView(png.buffer, png.byteOffset, png.byteLength)
		expect([v.getUint32(16), v.getUint32(20)]).toEqual([1200, 630])
		expect(svg.length).toBeGreaterThan(5000)
	})
})
