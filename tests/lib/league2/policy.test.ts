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

describe("validateRules", () => {
	it("accepts the shipped rule sets", async () => {
		const { CLASSIC_V1, WINNER_V1, CONFIDENCE_V1, UPSET_V1, validateRules } = await import("../../../lib/league2/domain")
		expect(validateRules("score-pick", CLASSIC_V1.rules)).toBeNull()
		expect(validateRules("winner", WINNER_V1.rules)).toBeNull()
		expect(validateRules("confidence", CONFIDENCE_V1.rules)).toBeNull()
		expect(validateRules("upset", UPSET_V1.rules)).toBeNull()
	})
	it("rejects malformed, negative, fractional and out-of-order rules", async () => {
		const { validateRules } = await import("../../../lib/league2/domain")
		expect(validateRules("score-pick", null)).not.toBeNull()
		expect(validateRules("score-pick", { winner: 1.5, margin: [], exactScore: 1 })).not.toBeNull()
		expect(validateRules("score-pick", { winner: 1, margin: [{ max: 5, pts: 1 }, { max: 2, pts: 1 }], exactScore: 1 })).not.toBeNull()
		expect(validateRules("score-pick", { winner: 1, margin: [{ max: 2, pts: -1 }], exactScore: 1 })).not.toBeNull()
		expect(validateRules("winner", { correct: 0 })).not.toBeNull()
		expect(validateRules("confidence", { perRank: "2" })).not.toBeNull()
		expect(validateRules("upset", { base: 1, perTier: 1, tierBoundaries: [0.8, 0.65] })).not.toBeNull()
		expect(validateRules("upset", { base: 1, perTier: 1, tierBoundaries: [0.4] })).not.toBeNull()
	})
})
