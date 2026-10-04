import { describe, expect, it } from "vitest"

import { TEAM_NAMES } from "../../lib/nfl"
import { type RankingsDoc, biggestMovers, buildBoards, movementWords, noLabel, raidersRow } from "../../lib/rankings"

const doc = (week: number, teams: string[], over: Partial<RankingsDoc> = {}): RankingsDoc => ({
	_id: `w${week}-${Math.random()}`,
	season: 2026,
	week,
	teams: teams.map((team) => ({ team })),
	...over,
})

describe("buildBoards", () => {
	it("ranks teams by their position in the list, starting at 1", () => {
		const [b] = buildBoards([doc(1, ["Buffalo Bills", "Las Vegas Raiders", "Miami Dolphins"])])
		expect(b.week).toBe(1)
		expect(b.rows.map((r) => [r.team, r.rank])).toEqual([
			["Buffalo Bills", 1],
			["Las Vegas Raiders", 2],
			["Miami Dolphins", 3],
		])
	})

	it("has no movement in the first week", () => {
		const [b] = buildBoards([doc(1, ["Buffalo Bills", "Miami Dolphins"])])
		for (const r of b.rows) {
			expect(r.prevRank).toBeNull()
			expect(r.change).toBeNull()
		}
	})

	it("computes movement against the previous week: positive means up", () => {
		const boards = buildBoards([
			doc(1, ["Buffalo Bills", "Miami Dolphins", "Las Vegas Raiders", "Denver Broncos"]),
			doc(2, ["Las Vegas Raiders", "Buffalo Bills", "Denver Broncos", "Miami Dolphins"]),
		])
		const w2 = boards[1].rows
		expect(w2.find((r) => r.team === "Las Vegas Raiders")).toMatchObject({ rank: 1, prevRank: 3, change: 2 })
		expect(w2.find((r) => r.team === "Buffalo Bills")).toMatchObject({ rank: 2, prevRank: 1, change: -1 })
		expect(w2.find((r) => r.team === "Denver Broncos")).toMatchObject({ rank: 3, prevRank: 4, change: 1 })
		expect(w2.find((r) => r.team === "Miami Dolphins")).toMatchObject({ rank: 4, prevRank: 2, change: -2 })
	})

	it("reports no change as zero, and a team new to the list as null", () => {
		const boards = buildBoards([doc(1, ["Buffalo Bills", "Miami Dolphins"]), doc(2, ["Buffalo Bills", "Miami Dolphins", "Denver Broncos"])])
		const w2 = boards[1].rows
		expect(w2[0].change).toBe(0)
		expect(w2[2]).toMatchObject({ team: "Denver Broncos", prevRank: null, change: null })
	})

	it("builds rank history oldest first, with null for weeks a team wasn't ranked", () => {
		const boards = buildBoards([
			doc(1, ["Buffalo Bills", "Miami Dolphins"]),
			doc(2, ["Miami Dolphins", "Buffalo Bills", "Denver Broncos"]),
			doc(3, ["Denver Broncos", "Miami Dolphins", "Buffalo Bills"]),
		])
		const last = boards[2].rows
		expect(last.find((r) => r.team === "Buffalo Bills")?.history).toEqual([1, 2, 3])
		expect(last.find((r) => r.team === "Denver Broncos")?.history).toEqual([null, 3, 1])
		// an earlier board's history stops at that board
		expect(boards[0].rows[0].history).toEqual([1])
	})

	it("sorts weeks numerically whatever order the documents arrive in", () => {
		const boards = buildBoards([doc(10, ["a"]), doc(2, ["a"]), doc(3, ["a"])])
		expect(boards.map((b) => b.week)).toEqual([2, 3, 10])
	})

	it("lets the last document for a week win when it was redone", () => {
		const boards = buildBoards([doc(2, ["Buffalo Bills", "Miami Dolphins"]), doc(2, ["Miami Dolphins", "Buffalo Bills"])])
		expect(boards).toHaveLength(1)
		expect(boards[0].rows[0].team).toBe("Miami Dolphins")
	})

	it("skips weeks with no teams and a team listed twice", () => {
		const boards = buildBoards([
			doc(1, []),
			{ ...doc(2, []), teams: null },
			doc(3, ["Buffalo Bills", "Buffalo Bills", "Miami Dolphins"]),
		])
		expect(boards).toHaveLength(1)
		expect(boards[0].rows.map((r) => r.team)).toEqual(["Buffalo Bills", "Miami Dolphins"])
		expect(boards[0].rows.map((r) => r.rank)).toEqual([1, 2])
	})

	it("carries the headline, write-up link and per-team notes through", () => {
		const d = doc(1, ["Buffalo Bills"], { headline: "Bills on top", post: { slug: "wk1", title: "Week 1" } })
		d.teams = [{ team: "Buffalo Bills", note: "Allen is Allen" }]
		const [b] = buildBoards([d])
		expect(b.headline).toBe("Bills on top")
		expect(b.post).toEqual({ slug: "wk1", title: "Week 1" })
		expect(b.rows[0].note).toBe("Allen is Allen")
	})

	it("handles a full 32-team week", () => {
		const [b] = buildBoards([doc(1, TEAM_NAMES)])
		expect(b.rows).toHaveLength(32)
		expect(b.rows[31].rank).toBe(32)
	})

	it("returns nothing for no documents", () => {
		expect(buildBoards([])).toEqual([])
	})
})

