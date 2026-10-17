import { describe, expect, it } from "vitest"

import { CLASSIC_TIEBREAKS, PUBLIC_TIEBREAKS, type PlayerInfo, type StandingGrade, aroundPlayer, buildRows, rankChanges, weeklyChampions } from "../../../lib/league2/domain"

const P = (id: string, joined: string): PlayerInfo => ({ id, handle: id, joinedAt: joined })
const G = (playerId: string, eventId: string, week: number, points: number, o: Partial<StandingGrade["detail"]> & { at?: string; voided?: boolean } = {}): StandingGrade => ({
	playerId,
	eventId,
	week,
	points,
	voided: o.voided ?? false,
	detail: { correct: o.correct ?? points > 0, marginError: o.marginError === undefined ? 3 : o.marginError, exact: o.exact ?? false },
	submittedAt: o.at,
})

describe("tiebreakers", () => {
	const players = [P("amy", "2026-09-02"), P("bo", "2026-09-01"), P("cy", "2026-09-03"), P("di", "2026-09-04")]

	it("orders by points, then correct winners, then lower average margin error", () => {
		const grades = [
			G("amy", "g1", 1, 13, { correct: true, marginError: 5 }),
			G("bo", "g1", 1, 13, { correct: true, marginError: 2 }),
			G("cy", "g1", 1, 13, { correct: true, marginError: 2 }),
			G("di", "g1", 1, 20, { correct: true, marginError: 0 }),
		]
		const rows = buildRows(grades, players, CLASSIC_TIEBREAKS)
		expect(rows.map((r) => [r.rank, r.playerId])).toEqual([
			[1, "di"],
			[2, "bo"], // ties with cy on all three, earlier join first
			[2, "cy"],
			[4, "amy"],
		])
	})

	it("falls back to join date then handle, and sorts handles without regard to case", () => {
		const ps = [P("Zed", "2026-09-01"), P("abe", "2026-09-01")]
		const rows = buildRows([G("Zed", "g1", 1, 10), G("abe", "g1", 1, 10)], ps, CLASSIC_TIEBREAKS)
		expect(rows.map((r) => r.playerId)).toEqual(["abe", "Zed"])
		expect(rows.map((r) => r.rank)).toEqual([1, 1])
	})

	it("uses who finished entering first in the public tiebreak", () => {
		const grades = [G("amy", "g1", 1, 5, { at: "2026-10-04T16:00:00Z" }), G("bo", "g1", 1, 5, { at: "2026-10-03T09:00:00Z" })]
		const rows = buildRows(grades, players, PUBLIC_TIEBREAKS)
		expect(rows.map((r) => r.playerId)).toEqual(["bo", "amy"])
		expect(rows.map((r) => r.rank)).toEqual([1, 2])
	})
})

describe("what counts", () => {
	const players = [P("amy", "2026-09-02"), P("bo", "2026-09-01")]
	it("ignores voided grades and players with nothing counted", () => {
		const rows = buildRows([G("amy", "g1", 1, 10), G("amy", "g2", 1, 25, { voided: true }), G("bo", "g2", 1, 25, { voided: true })], players, CLASSIC_TIEBREAKS)
		expect(rows.map((r) => [r.playerId, r.points, r.games])).toEqual([["amy", 10, 1]])
	})
	it("never counts an event twice for one player", () => {
		const rows = buildRows([G("amy", "g1", 1, 10), G("amy", "g1", 1, 10)], players, CLASSIC_TIEBREAKS)
		expect(rows[0].points).toBe(10)
		expect(rows[0].games).toBe(1)
	})
	it("scopes to a week or a list of events", () => {
		const grades = [G("amy", "g1", 1, 10), G("amy", "g2", 2, 20), G("bo", "g2", 2, 5)]
		expect(buildRows(grades, players, CLASSIC_TIEBREAKS, { week: 2 }).map((r) => r.points)).toEqual([20, 5])
		expect(buildRows(grades, players, CLASSIC_TIEBREAKS, { eventIds: ["g1"] }).map((r) => r.playerId)).toEqual(["amy"])
	})
	it("handles an empty league", () => {
		expect(buildRows([], players, CLASSIC_TIEBREAKS)).toEqual([])
	})
})

describe("finding yourself and moving", () => {
	const players = Array.from({ length: 8 }, (_, i) => P(`p${i}`, `2026-09-0${i + 1}`))
	const rows = buildRows(
		players.map((p, i) => G(p.id, "g1", 1, 80 - i * 5)),
		players,
		CLASSIC_TIEBREAKS
	)
	it("returns the rows around a player, trimmed at the ends", () => {
		const a = aroundPlayer(rows, "p4", 2)
		expect(a.neighbours.map((r) => r.playerId)).toEqual(["p2", "p3", "p4", "p5", "p6"])
		expect(a.row?.rank).toBe(5)
		expect(aroundPlayer(rows, "p0", 2).neighbours.map((r) => r.playerId)).toEqual(["p0", "p1", "p2"])
		expect(aroundPlayer(rows, "nobody").row).toBeNull()
	})
	it("works for a league of one", () => {
		const one = buildRows([G("p0", "g1", 1, 10)], players, CLASSIC_TIEBREAKS)
		expect(aroundPlayer(one, "p0").neighbours.length).toBe(1)
	})
	it("reports rank change and null for new players", () => {
		const before = buildRows([G("p0", "g1", 1, 10), G("p1", "g1", 1, 20)], players, CLASSIC_TIEBREAKS)
		const after = buildRows([G("p0", "g1", 1, 10), G("p1", "g1", 1, 20), G("p0", "g2", 2, 30), G("p2", "g2", 2, 1)], players, CLASSIC_TIEBREAKS)
		expect(rankChanges(before, after)).toEqual({ p0: 1, p1: -1, p2: null })
	})
})

describe("weekly champions need a real slate", () => {
	const players = [P("amy", "2026-09-02"), P("bo", "2026-09-01"), P("cy", "2026-09-03")]
	it("excludes a player who entered too little, however well", () => {
		const grades = [
			G("amy", "g1", 1, 1), G("amy", "g2", 1, 1), G("amy", "g3", 1, 1), G("amy", "g4", 1, 1), G("amy", "g5", 1, 0),
			G("bo", "g1", 1, 1), G("bo", "g2", 1, 1), G("bo", "g3", 1, 1), G("bo", "g4", 1, 1), G("bo", "g5", 1, 0),
			G("cy", "g1", 1, 1),
		]
		const rows = buildRows(grades, players, CLASSIC_TIEBREAKS, { week: 1 })
		expect(weeklyChampions(rows, 5).map((r) => r.playerId).sort()).toEqual(["amy", "bo"])
		expect(weeklyChampions(rows, 5, 0.2).map((r) => r.playerId).sort()).toEqual(["amy", "bo"])
		expect(weeklyChampions([], 5)).toEqual([])
	})
})
