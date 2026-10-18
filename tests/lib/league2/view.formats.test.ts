import { describe, expect, it } from "vitest"

import type { StandingGrade } from "../../../lib/league2/domain"
import type { CompetitionData, EventView } from "../../../lib/league2/services/read"
import { buildConfidenceWeek, buildUpsetWeek } from "../../../lib/league2/view/nflFormats"

const NOW = Date.parse("2026-10-17T12:00:00Z")
const ev = (id: string, week: number, kickoff: string, away: string, home: string, over: Partial<EventView> = {}): EventView => ({ id, legacyId: null, nflGameId: id, week, awayTeam: away, homeTeam: home, kickoff, lockAt: null, state: "scheduled", result: null, blogger: null, ...over })
const grade = (playerId: string, eventId: string, week: number, correct: boolean, points: number, voided = false): StandingGrade => ({ playerId, eventId, points, voided, detail: { correct, marginError: null, exact: false }, week, submittedAt: "2026-10-01T00:00:00Z" })
const player = (id: string, handle: string) => ({ id, handle, joinedAt: "2026-09-01T00:00:00Z", disabled: false })
const mine = (eventId: string, payload: unknown) => ({ entryId: "e" + eventId, eventId, payload, firstSubmittedAt: "2026-10-10T00:00:00Z", submittedAt: "2026-10-10T00:00:00Z", revisions: 1 })

const events = [
	ev("w5a", 5, "2026-10-11T17:00:00Z", "Kansas City Chiefs", "Las Vegas Raiders", { state: "final", result: { away: 20, home: 24 } }),
	ev("w5b", 5, "2026-10-12T00:20:00Z", "Denver Broncos", "Los Angeles Chargers", { state: "final", result: { away: 17, home: 17 } }),
	ev("w6a", 6, "2026-10-18T17:00:00Z", "Buffalo Bills", "New York Jets"),
	ev("w6b", 6, "2026-10-17T11:00:00Z", "Detroit Lions", "Chicago Bears"),
	ev("w6c", 6, "2026-10-19T00:15:00Z", "Dallas Cowboys", "Washington Commanders"),
]
const base = (over: Partial<CompetitionData>): CompetitionData => ({ competitionId: "x", events, players: [player("a", "Ann"), player("b", "Bobby")], grades: [], mine: [], tallies: {}, ...over })

describe("the confidence week view", () => {
	const conf = (over: Partial<CompetitionData> = {}, week = 6) => buildConfidenceWeek(base(over), 2026, { id: "a" }, NOW, week)!

	it("carries each pick's rank and counts the ranks left to use, with ranks running 1 to the number of games", () => {
		const v = conf({ mine: [mine("w6a", { pick: "home", rank: 3 }), mine("w6b", { pick: "away", rank: 1 })] })
		expect(v.gameCount).toBe(3)
		expect(v.games.find((g) => g.eventId === "w6a")).toMatchObject({ pick: "home", rank: 3, earned: null })
		expect(v.games.find((g) => g.eventId === "w6c")).toMatchObject({ pick: null, rank: null })
		expect(v.summary).toMatchObject({ ranked: 2, maxPossible: 6, points: 0, bestStillAlive: 4 })
		expect(v.next).toMatchObject({ kind: "pick", remaining: 1 })
	})

	it("scores a correct pick at its rank, a wrong one at nothing, and a push at nothing", () => {
		const v = conf(
			{ mine: [mine("w5a", { pick: "home", rank: 2 }), mine("w5b", { pick: "away", rank: 1 })], grades: [grade("a", "w5a", 5, true, 2), grade("a", "w5b", 5, false, 0, true)] },
			5
		)
		expect(v.games.find((g) => g.eventId === "w5a")).toMatchObject({ outcome: "correct", earned: 2, rank: 2 })
		expect(v.games.find((g) => g.eventId === "w5b")).toMatchObject({ outcome: "push", earned: null })
		expect(v.summary.points).toBe(2)
		expect(v.weekBoard.me).toMatchObject({ points: 2, rank: 1 })
	})

	it("says all set once every open game has a rank, and asks a stranger to sign in", () => {
		const all = conf({ mine: [mine("w6a", { pick: "home", rank: 3 }), mine("w6c", { pick: "home", rank: 2 }), mine("w6b", { pick: "away", rank: 1 })] })
		expect(all.next.kind).toBe("all_set")
		expect(buildConfidenceWeek(base({}), 2026, null, NOW, 6)!.next.kind).toBe("signin")
	})

	it("does not show a rank for a game whose pick was never made", () => {
		const v = conf({ mine: [mine("w6a", { pick: "none", rank: 2 })] })
		expect(v.games.find((g) => g.eventId === "w6a")!.rank).toBeNull()
	})
})

