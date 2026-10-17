// Competition administration: games, results, locks, the blogger's pick, individual picks, rules and the boards.
//
// Every function needs an AdminContext (see admin.ts) and writes its audit entry in the same transaction as the change,
// so a change without a record cannot happen. Nothing here edits a grade: corrections add a grade that supersedes the
// old one, exactly as the automatic grader does.

import type { Db, Queryable } from "../db"
import { type AdminContext } from "./admin"
import { mustAudit } from "./audit"
import { gradeCompetition, insertGrades, loadPolicies, toGrade, toLeagueEvent } from "./grade"
import { type BloggerPick, type ScoringPolicy, freezePolicy, planGrading, policyId, reviseBloggerPick, validateRules } from "../domain"

const need = (reason: string, min = 10) => {
	if (reason.trim().length < min) throw new Error("A written reason (at least 10 characters) is required for this action")
}
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null)

// --- reading ---------------------------------------------------------------------------------------------------------

export type CompetitionRow = { id: string; season: number; kind: string; name: string; policyFamily: string; enabled: boolean; frozen: boolean; events: number; entries: number; voidedEntries: number; gradedEntries: number }
export type PolicyRow = { id: string; family: string; version: number; kind: string; label: string; rules: unknown; effectiveFrom: string; frozenAt: string | null; grades: number }
export type SyncRow = { key: string; ranAt: string; detail: unknown }
export type Overview = { competitions: CompetitionRow[]; policies: PolicyRow[]; sync: SyncRow[]; admins: number }

export async function adminOverview(q: Queryable, _admin: AdminContext): Promise<Overview> {
	const c = await q.query<{ id: string; season: number; kind: string; name: string; policy_family: string; enabled: boolean; frozen_at: Date | null; events: number; entries: number; voided: number; graded: number }>(
		`select c.id, c.season, c.kind, c.name, c.policy_family, c.enabled, c.frozen_at,
		   (select count(distinct n.event_id)::int from league_entries n where n.competition_id = c.id) as events,
		   (select count(*)::int from league_entries n where n.competition_id = c.id) as entries,
		   (select count(*)::int from league_entries n where n.competition_id = c.id and n.voided_at is not null) as voided,
		   (select count(*)::int from league_current_grades g join league_entries n on n.id = g.entry_id where n.competition_id = c.id and not g.voided) as graded
		 from league_competitions c order by c.season desc, c.id`
	)
	const p = await q.query<{ id: string; family: string; version: number; kind: string; label: string; rules: unknown; effective_from: Date; frozen_at: Date | null; grades: number }>(
		`select p.id, p.family, p.version, p.kind, p.label, p.rules, p.effective_from, p.frozen_at, (select count(*)::int from league_grades g where g.policy_id = p.id) as grades
		 from league_scoring_policies p order by p.family, p.version`
	)
	const s = await q.query<{ key: string; ran_at: Date; detail: unknown }>(`select key, ran_at, detail from league_sync_state order by key`)
	const a = await q.query<{ n: number }>(`select count(*)::int as n from league_admins`)
	return {
		competitions: c.rows.map((r) => ({ id: r.id, season: r.season, kind: r.kind, name: r.name, policyFamily: r.policy_family, enabled: r.enabled, frozen: r.frozen_at !== null, events: r.events, entries: r.entries, voidedEntries: r.voided, gradedEntries: r.graded })),
		policies: p.rows.map((r) => ({ id: r.id, family: r.family, version: r.version, kind: r.kind, label: r.label, rules: r.rules, effectiveFrom: iso(r.effective_from) as string, frozenAt: iso(r.frozen_at), grades: r.grades })),
		sync: s.rows.map((r) => ({ key: r.key, ranAt: iso(r.ran_at) as string, detail: r.detail })),
		admins: a.rows[0].n,
	}
}

