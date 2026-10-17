import { describe, expect, it } from "vitest"

import { CLASSIC_V1, UPSET_V1, WINNER_V1, freezePolicy, isFrozen, policyFor, policyId, reviseRules } from "../../../lib/league2/domain"

describe("policy versions", () => {
	it("names a version from its family", () => {
		expect(policyId("btb-classic", 1)).toBe("btb-classic-v1")
		expect(CLASSIC_V1.id).toBe("btb-classic-v1")
	})

	it("freezes once and keeps the first freeze time", () => {
		const a = freezePolicy(WINNER_V1, "2026-09-01T00:00:00Z")
		expect(isFrozen(a)).toBe(true)
		expect(freezePolicy(a, "2027-01-01T00:00:00Z").frozenAt).toBe("2026-09-01T00:00:00Z")
		expect(WINNER_V1.frozenAt).toBeNull()
	})

	it("never edits a frozen policy: a rule change is the next version", () => {
		const next = reviseRules(CLASSIC_V1, { ...CLASSIC_V1.rules, winner: 12 }, "2027-09-01T00:00:00Z")
		expect(next.id).toBe("btb-classic-v2")
		expect(next.version).toBe(2)
		expect(next.rules.winner).toBe(12)
		expect(next.frozenAt).toBeNull()
		expect(CLASSIC_V1.rules.winner).toBe(10)
	})

	it("edits a draft in place", () => {
		const next = reviseRules(WINNER_V1, { correct: 2 }, "2027-09-01T00:00:00Z")
		expect(next.id).toBe("nfl-winner-v1")
		expect(next.rules.correct).toBe(2)
	})

	it("grades a game under the version in effect when it locked", () => {
		const v2 = reviseRules(CLASSIC_V1, { ...CLASSIC_V1.rules, winner: 12 }, "2027-09-01T00:00:00Z")
		const all = [CLASSIC_V1, v2]
		expect(policyFor(all, "btb-classic", "2026-10-04T17:00:00Z")?.id).toBe("btb-classic-v1")
		expect(policyFor(all, "btb-classic", "2027-09-01T00:00:00Z")?.id).toBe("btb-classic-v2")
		expect(policyFor(all, "btb-classic", "2027-12-01T00:00:00Z")?.id).toBe("btb-classic-v2")
		expect(policyFor(all, "unknown", "2026-10-04T17:00:00Z")).toBeNull()
		expect(UPSET_V1.rules.tierBoundaries.length).toBe(2)
	})
})