describe("biggestMovers", () => {
	const boards = buildBoards([
		doc(1, ["a", "b", "c", "d", "e", "f"]),
		doc(2, ["f", "e", "a", "b", "c", "d"]),
	])
	const rows = boards[1].rows

	it("lists risers and fallers, largest move first", () => {
		const { risers, fallers } = biggestMovers(rows)
		expect(risers[0]).toEqual({ team: "f", rank: 1, change: 5 })
		expect(risers[1]).toEqual({ team: "e", rank: 2, change: 3 })
		expect(fallers[0].change).toBeLessThan(0)
		expect(fallers.map((m) => m.change)).toEqual([...fallers.map((m) => m.change)].sort((x, y) => x - y))
	})

	it("respects the count and ignores teams that didn't move", () => {
		expect(biggestMovers(rows, 1).risers).toHaveLength(1)
		const still = buildBoards([doc(1, ["a", "b"]), doc(2, ["a", "b"])])[1].rows
		expect(biggestMovers(still)).toEqual({ risers: [], fallers: [] })
	})

	it("breaks ties by the better rank", () => {
		const r = buildBoards([doc(1, ["a", "b", "c", "d"]), doc(2, ["c", "d", "a", "b"])])[1].rows
		// c and d both rose 2: c is ranked higher so comes first
		expect(biggestMovers(r).risers.map((m) => m.team)).toEqual(["c", "d"])
	})

	it("returns nothing in week one, when there is no movement to report", () => {
		expect(biggestMovers(buildBoards([doc(1, ["a", "b"])])[0].rows)).toEqual({ risers: [], fallers: [] })
	})
})

describe("raidersRow / movementWords / noLabel", () => {
	it("finds the Raiders or returns null", () => {
		const rows = buildBoards([doc(1, ["Buffalo Bills", "Las Vegas Raiders"])])[0].rows
		expect(raidersRow(rows)?.rank).toBe(2)
		expect(raidersRow(buildBoards([doc(1, ["Buffalo Bills"])])[0].rows)).toBeNull()
	})

	it("words movement for headlines", () => {
		expect(movementWords(null)).toBe("")
		expect(movementWords(0)).toBe("no change")
		expect(movementWords(4)).toBe("up 4")
		expect(movementWords(-2)).toBe("down 2")
	})

	it("formats ranks the way headlines do", () => {
		expect(noLabel(1)).toBe("No. 1")
		expect(noLabel(12)).toBe("No. 12")
	})
})
