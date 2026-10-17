// Moving a legacy (handle + recovery key) player onto an email-and-password account.
//
// The legacy key keeps working until the claim has fully completed. A claim starts when the key is proven, waits for
// the new account's email to be verified, and completes in one step that links the account and retires the key.
// Anything that goes wrong leaves the legacy player exactly as it was.
//
//   unclaimed --begin--> claiming --bind--> claiming --complete--> claimed --retire--> retired
//        ^                  |                  |                      |                  |
//        +---- expire ------+------ expire -----+---- admin rollback --+------------------+
//
//   begin     the legacy key was proven; a one-time claim token goes to the browser.
//   bind      the browser presents that token while creating the new account; the claim is tied to that account.
//   complete  the new account's email was verified (the link in the email); only the bound account can complete.
//
// This file is the pure state machine. The database layer runs each transition inside one SQL transaction and writes
// the audit entries it returns. Pure: no I/O, no clock (the caller passes `now`).

export type LegacyState = "unclaimed" | "claiming" | "claimed" | "retired"

export type LegacyClaim = {
	handleLower: string
	state: LegacyState
	/** Hash of the single-use claim token while `claiming`. */
	tokenHash: string | null
	/** The new account the claim is tied to, once bound. Only this account can complete the claim. */
	pendingUserId: string | null
	/** Epoch ms the pending claim stops being valid. */
	expiresAt: number | null
	/** The new account that owns the player once `claimed` or `retired`. */
	claimedBy: string | null
	claimedAt: number | null
}

export const newClaim = (handleLower: string): LegacyClaim => ({ handleLower, state: "unclaimed", tokenHash: null, pendingUserId: null, expiresAt: null, claimedBy: null, claimedAt: null })

export type ClaimEvent =
	/** The legacy key was verified for this handle. `tokenHash` is the hash of the token handed to the browser. */
	| { type: "begin"; tokenHash: string; now: number; ttlMs: number }
	/** The claim token is presented while the new account is created; the claim is tied to that account. */
	| { type: "bind"; tokenHash: string; userId: string; now: number; ttlMs: number }
	/** The bound account's email was verified. */
	| { type: "complete"; userId: string; now: number }
	/** Clean up an unfinished claim. */
	| { type: "expire"; now: number }
	/** Remove the legacy key from use permanently once the owner is established. */
	| { type: "retire"; now: number }
	/** Admin: undo a claim. A written reason is mandatory. */
	| { type: "rollback"; actor: string; reason: string; now: number }

export type ClaimErrorCode = "already_claimed" | "no_pending_claim" | "bad_token" | "expired" | "reason_required" | "not_claimed" | "owner_mismatch" | "bound_to_other"

export type ClaimOutcome =
	| { ok: true; claim: LegacyClaim; /** True when the event changed nothing (a repeat). */ noop: boolean; audit: string | null }
	| { ok: false; code: ClaimErrorCode; claim: LegacyClaim }

/** Whether the legacy recovery key may still be used to sign in. Only a finished claim retires it. */
export function legacyKeyUsable(claim: LegacyClaim): boolean {
	return claim.state === "unclaimed" || claim.state === "claiming"
}

function pendingExpired(c: LegacyClaim, now: number): boolean {
	return c.state === "claiming" && c.expiresAt !== null && now >= c.expiresAt
}

/** A pending claim past its time is treated as unclaimed before anything else happens. */
function settle(c: LegacyClaim, now: number): LegacyClaim {
	return pendingExpired(c, now) ? { ...c, state: "unclaimed", tokenHash: null, pendingUserId: null, expiresAt: null } : c
}