export type AdminEvent = {
	id: string
	week: number
	awayTeam: string
	homeTeam: string
	kickoff: string
	lockAt: string | null
	state: string
	awayScore: number | null
	homeScore: number | null
	pinned: boolean
	entries: number
	voided: number
	graded: number
	blogger: { away: number; home: number; afterLockRevisions: number } | null
}

export async function adminEvents(q: Queryable, _admin: AdminContext, competitionId: string): Promise<AdminEvent[]> {
	const comp = await q.query<{ kind: string; season: number }>(`select kind, season from league_competitions where id = $1`, [competitionId])
	if (comp.rows.length === 0) return []
	const btb = comp.rows[0].kind === "btb"
	const r = await q.query<{ id: string; week: number; away_team: string; home_team: string; kickoff: Date; lock_at: Date | null; state: string; away_score: number | null; home_score: number | null; pinned: boolean; entries: number; voided: number; graded: number; b_away: number | null; b_home: number | null; b_after: number }>(
		`select e.id, e.week, e.away_team, e.home_team, e.kickoff, e.lock_at, e.state, e.away_score, e.home_score, e.result_pinned_at is not null as pinned,
		   (select count(*)::int from league_entries n where n.event_id = e.id and n.competition_id = $1) as entries,
		   (select count(*)::int from league_entries n where n.event_id = e.id and n.competition_id = $1 and n.voided_at is not null) as voided,
		   (select count(*)::int from league_current_grades g join league_entries n on n.id = g.entry_id where g.event_id = e.id and n.competition_id = $1 and not g.voided) as graded,
		   b.away as b_away, b.home as b_home,
		   (select count(*)::int from league_blogger_pick_revisions v where v.event_id = e.id and v.after_lock) as b_after
		 from league_events e left join league_blogger_picks b on b.event_id = e.id
		 where e.season = $2 and e.kind = 'game' and ${btb ? "e.legacy_prediction_id is not null" : "e.nfl_game_id is not null"}
		 order by e.kickoff`,
		[competitionId, comp.rows[0].season]
	)
	return r.rows.map((e) => ({
		id: e.id,
		week: e.week,
		awayTeam: e.away_team,
		homeTeam: e.home_team,
		kickoff: iso(e.kickoff) as string,
		lockAt: iso(e.lock_at),
		state: e.state,
		awayScore: e.away_score,
		homeScore: e.home_score,
		pinned: e.pinned,
		entries: e.entries,
		voided: e.voided,
		graded: e.graded,
		blogger: e.b_away !== null && e.b_home !== null ? { away: e.b_away, home: e.b_home, afterLockRevisions: e.b_after } : null,
	}))
}

export type AdminEntry = { entryId: string; competitionId: string; week: number; matchup: string; payload: unknown; submittedAt: string; revisions: number; voided: boolean; voidedReason: string | null; points: number | null }

/** Every pick a member has made, for the member page: what they picked, how often they changed it, how it scored. */
export async function memberEntries(q: Queryable, _admin: AdminContext, playerId: string): Promise<AdminEntry[]> {
	const r = await q.query<{ id: string; competition_id: string; week: number; away_team: string; home_team: string; payload: unknown; submitted_at: Date; revisions: number; voided_at: Date | null; voided_reason: string | null; points: number | null }>(
		`select n.id, n.competition_id, e.week, e.away_team, e.home_team, n.payload, n.submitted_at, n.voided_at, n.voided_reason,
		   (select count(*)::int from league_entry_revisions v where v.entry_id = n.id) as revisions,
		   (select g.points from league_current_grades g where g.entry_id = n.id and not g.voided) as points
		 from league_entries n join league_events e on e.id = n.event_id
		 where n.player_id = $1 order by e.kickoff desc limit 200`,
		[playerId]
	)
	return r.rows.map((x) => ({ entryId: x.id, competitionId: x.competition_id, week: x.week, matchup: `${x.away_team} at ${x.home_team}`, payload: x.payload, submittedAt: iso(x.submitted_at) as string, revisions: x.revisions, voided: x.voided_at !== null, voidedReason: x.voided_reason, points: x.points }))
}

