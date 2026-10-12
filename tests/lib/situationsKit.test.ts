import { describe, expect, it } from "vitest"

import { getPlayers } from "../../lib/lab/data"
import { getSituations } from "../../lib/lab/situationData"
import {
	BUCKETS,
	FLAG,
	type Cell,
	type Play,
	type Role,
	addCells,
	cellStats,
	gameLine,
	gameSummary,
	higherIsBetter,
	pctIn,
	playLine,
	playResult,
	situationView,
	spot,
	splitCell,
} from "../../lib/lab/situationsKit"

const sit = getSituations()
const data = getPlayers()
const ctx = { opp: () => "NE", result: () => ({ text: "W 31–14", won: true }) }

describe("cells", () => {
	const cells: Record<string, Cell> = { "1.L": [10, 50, 4, 1.5, 2, 0, 1], "3.S": [4, 12, 3, 2, 3, 1, 0], "3.L": [2, 4, 0, -1.2, 0, 0, 0] }

	it("adds cells and turns the sums into rates", () => {
		expect(addCells(cells["3.S"], cells["3.L"])).toEqual([6, 16, 3, 0.8, 3, 1, 0])
		expect(addCells(null, null)).toBeNull()
		const s = cellStats(cells["1.L"])!
		expect(s).toMatchObject({ n: 10, ypp: 5, sr: 0.4, epa: 0.15, fd: 0.2, td: 0, x: 0.1 })
		expect(cellStats([0, 0, 0, 0, 0, 0, 0])).toBeNull()
	})

	it("builds a whole down, one spot or everything from the same cells", () => {
		expect(splitCell(cells, "3")![0]).toBe(6)
		expect(splitCell(cells, "3.S")![0]).toBe(4)
		expect(splitCell(cells, "all")![0]).toBe(16)
		expect(splitCell(cells, "2")).toBeNull()
		expect(splitCell(cells, "rz", [3, 9, 2, 1, 1, 1, 0])![0]).toBe(3)
		expect(splitCell(cells, "rz")).toBeNull()
	})

	it("says a passer's sack rate is the one number where lower is better", () => {
		expect(higherIsBetter("pass", "x")).toBe(false)
		expect(higherIsBetter("pass", "sr")).toBe(true)
		expect(higherIsBetter("rush", "x")).toBe(true)
	})
})

describe("pctIn", () => {
	const y = { n: 30, mean: 5, sd: 2, q: [2, 3.5, 5, 6.5, 8] as [number, number, number, number, number] }
	it("reads the percentile off the league's marks, in order and never at the extremes", () => {
		expect(pctIn(5, y, true)).toBe(50)
		expect(pctIn(3.5, y, true)).toBe(25)
		expect(pctIn(8, y, true)).toBe(90)
		expect(pctIn(100, y, true)).toBe(99)
		expect(pctIn(-100, y, true)).toBe(1)
		expect(pctIn(4.25, y, true)).toBeCloseTo(37.5, 5)
		expect(pctIn(2, y, true)).toBeLessThan(pctIn(6, y, true))
	})
	it("flips for a number where lower is better, and copes with a flat league", () => {
		expect(pctIn(8, y, false)).toBe(10)
		expect(pctIn(0.2, { ...y, q: [0, 0, 0, 0, 0] }, true)).toBeGreaterThan(50)
	})
})

describe("one play", () => {
	const play = (over: Partial<Record<number, number>> = {}): Play => {
		const p: Play = [2, 3, 4, 35, 7, 1, 0.82, FLAG.FIRST_DOWN]
		Object.entries(over).forEach(([i, v]) => (p[Number(i)] = v as number))
		return p
	}
	it("places the ball on the field", () => {
		expect(spot(35)).toBe("opp 35")
		expect(spot(75)).toBe("own 25")
		expect(spot(50)).toBe("midfield")
	})
	it("describes a catch, a run, a sack, an incompletion and a turnover in a few words", () => {
		expect(playLine("rec", play())).toBe("Q2 · 3rd & 4 at opp 35 · caught for 7 yards, first down · +0.82 EPA")
		expect(playResult("rush", play({ 4: -2, 7: 0 }))).toBe("run for a loss of 2 yards")
		expect(playResult("rush", play({ 4: 0, 7: 0 }))).toBe("run for no gain")
		expect(playResult("rush", play({ 4: 6, 7: FLAG.SCRAMBLE | FLAG.TURNOVER }))).toBe("scramble for 6 yards, fumble lost")
		expect(playResult("pass", play({ 4: -7, 7: FLAG.SACK }))).toBe("sacked for a loss of 7 yards")
		expect(playResult("pass", play({ 4: 0, 7: FLAG.INCOMPLETE }))).toBe("incomplete")
		expect(playResult("pass", play({ 4: 0, 7: FLAG.INCOMPLETE | FLAG.TURNOVER }))).toBe("intercepted")
		expect(playResult("rec", play({ 4: 0, 7: FLAG.INCOMPLETE }))).toBe("target incomplete")
		expect(playResult("rec", play({ 4: 12, 7: FLAG.TOUCHDOWN | FLAG.FIRST_DOWN }))).toBe("caught for 12 yards, touchdown")
		expect(playLine("pass", play({ 6: -1.25 }))).toContain("−1.25 EPA")
	})
	it("sums a game's plays by down", () => {
		const plays: Play[] = [play(), play({ 5: 0, 1: 1 }), play({ 1: 3 }), play({ 1: 3, 5: 0 })]
		const s = gameSummary(plays)
		expect(s).toMatchObject({ n: 4, wins: 2, rate: 0.5 })
		expect(s.byDown).toEqual([
			{ down: 1, n: 1, wins: 0 },
			{ down: 3, n: 3, wins: 2 },
		])
		expect(gameLine("rush", { week: 1, opp: "X", result: null, won: null, plays }, 0.4, "Running back")).toBe("2 of 4 carries were successful (50%), against 40% for the average running back over the season.")
		expect(gameLine("rush", { week: 1, opp: "X", result: null, won: null, plays: [] }, 0.4, "Running back")).toBe("")
	})
})

