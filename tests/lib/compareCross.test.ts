import { describe, expect, it } from "vitest"

import {
	buildComparison,
	configQuery,
	crossDebates,
	headlineOf,
	readConfig,
	resolvePair,
	shareText,
	type CompareConfig,
} from "../../lib/lab/compareKit"
import { FAMILIES, familyFor, poolOf, rankIn, sharedFor } from "../../lib/lab/crossKit"
import { getPlayers } from "../../lib/lab/data"
import { isV2Site } from "../../lib/lab/labMethod"
import { STAT, statInfo, statOf, type PlayerGroup } from "../../lib/lab/playersKit"

const data = getPlayers()
// A running back's receiving stats (EPA per target, target share) exist only in the v2 method's data, so the back-and-receiver family needs it.
const v2 = isV2Site()
const cfg = (a: string, b: string, extra: Partial<CompareConfig> = {}): CompareConfig => ({ a, b, range: "season", metrics: null, group: null, sa: null, sb: null, ...extra })
/** Men who are graded on the family's first stat, best sample first. */
const graded = (g: PlayerGroup, key: string) =>
	data.players
		.filter((p) => p.group === g && statOf(p, key)?.season.r != null && p.stats.length >= 3)
		.sort((x, y) => (statOf(y, key)?.season.n ?? 0) - (statOf(x, key)?.season.n ?? 0))
const first = (g: PlayerGroup, key: string, n = 0) => graded(g, key)[n]

describe("which positions can be set side by side", () => {
	it("pairs the positions the Lab measures the same way, and nothing else", () => {
		expect(familyFor("wr", "te")?.id).toBe("receiving")
		expect(familyFor("te", "wr")?.id).toBe("receiving")
		expect(familyFor("rb", "wr")?.id).toBe(v2 ? "production" : undefined)
		expect(familyFor("te", "rb")?.id).toBe(v2 ? "production" : undefined)
		expect(familyFor("edge", "idl")?.id).toBe("passrush")
		expect(familyFor("saf", "cb")?.id).toBe("coverage")
		// the same position is the ordinary comparison, and these share no definition
		expect(familyFor("wr", "wr")).toBeNull()
		for (const [x, y] of [["qb", "te"], ["qb", "rb"], ["lb", "saf"], ["lb", "edge"], ["ol", "te"], ["cb", "wr"], ["k", "p"], ["edge", "cb"]] as [PlayerGroup, PlayerGroup][]) {
			expect(familyFor(x, y), `${x} ${y}`).toBeNull()
		}
	})

	it("uses only stats that both positions define the same way", () => {
		for (const f of FAMILIES) {
			for (const ga of f.groups) {
				for (const gb of f.groups) {
					if (ga === gb) continue
					for (const { stat, info } of sharedFor(f, ga, gb)) {
						const ia = statInfo(ga, stat.keys[ga] as string)!
						const ib = statInfo(gb, stat.keys[gb] as string)!
						// the same direction, the same unit, the same wording of the number, and never a line's (unit) stat
						expect(ia.higher, `${f.id} ${stat.id}`).toBe(ib.higher)
						// a graded stat reads the same on both sides; a style stat (a share) may be rounded differently, so it is worded once
						if (ia.higher !== null) {
							expect(ia.per, `${f.id} ${stat.id} per`).toBe(ib.per)
							for (const v of [-1.234, 0.0456, 0.5, 7.77, 63.2]) expect(ia.fmt(v), `${f.id} ${stat.id} ${v}`).toBe(ib.fmt(v))
						}
						expect(ia.unit).toBeUndefined()
						expect(info.label).toBeTruthy()
					}
				}
			}
		}
	})

	it("leaves out the stats whose definitions differ, and the ones that are not the family's topic", () => {
		const ids = (a: PlayerGroup, b: PlayerGroup) => sharedFor(familyFor(a, b)!, a, b).map((s) => s.stat.id)
		// a back's success rate is per carry, a receiver's per target; his carries have no receiver counterpart
		if (v2) {
			expect(ids("rb", "wr")).toEqual(["epaTgt", "share"])
			expect(ids("rb", "te")).toEqual(["epaTgt", "share"])
		}
		// tackling is not pass rushing or coverage
		expect(ids("edge", "idl")).toEqual(["pressRate", "sackRate", "tflRate"])
		expect(ids("cb", "saf")).not.toContain("missedPct")
		expect(ids("edge", "idl")).not.toContain("missedPct")
		// everything a wide receiver is measured on, a tight end is too
		expect(ids("wr", "te").sort()).toEqual(Object.keys(STAT.wr).filter((k) => STAT.te[k]).sort())
	})

	it("catalogues each shared stat only for the family's own positions, under the key each really has", () => {
		for (const f of FAMILIES) for (const st of f.stats) for (const g of Object.keys(st.keys)) expect(f.groups, `${f.id} ${st.id}`).toContain(g)
		const rb = FAMILIES.find((f) => f.id === "production")!.stats[0]
		expect(rb.keys.rb).toBe("recEpaTgt")
		expect(rb.keys.wr).toBe("epaTgt")
	})
})

