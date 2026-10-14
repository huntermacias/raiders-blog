import { describe, expect, it } from "vitest"

import { buildComparison, compareUrl, configQuery, headlineOf, nameOf, readConfig, resolvePair, viewsFor, type CompareConfig } from "../../lib/lab/compareKit"
import { getPlayers } from "../../lib/lab/data"
import { getPlayerHistory } from "../../lib/lab/playerHistoryData"
import { seasonsOf } from "../../lib/lab/seasonKit"

const data = getPlayers()
const history = getPlayerHistory()
const qbs = data.players.filter((p) => p.group === "qb" && seasonsOf(data, history, p.slug, "qb").length >= 3)
const [x, z] = qbs
const past = seasonsOf(data, history, x.slug, "qb").filter((s) => s < data.season)
const cfg = (extra: Partial<CompareConfig> = {}): CompareConfig => ({ a: x.slug, b: z.slug, range: "season", metrics: null, group: null, sa: null, sb: null, ...extra })

describe("the season in the address", () => {
	it("reads one season for both, or one for each, and ignores nonsense", () => {
		expect(readConfig({ a: "a", b: "b", y: "2024" })).toMatchObject({ sa: 2024, sb: 2024 })
		expect(readConfig({ a: "a", b: "b", ya: "2022", yb: "2025" })).toMatchObject({ sa: 2022, sb: 2025 })
		expect(readConfig({ a: "a", b: "b", y: "2024", yb: "2023" })).toMatchObject({ sa: 2024, sb: 2023 })
		for (const bad of ["abc", "24", "20245", "1800", "2024.5", ""]) expect(readConfig({ a: "a", b: "b", y: bad })).toMatchObject({ sa: null, sb: null })
		expect(readConfig({ a: "a", b: "b" })).toMatchObject({ sa: null, sb: null })
	})

	it("writes the shortest address that says the same, and round-trips", () => {
		expect(configQuery(cfg({ sa: 2024, sb: 2024 }))).toContain("&y=2024")
		expect(configQuery(cfg({ sa: 2024, sb: 2024 }))).not.toContain("ya=")
		expect(configQuery(cfg({ sa: 2022, sb: null }))).toContain("&ya=2022")
		expect(configQuery(cfg({ sa: 2022, sb: null }))).not.toContain("yb=")
		expect(configQuery(cfg())).not.toMatch(/[&?]y[ab]?=/)
		for (const c of [cfg(), cfg({ sa: 2024, sb: 2024 }), cfg({ sa: 2022, sb: 2025 }), cfg({ sa: null, sb: 2023 })]) {
			expect(readConfig(Object.fromEntries(new URLSearchParams(configQuery(c))))).toMatchObject({ sa: c.sa, sb: c.sb })
		}
		expect(compareUrl(cfg({ sa: 2024, sb: 2024 }))).toMatch(/^\/lab\/players\/compare\?a=.*&y=2024$/)
	})
})

describe("which season each man is measured in", () => {
	it("is the current one unless a season on file is asked for", () => {
		expect(viewsFor(data, cfg(), history).a).toBe(data)
		expect(viewsFor(data, cfg({ sa: 1999 }), history).a).toBe(data)
		expect(viewsFor(data, cfg({ sa: past[0] }), null).a).toBe(data)
		const v = viewsFor(data, cfg({ sa: past[0], sb: null }), history)
		expect(v.a.season).toBe(past[0])
		expect(v.b).toBe(data)
	})

	it("lets a man be set against himself in another season, but not in the same one", () => {
		const views = viewsFor(data, cfg({ b: x.slug, sa: past[0] }), history)
		expect("problem" in resolvePair(views.a, { a: x.slug, b: x.slug, group: null }, views.b)).toBe(false)
		const same = viewsFor(data, cfg({ b: x.slug }), history)
		expect(resolvePair(same.a, { a: x.slug, b: x.slug, group: null }, same.b)).toMatchObject({ problem: "same" })
		const both = viewsFor(data, cfg({ b: x.slug, sa: past[0], sb: past[0] }), history)
		expect(resolvePair(both.a, { a: x.slug, b: x.slug, group: null }, both.b)).toMatchObject({ problem: "same" })
	})

	it("says the man has no line when he did not play that season", () => {
		const rookie = data.players.find((p) => p.group === "qb" && seasonsOf(data, history, p.slug, "qb").length === 1)
		if (!rookie) return
		const v = viewsFor(data, cfg({ b: rookie.slug, sb: past[0] }), history)
		expect(resolvePair(v.a, { a: x.slug, b: rookie.slug, group: null }, v.b)).toMatchObject({ problem: "missing" })
	})
})

describe("a comparison across seasons", () => {
	const self = buildComparison(data, cfg({ b: x.slug, sa: past[0], sb: null }), history)!
	const year = buildComparison(data, cfg({ sa: past[0], sb: past[0] }), history)!

	it("sets a man against himself, each measured against his own season's league", () => {
		expect(self).not.toBeNull()
		expect(self.a.slug).toBe(self.b.slug)
		expect(self.seasons).toEqual({ a: past[0], b: data.season })
		expect(self.views.a.season).toBe(past[0])
		expect(self.views.b).toBe(data)
		expect(self.metrics.length).toBeGreaterThan(0)
		expect(self.rangeName).toBe(`${past[0]} and ${data.season}`)
		expect(self.basis).toMatch(/different season's league/)
	})

	it("names each side with its season when they differ, and plainly when they do not", () => {
		expect(nameOf(self, "a")).toBe(`${x.name} (${past[0]})`)
		expect(nameOf(self, "b")).toBe(`${x.name} (${data.season})`)
		expect(self.headline).toContain(`(${past[0]})`)
		expect(nameOf(year, "a")).toBe(x.name)
		expect(headlineOf(year)).not.toMatch(/\(\d{4}\)/)
	})

	it("is one whole season for both when one year is asked for, whatever stretch was in the address", () => {
		expect(year.seasons).toEqual({ a: past[0], b: past[0] })
		const asked = buildComparison(data, cfg({ sa: past[0], sb: past[0], range: "form" }), history)!
		expect(asked.range).toBe("season")
		expect(year.rangeName).toBe(`${past[0]} season`)
		expect(year.rangeWeeks).toMatch(/full season/)
		expect(year.early).toEqual({ a: false, b: false })
	})

	it("judges a past season on its own numbers and the current one on its history when both are current", () => {
		for (const m of year.metrics) expect(m.basis).toBe("season")
		const now = buildComparison(data, cfg(), history)!
		const hist = now.metrics.filter((m) => m.basis === "history")
		for (const m of hist) {
			expect(m.a.post).not.toBeNull()
			expect(m.b.post).not.toBeNull()
		}
	})

	it("leaves the current comparison exactly as it was when no history is given", () => {
		const plain = buildComparison(data, cfg())!
		const withNone = buildComparison(data, cfg({ sa: past[0], sb: past[0] }), null)!
		expect(withNone.seasons).toEqual({ a: data.season, b: data.season })
		expect(withNone.metrics.map((m) => [m.key, m.lead])).toEqual(plain.metrics.map((m) => [m.key, m.lead]))
	})
})
