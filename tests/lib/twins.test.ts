import { describe, expect, it } from "vitest"

import { getTwinsView } from "../../lib/lab/twins"
import { type Backtest, MIN_STATS, POOL, SHOWN, TWIN_MODES, agreement, backtest, findTwins, isMode, poolLine, trustLine, twinStory } from "../../lib/lab/twinsKit"
import { fakeSeasons } from "../helpers/twinsFake"

describe("season twins: the matching", () => {
	const { meta, tables } = fakeSeasons(240, { twin: 17 })

	it("puts a team-season with the Raiders' exact numbers first, at zero distance", () => {
		const r = findTwins(meta, tables)!
		expect(r.twins).toHaveLength(SHOWN)
		expect(r.twins[0].i).toBe(17)
		expect(r.twins[0].distance).toBeCloseTo(0, 10)
		expect(r.twins[0].closer).toBe(1)
	})

	it("lists twins closest first, each closer than the next, with sensible shares", () => {
		const r = findTwins(meta, tables)!
		for (let k = 1; k < r.twins.length; k++) {
			expect(r.twins[k].distance).toBeGreaterThanOrEqual(r.twins[k - 1].distance)
			expect(r.twins[k].closer).toBeLessThanOrEqual(r.twins[k - 1].closer)
		}
		for (const t of r.twins) {
			expect(t.closer).toBeGreaterThan(0.9)
			expect(t.closer).toBeLessThanOrEqual(1)
		}
		expect(r.median).toBeGreaterThan(r.twins[SHOWN - 1].distance)
	})

	it("has every stat's league standing between 0 and 1, further out meaning better whichever way the stat runs", () => {
		const r = findTwins(meta, tables)!
		for (const s of r.stats) {
			expect(s.raidersPct).toBeGreaterThanOrEqual(0)
			expect(s.raidersPct).toBeLessThanOrEqual(1)
		}
		// Row 17 is the Raiders, so a twin's standing on each stat equals the Raiders'.
		r.twins[0].pcts.forEach((p, j) => expect(p).toBeCloseTo(r.stats[j].raidersPct, 10))
		// A team with the best value on a lower-is-better stat must stand near the top.
		const lower = tables.findIndex((t) => !t.higherIsBetter)
		const best = tables[lower].start.indexOf(Math.min(...(tables[lower].start as number[])))
		const probe = findTwins(meta, tables.map((t, j) => (j === lower ? { ...t, value: tables[lower].start[best] as number } : t)))!
		expect(probe.stats[lower].raidersPct).toBeGreaterThan(0.99)
	})

	it("uses only offense or only defense stats in those modes, and nothing in the net stats", () => {
		const off = findTwins(meta, tables, "off")!
		const def = findTwins(meta, tables, "def")!
		expect(off.stats.every((s) => s.family === "off")).toBe(true)
		expect(def.stats.every((s) => s.family === "def")).toBe(true)
		expect(off.stats).toHaveLength(6)
		const withNet = [...tables, { ...tables[0], key: "net.points", family: "net" as const }]
		expect(findTwins(meta, withNet)!.stats.map((s) => s.key)).not.toContain("net.points")
	})

	it("returns nothing when there are too few stats to match on", () => {
		expect(MIN_STATS).toBeGreaterThan(4)
		expect(findTwins(meta, tables, "off")).not.toBeNull()
		expect(findTwins(meta, tables.slice(0, 4), "all")).toBeNull()
		expect(findTwins(meta, [], "all")).toBeNull()
	})

	it("adds up the closest thirty and compares them with every team", () => {
		const r = findTwins(meta, tables)!
		expect(r.pool.size).toBe(POOL)
		const o = r.pool.outcomes
		for (const v of [o.restWin, o.allRestWin, o.playoffs, o.allPlayoffs]) {
			expect(v).toBeGreaterThanOrEqual(0)
			expect(v).toBeLessThanOrEqual(1)
		}
		expect(poolLine(r)).toMatch(/^After game 4 the 30 closest team-seasons won \d+% of their games, against \d+% for the average team\. \d+% of them made the playoffs, against \d+% of all teams\.$/)
	})

	it("finds the Raiders' own closest earlier team, which may be one of the five", () => {
		const r = findTwins(meta, tables)!
		expect(r.raidersTwin).not.toBeNull()
		expect(r.raidersTwin!.raiders).toBe(true)
		const lv = meta.teams.map((t, i) => (t.endsWith(" LV") ? i : -1)).filter((i) => i >= 0)
		const sd = tables.map((t) => Math.sqrt(((t.start as number[]).reduce((a, v) => a + (v - (t.start as number[]).reduce((x, y) => x + y, 0) / t.start.length) ** 2, 0)) / t.start.length))
		const dist = (i: number) => Math.sqrt(tables.reduce((s, t, j) => s + ((((t.start[i] as number) - t.value) / sd[j]) ** 2), 0))
		expect(lv).toContain(r.raidersTwin!.i)
		expect(dist(r.raidersTwin!.i)).toBeLessThanOrEqual(Math.min(...lv.map(dist)) * 1.0001 + 1e-9)
	})

	it("skips team-seasons that are missing most of their numbers, and copes with a missing one", () => {
		const holes = tables.map((t) => ({ ...t, start: t.start.map((v, i) => (i === 3 ? null : i === 9 && t.family === "off" ? null : v)) }))
		const r = findTwins(meta, holes)!
		expect(r.twins.map((t) => t.i)).not.toContain(3)
		for (const t of r.twins) expect(t.values.filter((v) => v === null).length).toBeLessThan(3)
	})

	it("ranks the stats from the closest match to the furthest", () => {
		const r = findTwins(meta, tables)!
		const a = agreement(r, r.twins[1])
		expect(a).toHaveLength(r.stats.length)
		for (let k = 1; k < a.length; k++) expect(a[k].gap).toBeGreaterThanOrEqual(a[k - 1].gap)
		expect(agreement(r, r.twins[0]).every((x) => x.gap < 1e-9)).toBe(true)
	})

	it("knows the three modes", () => {
		expect(TWIN_MODES.map((m) => m.id)).toEqual(["all", "off", "def"])
		expect(isMode("off")).toBe(true)
		expect(isMode("net")).toBe(false)
		expect(isMode(undefined)).toBe(false)
	})
})