describe("choosing the rows to compare", () => {
	it("keeps the ordinary comparison for two men at one job, and a family only when there is none", () => {
		const a = first("te", "epaTgt")
		const b = first("te", "epaTgt", 1)
		const same = resolvePair(data, cfg(a.slug, b.slug))
		expect("problem" in same).toBe(false)
		expect("problem" in same ? null : (same as { family?: unknown }).family).toBeUndefined()
		const w = first("wr", "epaTgt")
		const x = resolvePair(data, cfg(a.slug, w.slug))
		expect("problem" in x).toBe(false)
		if (!("problem" in x)) {
			expect(x.family?.id).toBe("receiving")
			expect([x.a.group, x.b.group]).toEqual(["te", "wr"])
		}
		const qb = data.players.find((p) => p.group === "qb")!
		const no = resolvePair(data, cfg(a.slug, qb.slug))
		expect("problem" in no && no.problem).toBe("jobs")
	})
})

describe("a comparison across positions", () => {
	const pairs: [PlayerGroup, string, PlayerGroup, string][] = [
		["te", "epaTgt", "wr", "epaTgt"],
		...(v2 ? ([["rb", "recEpaTgt", "wr", "epaTgt"], ["rb", "recEpaTgt", "te", "epaTgt"]] as [PlayerGroup, string, PlayerGroup, string][]) : []),
		["edge", "pressRate", "idl", "pressRate"],
		["cb", "yardsTgt", "saf", "yardsTgt"],
	]
	for (const [ga, ka, gb, kb] of pairs) {
		it(`holds together for ${ga} against ${gb}: shared stats only, one scale, ranks at each position`, () => {
			const A = first(ga, ka)
			const B = first(gb, kb)
			expect(A && B).toBeTruthy()
			const c = buildComparison(data, cfg(A.slug, B.slug))!
			expect(c).toBeTruthy()
			expect(c.cross).toBeTruthy()
			expect([c.a.group, c.b.group]).toEqual([ga, gb])
			const fam = FAMILIES.find((f) => f.id === c.cross!.family)!
			const allowed = new Set(sharedFor(fam, ga, gb).map((s) => s.stat.id))
			expect(c.metrics.length).toBeGreaterThan(0)
			for (const m of [...c.metrics, ...c.options, ...c.style]) {
				expect(allowed.has(m.key), m.key).toBe(true)
				// each man's number comes from his own catalog key
				expect(statOf(c.a, m.keys.a)).toBeTruthy()
				expect(statOf(c.b, m.keys.b)).toBeTruthy()
			}
			expect(c.line).toEqual([])
			for (const m of c.metrics) {
				for (const side of [m.a, m.b]) {
					if (side.pct !== null) {
						expect(side.pct).toBeGreaterThanOrEqual(0)
						expect(side.pct).toBeLessThanOrEqual(100)
					}
					if (side.rank !== null && side.of !== null) expect(side.rank).toBeLessThanOrEqual(side.of)
					// his own position's rank is kept beside the shared one
					if (c.range === "season" && side.rank !== null) {
						expect(side.own).toBeTruthy()
						expect(side.own!.rank).toBeLessThanOrEqual(side.own!.of)
					}
				}
				const better = (m.a.value - m.b.value) * (m.info.higher ? 1 : -1)
				if (m.lead === "a") expect(better).toBeGreaterThan(0)
				if (m.lead === "b") expect(better).toBeLessThan(0)
			}
			const t = c.tally
			expect(t.a + t.b + t.even + t.noise).toBe(c.metrics.length)
			// no overall is set against another position's
			expect(c.overall.lead).toBeNull()
			expect(c.radar.length === 0 || c.radar.length >= 3).toBe(true)
		})
	}

	it("ranks a number on one scale: the pool is both positions' graded men, and a better number never ranks lower", () => {
		const fam = FAMILIES.find((f) => f.id === "receiving")!
		const stat = fam.stats[0]
		const pool = poolOf(data, stat, "wr", "te")!
		const ranked = data.players.filter((p) => (p.group === "wr" || p.group === "te") && statOf(p, "epaTgt")?.season.r != null).length
		expect(pool.n).toBe(ranked)
		expect(pool.y.q[0]).toBeLessThan(pool.y.q[4])
		expect(rankIn(pool, pool.values[pool.n - 1] + 1)).toBe(1)
		expect(rankIn(pool, pool.values[0] - 1)).toBe(pool.n + 1)
		// the pool is the same whichever order the two positions are given
		expect(poolOf(data, stat, "te", "wr")).toBe(pool)
	})

	it("is the same comparison from either side: the same stats, the leads flipped", () => {
		const A = first("te", "epaTgt")
		const B = first("wr", "epaTgt")
		const x = buildComparison(data, cfg(A.slug, B.slug))!
		const y = buildComparison(data, cfg(B.slug, A.slug))!
		expect(y.metrics.map((m) => m.key)).toEqual(x.metrics.map((m) => m.key))
		const flip = (l: string) => (l === "a" ? "b" : l === "b" ? "a" : l)
		expect(y.metrics.map((m) => m.lead)).toEqual(x.metrics.map((m) => flip(m.lead)))
		expect(y.metrics.map((m) => m.a.pct)).toEqual(x.metrics.map((m) => m.b.pct))
	})

	it.runIf(v2)("matches a back's receiving to a receiver's under one label, whichever side he is on", () => {
		const R = first("rb", "recEpaTgt")
		const W = first("wr", "epaTgt")
		const x = buildComparison(data, cfg(R.slug, W.slug))!
		const y = buildComparison(data, cfg(W.slug, R.slug))!
		const ids = x.metrics.map((m) => m.key)
		expect(ids).toContain("epaTgt")
		expect(x.options.find((m) => m.key === "epaTgt")!.label).toBe(y.options.find((m) => m.key === "epaTgt")!.label)
		expect(x.options.find((m) => m.key === "epaTgt")!.keys).toEqual({ a: "recEpaTgt", b: "epaTgt" })
		expect(y.options.find((m) => m.key === "epaTgt")!.keys).toEqual({ a: "epaTgt", b: "recEpaTgt" })
		// nothing about carries or a per-carry success rate is shown
		const shown = [...x.options, ...x.style, ...x.metrics].map((m) => m.key)
		for (const k of ["epaRush", "success", "explosive", "yco", "stuffRate", "touchEpa", "ybc"]) expect(shown).not.toContain(k)
	})

	it("says plainly that the positions differ, and what the numbers cannot tell", () => {
		const A = first("te", "epaTgt")
		const B = first("wr", "epaTgt")
		const c = buildComparison(data, cfg(A.slug, B.slug))!
		expect(c.cross!.tags).toEqual({ a: "TE", b: "WR" })
		expect(c.cross!.caveats.length).toBeGreaterThan(0)
		expect(c.headline).toMatch(/\((TE|WR)\)/)
		expect(c.headline).toMatch(/shared stat|too close|too early|split|no stat/)
		expect(c.insights[0]).toMatch(/is a tight end and .* is a wide receiver/)
		expect(c.insights.join(" ")).toMatch(/Against his own position/)
		expect(c.basis).toMatch(/One scale for both positions/)
		expect(shareText(c)).toContain("(TE vs WR)")
		expect(shareText(c).length).toBeLessThan(250)
		const er = first("edge", "pressRate")
		const dt = first("idl", "pressRate")
		const p = buildComparison(data, cfg(er.slug, dt.slug))!
		expect(p.insights[0]).toMatch(/is an edge rusher and .* is an interior lineman/)
		expect(p.cross!.skipped.join(" ")).toMatch(/tackling/)
	})

	it("reads the recent games against the same pool, and gives no own-position rank for a window", () => {
		const A = first("te", "epaTgt")
		const B = first("wr", "epaTgt")
		const c = buildComparison(data, cfg(A.slug, B.slug, { range: "form" }))
		if (!c) return
		expect(c.basis).toMatch(/tight ends and wide receivers/)
		for (const m of c.metrics) for (const s of [m.a, m.b]) if (s.pct !== null) expect(s.own).toBeNull()
	})

	it("keeps the ordinary comparison exactly as it was: no cross note, no own-position rank, the position's own scale", () => {
		const a = first("te", "epaTgt")
		const b = first("te", "epaTgt", 1)
		const c = buildComparison(data, cfg(a.slug, b.slug))!
		expect(c.cross).toBeNull()
		for (const m of c.metrics) {
			expect(m.keys).toEqual({ a: m.key, b: m.key })
			expect(m.a.own).toBeNull()
			expect(m.a.yard).toBe(data.yard.te![m.key])
		}
		expect(c.headline).not.toMatch(/shared/)
		expect(c.basis).toMatch(/Percentile is each player's season rank among tight ends/)
	})

	it("keeps the address short and the same: the family follows from the two players", () => {
		const A = first("te", "epaTgt")
		const B = first("wr", "epaTgt")
		expect(configQuery(cfg(A.slug, B.slug))).toBe(`a=${A.slug}&b=${B.slug}`)
		expect(readConfig(Object.fromEntries(new URLSearchParams(configQuery(cfg(A.slug, B.slug, { metrics: ["epaTgt", "croe"] })))))).toEqual(cfg(A.slug, B.slug, { metrics: ["epaTgt", "croe"] }))
		// a chosen stat that only one position has is dropped, not scored
		const c = buildComparison(data, cfg(A.slug, B.slug, { metrics: ["epaTgt", "epaRush"] }))!
		expect(c.metrics.map((m) => m.key)).toEqual(["epaTgt"])
	})
})

describe("a comparison with one shared stat", () => {
	it.runIf(v2)("is named in the headline, not counted as '1 of 1'", () => {
		const R = first("rb", "recEpaTgt")
		const W = first("wr", "epaTgt")
		const c = buildComparison(data, cfg(R.slug, W.slug))!
		expect(c.metrics.length).toBe(1)
		expect(c.headline).not.toMatch(/1 of 1/)
		expect(headlineOf(c)).toMatch(/EPA per target|too close|too early|no stat/i)
	})
})

describe("debates across positions", () => {
	it("are real cross-position pairs that compare on something", () => {
		const d = crossDebates(data, 4)
		expect(d.length).toBeGreaterThan(0)
		const seen = new Set<string>()
		for (const { a, b, tag } of d) {
			expect(a.group).not.toBe(b.group)
			expect(familyFor(a.group, b.group)).toBeTruthy()
			expect(buildComparison(data, cfg(a.slug, b.slug))?.cross).toBeTruthy()
			expect(tag).toMatch(/ vs /)
			const key = [a.slug, b.slug].sort().join("|")
			expect(seen.has(key)).toBe(false)
			seen.add(key)
		}
	})
})
