// @vitest-environment node
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { describe, expect, it, vi } from "vitest"

import { getPlayers } from "../../lib/lab/data"
import { TEAMS } from "../../lib/nfl"
import { cardSize, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { insightSpec, type InsightQuery } from "../../lib/og/insightSpecs"
import { rasterize } from "../../lib/og/rasterize"
import { simplifyMasks } from "../../lib/og/simplifySvg"

vi.setConfig({ testTimeout: 180_000 })

const base = { slug: "", view: "", rank: "", opp: "", week: "" }
const q = (extra: Record<string, string>) => ({ ...base, ...extra }) as unknown as InsightQuery

const data = getPlayers()
const te = data.players.filter((p) => p.group === "te" && p.stats.length >= 4).sort((a, b) => b.games - a.games)
const qb = data.players.filter((p) => p.group === "qb" && p.stats.length >= 4).sort((a, b) => b.games - a.games)

const CARDS: Record<string, InsightQuery> = {
	player: q({ type: "player", slug: te[0].slug }),
	compare: q({ type: "compare", a: te[0].slug, b: te[1].slug, f: "h2h" }),
	"compare radar": q({ type: "compare", a: qb[0].slug, b: qb[1].slug, f: "radar" }),
	"compare tall": q({ type: "compare", a: te[0].slug, b: te[1].slug, f: "spot", side: "a", size: "tall" }),
	hub: q({ type: "hub" }),
	"flags team": q({ type: "flags", kind: "team", team: "LV" }),
	"flags board": q({ type: "flags", kind: "board", board: "latest" }),
	scout: q({ type: "scout", opp: "KC" }),
	last: q({ type: "last", kind: "chart" }),
	matchup: q({ type: "matchup", a: "LV", b: "KC" }),
	board: q({ type: "board", sort: "composite" }),
	twins: q({ type: "twins" }),
	rooting: q({ type: "rooting", team: "LV", goal: "playoffs" }),
	playoffs: q({ type: "playoffs", t: "LV" }),
}

const pixels = (svg: string, width: number, simplify: boolean) =>
	new Resvg(simplify ? simplifyMasks(svg) : svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().pixels

describe("simplifyMasks", () => {
	it("leaves an SVG with no masks, or one it cannot read, exactly as it was", () => {
		const plain = '<svg width="10" height="10"><rect width="5" height="5"/></svg>'
		expect(simplifyMasks(plain)).toBe(plain)
		const odd = '<svg width="10" height="10"><mask id="a"><linearGradient/></mask><g mask="url(#a)"/></svg>'
		expect(simplifyMasks(odd)).toBe(odd)
	})

	it("drops a mask that covers the whole canvas, and switches off what a zero-size mask hides", () => {
		const svg =
			'<svg width="100" height="50"><defs>' +
			'<mask id="all"><rect x="0" y="0" width="100" height="50" fill="#fff"/></mask>' +
			'<mask id="none"><rect x="0" y="0" width="0" height="50" fill="#fff" mask="url(#all)"/></mask>' +
			'<mask id="half"><rect x="0" y="0" width="50" height="50" fill="#fff" mask="url(#all)"/></mask>' +
			'</defs><g mask="url(#all)"><rect id="x" width="10" height="10"/></g><g mask="url(#none)"><rect id="y"/></g><g mask="url(#half)"><rect id="z"/></g></svg>'
		const out = simplifyMasks(svg)
		expect(out).not.toContain('mask="url(#all)"')
		expect(out).toContain('<g display="none"><rect id="y"/></g>')
		// A mask that really clips is kept, with its parent reference removed (the parent shows everything).
		expect(out).toContain('<g mask="url(#half)"><rect id="z"/></g>')
		expect(out).toContain('<mask id="half"><rect x="0" y="0" width="50" height="50" fill="#fff"/></mask>')
		expect(out).not.toContain('id="all"')
		expect(out).not.toContain('id="none"')
	})

	it("does not add display attributes to an SVG that already has them", () => {
		const svg = '<svg width="10" height="10"><mask id="n"><rect x="0" y="0" width="0" height="10" fill="#fff"/></mask><g display="inline" mask="url(#n)"/></svg>'
		expect(simplifyMasks(svg)).toContain('mask="url(#n)"')
	})
})

describe("rasterize", () => {
	for (const [name, query] of Object.entries(CARDS)) {
		it(`draws the ${name} card the same as before, with fewer masks`, async () => {
			const spec = insightSpec(query as never)
			expect(spec, name).toBeTruthy()
			const { width, height } = cardSize(spec as never)
			const svg = await satori(renderCard(spec as never), { width, height, fonts: ogFonts() })
			const before = pixels(svg, width, false)
			const after = pixels(svg, width, true)
			expect(after.length).toBe(before.length)
			let worst = 0
			let off = 0
			for (let i = 0; i < before.length; i++) {
				const d = Math.abs(before[i] - after[i])
				if (d > worst) worst = d
				if (d > 2) off++
			}
			// Identical to the eye: at most a stray anti-aliasing step on a handful of edge pixels.
			console.log(name, "worst", worst, "pixels off by >2:", off, "of", before.length / 4, "masks", (svg.match(/mask="url/g) ?? []).length, "->", (simplifyMasks(svg).match(/mask="url/g) ?? []).length)
			expect(worst).toBeLessThanOrEqual(24)
			expect(off).toBeLessThan(before.length / 5000)
			expect((simplifyMasks(svg).match(/mask="url/g) ?? []).length).toBeLessThanOrEqual((svg.match(/mask="url/g) ?? []).length)
			expect(rasterize(svg, width).length).toBeGreaterThan(1000)
		})
	}

	it("has every team to draw", () => {
		expect(Object.keys(TEAMS).length).toBeGreaterThan(30)
	})
})
