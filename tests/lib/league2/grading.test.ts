import { describe, expect, it } from "vitest"

import { CLASSIC_V1, CONFIDENCE_V1, UPSET_V1, WINNER_V1, type Grade, type LeagueEvent, applyPlan, currentGrades, gradeKey, homeWinChance, planGrading, underdogSnapshot, upsetTier } from "../../../lib/league2/domain"

const NOW = "2026-10-05T00:00:00.000Z"
const base: LeagueEvent = { id: "g1", kickoff: "2026-10-04T17:00:00Z", state: "final", result: { away: 17, home: 24 } }
const entries = [
	{ id: "a:g1", playerId: "a", eventId: "g1", payload: { away: 17, home: 24 } },
	{ id: "b:g1", playerId: "b", eventId: "g1", payload: { away: 20, home: 14 } },
	{ id: "c:g1", playerId: "c", eventId: "g1", payload: { away: 10, home: 13 } },
]

describe("grading is idempotent", () => {
	it("adds one grade per entry for a final game", () => {
		const plan = planGrading({ event: base, entries, existing: [], policy: CLASSIC_V1, now: NOW })
		expect(plan.create.map((g) => [g.playerId, g.points])).toEqual([
			["a", 25],
			["b", 0],
			["c", 10 + 3],
		])
		expect(plan.create[0].key).toBe(gradeKey("a:g1", "btb-classic-v1", "17-24"))
		expect(plan.create.every((g) => g.supersedes === null && !g.voided)).toBe(true)
	})

	it("adds nothing the second time, or the hundredth", () => {
		let grades: Grade[] = []
		for (let i = 0; i < 100; i++) {
			const plan = planGrading({ event: base, entries, existing: grades, policy: CLASSIC_V1, now: NOW })
			if (i > 0) expect(plan.create).toEqual([])
			grades = applyPlan(grades, plan)
		}
		expect(grades.length).toBe(3)
	})

	it("never grades a game that is not final", () => {
		for (const state of ["scheduled", "postponed", "in_progress"] as const) {
			expect(planGrading({ event: { ...base, state, result: null }, entries, existing: [], policy: CLASSIC_V1, now: NOW }).create).toEqual([])
		}
		// A "final" with no scores yet is still not gradable.
		expect(planGrading({ event: { ...base, result: null }, entries, existing: [], policy: CLASSIC_V1, now: NOW }).create).toEqual([])
	})

	it("grades an entry added later (a late sync) without touching the rest", () => {
		const first = applyPlan([], planGrading({ event: base, entries: entries.slice(0, 2), existing: [], policy: CLASSIC_V1, now: NOW }))
		const plan = planGrading({ event: base, entries, existing: first, policy: CLASSIC_V1, now: NOW })
		expect(plan.create.map((g) => g.playerId)).toEqual(["c"])
		expect(plan.skipped).toBe(2)
	})

	it("reports unreadable payloads instead of guessing", () => {
		const plan = planGrading({ event: base, entries: [{ id: "x:g1", playerId: "x", eventId: "g1", payload: { nonsense: true } }], existing: [], policy: CLASSIC_V1, now: NOW })
		expect(plan.create).toEqual([])
		expect(plan.unreadable).toEqual(["x:g1"])
	})
})

describe("stat corrections", () => {
	it("supersede the old grade and keep it for the record", () => {
		const first = applyPlan([], planGrading({ event: base, entries, existing: [], policy: CLASSIC_V1, now: NOW }))
		const corrected: LeagueEvent = { ...base, result: { away: 17, home: 23 } }
		const plan = planGrading({ event: corrected, entries, existing: first, policy: CLASSIC_V1, now: "2026-10-07T00:00:00Z" })
		expect(plan.create.length).toBe(3)
		plan.create.forEach((g) => expect(g.supersedes).toBe(first.find((f) => f.entryId === g.entryId)!.key))
		const all = applyPlan(first, plan)
		expect(all.length).toBe(6)
		const cur = currentGrades(all)
		expect(cur.length).toBe(3)
		expect(cur.find((g) => g.playerId === "a")!.points).toBe(10 + 6 + 0) // 7 vs 6 margin: within 3 but not exact
		// Correcting again to the original result supersedes the correction, still without double counting.
		const back = applyPlan(all, planGrading({ event: base, entries, existing: all, policy: CLASSIC_V1, now: "2026-10-08T00:00:00Z" }))
		expect(currentGrades(back).find((g) => g.playerId === "a")!.points).toBe(25)
		expect(currentGrades(back).length).toBe(3)
	})
})

