import { describe, expect, it } from "vitest"

import { morePicks, seriesNeighbors, withTypes } from "@/lib/postSeries"

const row = (id: string, day: number, over: Record<string, unknown> = {}) => ({
	_id: id,
	title: `Post ${id}`,
	slug: { current: id },
	_createdAt: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
	...over,
})

const rows = withTypes([
	row("p1", 1, { storyType: "preview" }),
	row("r1", 2, { storyType: "power-rankings" }),
	row("p2", 8, { categories: [{ title: "Preview Matchup" }] }),
	row("p3", 15, { title: "Week 3 Preview" }),
	row("n1", 16),
])

describe("seriesNeighbors", () => {
	it("finds the earlier and later story of the same kind, however its type was set", () => {
		const { prev, next } = seriesNeighbors(rows, "p2")
		expect(prev?._id).toBe("p1")
		expect(next?._id).toBe("p3")
	})
	it("is null at the ends and when the story is unknown", () => {
		expect(seriesNeighbors(rows, "p1").prev).toBeNull()
		expect(seriesNeighbors(rows, "p3").next).toBeNull()
		expect(seriesNeighbors(rows, "nope")).toEqual({ prev: null, next: null })
		expect(seriesNeighbors(rows, "r1")).toEqual({ prev: null, next: null })
	})
})

describe("morePicks", () => {
	it("puts the same kind first, newest first, then tops up with the newest of anything", () => {
		const { picks, allSameKind } = morePicks(rows, "p2", 3)
		expect(picks.map((r) => r._id)).toEqual(["p3", "p1", "n1"])
		expect(allSameKind).toBe(false)
	})
	it("says so when every pick is the same kind", () => {
		expect(morePicks(rows, "p2", 2).allSameKind).toBe(true)
	})
	it("never includes the story itself and copes with a short list", () => {
		expect(morePicks(rows.slice(0, 1), "p1").picks).toEqual([])
	})
})
