import { describe, expect, it } from "vitest"

import {
	MAX_METRICS,
	buildComparison,
	compareUrl,
	configQuery,
	featuredDebates,
	headlineOf,
	insightsOf,
	lastName,
	pctWord,
	readConfig,
	resolvePair,
	shareText,
	spotlightOf,
	type CompareConfig,
} from "../../lib/lab/compareKit"
import { getPlayers } from "../../lib/lab/data"
import { GROUP_ORDER, gradeScore, hasOverall, stretchGrade, overall, type PlayerGroup } from "../../lib/lab/playersKit"

const data = getPlayers()
const cfg = (a: string, b: string, extra: Partial<CompareConfig> = {}): CompareConfig => ({ a, b, range: "season", metrics: null, group: null, ...extra })
const of = (g: PlayerGroup) => data.players.filter((p) => p.group === g && p.stats.length >= 4).sort((x, y) => y.games - x.games)

describe("reading a comparison from the address", () => {
	it("keeps good slugs, ranges and stat keys and drops everything else", () => {
		const c = readConfig({ a: "brock-bowers", b: "../etc/passwd", r: "form", m: "epaTgt,epaTgt,croe,<script>,x y", g: "te" })
		expect(c.a).toBe("brock-bowers")
		expect(c.b).toBe("")
		expect(c.range).toBe("form")
		expect(c.metrics).toEqual(["epaTgt", "croe"])
		expect(c.group).toBe("te")
	})

	it("falls back to the season, the default stats and no job when the address is junk", () => {
		expect(readConfig({ r: "decade", g: "kicker-ish", m: "" })).toEqual({ a: "", b: "", range: "season", metrics: null, group: null })
	})

	it("limits how many stats can be chosen", () => {
		const many = Array.from({ length: 30 }, (_, i) => `s${i}`).join(",")
		expect(readConfig({ m: many }).metrics).toHaveLength(MAX_METRICS)
	})

	it("writes a short address that reads back to the same comparison", () => {
		expect(configQuery(cfg("a-b", "c-d"))).toBe("a=a-b&b=c-d")
		const full = cfg("a-b", "c-d", { range: "earlier", metrics: ["epaTgt", "croe"], group: "te" })
		expect(configQuery(full)).toBe("a=a-b&b=c-d&r=earlier&m=epaTgt,croe&g=te")
		const q = Object.fromEntries(new URLSearchParams(configQuery(full)))
		expect(readConfig(q)).toEqual(full)
		expect(compareUrl(cfg("a-b", "c-d"))).toBe("/lab/players/compare?a=a-b&b=c-d")
	})
})

describe("choosing which row of each man to compare", () => {
	it("reports the pair problems instead of guessing", () => {
		const te = of("te")
		const qb = of("qb")
		expect("problem" in resolvePair(data, cfg("nobody-here", te[0].slug))).toBe(true)
		const same = resolvePair(data, cfg(te[0].slug, te[0].slug))
		expect("problem" in same && same.problem).toBe("same")
		const jobs = resolvePair(data, cfg(te[0].slug, qb[0].slug))
		expect("problem" in jobs && jobs.problem).toBe("jobs")
		const ok = resolvePair(data, cfg(te[0].slug, te[1].slug))
		expect("problem" in ok).toBe(false)
	})
})

