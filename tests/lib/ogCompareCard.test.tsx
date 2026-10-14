// @vitest-environment node
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { describe, expect, it, vi } from "vitest"

import { readConfig } from "../../lib/lab/compareKit"
import { getPlayers } from "../../lib/lab/data"
import { getPlayerHistory } from "../../lib/lab/playerHistoryData"
import { seasonsOf } from "../../lib/lab/seasonKit"
import { GROUP_ORDER } from "../../lib/lab/playersKit"
import { TEAMS } from "../../lib/nfl"
import { cardSize, renderCard } from "../../lib/og/cards"
import { buildCompareSpec, pairColors } from "../../lib/og/compareCards"
import { ogFonts } from "../../lib/og/fonts"
import { insightSpec, type InsightQuery } from "../../lib/og/insightSpecs"

vi.setConfig({ testTimeout: 180_000 })

const data = getPlayers()
const pool = (g: string) => data.players.filter((p) => p.group === g && p.stats.length >= 4).sort((a, b) => b.games - a.games)
const te = pool("te")
const q = (extra: Record<string, string>): InsightQuery => ({ type: "compare", slug: "", view: "", rank: "", opp: "", week: "", ...extra }) as InsightQuery

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const apart = (x: string, y: string) => Math.hypot(...hex(x).map((v, i) => v - hex(y)[i]))

async function png(spec: NonNullable<ReturnType<typeof buildCompareSpec>>, scale = 1) {
	const { width, height } = cardSize(spec)
	const svg = await satori(renderCard(spec), { width, height, fonts: ogFonts() })
	return new Resvg(svg, { fitTo: { mode: "width", value: width * scale } }).render().asPng()
}
const dims = (b: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => {
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
	return { w: v.getUint32(16), h: v.getUint32(20) }
}

describe("the comparison card's spec", () => {
	it("holds both players, the stats with their percentiles and the comparison's own link", () => {
		const s = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug }))!
		expect(s.type).toBe("compare")
		expect(s.a.name).toBe(te[0].name)
		expect(s.b.name).toBe(te[1].name)
		expect(s.rows.length).toBeGreaterThan(0)
		expect(s.rows.length).toBeLessThanOrEqual(6)
		for (const r of s.rows) for (const p of [r.aPct, r.bPct]) if (p !== null) expect(p).toBeGreaterThanOrEqual(0)
		expect(s.link).toBe(`raidersrundown.com/lab/players/compare?a=${te[0].slug}&b=${te[1].slug}`)
		expect(s.range).toMatch(/Season to date/)
	})

	it("carries a chosen stretch of games into the printed link and the label, but not the stat list", () => {
		const s = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug, r: "form", m: "croe,share" }))!
		expect(s.link).toContain("&r=form")
		expect(s.link).not.toContain("m=")
		expect(s.range).not.toMatch(/Season to date/)
		expect(s.rows.map((r) => r.label).join(" ")).toMatch(/CROE|Catches/i)
		expect(s.rows).toHaveLength(2)
	})

	it("is null for a pair that cannot be compared and for an unknown player", () => {
		expect(buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[0].slug }))).toBeNull()
		expect(buildCompareSpec(data, readConfig({ a: te[0].slug, b: pool("qb")[0].slug }))).toBeNull()
		expect(buildCompareSpec(data, readConfig({ a: "nobody", b: te[0].slug }))).toBeNull()
	})

	it("falls back to the head to head when a radar or a spotlight has too little to draw", () => {
		const ol = pool("ol")
		const s = buildCompareSpec(data, readConfig({ a: ol[0].slug, b: ol[1].slug }), { format: "radar" })!
		expect(s.format).toBe("h2h")
		expect(buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug, m: "croe,share" }), { format: "radar" })!.format).toBe("h2h")
	})

	it("is taller on the tall size and shows more stats there", () => {
		const w = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug }), { size: "wide" })!
		const t = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug }), { size: "tall" })!
		expect(cardSize(w)).toEqual({ width: 1200, height: 630 })
		expect(cardSize(t)).toEqual({ width: 1080, height: 1350 })
		expect(t.rows.length).toBeGreaterThanOrEqual(w.rows.length)
	})

	it("keeps luck stats out of the lead column and never calls them clear", () => {
		const s = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug }))!
		for (const r of s.rows) if (r.luck) expect(r.lead === "even" && !r.clear).toBe(true)
	})
})

describe("telling the two players apart", () => {
	it("never gives two players the same colour, for any two teams (including the same team)", () => {
		const abbrs = TEAMS.map((t) => t.abbr)
		for (const x of abbrs) for (const y of abbrs) {
			const [a, b] = pairColors(x, y)
			expect(apart(a, b), `${x} vs ${y}`).toBeGreaterThanOrEqual(100)
		}
	})
})

