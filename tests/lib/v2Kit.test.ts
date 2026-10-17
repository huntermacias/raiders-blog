// The v2 Player Lab model, checked on the staged v2 data (data/lab/v2). The modules are loaded with the flag ON in every run, whatever
// the run's own setting, so the default `vitest run` exercises v2 as well as v1. A separate block checks the flag OFF changes nothing.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

type Kit = typeof import("../../lib/lab/v2/kit")
type Players = typeof import("../../lib/lab/playersKit")
type V2Types = typeof import("../../lib/lab/v2/types")
type DataMod = typeof import("../../lib/lab/data")
type Compare = typeof import("../../lib/lab/compareKit")

let kit: Kit
let pk: Players
let types: V2Types
let data: import("../../lib/lab/v2/types").V2Data
let compare: Compare

beforeAll(async () => {
	vi.stubEnv("NEXT_PUBLIC_LAB_METHOD", "v2")
	vi.resetModules()
	kit = await import("../../lib/lab/v2/kit")
	pk = await import("../../lib/lab/playersKit")
	types = await import("../../lib/lab/v2/types")
	compare = await import("../../lib/lab/compareKit")
	const d = (await import("../../lib/lab/data")) as DataMod
	data = d.getPlayers() as unknown as typeof data
})
afterAll(() => {
	vi.unstubAllEnvs()
	vi.resetModules()
})

const byName = (n: string) => data.players.find((p) => p.name === n)

describe("the staged v2 data", () => {
	it("is v2 data, with the policy for every job and the fixed scale", () => {
		expect(types.isV2(data)).toBe(true)
		expect(data.method.version).toBe(2)
		for (const g of pk.GROUP_ORDER) expect(data.method.policy[g], g).toBeTruthy()
		expect(data.method.scale.calibration).toBe(1.45)
	})

	it("reads each job on the same stat the policy says is its primary (the TypeScript table and the builder agree)", () => {
		for (const [g, key] of Object.entries(pk.V2_OBSERVED_KEY)) {
			expect(data.method.policy[g as keyof typeof data.method.policy]?.primary, g).toBe(key)
		}
	})

	it("has a catalog entry for every stat the data holds, and ranks exactly the stats the catalog grades", () => {
		const seen = new Map<string, { n: number; ranked: number }>()
		for (const p of data.players)
			for (const s of p.stats) {
				const e = seen.get(`${p.group}.${s.k}`) ?? { n: 0, ranked: 0 }
				e.n++
				if (s.season.r != null) e.ranked++
				seen.set(`${p.group}.${s.k}`, e)
			}
		for (const [k, e] of Array.from(seen)) {
			const [g, key] = k.split(".")
			const info = pk.statInfo(g as never, key)
			expect(info, k).toBeTruthy()
			// A unit stat (a line's) is ranked though it is not a man's own; a style or role stat is never ranked.
			if (info!.higher === null) expect(e.ranked, `${k} is a style or role stat and must not be ranked`).toBe(0)
		}
	})
})

describe("this season", () => {
	it("is the job's primary stat from this season's plays only, with the rank among players with enough plays", () => {
		const purdy = byName("Brock Purdy")!
		const o = kit.observedOf(data, purdy)!
		expect(o.key).toBe("epaDb")
		expect(o.value).toBe(pk.statOf(purdy, "epaDb")!.season.v)
		expect(o.rank).toBe(pk.statOf(purdy, "epaDb")!.season.r)
		expect(o.of).toBe(data.yard.qb!.epaDb!.n)
	})

	it("leads the page: the standing a card shows is the observed percentile, with no history in it", () => {
		for (const p of data.players.filter((x) => x.group === "qb")) {
			const s = pk.gradeScore(data, p)
			const r = pk.overallRank(data, p)
			if (s === null) {
				expect(r).toBeNull()
				continue
			}
			expect(s).toBeGreaterThanOrEqual(1)
			expect(s).toBeLessThanOrEqual(99)
			expect(r!.rank).toBe(pk.statOf(p, "epaDb")!.season.r)
		}
	})
})