export function reduceClaim(input: LegacyClaim, ev: ClaimEvent): ClaimOutcome {
	const c = settle(input, ev.now)
	switch (ev.type) {
		case "begin": {
			if (c.state === "claimed" || c.state === "retired") return { ok: false, code: "already_claimed", claim: c }
			// A second begin replaces the token and drops any binding: only the latest link in the browser works.
			return { ok: true, claim: { ...c, state: "claiming", tokenHash: ev.tokenHash, pendingUserId: null, expiresAt: ev.now + ev.ttlMs }, noop: false, audit: "legacy.claim.begin" }
		}
		case "bind": {
			if (c.state === "claimed" || c.state === "retired") return { ok: false, code: "already_claimed", claim: c }
			if (c.state !== "claiming") return { ok: false, code: pendingExpired(input, ev.now) ? "expired" : "no_pending_claim", claim: c }
			if (c.tokenHash !== ev.tokenHash) return { ok: false, code: "bad_token", claim: c }
			if (c.pendingUserId === ev.userId) return { ok: true, claim: c, noop: true, audit: null }
			if (c.pendingUserId !== null) return { ok: false, code: "bound_to_other", claim: c }
			// Binding gives the new account time to find and click its verification email.
			return { ok: true, claim: { ...c, pendingUserId: ev.userId, expiresAt: ev.now + ev.ttlMs }, noop: false, audit: "legacy.claim.bind" }
		}
		case "complete": {
			if (c.state === "claimed" || c.state === "retired") {
				// The same account finishing again is a harmless repeat; anyone else is refused.
				return c.claimedBy === ev.userId ? { ok: true, claim: c, noop: true, audit: null } : { ok: false, code: "already_claimed", claim: c }
			}
			if (c.state !== "claiming") return { ok: false, code: pendingExpired(input, ev.now) ? "expired" : "no_pending_claim", claim: c }
			if (c.pendingUserId === null || c.pendingUserId !== ev.userId) return { ok: false, code: "owner_mismatch", claim: c }
			return { ok: true, claim: { ...c, state: "claimed", tokenHash: null, pendingUserId: null, expiresAt: null, claimedBy: ev.userId, claimedAt: ev.now }, noop: false, audit: "legacy.claim.complete" }
		}
		case "expire":
			return c.state === input.state ? { ok: true, claim: c, noop: true, audit: null } : { ok: true, claim: c, noop: false, audit: "legacy.claim.expire" }
		case "retire": {
			if (c.state === "retired") return { ok: true, claim: c, noop: true, audit: null }
			if (c.state !== "claimed") return { ok: false, code: "not_claimed", claim: c }
			return { ok: true, claim: { ...c, state: "retired" }, noop: false, audit: "legacy.claim.retire" }
		}
		case "rollback": {
			if (ev.reason.trim().length < 10) return { ok: false, code: "reason_required", claim: c }
			if (c.state === "unclaimed") return { ok: true, claim: c, noop: true, audit: null }
			return { ok: true, claim: { ...c, state: "unclaimed", tokenHash: null, pendingUserId: null, expiresAt: null, claimedBy: null, claimedAt: null }, noop: false, audit: "legacy.claim.rollback" }
		}
	}
}

// --- ownership evidence for players without a key ---------------------------------

export type EvidenceKind = "x_dm_from_original_account" | "email_used_when_contacting" | "pick_details_only_owner_knows" | "signup_link_or_device_detail"
export const STRONG_EVIDENCE: readonly EvidenceKind[] = ["x_dm_from_original_account", "email_used_when_contacting", "pick_details_only_owner_knows", "signup_link_or_device_detail"]

export type ManualReview = { evidence: EvidenceKind[]; notes: string; reviewer: string; secondReviewer?: string | null }

/**
 * A handle claimed with no key moves only on independent evidence: at least two different kinds, written notes, and
 * a reviewer who is not the claimant. A matching handle or an unverified email is never evidence on its own.
 */
export function manualReviewSufficient(r: ManualReview, claimantUserId: string): { ok: true } | { ok: false; reason: string } {
	const kinds: Record<string, true> = {}
	r.evidence.forEach((k) => {
		if (STRONG_EVIDENCE.indexOf(k) >= 0) kinds[k] = true
	})
	if (Object.keys(kinds).length < 2) return { ok: false, reason: "At least two different kinds of independent evidence are required" }
	if (r.notes.trim().length < 20) return { ok: false, reason: "Write down what was checked (at least 20 characters)" }
	if (!r.reviewer || r.reviewer === claimantUserId) return { ok: false, reason: "The reviewer cannot be the person making the claim" }
	return { ok: true }
}