export type AuditRow = { id: number; at: string; actor: string; role: string; action: string; subject: string; reason: string | null; before: unknown; after: unknown }

/** The audit trail, newest first. `beforeId` pages backwards. */
export async function auditLog(q: Queryable, _admin: AdminContext, f: { action?: string; subject?: string; beforeId?: number; limit?: number }): Promise<AuditRow[]> {
	const limit = Math.min(Math.max(f.limit ?? 50, 1), 200)
	const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
	const r = await q.query<{ id: string; at: Date; actor: string; actor_role: string; action: string; subject: string; reason: string | null; before: unknown; after: unknown }>(
		`select id, at, actor, actor_role, action, subject, reason, before, after from league_audit_log
		 where ($1::text is null or action like $1 || '%' escape '\\') and ($2::text is null or subject like $2 || '%' escape '\\') and ($3::bigint is null or id < $3)
		 order by id desc limit $4`,
		[f.action ? esc(f.action.slice(0, 60)) : null, f.subject ? esc(f.subject.slice(0, 120)) : null, f.beforeId ?? null, limit]
	)
	return r.rows.map((x) => ({ id: Number(x.id), at: iso(x.at) as string, actor: x.actor, role: x.actor_role, action: x.action, subject: x.subject, reason: x.reason, before: x.before, after: x.after }))
}

// --- changing games -------------------------------------------------------------------------------------------------

type EventRow = { id: string; kickoff: Date; lock_at: Date | null; state: "scheduled" | "postponed" | "in_progress" | "final" | "cancelled"; away_score: number | null; home_score: number | null; result_pinned_at: Date | null }

async function lockEvent(q: Queryable, eventId: string): Promise<EventRow> {
	const r = await q.query<EventRow>(`select id, kickoff, lock_at, state, away_score, home_score, result_pinned_at from league_events where id = $1 and kind = 'game' for update`, [eventId])
	if (r.rows.length === 0) throw new Error("Game not found")
	return r.rows[0]
}

/** Re-run grading for one event in every competition that has picks on it. */
async function regradeEvent(q: Queryable, eventId: string, now: number): Promise<number> {
	const comps = await q.query<{ competition_id: string }>(`select distinct competition_id from league_entries where event_id = $1`, [eventId])
	let created = 0
	for (const c of comps.rows) created += (await gradeCompetition(q, { competitionId: c.competition_id, now, eventIds: [eventId] })).created
	return created
}

export async function cancelEvent(db: Db, admin: AdminContext, eventId: string, reason: string, now: number): Promise<{ ok: true; noop: boolean; graded: number }> {
	need(reason)
	return db.tx(async (q) => {
		const ev = await lockEvent(q, eventId)
		if (ev.state === "cancelled") return { ok: true, noop: true, graded: 0 } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "event.cancel", subject: `event:${eventId}`, before: { state: ev.state }, after: { state: "cancelled" }, reason }, now)
		await q.query(`update league_events set state = 'cancelled', updated_at = now() where id = $1`, [eventId])
		return { ok: true, noop: false, graded: await regradeEvent(q, eventId, now) } as const
	})
}

/** Bring a cancelled game back. It is final again if it has a score, otherwise scheduled. */
export async function restoreEvent(db: Db, admin: AdminContext, eventId: string, reason: string, now: number): Promise<{ ok: true; noop: boolean; state?: string; graded: number }> {
	need(reason)
	return db.tx(async (q) => {
		const ev = await lockEvent(q, eventId)
		if (ev.state !== "cancelled") return { ok: true, noop: true, graded: 0 } as const
		const state = ev.away_score !== null && ev.home_score !== null ? "final" : "scheduled"
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "event.restore", subject: `event:${eventId}`, before: { state: "cancelled" }, after: { state }, reason }, now)
		await q.query(`update league_events set state = $2, updated_at = now() where id = $1`, [eventId, state])
		return { ok: true, noop: false, state, graded: await regradeEvent(q, eventId, now) } as const
	})
}

