// The audit trail: every action that changes identity, scores, standings, eligibility or results.
//
// Entries are append-only. Sensitive actions cannot be recorded without a written reason, so the code that performs
// them cannot forget to ask for one. Pure: no I/O.

export type AuditAction =
	| "account.register"
	| "account.verify_email"
	| "account.password_reset.request"
	| "account.password_reset.complete"
	| "account.sessions.revoke"
	| "account.disable"
	| "account.restore"
	| "account.merge"
	| "legacy.claim.begin"
	| "legacy.claim.bind"
	| "legacy.claim.complete"
	| "legacy.claim.expire"
	| "legacy.claim.retire"
	| "legacy.claim.rollback"
	| "legacy.manual_review"
	| "entry.revise_after_lock"
	| "blogger_pick.revise"
	| "grade.create"
	| "grade.correct"
	| "result.publish"
	| "result.correct"
	| "standings.recalculate"
	| "policy.freeze"
	| "policy.revise"
	| "competition.configure"

const REASON_REQUIRED: readonly AuditAction[] = [
	"account.disable",
	"account.restore",
	"account.merge",
	"account.sessions.revoke",
	"legacy.claim.rollback",
	"legacy.manual_review",
	"entry.revise_after_lock",
	"blogger_pick.revise",
	"grade.correct",
	"result.correct",
	"standings.recalculate",
	"policy.revise",
]

export const requiresReason = (a: AuditAction): boolean => REASON_REQUIRED.indexOf(a) >= 0

export type AuditEntry = {
	at: string
	/** User id of the admin or player, or "system" for scheduled jobs. */
	actor: string
	actorRole: "admin" | "player" | "system"
	action: AuditAction
	/** What was acted on, e.g. "player:abc", "event:2026_06_LV_KC". */
	subject: string
	before: unknown
	after: unknown
	reason: string | null
}

export type AuditInput = Omit<AuditEntry, "at" | "reason"> & { reason?: string | null }

export function buildAudit(input: AuditInput, nowMs: number): { ok: true; entry: AuditEntry } | { ok: false; message: string } {
	const reason = (input.reason ?? "").trim()
	if (requiresReason(input.action) && reason.length < 10) return { ok: false, message: "A written reason (at least 10 characters) is required for this action" }
	if (!input.actor) return { ok: false, message: "Every audit entry needs an actor" }
	// Admin-only actions cannot be attributed to a player.
	if (input.actorRole === "player" && requiresReason(input.action)) return { ok: false, message: "Only an administrator can do this" }
	return { ok: true, entry: { ...input, reason: reason || null, at: new Date(nowMs).toISOString() } }
}

/** Fields that must never be written into audit before/after payloads. */
const SECRET_KEYS = ["password", "passwordHash", "hash", "keyHash", "token", "tokenHash", "key", "secret", "email"]

/** Strip secrets (and emails, which are private) from a payload before it is stored in the audit trail. */
export function redact(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {}
		Object.keys(value as Record<string, unknown>).forEach((k) => {
			out[k] = SECRET_KEYS.indexOf(k) >= 0 ? "[redacted]" : redact((value as Record<string, unknown>)[k])
		})
		return out
	}
	return value
}
