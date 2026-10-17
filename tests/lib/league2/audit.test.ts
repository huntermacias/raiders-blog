import { describe, expect, it } from "vitest"

import { buildAudit, redact, requiresReason } from "../../../lib/league2/domain"

const base = { actor: "admin1", actorRole: "admin" as const, subject: "player:abc", before: { state: "claimed" }, after: { state: "unclaimed" } }

describe("audit entries", () => {
	it("require a written reason for sensitive actions", () => {
		expect(requiresReason("legacy.claim.rollback")).toBe(true)
		expect(requiresReason("result.correct")).toBe(true)
		expect(requiresReason("account.register")).toBe(false)
		expect(buildAudit({ ...base, action: "legacy.claim.rollback" }, 0).ok).toBe(false)
		expect(buildAudit({ ...base, action: "legacy.claim.rollback", reason: "too short" }, 0).ok).toBe(false)
		const r = buildAudit({ ...base, action: "legacy.claim.rollback", reason: "Verified ownership by two independent signals" }, Date.parse("2026-10-17T00:00:00Z"))
		expect(r).toMatchObject({ ok: true, entry: { at: "2026-10-17T00:00:00.000Z", reason: "Verified ownership by two independent signals" } })
	})
	it("does not need a reason for routine actions, and always needs an actor", () => {
		expect(buildAudit({ ...base, action: "grade.create", actorRole: "system", actor: "system" }, 0).ok).toBe(true)
		expect(buildAudit({ ...base, action: "grade.create", actor: "" }, 0).ok).toBe(false)
	})
	it("refuses to attribute admin-only actions to a player", () => {
		expect(buildAudit({ ...base, action: "account.disable", actorRole: "player", reason: "I would like to disable this account" }, 0).ok).toBe(false)
	})
	it("redacts secrets, tokens and emails from stored payloads, deeply", () => {
		expect(redact({ handle: "amy", email: "a@b.co", nested: { passwordHash: "x", keyHash: "y", ok: 1 }, list: [{ token: "t", n: 2 }] })).toEqual({
			handle: "amy",
			email: "[redacted]",
			nested: { passwordHash: "[redacted]", keyHash: "[redacted]", ok: 1 },
			list: [{ token: "[redacted]", n: 2 }],
		})
	})
})