const DAY = 86_400_000

/** Move when picks close, for a postponement or a mistaken kickoff. `null` goes back to locking at kickoff. */
export async function moveLock(db: Db, admin: AdminContext, eventId: string, lockAt: string | null, reason: string, now: number): Promise<{ ok: true; noop: boolean } | { ok: false; message: string }> {
	need(reason)
	return db.tx(async (q) => {
		const ev = await lockEvent(q, eventId)
		if (ev.state === "final" || ev.state === "cancelled") return { ok: false, message: "A finished or cancelled game cannot change its lock" } as const
		let next: string | null = null
		if (lockAt !== null) {
			const t = Date.parse(lockAt)
			if (!Number.isFinite(t)) return { ok: false, message: "That is not a valid date and time" } as const
			const k = new Date(ev.kickoff).getTime()
			if (t < k - 7 * DAY || t > k + 14 * DAY) return { ok: false, message: "The lock must be within a week before and two weeks after kickoff" } as const
			next = new Date(t).toISOString()
		}
		const before = iso(ev.lock_at)
		if (before === next) return { ok: true, noop: true } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "event.move_lock", subject: `event:${eventId}`, before: { lockAt: before }, after: { lockAt: next }, reason }, now)
		await q.query(`update league_events set lock_at = $2, updated_at = now() where id = $1`, [eventId, next])
		return { ok: true, noop: false } as const
	})
}

/**
 * Set or correct a final score. The score is pinned so the next sync from Sanity or ESPN does not put the old one
 * back; releasing the pin hands control back to the sync. Every pick is regraded; the old grades stay as history.
 */
export async function correctResult(db: Db, admin: AdminContext, eventId: string, away: number, home: number, reason: string, now: number): Promise<{ ok: true; noop: boolean; graded: number } | { ok: false; message: string }> {
	need(reason)
	if (!Number.isInteger(away) || !Number.isInteger(home) || away < 0 || home < 0 || away > 99 || home > 99) return { ok: false, message: "Scores are whole numbers from 0 to 99" }
	return db.tx(async (q) => {
		const ev = await lockEvent(q, eventId)
		if (ev.state === "cancelled") return { ok: false, message: "Restore the cancelled game before setting its score" } as const
		const wasFinal = ev.state === "final"
		if (wasFinal && ev.away_score === away && ev.home_score === home && ev.result_pinned_at) return { ok: true, noop: true, graded: 0 } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: wasFinal ? "result.correct" : "result.publish", subject: `event:${eventId}`, before: wasFinal ? { away: ev.away_score, home: ev.home_score } : { state: ev.state }, after: { away, home, pinned: true }, reason }, now)
		await q.query(`update league_events set state = 'final', away_score = $2, home_score = $3, result_pinned_at = $4::timestamptz, result_pinned_by = $5, updated_at = now() where id = $1`, [eventId, away, home, new Date(now).toISOString(), admin.userId])
		await q.query(`insert into league_result_snapshots (event_id, source, away_score, home_score, hash) values ($1, 'admin', $2, $3, $4)`, [eventId, away, home, `${away}-${home}`])
		return { ok: true, noop: false, graded: await regradeEvent(q, eventId, now) } as const
	})
}

/** Let the sync own this game's score again. The score stays as it is until the feed next changes it. */
export async function releaseResultPin(db: Db, admin: AdminContext, eventId: string, reason: string, now: number): Promise<{ ok: true; noop: boolean }> {
	need(reason)
	return db.tx(async (q) => {
		const ev = await lockEvent(q, eventId)
		if (!ev.result_pinned_at) return { ok: true, noop: true } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "result.correct", subject: `event:${eventId}`, before: { pinned: true, away: ev.away_score, home: ev.home_score }, after: { pinned: false }, reason }, now)
		await q.query(`update league_events set result_pinned_at = null, result_pinned_by = null, updated_at = now() where id = $1`, [eventId])
		return { ok: true, noop: false } as const
	})
}

