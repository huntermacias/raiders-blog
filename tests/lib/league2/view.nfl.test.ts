import { describe, expect, it } from "vitest"

import type { StandingGrade } from "../../../lib/league2/domain"
import type { CompetitionData, EventView } from "../../../lib/league2/services/read"
import { buildNflWeek, defaultWeek, statusOf } from "../../../lib/league2/view/nfl"

const NOW = Date.parse("2026-10-17T12:00:00Z")
const ev = (id: string, week: number, kickoff: string, away: string, home: string, over: Partial<EventView> = {}): EventView => ({ id, legacyId: null, nflGameId: id, week, awayTeam: away, homeTeam: home, kickoff, lockAt: null, state: "scheduled", result: null, blogger: null, ...over })
const grade = (playerId: string, eventId: string, week: number, correct: boolean, voided = false): StandingGrade => ({ playerId, eventId, points: correct ? 1 : 0, voided, detail: { correct, marginError: null, exact: false }, week, submittedAt: "2026-10-01T00:00:00Z" })
const player = (id: string, handle: string, disabled = false) => ({ id, handle, joinedAt: "2026-09-01T00:00:00Z", disabled })

const data = (over: Partial<CompetitionData> = {}): CompetitionData => ({
	competitionId: "nfl-winners-2026",
	events: [
		ev("w5a", 5, "2026-10-11T17:00:00Z", "Kansas City Chiefs", "Las Vegas Raiders", { state: "final", result: { away: 20, home: 24 } }),
		ev("w5b", 5, "2026-10-12T00:20:00Z", "Denver Broncos", "Los Angeles Chargers", { state: "final", result: { away: 17, home: 17 } }), // a tie
		ev("w6a", 6, "2026-10-18T17:00:00Z", "Buffalo Bills", "New York Jets"), // open
		ev("w6b", 6, "2026-10-17T11:00:00Z", "Detroit Lions", "Chicago Bears"), // kicked off an hour ago: locked
		ev("w6c", 6, "2026-10-19T00:15:00Z", "Dallas Cowboys", "Washington Commanders"),
	],
	players: [player("a", "Ann"), player("b", "Bobby"), player("c", "Cyrus", true)],
	grades: [grade("a", "w5a", 5, true), grade("b", "w5a", 5, false), grade("c", "w5a", 5, true), grade("a", "w5b", 5, false, true), grade("b", "w5b", 5, false, true)],
	mine: [],
	tallies: { w5a: { eventId: "w5a", entries: 3, awayWins: 1, homeWins: 2 }, w6a: { eventId: "w6a", entries: 5, awayWins: 5, homeWins: 0 }, w6b: { eventId: "w6b", entries: 4, awayWins: 1, homeWins: 3 } },
	...over,
})
const pick = (eventId: string, p: "away" | "home") => ({ entryId: "e" + eventId, eventId, payload: { pick: p }, firstSubmittedAt: "2026-10-10T00:00:00Z", submittedAt: "2026-10-10T00:00:00Z", revisions: 1 })

describe("the NFL winners week view", () => {
	it("opens on the first week that still has something to play", () => {
		expect(defaultWeek(data().events, NOW)).toBe(6)
		expect(defaultWeek(data().events.filter((e) => e.week === 5), NOW)).toBe(5)
		expect(defaultWeek([], NOW)).toBeNull()
	})

	it("calls a game open, locked, final or cancelled from the clock and its state", () => {
		const e = data().events
		expect(statusOf(e[2], NOW)).toBe("open")
		expect(statusOf(e[3], NOW)).toBe("locked")
		expect(statusOf(e[0], NOW)).toBe("final")
		expect(statusOf({ ...e[2], state: "cancelled" }, NOW)).toBe("cancelled")
		// A moved lock keeps a game open past kickoff.
		expect(statusOf({ ...e[3], lockAt: "2026-10-17T13:00:00Z" }, NOW)).toBe("open")
	})

	it("hides the crowd while a game is open, shows it once locked, and never loads other players' picks", () => {
		const v = buildNflWeek(data({ mine: [pick("w6a", "home")] }), 2026, { id: "a" }, NOW, 6)!
		const open = v.games.find((g) => g.eventId === "w6a")!
		expect(open.status).toBe("open")
		expect(open.crowd).toBeNull()
		expect(open.pick).toBe("home")
		expect(v.games.find((g) => g.eventId === "w6b")!.crowd).toEqual({ away: 1, home: 3, total: 4 })
		expect(v.games.find((g) => g.eventId === "w6b")!.outcome).toBe("missed")
	})

	it("tells the player what to do next, in each situation", () => {
		expect(buildNflWeek(data(), 2026, null, NOW, 6)!.next.kind).toBe("signin")
		const some = buildNflWeek(data({ mine: [pick("w6a", "home")] }), 2026, { id: "a" }, NOW, 6)!
		expect(some.next).toMatchObject({ kind: "pick", remaining: 1 })
		expect(some.summary).toMatchObject({ picked: 1, openUnpicked: 1 })
		const all = buildNflWeek(data({ mine: [pick("w6a", "home"), pick("w6c", "away")] }), 2026, { id: "a" }, NOW, 6)!
		expect(all.next.kind).toBe("all_set")
		const locked = buildNflWeek(data(), 2026, { id: "a" }, Date.parse("2026-10-20T12:00:00Z"), 6)!
		expect(locked.next.kind).toBe("waiting")
	})

	it("grades the viewer's picks: right, wrong, and a tie as a push", () => {
		const d = data({ mine: [pick("w5a", "home"), pick("w5b", "home")] })
		const a = buildNflWeek(d, 2026, { id: "a" }, NOW, 5)!
		expect(a.games.map((g) => [g.eventId, g.outcome])).toEqual([["w5a", "correct"], ["w5b", "push"]])
		expect(a.games[1].result).toEqual({ away: 17, home: 17, winner: "tie" })
		expect(a.summary).toMatchObject({ final: 2, correct: 1, pushes: 1, total: 2 })
		const b = buildNflWeek(data({ mine: [pick("w5a", "away")] }), 2026, { id: "b" }, NOW, 5)!
		expect(b.games[0].outcome).toBe("wrong")
	})

	it("ranks the week and the season, leaves out disabled players, and keeps you on the board", () => {
		const v = buildNflWeek(data(), 2026, { id: "b" }, NOW, 5)!
		expect(v.weekBoard.rows.map((r) => [r.handle, r.rank, r.points])).toEqual([["Ann", 1, 1], ["Bobby", 2, 0]])
		expect(v.weekBoard.me?.handle).toBe("Bobby")
		expect(v.seasonBoard.rows.map((r) => r.handle)).toEqual(["Ann", "Bobby"])
		expect(v.seasonBoard.players).toBe(2)
	})

	it("names the champion of a finished week, but not of a week still in play", () => {
		const v = buildNflWeek(data(), 2026, null, NOW, 6)!
		expect(v.champions).toEqual([{ week: 5, handles: ["Ann"], points: 1 }])
		const early = buildNflWeek(data(), 2026, null, NOW, 5)!
		expect(early.champions).toEqual([{ week: 5, handles: ["Ann"], points: 1 }])
	})

	it("returns null when there are no games yet", () => {
		expect(buildNflWeek(data({ events: [] }), 2026, null, NOW, null)).toBeNull()
	})
})