describe("contribution so far", () => {
	it("counts players under the card floor, marks them, and ranks everyone on one list", () => {
		const board = kit.contributionBoard(data, "qb")
		expect(board.length).toBeGreaterThan(data.players.filter((p) => p.group === "qb" && p.contrib).length - 1)
		expect(board.some((r) => r.lowVolume)).toBe(true)
		expect(board.every((r) => (r.lowVolume ? r.slug === undefined : true))).toBe(true)
		for (let i = 1; i < board.length; i++) expect(board[i].over).toBeLessThanOrEqual(board[i - 1].over)
		expect(board.map((r) => r.rank)).toEqual(board.map((_, i) => i + 1))
	})

	it("sums to roughly nothing across a job (it is points above an average player at the job)", () => {
		for (const g of ["qb", "wr", "te"] as const) {
			const board = kit.contributionBoard(data, g)
			const total = board.reduce((a, r) => a + r.over, 0)
			expect(Math.abs(total), g).toBeLessThan(0.06 * board.length + 1)
		}
	})

	it("agrees between a player's card and the board", () => {
		for (const p of data.players.filter((x) => x.contrib).slice(0, 80)) {
			const line = kit.contributionOf(data, p)!
			const row = kit.contributionBoard(data, p.group).find((r) => r.id === p.id)!
			expect(row.rank, p.name).toBe(line.rank)
			expect(row.over).toBe(line.over)
		}
	})
})

describe("projection", () => {
	it("is a grade with a range, the share of it that is this season, and what this season alone would say", () => {
		const young = byName("Bryce Young")!
		const pr = kit.projectionOf(data, young)!
		expect(pr.lo).toBeLessThan(pr.grade)
		expect(pr.hi).toBeGreaterThan(pr.grade)
		expect(pr.thisSeasonShare).toBeGreaterThan(0)
		expect(pr.thisSeasonShare).toBeLessThan(0.5)
		expect(pr.seasonOnly).not.toBeNull()
		expect(pr.target.length).toBeGreaterThan(40)
		expect(kit.PROJECTION_LIMITS).toMatch(/new team/i)
	})

	it("has no board for running backs, and boards for the jobs the method says it can project", () => {
		expect(kit.hasProjectionBoard(data, "rb")).toBe(false)
		expect(kit.hasProjectionBoard(data, "qb")).toBe(true)
		const board = kit.projectionBoard(data, "qb")
		for (let i = 1; i < board.length; i++) expect(board[i].rank).toBeGreaterThanOrEqual(board[i - 1].rank)
	})

	it("flags a new team or head coach and changes no number for it", () => {
		const moved = data.players.filter((p) => p.grade && p.teamChanged)
		expect(moved.length).toBeGreaterThan(0)
		for (const p of moved.slice(0, 10)) {
			const env = kit.environmentOf(p)
			expect(env.kind).toBe("new-team")
			expect(env.text).toMatch(/not adjusted/)
		}
	})
})