describe("the upset week view", () => {
	const lines = { w5a: { underdog: "home" as const, favouriteWinChance: 0.6 }, w6a: { underdog: "away" as const, favouriteWinChance: 0.7 }, w6b: { underdog: "home" as const, favouriteWinChance: 0.9 } }
	const up = (over: Partial<CompetitionData> = {}, week = 6, who: { id: string } | null = { id: "a" }) => buildUpsetWeek(base({ lines, maxUpsets: 5, ...over }), 2026, who, NOW, week)!

	it("prices each underdog from the frozen line and the policy tiers", () => {
		const v = up()
		expect(v.games.find((g) => g.eventId === "w6a")!.line).toMatchObject({ underdog: "away", value: 2, tier: 2, label: "Big upset" })
		expect(v.games.find((g) => g.eventId === "w6b")!.line).toMatchObject({ underdog: "home", value: 3, tier: 3, label: "Huge upset" })
		expect(v.games.find((g) => g.eventId === "w6c")!.line).toBeNull()
	})

	it("follows the policy rules it is given", () => {
		const v = up({ upsetRules: { base: 2, perTier: 5, tierBoundaries: [0.65, 0.8] } })
		expect(v.games.find((g) => g.eventId === "w6a")!.line!.value).toBe(7)
	})

	it("counts calls against the weekly cap, and 'none' is not a call", () => {
		const v = up({ mine: [mine("w6a", { pick: "away" }), mine("w6b", { pick: "none" })] })
		expect(v.calls).toEqual({ used: 1, max: 5, left: 4 })
		expect(v.games.find((g) => g.eventId === "w6b")!.called).toBe(false)
		expect(v.next).toMatchObject({ kind: "pick", remaining: 4 })
		const full = up({ maxUpsets: 1, mine: [mine("w6a", { pick: "away" })] })
		expect(full.next.kind).toBe("all_set")
	})

	it("grades a call as a hit or a miss and totals the points", () => {
		const v = up({ mine: [mine("w5a", { pick: "home" })], grades: [grade("a", "w5a", 5, true, 1)] }, 5)
		expect(v.games.find((g) => g.eventId === "w5a")).toMatchObject({ called: true, outcome: "hit", upsetHappened: true })
		expect(v.summary).toMatchObject({ called: 1, hits: 1, misses: 0, points: 1, final: 2 })
		const miss = up({ mine: [mine("w5a", { pick: "home" })], grades: [grade("a", "w5a", 5, false, 0)] }, 5)
		expect(miss.summary).toMatchObject({ hits: 0, misses: 1, points: 0 })
	})

	it("finds the upset of the week and how many players called it, only after the game is over", () => {
		const v = up({ tallies: { w5a: { eventId: "w5a", entries: 3, awayWins: 1, homeWins: 2 } } }, 5)
		expect(v.upsetOfWeek).toMatchObject({ eventId: "w5a", callers: 2, value: 1, awayIsUnderdog: false })
		expect(v.upsetOfWeek!.underdog.abbr).toBe("LV")
		expect(up().upsetOfWeek).toBeNull()
		// Open games show no caller count at all.
		expect(up({ tallies: { w6a: { eventId: "w6a", entries: 9, awayWins: 9, homeWins: 0 } } }).games.find((g) => g.eventId === "w6a")!.callers).toBeNull()
	})

	it("crowns a week's champion on a single scoring call, and never on zero points", () => {
		const scored = up({ grades: [grade("a", "w5a", 5, true, 1), grade("b", "w5a", 5, false, 0)] }, 6)
		expect(scored.champions).toEqual([{ week: 5, handles: ["Ann"], points: 1 }])
		const none = up({ grades: [grade("b", "w5a", 5, false, 0)] }, 6)
		expect(none.champions).toEqual([])
	})

	it("tells a stranger to sign in and a player with no lines yet to wait", () => {
		expect(up({}, 6, null).next.kind).toBe("signin")
		expect(up({ lines: {} }).next).toMatchObject({ kind: "waiting" })
	})
})
