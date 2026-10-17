// Writes audit entries inside the caller's transaction, so a change and its record succeed or fail together.

import type { Queryable } from "../db"
import { type AuditInput, buildAudit, redact } from "../domain"

export async function writeAudit(q: Queryable, input: AuditInput, nowMs: number): Promise<{ ok: true } | { ok: false; message: string }> {
	const built = buildAudit(input, nowMs)
	if (!built.ok) return built
	const e = built.entry
	await q.query(`insert into league_audit_log (at, actor, actor_role, action, subject, before, after, reason) values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
		e.at,
		e.actor,
		e.actorRole,
		e.action,
		e.subject,
		JSON.stringify(redact(e.before) ?? null),
		JSON.stringify(redact(e.after) ?? null),
		e.reason,
	])
	return { ok: true }
}

/** Like writeAudit but throws, for use where a missing reason is a programming error that must roll the change back. */
export async function mustAudit(q: Queryable, input: AuditInput, nowMs: number): Promise<void> {
	const r = await writeAudit(q, input, nowMs)
	if (!r.ok) throw new Error(r.message)
}