describe("why the three can disagree", () => {
	it("explains a quarterback who is 10th this season and far lower on the projection (Young)", () => {
		const y = byName("Bryce Young")!
		const o = kit.observedOf(data, y)!
		const pr = kit.projectionOf(data, y)!
		expect(o.rank!).toBeLessThan(pr.rank - 10)
		const why = kit.whyDiffer(data, y)!
		expect(why).toMatch(/10th on what he has done this season but 33rd on the projection/)
		expect(why).toMatch(/earlier seasons were weaker/)
		expect(why).toMatch(/14% of the projection is this season/)
	})

	it("explains a receiver who is first on the projection and lower on this season (Nacua, Kittle)", () => {
		for (const [name, group] of [["Puka Nacua", "wr"], ["George Kittle", "te"]] as const) {
			const p = byName(name)!
			expect(p.group).toBe(group)
			expect(kit.projectionOf(data, p)!.rank).toBe(1)
			expect(kit.observedOf(data, p)!.rank!).toBeGreaterThan(10)
			expect(kit.whyDiffer(data, p)).toMatch(/earlier seasons were better/)
		}
	})

	it("says they agree when they do", () => {
		expect(kit.whyDiffer(data, byName("Geno Smith")!)).toMatch(/agree/)
	})

	it("names a this-season leader on a small sample with the count and flags it (a 2-game leader is not called the best right now without saying so)", () => {
		const top = kit.topThree(data, "qb")
		expect(top.season).toBe("Drew Lock")
		expect(top.seasonSample!.n).toBeLessThan(top.seasonSample!.typical * kit.SMALL_SAMPLE_SHARE)
		expect(top.seasonSample!.small).toBe(true)
		expect(top.seasonSample!.per).toBe("dropbacks")
	})

	it("gives every quarterback with a card a consistent header of three leaders", () => {
		const top = kit.topThree(data, "qb")
		expect(top.season).toBeTruthy()
		expect(top.contribution).toBeTruthy()
		expect(top.projection).toBeTruthy()
		expect(kit.topThree(data, "rb").projection).toBeNull()
	})
})

describe("the chance of beating another quarterback over the rest of the season", () => {
	const qbs = () => data.players.filter((p) => p.group === "qb")

	it("is shown only for two quarterbacks in the window it was checked on, rounded down to the step and never above the cap", () => {
		const { cap, step, floor } = data.method.pairwise!.display
		let chances = 0
		for (const a of qbs())
			for (const b of qbs()) {
				if (a.id >= b.id) continue
				const r = kit.pairChance(data, a, b)
				if (r.kind === "chance") {
					chances++
					expect(r.shown).toBeLessThanOrEqual(cap + 1e-9)
					expect(r.shown).toBeGreaterThanOrEqual(floor - 1e-9)
					expect(Math.abs(r.shown / step - Math.round(r.shown / step))).toBeLessThan(1e-6)
					expect(a.games).toBeGreaterThanOrEqual(4)
					expect(b.games).toBeGreaterThanOrEqual(4)
				}
			}
		expect(chances).toBeGreaterThan(0)
	})

	it("is never shown outside the window, for other jobs, or for the same player", () => {
		const few = qbs().find((p) => p.games < 4)!
		const full = qbs().find((p) => p.games >= 4)!
		expect(kit.pairChance(data, few, full).kind).toBe("none")
		const wrs = data.players.filter((p) => p.group === "wr")
		expect(kit.pairChance(data, wrs[0], wrs[1]).kind).toBe("none")
		expect(kit.pairChance(data, full, full).kind).toBe("none")
	})

	it("leans the way the numbers lean and names the target in words", () => {
		const a = qbs().filter((p) => p.games >= 4)
		for (const x of a)
			for (const y of a) {
				if (x.id >= y.id) continue
				const r = kit.pairChance(data, x, y)
				if (r.kind !== "chance") continue
				const ex = pk.statOf(x, "epaDb")!.season.a!
				const ey = pk.statOf(y, "epaDb")!.season.a!
				expect(r.leader).toBe(ex >= ey ? x.name : y.name)
				expect(r.text).toMatch(/EPA per dropback/)
				return
			}
		throw new Error("no published pair to check")
	})
})