describe("cancelled games", () => {
	it("add a void grade once, worth nothing", () => {
		const cancelled: LeagueEvent = { ...base, state: "cancelled", result: null }
		const once = applyPlan([], planGrading({ event: cancelled, entries, existing: [], policy: CLASSIC_V1, now: NOW }))
		expect(once.every((g) => g.voided && g.points === 0)).toBe(true)
		expect(planGrading({ event: cancelled, entries, existing: once, policy: CLASSIC_V1, now: NOW }).create).toEqual([])
	})
	it("supersede an earlier real grade if the result is voided afterwards", () => {
		const graded = applyPlan([], planGrading({ event: base, entries, existing: [], policy: CLASSIC_V1, now: NOW }))
		const voided = planGrading({ event: { ...base, state: "cancelled", result: null }, entries, existing: graded, policy: CLASSIC_V1, now: NOW })
		expect(voided.create.every((g) => g.voided && g.supersedes !== null)).toBe(true)
	})
})

describe("other policies", () => {
	it("scores winners, and treats a tie as a push that neither scores nor counts", () => {
		const e = [
			{ id: "a", playerId: "a", eventId: "g1", payload: { pick: "home" } },
			{ id: "b", playerId: "b", eventId: "g1", payload: { pick: "away" } },
		]
		const plan = planGrading({ event: base, entries: e, existing: [], policy: WINNER_V1, now: NOW })
		expect(plan.create.map((g) => g.points)).toEqual([1, 0])
		const tie = planGrading({ event: { ...base, result: { away: 20, home: 20 } }, entries: e, existing: [], policy: WINNER_V1, now: NOW })
		expect(tie.create.map((g) => [g.points, g.voided])).toEqual([[0, true], [0, true]])
		// Re-running on the same tie adds nothing; a corrected score supersedes the push.
		const again = planGrading({ event: { ...base, result: { away: 20, home: 20 } }, entries: e, existing: tie.create, policy: WINNER_V1, now: NOW })
		expect(again.create).toEqual([])
		const fixed = planGrading({ event: { ...base, result: { away: 20, home: 23 } }, entries: e, existing: tie.create, policy: WINNER_V1, now: NOW })
		expect(fixed.create.map((g) => [g.points, g.voided, g.supersedes !== null])).toEqual([[1, false, true], [0, false, true]])
	})

	it("scores confidence by the rank assigned", () => {
		const e = [
			{ id: "a", playerId: "a", eventId: "g1", payload: { pick: "home", rank: 14 } },
			{ id: "b", playerId: "b", eventId: "g1", payload: { pick: "away", rank: 16 } },
		]
		expect(planGrading({ event: base, entries: e, existing: [], policy: CONFIDENCE_V1, now: NOW }).create.map((g) => g.points)).toEqual([14, 0])
	})

	it("scores an upset only for the pre-lock underdog, by tier, and needs the snapshot", () => {
		// Home is the favourite at 0.70: tier 2 (boundaries 0.65, 0.80).
		const snap = { underdog: "away" as const, favouriteWinChance: 0.7 }
		expect(upsetTier(UPSET_V1, 0.55)).toBe(1)
		expect(upsetTier(UPSET_V1, 0.65)).toBe(2)
		expect(upsetTier(UPSET_V1, 0.8)).toBe(3)
		const e = [
			{ id: "a", playerId: "a", eventId: "g1", payload: { pick: "away" } },
			{ id: "b", playerId: "b", eventId: "g1", payload: { pick: "home" } },
		]
		const upset = planGrading({ event: { ...base, result: { away: 27, home: 20 } }, entries: e, existing: [], policy: UPSET_V1, snapshot: snap, now: NOW })
		expect(upset.create.map((g) => g.points)).toEqual([2, 0])
		const favouriteWins = planGrading({ event: base, entries: e, existing: [], policy: UPSET_V1, snapshot: snap, now: NOW })
		expect(favouriteWins.create.map((g) => g.points)).toEqual([0, 0])
		expect(planGrading({ event: base, entries: e, existing: [], policy: UPSET_V1, now: NOW }).unreadable.length).toBe(2)
	})

	it("derives the underdog from ratings, symmetric and with no underdog on a dead heat", () => {
		expect(homeWinChance(1500, 1500, 0)).toBeCloseTo(0.5, 12)
		expect(homeWinChance(1500, 1500)).toBeGreaterThan(0.5)
		expect(underdogSnapshot(1600, 1500)).toMatchObject({ underdog: "away" })
		expect(underdogSnapshot(1400, 1600)).toMatchObject({ underdog: "home" })
		expect(underdogSnapshot(1500, 1548, 48)).toBeNull()
		const a = underdogSnapshot(1600, 1500, 0)!
		const b = underdogSnapshot(1500, 1600, 0)!
		expect(a.favouriteWinChance).toBeCloseTo(b.favouriteWinChance, 12)
	})
})