// --- the blogger's pick ------------------------------------------------------------------------------------------------

/**
 * Enter or change the blogger's pick. Before the lock it is quiet; after the lock it needs a reason and is flagged
 * "after lock" on the public record forever. The Beat the Blogger comparison reads this pick directly, so a change is
 * reflected everywhere at once.
 */
export async function correctBloggerPick(db: Db, admin: AdminContext, eventId: string, away: number, home: number, reason: string, now: number): Promise<{ ok: true; change: string; afterLock: boolean } | { ok: false; message: string }> {
	return db.tx(async (q) => {
		const row = await lockEvent(q, eventId)
		const ev = toLeagueEvent(row)
		const cur = await q.query<{ away: number; home: number; entered_at: Date }>(`select away, home, entered_at from league_blogger_picks where event_id = $1 for update`, [eventId])
		let existing: BloggerPick | null = null
		if (cur.rows[0]) {
			const revs = await q.query<{ n: number; away: number; home: number; at: Date; reason: string | null; after_lock: boolean }>(`select n, away, home, at, reason, after_lock from league_blogger_pick_revisions where event_id = $1 order by n`, [eventId])
			existing = { eventId, away: cur.rows[0].away, home: cur.rows[0].home, enteredAt: iso(cur.rows[0].entered_at) as string, revisions: revs.rows.map((r) => ({ n: r.n, away: r.away, home: r.home, at: iso(r.at) as string, reason: r.reason, afterLock: r.after_lock })) }
		}
		const out = reviseBloggerPick(ev, existing, { away, home, reason, nowMs: now })
		if (!out.ok) return out
		if (out.change === "unchanged") return { ok: true, change: "unchanged", afterLock: out.afterLock } as const
		const rev = out.pick.revisions[out.pick.revisions.length - 1]
		const note = out.afterLock || (existing && reason.trim().length > 0) ? reason.trim() : null
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "blogger_pick.revise", subject: `event:${eventId}`, before: existing ? { away: existing.away, home: existing.home } : null, after: { away, home, afterLock: out.afterLock }, reason: reason.trim().length >= 10 ? reason : `${out.change === "created" ? "Entered" : "Revised"} before the lock (no reason given)` }, now)
		if (out.change === "created") {
			await q.query(`insert into league_blogger_picks (event_id, away, home, entered_at) values ($1, $2, $3, $4)`, [eventId, away, home, rev.at])
		} else {
			await q.query(`update league_blogger_picks set away = $2, home = $3 where event_id = $1`, [eventId, away, home])
		}
		await q.query(`insert into league_blogger_pick_revisions (event_id, n, away, home, at, reason, after_lock, imported, actor) values ($1, $2, $3, $4, $5, $6, $7, false, $8)`, [eventId, rev.n, away, home, rev.at, note, out.afterLock, admin.userId])
		return { ok: true, change: out.change, afterLock: out.afterLock } as const
	})
}

// --- individual picks -----------------------------------------------------------------------------------------------

/**
 * Remove a pick from play (a pick entered by mistake, a bug, a proven duplicate account). The pick and its history are
 * kept; it stops counting. If it was already graded, a void grade supersedes the old one.
 */
