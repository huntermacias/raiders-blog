import { describe, expect, it } from "vitest"

import { type RivalryGame, buildRivalry, rivalryBySeason, shareBeatingBlogger, vs } from "../../../lib/league2/domain"

let n = 0
const g = (player: number, blogger: number, o: Partial<RivalryGame> = {}): RivalryGame => ({
	eventId: `e${++n}`,
	season: 2026,
	week: n,
	kickoff: `2026-09-${String(n).padStart(2, "0")}T17:00:00Z`,
	playerPoints: player,
	bloggerPoints: blogger,
	marginError: 3,
	...o,
})

describe("the rivalry", () => {
	it("compares points per game", () => {
		expect(vs(10, 3)).toBe("W")
		expect(vs(3, 10)).toBe("L")
		expect(vs(6, 6)).toBe("T")
	})

	it("counts record, differential and streaks, and a tie ends a streak", () => {
		n = 0
		const r = buildRivalry([g(13, 3), g(10, 0), g(6, 6), g(20, 10), g(13, 3), g(13, 3), g(0, 13)])
		expect(r.record).toEqual({ w: 5, l: 1, t: 1 })
		expect(r.differential).toBe(10 + 10 + 0 + 10 + 10 + 10 - 13)
		expect(r.longestWin).toBe(3)
		expect(r.current).toEqual({ type: "L", length: 1 })
		expect(r.games).toBe(7)
	})

	it("reports the run the player is on now", () => {
		n = 0
		expect(buildRivalry([g(0, 10), g(20, 10), g(13, 3)]).current).toEqual({ type: "W", length: 2 })
		n = 0
		expect(buildRivalry([g(5, 5), g(6, 6)]).current).toEqual({ type: "T", length: 2 })
	})

	it("handles nobody and voided games", () => {
		expect(buildRivalry([])).toMatchObject({ games: 0, current: null, best: null, biggestWin: null, longestWin: 0 })
		n = 0
		expect(buildRivalry([g(25, 0, { voided: true })]).games).toBe(0)
	})

	it("orders by kickoff, not by input order", () => {
		n = 0
		const a = g(10, 0, { kickoff: "2026-09-20T00:00:00Z" })
		const b = g(0, 10, { kickoff: "2026-09-10T00:00:00Z" })
		expect(buildRivalry([a, b]).current).toEqual({ type: "W", length: 1 })
	})

	it("picks a best game deterministically: points, then smaller error, then earlier", () => {
		n = 0
		const a = g(25, 0, { marginError: 0, kickoff: "2026-09-12T00:00:00Z" })
		const b = g(25, 0, { marginError: 0, kickoff: "2026-09-05T00:00:00Z" })
		const c = g(13, 0, { marginError: 0 })
		expect(buildRivalry([a, b, c]).best).toBe(b)
		expect(buildRivalry([c, a, b]).best).toBe(b)
		n = 0
		const d = g(25, 0, { marginError: 1 })
		const e = g(25, 0, { marginError: 0, kickoff: "2026-10-01T00:00:00Z" })
		expect(buildRivalry([d, e]).best).toBe(e)
	})

	it("finds the biggest win over the blogger", () => {
		n = 0
		const small = g(13, 10)
		const big = g(25, 3)
		expect(buildRivalry([small, big, g(0, 25)]).biggestWin).toBe(big)
	})

	it("separates seasons for the history view", () => {
		n = 0
		const rows = rivalryBySeason([g(10, 0, { season: 2027 }), g(0, 10, { season: 2026 }), g(10, 0, { season: 2026 })])
		expect(rows.map((r) => r.season)).toEqual([2026, 2027])
		expect(rows[0].rivalry.record).toEqual({ w: 1, l: 1, t: 0 })
	})

	it("reports the share of players ahead of the blogger, none when empty", () => {
		expect(shareBeatingBlogger([{ delta: 5 }, { delta: -1 }, { delta: 0 }, { delta: 3 }])).toBe(0.5)
		expect(shareBeatingBlogger([])).toBeNull()
	})
})