describe("the comparison, for any two players at the same job", () => {
	for (const g of GROUP_ORDER) {
		const pool = of(g)
		if (pool.length < 2) continue
		it(`holds together for ${g}: leads follow the numbers, the tally adds up and nothing is out of range`, () => {
			const [a, b] = pool
			const c = buildComparison(data, cfg(a.slug, b.slug))!
			expect(c).toBeTruthy()
			expect(c.group).toBe(g)
			for (const m of c.metrics) {
				for (const side of [m.a, m.b]) {
					if (side.pct !== null) {
						expect(side.pct).toBeGreaterThanOrEqual(0)
						expect(side.pct).toBeLessThanOrEqual(100)
					}
				}
				// Whoever has the better number leads; "even" is only ever a toss-up or a style stat.
				if (m.info.higher !== null && m.lead !== "even") {
					const better = (m.a.value - m.b.value) * (m.info.higher ? 1 : -1)
					expect(m.lead).toBe(better > 0 ? "a" : "b")
				}
				if (m.info.higher === null) expect(m.lead).toBe("even")
			}
			const counted = c.metrics.filter((m) => m.signal !== "luck")
			expect(c.tally.a + c.tally.b + c.tally.even).toBe(counted.length)
			expect(c.tally.noise).toBe(c.metrics.length - counted.length)
			expect(c.tally.clearA).toBeLessThanOrEqual(c.tally.a)
			expect(c.tally.clearB).toBeLessThanOrEqual(c.tally.b)
			expect(c.headline.length).toBeGreaterThan(10)
			expect(c.radar.length === 0 || (c.radar.length >= 3 && c.radar.length <= 8)).toBe(true)
			for (const r of c.radar) {
				expect(r.a).toBeGreaterThanOrEqual(0)
				expect(r.b).toBeLessThanOrEqual(100)
			}
			// Overall grades are on the Lab's 1 to 99 scale, or absent for a job with none.
			if (hasOverall(g)) {
				for (const o of [c.overall.a, c.overall.b]) if (o !== null) expect(o).toBeGreaterThanOrEqual(1)
			} else {
				expect(c.overall).toEqual({ a: null, b: null, lead: null })
			}
		})
	}

	it("flips cleanly when the two sides swap", () => {
		const [a, b] = of("wr")
		const x = buildComparison(data, cfg(a.slug, b.slug))!
		const y = buildComparison(data, cfg(b.slug, a.slug))!
		expect(y.metrics.map((m) => m.key)).toEqual(x.metrics.map((m) => m.key))
		expect(y.tally.a).toBe(x.tally.b)
		expect(y.tally.b).toBe(x.tally.a)
		for (const [i, m] of Array.from(x.metrics.entries())) expect(y.metrics[i].lead).toBe(m.lead === "a" ? "b" : m.lead === "b" ? "a" : "even")
	})

	it("calls a lower number better on a lower-is-better stat", () => {
		const pool = of("qb")
		let checked = 0
		for (const a of pool.slice(0, 8)) {
			for (const b of pool.slice(0, 8)) {
				if (a.slug >= b.slug) continue
				const c = buildComparison(data, cfg(a.slug, b.slug))
				for (const m of c?.metrics ?? []) {
					if (m.info.higher === false && m.lead !== "even") {
						expect(m.lead).toBe(m.a.value < m.b.value ? "a" : "b")
						checked++
					}
				}
			}
		}
		expect(checked).toBeGreaterThan(0)
	})

	it("scores a recent-games window on the window's own numbers, never the season's", () => {
		const [a, b] = of("te")
		const season = buildComparison(data, cfg(a.slug, b.slug))!
		const form = buildComparison(data, cfg(a.slug, b.slug, { range: "form" }))
		expect(form).toBeTruthy()
		expect(form!.rangeName).not.toBe(season.rangeName)
		for (const m of form!.metrics) {
			const s = season.options.find((o) => o.key === m.key)
			if (s) expect(m.a.n).toBeLessThanOrEqual(s.a.n)
			// A window has no season rank to quote.
			expect(m.a.rank).toBeNull()
		}
	})

	it("uses exactly the chosen stats, in the order given, and ignores keys the job does not have", () => {
		const [a, b] = of("te")
		const keys = buildComparison(data, cfg(a.slug, b.slug))!.options.map((m) => m.key)
		const pick = [keys[1], keys[0]]
		const c = buildComparison(data, cfg(a.slug, b.slug, { metrics: [...pick, "notAStat"] }))!
		expect(c.metrics.map((m) => m.key)).toEqual(pick)
	})

	it("never puts a lineman's shared line stats into the score", () => {
		const [a, b] = of("ol")
		const c = buildComparison(data, cfg(a.slug, b.slug))!
		expect(c.overall.a).toBeNull()
		for (const m of c.metrics) expect(m.info.unit).toBeFalsy()
		expect(c.line.length).toBeGreaterThan(0)
	})
})