describe("running backs", () => {
	const rb = () => data.players.filter((p) => p.group === "rb" && kit.componentsOf(data, p).length > 0)

	it("keep explosive runs and yards after contact as separate graded components, and never one grade", () => {
		expect(data.method.policy.rb!.mode).toBe("components")
		expect(data.method.policy.rb!.grade).toEqual(["explosive", "yco"])
		const p = rb().find((x) => kit.componentsOf(data, x).some((c) => c.grade))!
		const parts = kit.componentsOf(data, p)
		expect(parts.filter((c) => c.grade).map((c) => c.key).sort()).toEqual(["explosive", "yco"])
		expect(kit.projectionOf(data, p)).toBeNull()
		expect(kit.rbOverlapNote()).toMatch(/overlap/i)
	})

	it("show rushing yards over expected as observed only, with how many carries the tracking data covers", () => {
		const withTracking = data.players.filter((p) => p.group === "rb" && p.tracked && p.tracked.of > 0 && pk.statOf(p, "ryoe"))
		expect(withTracking.length).toBeGreaterThan(5)
		for (const p of withTracking.slice(0, 20)) {
			const c = kit.componentsOf(data, p).find((x) => x.key === "ryoe")
			expect(c, p.name).toBeTruthy()
			expect(c!.grade ?? null).toBeNull()
			expect(c!.covered).toBeTruthy()
			expect(c!.covered!.n).toBeLessThanOrEqual(c!.covered!.of)
			expect(data.method.policy.rb!.grade).not.toContain("ryoe")
		}
	})

	it("count every target, including in a game with no carry (Shipley has 8, not 6)", () => {
		const s = byName("Will Shipley")!
		expect(s.box.tgt).toBe(8)
	})
})

describe("every kit function over every v2 player (missing data never throws and never prints NaN)", () => {
	it("survives the whole file", () => {
		let n = 0
		for (const p of data.players) {
			const bits = [
				kit.observedOf(data, p)?.formatted,
				kit.projectionOf(data, p)?.target,
				kit.whyDiffer(data, p),
				kit.contributionOf(data, p)?.over?.toFixed(1),
				...kit.componentsOf(data, p).map((c) => c.formatted),
				String(pk.overall(p) ?? ""),
				String(pk.gradeScore(data, p) ?? ""),
				pk.badgesFor(data, p, 5, 3).map((b) => b.text).join(" "),
			]
			for (const b of bits) if (b !== undefined) expect(String(b), p.name).not.toMatch(/NaN|undefined|Infinity/)
			n++
		}
		expect(n).toBeGreaterThan(900)
	})

	it("compares any two players of one job without throwing", () => {
		for (const g of ["qb", "rb", "wr", "te", "edge", "cb", "k"] as const) {
			const ps = data.players.filter((p) => p.group === g).slice(0, 4)
			for (let i = 0; i < ps.length; i++)
				for (let j = i + 1; j < ps.length; j++) {
					const c = compare.buildComparison(data, compare.readConfig({ a: ps[i].slug, b: ps[j].slug }))
					expect(c, `${ps[i].name} v ${ps[j].name}`).toBeTruthy()
					const three = kit.threeWay(data, ps[i], ps[j])
					expect(three.map((t) => t.id)).toEqual(["season", "contribution", "projection"])
					expect(three.find((t) => t.id === "contribution")!.lead).toBeNull()
				}
		}
	})

	it("calls a lead on this season only when the gap beats the numbers' own uncertainty", () => {
		const [a, b] = data.players.filter((p) => p.group === "qb" && p.games >= 4)
		const t = kit.threeWay(data, a, b).find((x) => x.id === "season")!
		const ea = pk.statOf(a, "epaDb")!.season
		const eb = pk.statOf(b, "epaDb")!.season
		const gap = Math.abs(ea.v - eb.v)
		const se = Math.sqrt((ea.se ?? 0) ** 2 + (eb.se ?? 0) ** 2)
		expect(t.lead === null).toBe(gap <= se)
	})
})