describe("the situations file", () => {
	it("holds every player's plays in the cells: the two always agree", () => {
		let checked = 0
		for (const [slug, roles] of Object.entries(sit.players)) {
			for (const [role, e] of Object.entries(roles)) {
				const inCells = Object.values(e!.c).reduce((a, c) => a + c[0], 0)
				const inPlays = Object.values(e!.p).reduce((a, v) => a + v.length, 0)
				expect(inCells, `${slug} ${role}`).toBe(inPlays)
				const wins = Object.values(e!.c).reduce((a, c) => a + c[2], 0)
				expect(wins, `${slug} ${role}`).toBe(Object.values(e!.p).flat().reduce((a, p) => a + p[5], 0))
				checked++
			}
		}
		expect(checked).toBeGreaterThan(150)
	})

	it("agrees with the box score: carries, targets and dropbacks are the same plays", () => {
		const tol: Record<Role, [string, number]> = { rush: ["car", 1], rec: ["tgt", 1], pass: ["att", 3] }
		let checked = 0
		for (const p of data.players) {
			for (const role of ["rush", "rec", "pass"] as Role[]) {
				const e = sit.players[p.slug]?.[role]
				const [key, slack] = tol[role]
				if (!e || e.g !== p.group || p.box[key] === undefined) continue
				const n = Object.values(e.c).reduce((a, c) => a + c[0], 0)
				expect(Math.abs(n - p.box[key]), `${p.name} ${role}`).toBeLessThanOrEqual(slack)
				checked++
			}
		}
		expect(checked).toBeGreaterThan(150)
	})

	it("gives a league row and a yardstick for every job it ranks, with the plays a player needs to be ranked", () => {
		expect(Object.keys(sit.league).sort()).toEqual(["pass.qb", "rec.rb", "rec.te", "rec.wr", "rush.qb", "rush.rb"])
		for (const [combo, splits] of Object.entries(sit.yard)) {
			expect(sit.league[combo], combo).toBeTruthy()
			for (const [split, y] of Object.entries(splits)) {
				expect(y.min, `${combo} ${split}`).toBeGreaterThanOrEqual(3)
				for (const yard of Object.values(y.m)) expect(yard.q[0]).toBeLessThanOrEqual(yard.q[4])
			}
		}
	})
})

describe("situationView", () => {
	it("gives Brock Bowers' targets by down, in the grid, and a read a reader can follow", () => {
		const v = situationView(sit, "brock-bowers", "rec", "te", ctx)!
		const box = data.players.find((p) => p.slug === "brock-bowers")!.box.tgt
		expect(v.total).toBe(box)
		expect(v.rows.map((r) => r.key)).toEqual(["1", "2", "3", "4", "rz", "all"])
		expect(v.rows.find((r) => r.key === "all")!.mine.n).toBe(box)
		expect(v.grid).toHaveLength(16)
		expect(v.grid.reduce((a, c) => a + (c.mine?.n ?? 0), 0)).toBe(box)
		expect(v.grid.map((c) => c.bucket).slice(0, 4)).toEqual([...BUCKETS])
		expect(v.read.length).toBeGreaterThan(0)
		expect(v.read.join(" ")).not.toMatch(/undefined|NaN/)
		expect(v.games.map((g) => g.week)).toEqual([3, 4, 5])
		expect(v.games.every((g) => g.opp === "NE" && g.result === "W 31–14")).toBe(true)
		expect(v.lgSr).toBeGreaterThan(0.3)
	})

	it("is null for a job he does not have, or in a position it is not compared in", () => {
		expect(situationView(sit, "brock-bowers", "rush", "te", ctx)).toBeNull()
		expect(situationView(sit, "brock-bowers", "rec", "wr", ctx)).toBeNull()
		expect(situationView(sit, "nobody-here", "rec", "te", ctx)).toBeNull()
	})

	it("only ranks a player where he has enough plays, and never says a thing it cannot back", () => {
		let ranked = 0
		let thin = 0
		for (const [slug, roles] of Object.entries(sit.players)) {
			for (const role of Object.keys(roles) as Role[]) {
				const g = roles[role]!.g as never
				const v = situationView(sit, slug, role, g, ctx)
				if (!v) continue
				for (const r of v.rows) {
					if (r.pct) {
						expect(r.mine.n).toBeGreaterThanOrEqual(r.min!)
						for (const x of Object.values(r.pct)) {
							expect(x).toBeGreaterThanOrEqual(1)
							expect(x).toBeLessThanOrEqual(99)
						}
						ranked++
					} else thin++
				}
				expect(v.read.join(" "), slug).not.toMatch(/undefined|NaN|Infinity/)
				expect(v.read.length).toBeLessThanOrEqual(4)
			}
		}
		expect(ranked).toBeGreaterThan(50)
		expect(thin).toBeGreaterThan(0)
	})
})