describe("season twins: how far to trust them", () => {
	it("finds a real edge when the stats say something about the rest of the season, and not when they do not", () => {
		const real = backtest(...(Object.values(fakeSeasons(300, { quality: true, seed: 3 })) as [never, never]))!
		const noise = backtest(...(Object.values(fakeSeasons(300, { quality: false, seed: 3 })) as [never, never]))!
		expect(real.seasons).toBe(300)
		expect(real.gain).toBeGreaterThan(0.05)
		expect(real.corr).toBeGreaterThan(0.3)
		expect(noise.gain).toBeLessThan(real.gain)
		expect(noise.corr).toBeLessThan(real.corr)
	})

	it("is deterministic and never uses a team-season to guess itself", () => {
		const { meta, tables } = fakeSeasons(120, { seed: 11 })
		expect(backtest(meta, tables)).toEqual(backtest(meta, tables))
		expect(backtest(meta, tables.slice(0, 3))).toBeNull()
		expect(backtest({ ...meta, teams: meta.teams.slice(0, 20), po: [], wins: [], losses: [], startWins: [], startLosses: [] }, tables.map((t) => ({ ...t, start: t.start.slice(0, 20), rest: t.rest.slice(0, 20) })))).toBeNull()
	})

	it("says plainly how big the edge is", () => {
		const base: Backtest = { seasons: 855, twinsMiss: 0.189, averageMiss: 0.207, startMiss: 0.278, gain: 0.088, corr: 0.41 }
		expect(trustLine(base, 1999)).toContain("855 team-seasons since 1999")
		expect(trustLine(base, 1999)).toContain("18.9 percentage points")
		expect(trustLine(base, 1999)).toContain("real but modest edge")
		expect(trustLine({ ...base, gain: 0.03 }, 1999)).toContain("small edge")
		expect(trustLine({ ...base, gain: 0.005 }, 1999)).toContain("barely better than guessing the average")
	})

	it("tells a twin's season in a sentence", () => {
		const r = findTwins(...(Object.values(fakeSeasons(240)) as [never, never]))!
		const t = { ...r.twins[0], label: "2022 Jaguars", startWins: 2, startLosses: 2, wins: 9, losses: 8, games: 17, playoffs: true }
		expect(twinStory(t, 4)).toBe("The 2022 Jaguars started 2-2, then finished 9-8 and made the playoffs.")
		expect(twinStory({ ...t, wins: 8, losses: 8, games: 17, playoffs: false }, 4)).toBe("The 2022 Jaguars started 2-2, then finished 8-8-1 and missed the playoffs.")
	})
})

describe("season twins: this week's real data", () => {
	const view = getTwinsView()

	it("builds all three matches from the history and the scouting file", () => {
		expect(view).not.toBeNull()
		const v = view!
		expect(v.n).toBeGreaterThanOrEqual(3)
		expect(v.n).toBeLessThanOrEqual(12)
		for (const m of TWIN_MODES) {
			const res = v.modes[m.id]
			expect(res, m.id).not.toBeNull()
			expect(res!.result.twins).toHaveLength(SHOWN)
			expect(res!.result.stats.length).toBe(m.id === "all" ? 18 : 9)
		}
	})

	it("only names team-seasons that exist, and none from the season being played", () => {
		const v = view!
		for (const m of TWIN_MODES) {
			for (const t of v.modes[m.id]!.result.twins) {
				expect(t.row).toMatch(/^\d{4} [A-Z]{2,3}$/)
				const season = Number(t.row.slice(0, 4))
				expect(season).toBeGreaterThanOrEqual(v.first)
				expect(season).toBeLessThanOrEqual(v.last)
				expect(t.wins + t.losses).toBeLessThanOrEqual(t.games)
				expect(Number.isFinite(t.distance)).toBe(true)
			}
		}
	})

	it("has a backtest for every match, and the whole-team one beats guessing the average", () => {
		const v = view!
		expect(v.modes.all!.test).not.toBeNull()
		expect(v.modes.all!.test!.gain).toBeGreaterThan(0)
		expect(v.modes.all!.test!.seasons).toBeGreaterThan(800)
	})
})