describe("the card route's choice", () => {
	it("picks the comparison card for a clean pair and its format, side and size", () => {
		const base = { a: te[0].slug, b: te[1].slug }
		expect(insightSpec(q(base))?.type).toBe("compare")
		const radar = insightSpec(q({ ...base, f: "radar", size: "tall" })) as never as { format: string; size: string }
		expect(radar.size).toBe("tall")
		expect(["radar", "h2h"]).toContain(radar.format)
		const spot = insightSpec(q({ ...base, f: "spot", side: "b" })) as never as { spot: { side: string } | null }
		if (spot.spot) expect(spot.spot.side).toBe("b")
	})

	it("refuses anything that is not a clean slug", () => {
		expect(insightSpec(q({ a: "../etc", b: te[1].slug }))).toBeNull()
		expect(insightSpec(q({ a: te[0].slug, b: "" }))).toBeNull()
		expect(insightSpec(q({ a: te[0].slug, b: "Not A Slug" }))).toBeNull()
	})
})

describe("drawing the card", () => {
	it("renders every format at both sizes to a real PNG of the right size", async () => {
		for (const format of ["h2h", "radar", "spot"] as const) {
			for (const size of ["wide", "tall"] as const) {
				const s = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug }), { format, size })!
				const out = await png(s)
				const { width, height } = cardSize(s)
				expect(out.length).toBeGreaterThan(20_000)
				expect(dims(out)).toEqual({ w: width, h: height })
			}
		}
	})

	it("renders at twice the pixels for the high-resolution download", async () => {
		const s = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug }))!
		expect(dims(await png(s, 2))).toEqual({ w: 2400, h: 1260 })
	})

	it("draws initials in place of a missing photo and a photo when there is one", async () => {
		const s = buildCompareSpec(data, readConfig({ a: te[0].slug, b: te[1].slug }))!
		expect(s.a.photo ?? null).toBeNull()
		const dot = `data:image/png;base64,${btoa(String.fromCharCode(...Array.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#888"/></svg>`).render().asPng())))}`
		const withPhoto = { ...s, a: { ...s.a, photo: dot }, b: { ...s.b, photo: dot } }
		expect((await png(withPhoto)).length).toBeGreaterThan(20_000)
	})

	// A card whose content runs past the picture can crash the renderer outright, so every job is drawn here with the longest names and busiest stat lists.
	it("fits every job: the longest names and the most stats, in every format and size", async () => {
		for (const g of GROUP_ORDER) {
			const all = data.players.filter((p) => p.group === g)
			const picks = [...all].sort((a, b) => b.name.length - a.name.length).slice(0, 1).concat([...all].sort((a, b) => b.stats.length - a.stats.length).slice(0, 2))
			const [x, y] = Array.from(new Set(picks))
			if (!x || !y) continue
			for (const format of ["h2h", "radar", "spot"] as const) {
				for (const size of ["wide", "tall"] as const) {
					const s = buildCompareSpec(data, readConfig({ a: x.slug, b: y.slug }), { format, size })
					if (s) expect((await png(s)).length, `${g} ${format} ${size}`).toBeGreaterThan(10_000)
				}
			}
		}
	})
})

describe("the comparison card across seasons", () => {
	const history = getPlayerHistory()
	const x = data.players.find((p) => p.group === "qb" && seasonsOf(data, history, p.slug, "qb").length >= 3)!
	const old = seasonsOf(data, history, x.slug, "qb")[0]

	it("names each man's season, says which seasons on the card and prints the season in the link", () => {
		const s = buildCompareSpec(data, readConfig({ a: x.slug, b: x.slug, ya: String(old) }), {}, history)!
		expect(s).not.toBeNull()
		expect(s.a.team).toContain(String(old))
		expect(s.b.team).toContain(String(data.season))
		expect(s.a.last).toBe(`${x.name.split(" ").slice(1).join(" ")} ${old}`)
		expect(s.range).toBe(`${old} and ${data.season} seasons`)
		expect(s.link).toContain(`ya=${old}`)
		expect(s.headline).toContain(`(${old})`)
	})

	it("is one past season for both, and the card draws", async () => {
		const y = seasonsOf(data, history, te[0].slug, "te").find((v) => v < data.season)
		const peer = te.find((p) => seasonsOf(data, history, p.slug, "te").includes(y ?? 0) && p.slug !== te[0].slug)
		if (!y || !peer) return
		const s = buildCompareSpec(data, readConfig({ a: te[0].slug, b: peer.slug, y: String(y) }), { format: "h2h" }, history)!
		expect(s.range).toBe(`${y} season · Full season`)
		expect(s.a.last).toContain(String(y))
		expect((await png(s)).length).toBeGreaterThan(10_000)
	})

	it("reads the season from the card's own query", () => {
		const s = insightSpec(q({ a: x.slug, b: x.slug, ya: String(old) }))
		expect(s && s.type === "compare" && s.a.team.includes(String(old))).toBe(true)
	})

	it("is the usual card when no history is given", () => {
		const s = buildCompareSpec(data, readConfig({ a: x.slug, b: x.slug, ya: String(old) }))
		expect(s).toBeNull()
	})
})