export async function voidEntry(db: Db, admin: AdminContext, entryId: string, reason: string, now: number): Promise<{ ok: true; noop: boolean }> {
	need(reason)
	return db.tx(async (q) => {
		const r = await q.query<{ id: string; player_id: string; event_id: string; competition_id: string; payload: unknown; voided_at: Date | null }>(`select id, player_id, event_id, competition_id, payload, voided_at from league_entries where id = $1 for update`, [entryId])
		const e = r.rows[0]
		if (!e) throw new Error("Pick not found")
		if (e.voided_at) return { ok: true, noop: true } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "entry.void", subject: `entry:${entryId}`, before: { voided: false, payload: e.payload }, after: { voided: true, player: e.player_id, event: e.event_id }, reason }, now)
		await q.query(`update league_entries set voided_at = $2::timestamptz, voided_reason = $3, voided_by = $4 where id = $1`, [entryId, new Date(now).toISOString(), reason.trim(), admin.userId])
		const gr = await q.query<Parameters<typeof toGrade>[0]>(`select * from league_grades where entry_id = $1`, [entryId])
		if (gr.rows.length > 0) {
			const grades = gr.rows.map(toGrade)
			const policies = await loadPolicies(q)
			const cur = grades.filter((g) => !grades.some((n) => n.supersedes === g.key))[0]
			const policy = policies.find((p) => p.id === cur?.policyId)
			if (policy) {
				const plan = planGrading({ event: { id: e.event_id, kickoff: new Date(0).toISOString(), state: "cancelled" }, entries: [{ id: e.id, playerId: e.player_id, eventId: e.event_id, payload: e.payload }], existing: grades, policy, now: new Date(now).toISOString() })
				await insertGrades(q, plan.create)
			}
		}
		return { ok: true, noop: false } as const
	})
}

export async function restoreEntry(db: Db, admin: AdminContext, entryId: string, reason: string, now: number): Promise<{ ok: true; noop: boolean; graded: number }> {
	need(reason)
	return db.tx(async (q) => {
		const r = await q.query<{ event_id: string; competition_id: string; voided_at: Date | null }>(`select event_id, competition_id, voided_at from league_entries where id = $1 for update`, [entryId])
		const e = r.rows[0]
		if (!e) throw new Error("Pick not found")
		if (!e.voided_at) return { ok: true, noop: true, graded: 0 } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "entry.restore", subject: `entry:${entryId}`, before: { voided: true }, after: { voided: false }, reason }, now)
		await q.query(`update league_entries set voided_at = null, voided_reason = null, voided_by = null where id = $1`, [entryId])
		const graded = (await gradeCompetition(q, { competitionId: e.competition_id, now, eventIds: [e.event_id] })).created
		return { ok: true, noop: false, graded } as const
	})
}

// --- boards and rules ---------------------------------------------------------------------------------------------

export type RecalcReport = { created: number; skipped: number; unreadable: number; finalWithoutGrade: number; duplicateCurrent: number }

/**
 * Re-run grading for a whole competition and check the books. Grading is idempotent, so on healthy data this adds
 * nothing; it exists to heal after a failed sync and to prove nothing is missing. The boards are computed from
 * current grades on every read, so there is no stored leaderboard to rebuild.
 */
export async function recalculate(db: Db, admin: AdminContext, competitionId: string, reason: string, now: number): Promise<{ ok: true; report: RecalcReport } | { ok: false; message: string }> {
	need(reason)
	return db.tx(async (q) => {
		const c = await q.query(`select 1 from league_competitions where id = $1 for update`, [competitionId])
		if (c.rows.length === 0) return { ok: false, message: "No such competition" } as const
		const g = await gradeCompetition(q, { competitionId, now })
		const missing = await q.query<{ n: number }>(
			`select count(*)::int as n from league_entries n join league_events e on e.id = n.event_id
			 where n.competition_id = $1 and n.voided_at is null and e.state = 'final'
			   and not exists (select 1 from league_current_grades g where g.entry_id = n.id)`,
			[competitionId]
		)
		const dup = await q.query<{ n: number }>(`select count(*)::int as n from (select g.entry_id from league_current_grades g join league_entries n on n.id = g.entry_id where n.competition_id = $1 group by g.entry_id having count(*) > 1) d`, [competitionId])
		const report: RecalcReport = { created: g.created, skipped: g.skipped, unreadable: g.unreadable, finalWithoutGrade: missing.rows[0].n, duplicateCurrent: dup.rows[0].n }
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "standings.recalculate", subject: `competition:${competitionId}`, before: null, after: report, reason }, now)
		return { ok: true, report } as const
	})
}