describe("low-volume players and missing data", () => {
	it("keeps a player under the card floor on the contribution board with no page", () => {
		expect(data.others.length).toBeGreaterThan(0)
		const o = data.others.find((x) => x.contrib)!
		const row = kit.contributionBoard(data, o.group).find((r) => r.id === o.id)!
		expect(row.lowVolume).toBe(true)
		expect(row.slug).toBeUndefined()
		expect(data.players.some((p) => p.id === o.id && p.group === o.group)).toBe(false)
	})

	it("has no observed value rather than a zero for a player without the stat", () => {
		const p = { ...data.players.find((x) => x.group === "qb")!, stats: [] }
		expect(kit.observedOf(data, p)).toBeNull()
		expect(kit.projectionOf(data, { ...p, grade: undefined })).toBeNull()
		expect(kit.contributionOf(data, { ...p, contrib: undefined })).toBeNull()
		expect(kit.componentsOf(data, p)).toEqual([])
	})

	it("says a rookie has no earlier season at the job instead of inventing one", () => {
		const r = kit.environmentOf({ ...data.players[0], teamChanged: undefined })
		expect(r.kind).toBe("rookie")
	})
})

describe("share images", () => {
	it("label the number as this season's plays, with no scouting-grade line, and carry the same standing as the card", async () => {
		const og = await import("../../lib/og/playerCard")
		const young = byName("Bryce Young")!
		const spec = og.buildPlayerSpec(data, young.slug, undefined)!
		expect(spec.grade).toBe(pk.gradeScore(data, young))
		expect(spec.gradeWord).toMatch(/EPA per dropback, this season's plays only/)
		expect(spec.gradeWord).not.toMatch(/Scouting grade/)
		expect(spec.rank).toMatch(/^10th of 40 quarterbacks/)
	})
})

describe("the flag off changes nothing", () => {
	it("keeps v1's catalog, headline stats, labels and loaders", async () => {
		try {
			vi.stubEnv("NEXT_PUBLIC_LAB_METHOD", "")
			vi.resetModules()
			const k = await import("../../lib/lab/playersKit")
			const d = await import("../../lib/lab/data")
			expect(k.HEADLINE.wr).toBe("epaTgt")
			expect(k.OVERALL_WORD).toBe("Overall")
			expect(k.STAT.rb.tgtShare).toBeUndefined()
			expect(k.STAT.wr.share.higher).toBe(true)
			// The loader reads the v1 file, not the staged v2 one. (The data job now writes the same method block into both files, so
			// the file's own stamp is what tells them apart, not whether a block is present.)
			const v1File = (await import("../../data/lab/players.json")).default as { generatedAt: string; week: number }
			const got = d.getPlayers() as unknown as { generatedAt: string; week: number }
			expect(got.generatedAt).toBe(v1File.generatedAt)
			expect(got.week).toBe(v1File.week)
		} finally {
			// Restore the v2 modules for any test that runs after this block, even when an assertion above fails.
			vi.stubEnv("NEXT_PUBLIC_LAB_METHOD", "v2")
			vi.resetModules()
		}
	})
})

describe("the game-by-game trail in v2", () => {
	it("is this season's plain number: its last point is where the season rank is, never the projection's estimate", async () => {
		const logs = (await import("../../lib/lab/playerData")).getPlayerLogs()
		let checked = 0
		for (const p of data.players) {
			const key = pk.observedKeyOf(p.group)
			const s = key ? p.stats.find((x) => x.k === key) : undefined
			const pts = key ? logs.logs[p.slug]?.[p.group]?.g[key] : undefined
			const r = s?.season.r
			const of = s?.season.of
			if (!pts?.length || typeof r !== "number" || !of || of < 2 || pts[pts.length - 1][0] !== data.week || pts[pts.length - 1][3] === null) continue
			const rankPct = (100 * (of - r)) / (of - 1)
			// Counting stats tie at zero, which the rank and the percentile treat a little differently; the continuous ones agree to the decimal.
			const tol = ["qb", "p", "kr"].includes(p.group) ? 0.5 : 8
			expect(Math.abs(pts[pts.length - 1][3]! - rankPct), `${p.name} ${key}`).toBeLessThanOrEqual(tol)
			checked++
		}
		expect(checked).toBeGreaterThan(200)
	})
})