describe("the words", () => {
	const [a, b] = of("te")
	const c = buildComparison(data, cfg(a.slug, b.slug))!

	it("says plainly when nobody leads, and never claims a lead the numbers do not give", () => {
		const base = { a: a, b: b, rangeName: "Season to date", overall: c.overall, metrics: c.metrics }
		expect(headlineOf({ ...base, tally: { a: 0, b: 0, even: 0, clearA: 0, clearB: 0, noise: 3 } })).toMatch(/Too early/)
		expect(headlineOf({ ...base, tally: { a: 0, b: 0, even: 2, clearA: 0, clearB: 0, noise: 0 } })).toMatch(/too close to separate on these 2 stats/)
		expect(headlineOf({ ...base, tally: { a: 0, b: 0, even: 1, clearA: 0, clearB: 0, noise: 0 } })).toMatch(/the one stat that counts/)
		expect(headlineOf({ ...base, tally: { a: 3, b: 1, even: 0, clearA: 0, clearB: 0, noise: 0 } })).toMatch(/slight edge on 3 of 4 stats; none of the gaps is clear/)
		expect(headlineOf({ ...base, tally: { a: 3, b: 1, even: 0, clearA: 2, clearB: 0, noise: 0 } })).toMatch(/leads 3 of 4 stats\./)
		expect(headlineOf({ ...base, tally: { a: 2, b: 2, even: 0, clearA: 0, clearB: 0, noise: 0 } })).toMatch(/split 4 stats 2 to 2/)
	})

	it("gives a post that leaves room for the link on X", () => {
		const text = shareText(c)
		expect(text.length).toBeLessThan(250)
		expect(text).toContain(a.name)
		expect(text).toContain(b.name)
	})

	it("explains the comparison in sentences with no leftover template text", () => {
		const out = insightsOf(c)
		expect(out.length).toBeGreaterThan(0)
		for (const s of out) expect(s).not.toMatch(/undefined|NaN|\[object|\{\}/)
	})

	it("finds a player's best case, only from numbers that are at least average or that he wins", () => {
		const s = spotlightOf(c, "a", 4)
		expect(s.length).toBeLessThanOrEqual(4)
		for (const m of s) expect(m.lead === "a" || (m.a.pct ?? 0) >= 50 || m.signal === "luck").toBe(true)
	})

	it("words a percentile the way a reader expects", () => {
		expect(pctWord(null)).toBe("")
		expect(pctWord(97)).toMatch(/^Top \d+%$/)
		expect(pctWord(20)).toMatch(/percentile$/)
		expect(lastName(a)).not.toBe("")
	})
})

describe("overall grades over any stretch", () => {
	it("read on the same scale as the season grade", () => {
		const p = of("wr")[0]
		expect(stretchGrade(data, overall(p))).toBe(gradeScore(data, p))
		expect(stretchGrade(data, null)).toBeNull()
	})
})

describe("the debates on offer from an empty page", () => {
	const d = featuredDebates(data, 10)
	it("are real pairs at the same job, with no pair twice and no man against himself", () => {
		expect(d.length).toBeGreaterThan(3)
		const seen = new Set<string>()
		for (const x of d) {
			expect(x.a.group).toBe(x.b.group)
			expect(x.a.slug).not.toBe(x.b.slug)
			const key = [x.a.slug, x.b.slug].sort().join("|")
			expect(seen.has(key)).toBe(false)
			seen.add(key)
			expect("problem" in resolvePair(data, cfg(x.a.slug, x.b.slug))).toBe(false)
			expect(buildComparison(data, cfg(x.a.slug, x.b.slug))?.metrics.length ?? 0).toBeGreaterThan(0)
		}
		expect(d.length).toBeLessThanOrEqual(10)
	})
})
