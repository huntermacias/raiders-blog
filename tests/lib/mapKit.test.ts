import { describe, expect, it } from "vitest"

import { getPlayers } from "../../lib/lab/data"
import { type MapData, correlation, defaultAxes, dotsFor, mapData, median, nearest, unit } from "../../lib/lab/mapKit"
import { GROUP_ORDER, HEADLINE, statInfo } from "../../lib/lab/playersKit"

const data = getPlayers()

const tiny: MapData = {
	group: "wr",
	season: 2026,
	stats: [
		{ k: "a", label: "A", short: "A", higher: true, per: "targets" },
		{ k: "b", label: "B", short: "B", higher: false, per: "targets" },
		{ k: "z", label: "Z", short: "Z", higher: true, per: "targets", counts: false },
	],
	players: [
		["p1", "One", "LV", "WR", { a: [1, 50], b: [10, 50], z: [0, 50] }],
		["p2", "Two", "KC", "WR", { a: [3, 40], b: [2, 40], z: [0, 40] }],
		["p3", "Three", "DEN", "WR", { a: [2, 30], z: [1, 30] }],
	],
}

describe("the league map data", () => {
	it("has a file for every position, holding only stats the site knows and plain numbers", () => {
		for (const g of GROUP_ORDER) {
			const m = mapData(data, g)
			expect(m.group).toBe(g)
			expect(m.players.length).toBe(data.players.filter((p) => p.group === g).length)
			for (const s of m.stats) expect(statInfo(g, s.k)).not.toBeNull()
			for (const [, , , , vals] of m.players) for (const [v, n] of Object.values(vals)) {
				expect(Number.isFinite(v)).toBe(true)
				expect(n).toBeGreaterThanOrEqual(0)
			}
		}
	})

	it("stays small enough to fetch on a whim", () => {
		for (const g of GROUP_ORDER) expect(JSON.stringify(mapData(data, g)).length).toBeLessThan(60_000)
	})

	it("flips an axis where lower is better, so up and right are always better", () => {
		const v = dotsFor(tiny, "a", "b")
		expect(v.dots.map((d) => d.slug)).toEqual(["p1", "p2"])
		const [p1, p2] = v.dots
		expect(p2.nx).toBeGreaterThan(p1.nx)
		// p2 allows less of "b", so it is the higher dot even though its number is smaller.
		expect(p2.ny).toBeGreaterThan(p1.ny)
		expect(p2.y).toBe(2)
	})

	it("leaves out players missing either stat, and survives unknown stats", () => {
		expect(dotsFor(tiny, "a", "z").dots.length).toBe(3)
		expect(dotsFor(tiny, "nope", "a").dots).toEqual([])
	})

	it("positions on a 0 to 1 axis and finds the closest dot only inside its reach", () => {
		expect(unit(5, { lo: 0, hi: 10 })).toBe(0.5)
		const pts = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 100, y: 100 }]
		expect(nearest(pts, { x: 28, y: 2 }, 24)).toBe(1)
		expect(nearest(pts, { x: 60, y: 60 }, 24)).toBe(-1)
		expect(nearest([], { x: 0, y: 0 }, 24)).toBe(-1)
	})

	it("takes medians of odd and even lists", () => {
		expect(median([3, 1, 2])).toBe(2)
		expect(median([4, 1, 2, 3])).toBe(2.5)
		expect(median([])).toBeNull()
	})

	it("opens on the headline stat against the least related graded stat, never one that does not count", () => {
		for (const g of GROUP_ORDER) {
			const m = mapData(data, g)
			const [x, y] = defaultAxes(m, HEADLINE[g])
			if (!x) continue
			const xs = m.stats.find((s) => s.k === x)!
			const ys = m.stats.find((s) => s.k === y)!
			expect(xs.counts).not.toBe(false)
			expect(ys.counts).not.toBe(false)
			expect(ys.higher).not.toBeNull()
		}
		expect(defaultAxes(tiny, "a")).toEqual(["a", "b"])
	})

	it("measures how two stats move together", () => {
		const m: MapData = { ...tiny, players: [1, 2, 3, 4, 5, 6].map((i) => [`p${i}`, "x", "LV", "WR", { a: [i, 10], b: [i * 2, 10], z: [7 - i, 10] }] as MapData["players"][number]) }
		expect(correlation(m, "a", "b")).toBeCloseTo(1, 5)
		expect(correlation(m, "a", "z")).toBeCloseTo(-1, 5)
		expect(correlation(tiny, "a", "b")).toBe(0)
	})
})
