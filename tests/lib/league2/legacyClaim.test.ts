import { describe, expect, it } from "vitest"

import { type ClaimEvent, type LegacyClaim, legacyKeyUsable, manualReviewSufficient, newClaim, reduceClaim } from "../../../lib/league2/domain"

const T0 = 1_000_000
const TTL = 30 * 60_000
const run = (c: LegacyClaim, ev: ClaimEvent) => reduceClaim(c, ev)

function claiming(): LegacyClaim {
	const r = run(newClaim("hunter2"), { type: "begin", tokenHash: "h1", now: T0, ttlMs: TTL })
	if (!r.ok) throw new Error("expected ok")
	return r.claim
}

function bound(user = "u1"): LegacyClaim {
	const r = run(claiming(), { type: "bind", tokenHash: "h1", userId: user, now: T0 + 500, ttlMs: TTL })
	if (!r.ok) throw new Error("expected ok")
	return r.claim
}

describe("legacy claim state machine", () => {
	it("keeps the legacy key working until the claim completes", () => {
		expect(legacyKeyUsable(newClaim("x"))).toBe(true)
		expect(legacyKeyUsable(claiming())).toBe(true)
		expect(legacyKeyUsable(bound())).toBe(true)
		const done = run(bound(), { type: "complete", userId: "u1", now: T0 + 1000 })
		expect(done.ok && legacyKeyUsable(done.claim)).toBe(false)
	})

	it("binds the claim to the account that presents the token", () => {
		const r = run(claiming(), { type: "bind", tokenHash: "h1", userId: "u1", now: T0 + 500, ttlMs: TTL })
		expect(r).toMatchObject({ ok: true, noop: false, audit: "legacy.claim.bind" })
		expect(r.ok && r.claim).toMatchObject({ state: "claiming", pendingUserId: "u1", expiresAt: T0 + 500 + TTL })
	})

	it("rejects a wrong token, and a second account once one is bound", () => {
		const c = claiming()
		const bad = run(c, { type: "bind", tokenHash: "WRONG", userId: "u1", now: T0 + 500, ttlMs: TTL })
		expect(bad).toMatchObject({ ok: false, code: "bad_token" })
		expect(bad.claim).toEqual(c)
		expect(run(bound("u1"), { type: "bind", tokenHash: "h1", userId: "u2", now: T0 + 600, ttlMs: TTL })).toMatchObject({ ok: false, code: "bound_to_other" })
		expect(run(bound("u1"), { type: "bind", tokenHash: "h1", userId: "u1", now: T0 + 600, ttlMs: TTL })).toMatchObject({ ok: true, noop: true })
	})

	it("cannot bind without beginning, or after the claim is done", () => {
		expect(run(newClaim("x"), { type: "bind", tokenHash: "h1", userId: "u1", now: T0, ttlMs: TTL })).toMatchObject({ ok: false, code: "no_pending_claim" })
		const done = run(bound(), { type: "complete", userId: "u1", now: T0 + 1000 })
		if (!done.ok) throw new Error("expected ok")
		expect(run(done.claim, { type: "bind", tokenHash: "h1", userId: "u2", now: T0 + 2000, ttlMs: TTL })).toMatchObject({ ok: false, code: "already_claimed" })
	})

	it("completes only for the bound account, linking exactly one account", () => {
		const done = run(bound(), { type: "complete", userId: "u1", now: T0 + 1000 })
		expect(done).toMatchObject({ ok: true, noop: false, audit: "legacy.claim.complete" })
		expect(done.ok && done.claim).toMatchObject({ state: "claimed", claimedBy: "u1", tokenHash: null, pendingUserId: null, claimedAt: T0 + 1000 })
		expect(run(bound("u1"), { type: "complete", userId: "u2", now: T0 + 1000 })).toMatchObject({ ok: false, code: "owner_mismatch" })
		// An account that only verified an email, with no bound claim, cannot take the handle.
		expect(run(claiming(), { type: "complete", userId: "u1", now: T0 + 1000 })).toMatchObject({ ok: false, code: "owner_mismatch" })
	})

	it("is idempotent for the same account and refuses a different one", () => {
		const done = run(bound(), { type: "complete", userId: "u1", now: T0 + 1000 })
		if (!done.ok) throw new Error("expected ok")
		expect(run(done.claim, { type: "complete", userId: "u1", now: T0 + 2000 })).toMatchObject({ ok: true, noop: true, audit: null })
		expect(run(done.claim, { type: "complete", userId: "u2", now: T0 + 2000 })).toMatchObject({ ok: false, code: "already_claimed" })
		expect(run(done.claim, { type: "begin", tokenHash: "h9", now: T0 + 3000, ttlMs: TTL })).toMatchObject({ ok: false, code: "already_claimed" })
	})

	it("expires an unfinished claim back to unclaimed, and the legacy key still works", () => {
		const late = run(bound(), { type: "complete", userId: "u1", now: T0 + 500 + TTL })
		expect(late).toMatchObject({ ok: false, code: "expired" })
		expect(late.claim.state).toBe("unclaimed")
		expect(late.claim.pendingUserId).toBeNull()
		expect(legacyKeyUsable(late.claim)).toBe(true)
		expect(run(claiming(), { type: "expire", now: T0 + TTL + 1 })).toMatchObject({ ok: true, noop: false, audit: "legacy.claim.expire" })
		expect(run(claiming(), { type: "expire", now: T0 + 1 })).toMatchObject({ ok: true, noop: true })
	})

	it("replaces the token and drops the binding when begun again", () => {
		const second = run(bound(), { type: "begin", tokenHash: "h2", now: T0 + 5000, ttlMs: TTL })
		if (!second.ok) throw new Error("expected ok")
		expect(second.claim.pendingUserId).toBeNull()
		expect(run(second.claim, { type: "bind", tokenHash: "h1", userId: "u1", now: T0 + 6000, ttlMs: TTL })).toMatchObject({ ok: false, code: "bad_token" })
		expect(run(second.claim, { type: "bind", tokenHash: "h2", userId: "u1", now: T0 + 6000, ttlMs: TTL }).ok).toBe(true)
	})

	it("cannot complete without beginning", () => {
		expect(run(newClaim("x"), { type: "complete", userId: "u1", now: T0 })).toMatchObject({ ok: false, code: "no_pending_claim" })
	})

	it("retires only a finished claim, once", () => {
		expect(run(claiming(), { type: "retire", now: T0 })).toMatchObject({ ok: false, code: "not_claimed" })
		const done = run(bound(), { type: "complete", userId: "u1", now: T0 + 1 })
		if (!done.ok) throw new Error("expected ok")
		const ret = run(done.claim, { type: "retire", now: T0 + 2 })
		expect(ret).toMatchObject({ ok: true, noop: false, audit: "legacy.claim.retire" })
		if (!ret.ok) throw new Error("expected ok")
		expect(ret.claim.state).toBe("retired")
		expect(run(ret.claim, { type: "retire", now: T0 + 3 })).toMatchObject({ ok: true, noop: true })
		expect(legacyKeyUsable(ret.claim)).toBe(false)
	})

	it("rolls back on an admin's written reason, restoring the legacy key", () => {
		const done = run(bound(), { type: "complete", userId: "u1", now: T0 + 1 })
		if (!done.ok) throw new Error("expected ok")
		expect(run(done.claim, { type: "rollback", actor: "admin", reason: "short", now: T0 + 2 })).toMatchObject({ ok: false, code: "reason_required" })
		const back = run(done.claim, { type: "rollback", actor: "admin", reason: "Claimed by the wrong person; verified with the owner", now: T0 + 2 })
		expect(back).toMatchObject({ ok: true, noop: false, audit: "legacy.claim.rollback" })
		expect(back.ok && back.claim).toMatchObject({ state: "unclaimed", claimedBy: null, claimedAt: null, pendingUserId: null })
		expect(back.ok && legacyKeyUsable(back.claim)).toBe(true)
		const again = back.ok ? run(back.claim, { type: "rollback", actor: "admin", reason: "Second rollback of the same claim", now: T0 + 3 }) : null
		expect(again).toMatchObject({ ok: true, noop: true })
	})

	it("never mutates its input", () => {
		const c = bound()
		const snapshot = JSON.stringify(c)
		run(c, { type: "complete", userId: "u1", now: T0 + 1 })
		run(c, { type: "expire", now: T0 + TTL * 2 })
		run(c, { type: "bind", tokenHash: "h1", userId: "u2", now: T0 + 2, ttlMs: TTL })
		expect(JSON.stringify(c)).toBe(snapshot)
	})
})

describe("manual review for players without a key", () => {
	it("needs two kinds of independent evidence, notes, and a reviewer who is not the claimant", () => {
		const ok = { evidence: ["x_dm_from_original_account", "pick_details_only_owner_knows"] as const, notes: "DM from the account that posted the original challenge link; knew week 3 pick.", reviewer: "admin1" }
		expect(manualReviewSufficient({ ...ok, evidence: [...ok.evidence] }, "claimant")).toEqual({ ok: true })
		expect(manualReviewSufficient({ ...ok, evidence: ["x_dm_from_original_account"] }, "claimant").ok).toBe(false)
		expect(manualReviewSufficient({ ...ok, evidence: ["x_dm_from_original_account", "x_dm_from_original_account"] }, "claimant").ok).toBe(false)
		expect(manualReviewSufficient({ ...ok, evidence: [...ok.evidence], notes: "short" }, "claimant").ok).toBe(false)
		expect(manualReviewSufficient({ ...ok, evidence: [...ok.evidence] }, "admin1").ok).toBe(false)
	})
})
