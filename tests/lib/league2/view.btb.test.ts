import { describe, expect, it } from "vitest"

import { type StandingGrade } from "../../../lib/league2/domain"
import type { CompetitionData, EventView } from "../../../lib/league2/services/read"
import { buildHome } from "../../../lib/league2/view/btb"

const NOW = Date.parse("2026-10-17T12:00:00Z")
const ev = (id: string, week: number, kickoff: string, over: Partial<EventView> = {}): EventView => ({ id, legacyId: id, nflGameId: null, week, awayTeam: "Las Vegas Raiders", homeTeam: "Team " + id, kickoff, lockAt: null, state: "scheduled", result: null, blogger: { away: 24, home: 20 }, ...over })
const grade = (playerId: string, eventId: string, points: number, week: number, correct = true): StandingGrade => ({ playerId, eventId, points, voided: false, detail: { correct, marginError: 2, exact: false }, week, submittedAt: "2026-09-01T00:00:00Z" })
const player = (id: string, handle: string, disabled = false) => ({ id, handle, joinedAt: "2026-09-01T00:00:00Z", disabled })

function data(over: Partial<CompetitionData> = {}): CompetitionData {
	return {
		competitionId: "btb-2026",
		events: [
			ev("g1", 1, "2026-09-13T17:00:00Z", { state: "final", result: { away: 27, home: 17 } }), // blogger 24-20: winner 10 + margin err 6 (3) = 13
			ev("g2", 2, "2026-09-20T17:00:00Z", { state: "final", result: { away: 24, home: 20 } }), // blogger exact: 10+10+5 = 25
			ev("g3", 6, "2026-10-17T20:00:00Z"), // tonight: open
			ev("g4", 7, "2026-10-24T20:00:00Z"),
		],
		players: [player("a", "Ann"), player("b", "Bobby"), player("c", "Cyrus", true)],
		grades: [grade("a", "g1", 20, 1), grade("a", "g2", 10, 2), grade("b", "g1", 5, 1), grade("b", "g2", 25, 2), grade("c", "g1", 99, 1)],
		mine: [],
		tallies: { g1: { eventId: "g1", entries: 2, awayWins: 1, homeWins: 1 }, g3: { eventId: "g3", entries: 2, awayWins: 2, homeWins: 0 } },
		...over,
	}
}

describe("the Beat the Blogger home view", () => {
	it("hides the blogger's pick and the community until a game locks", () => {
		const v = buildHome(data(), 2026, { id: "a" }, NOW)
		const open = v.slate.find((c) => c.eventId === "g3")!
		expect(open.status).toBe("open")
		expect(open.blogger).toBeNull()
		expect(open.bloggerPoints).toBeNull()
		expect(open.community).toBeNull()
		const done = v.recent!.cards.find((c) => c.eventId === "g2")!
		expect(done.blogger).toEqual({ away: 24, home: 20 })
		expect(done.community).toBeNull() // g2 has no tally
		expect(v.recent!.cards[0].community).toBeNull()
	})

	it("reveals the community on a locked game and never exposes another player's pick", () => {
		const d = data({ events: [ev("g3", 6, "2026-10-17T11:00:00Z")], grades: [] })
		const v = buildHome(d, 2026, null, NOW)
		expect(v.locked[0].status).toBe("locked")
		expect(v.locked[0].community).toEqual({ entries: 2, awayShare: 1 })
		expect(JSON.stringify(v)).not.toContain("payload")
	})

	it("ranks players, leaves out disabled ones, and measures each against the blogger", () => {
		const v = buildHome(data(), 2026, { id: "a" }, NOW)
		expect(v.board.total).toBe(2)
		expect(v.board.top.map((r) => [r.handle, r.rank, r.points, r.delta])).toEqual([["Ann", 1, 30, -8], ["Bobby", 1, 30, -8]])
		expect(v.board.blogger).toEqual({ points: 38, games: 2 })
		expect(v.board.aheadOfBlogger).toBe(0)
		expect(v.board.shareAhead).toBe(0)
		expect(v.players).toBe(2)
	})

	it("builds my line: rank, movement since the last graded week, and the rivalry", () => {
		const v = buildHome(data(), 2026, { id: "b" }, NOW)
		expect(v.me).toMatchObject({ handle: "Bobby", rank: 1, of: 2, points: 30, games: 2, movement: 1, delta: -8 })
		const a = buildHome(data(), 2026, { id: "a" }, NOW).me!
		expect(a.movement).toBe(0)
		expect(a.rivalry.record).toEqual({ w: 1, l: 1, t: 0 })
		expect(a.rivalry.current).toEqual({ type: "L", length: 1 })
		expect(a.rivalry.longestWin).toBe(1)
	})

	it("summarises the latest graded week", () => {
		const v = buildHome(data(), 2026, null, NOW)
		expect(v.recent).toMatchObject({ week: 2, entrants: 2, beat: 0 })
		expect(v.me).toBeNull()
	})

	it("tells each kind of visitor what to do next", () => {
		expect(buildHome(data(), 2026, null, NOW).nextAction.kind).toBe("join")
		const picking = buildHome(data(), 2026, { id: "a" }, NOW).nextAction
		expect(picking).toMatchObject({ kind: "pick", eventId: "g3" })
		expect(picking.detail).toMatch(/Locks in 8 hours/)
		const done = data({ mine: [{ entryId: "x", eventId: "g3", payload: { away: 20, home: 24 }, firstSubmittedAt: "2026-10-16T00:00:00Z", submittedAt: "2026-10-16T00:00:00Z", revisions: 1 }, { entryId: "y", eventId: "g4", payload: { away: 20, home: 24 }, firstSubmittedAt: "2026-10-16T00:00:00Z", submittedAt: "2026-10-16T00:00:00Z", revisions: 1 }] })
		expect(buildHome(done, 2026, { id: "a" }, NOW).nextAction.kind).toBe("all_set")
		const none = data({ events: data().events.slice(0, 2) })
		expect(buildHome(none, 2026, { id: "a" }, NOW).nextAction.kind).toBe("waiting")
	})

	it("shows my own pick on an open game and nobody else's", () => {
		const d = data({ mine: [{ entryId: "x", eventId: "g3", payload: { away: 31, home: 17 }, firstSubmittedAt: "2026-10-16T00:00:00Z", submittedAt: "2026-10-16T00:00:00Z", revisions: 1 }] })
		const v = buildHome(d, 2026, { id: "a" }, NOW)
		expect(v.slate.find((c) => c.eventId === "g3")!.myPick).toEqual({ away: 31, home: 17 })
		expect(buildHome(d, 2026, null, NOW).slate.find((c) => c.eventId === "g3")!.myPick).toBeNull()
	})

	it("treats a cancelled game as void and an empty league as a quiet page", () => {
		const d = data({ events: [ev("g1", 1, "2026-10-10T17:00:00Z", { state: "cancelled" })], grades: [], tallies: {} })
		expect(buildHome(d, 2026, null, NOW).slate).toEqual([])
		const empty = buildHome({ competitionId: "x", events: [], players: [], grades: [], mine: [], tallies: {} }, 2026, { id: "zz" }, NOW)
		expect(empty.me).toBeNull()
		expect(empty.board.total).toBe(0)
		expect(empty.board.shareAhead).toBeNull()
	})
})