/** Turn a competition on or off. Off hides it from players; for Beat the Blogger the old League page takes over. */
export async function setCompetitionEnabled(db: Db, admin: AdminContext, competitionId: string, enabled: boolean, reason: string, now: number): Promise<{ ok: true; noop: boolean } | { ok: false; message: string }> {
	need(reason)
	return db.tx(async (q) => {
		const r = await q.query<{ enabled: boolean }>(`select enabled from league_competitions where id = $1 for update`, [competitionId])
		if (r.rows.length === 0) return { ok: false, message: "No such competition" } as const
		if (r.rows[0].enabled === enabled) return { ok: true, noop: true } as const
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "competition.configure", subject: `competition:${competitionId}`, before: { enabled: r.rows[0].enabled }, after: { enabled }, reason }, now)
		await q.query(`update league_competitions set enabled = $2 where id = $1`, [competitionId, enabled])
		return { ok: true, noop: false } as const
	})
}

/** Make a draft policy public and fixed. It can still be superseded by a later version, never edited. */
export async function freezePolicyVersion(db: Db, admin: AdminContext, id: string, reason: string, now: number): Promise<{ ok: true; noop: boolean } | { ok: false; message: string }> {
	need(reason)
	return db.tx(async (q) => {
		const policies = await loadPolicies(q)
		const p = policies.find((x) => x.id === id)
		if (!p) return { ok: false, message: "No such rule set" } as const
		if (p.frozenAt) return { ok: true, noop: true } as const
		const frozen = freezePolicy(p, new Date(now).toISOString())
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "policy.freeze", subject: `policy:${id}`, before: { frozen: false }, after: { frozen: true }, reason }, now)
		await q.query(`update league_scoring_policies set frozen_at = $2::timestamptz where id = $1`, [id, frozen.frozenAt])
		return { ok: true, noop: false } as const
	})
}

/**
 * Publish the next version of a rule set. The new version is frozen immediately and applies only to games that lock
 * after `effectiveFrom`, which must be in the future, so a published game is never rescored by a rule change.
 * The previous version is frozen too if it was still a draft.
 */
export async function publishPolicyVersion(db: Db, admin: AdminContext, family: string, rules: unknown, effectiveFrom: string, reason: string, now: number): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
	need(reason)
	return db.tx(async (q) => {
		const all = (await loadPolicies(q)).filter((p) => p.family === family)
		if (all.length === 0) return { ok: false, message: "No such rule family" } as const
		const latest = all.reduce((m, p) => (p.version > m.version ? p : m))
		const bad = validateRules(latest.kind, rules)
		if (bad) return { ok: false, message: bad } as const
		const from = Date.parse(effectiveFrom)
		if (!Number.isFinite(from) || from < now + 3_600_000) return { ok: false, message: "New rules must take effect at least an hour from now, so no game already open is rescored" } as const
		if (from <= Date.parse(latest.effectiveFrom)) return { ok: false, message: "New rules must take effect after the current version does" } as const
		const next: ScoringPolicy = { ...latest, version: latest.version + 1, id: policyId(family, latest.version + 1), rules: rules as never, effectiveFrom: new Date(from).toISOString(), frozenAt: new Date(now).toISOString() } as ScoringPolicy
		await mustAudit(q, { actor: admin.userId, actorRole: "admin", action: "policy.revise", subject: `policy:${next.id}`, before: { id: latest.id, rules: latest.rules }, after: { id: next.id, rules: next.rules, effectiveFrom: next.effectiveFrom }, reason }, now)
		if (!latest.frozenAt) await q.query(`update league_scoring_policies set frozen_at = $2::timestamptz where id = $1`, [latest.id, new Date(now).toISOString()])
		await q.query(`insert into league_scoring_policies (id, family, version, kind, label, rules, effective_from, frozen_at) values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8::timestamptz)`, [next.id, family, next.version, next.kind, next.label, JSON.stringify(next.rules), next.effectiveFrom, next.frozenAt])
		return { ok: true, id: next.id } as const
	})
}
