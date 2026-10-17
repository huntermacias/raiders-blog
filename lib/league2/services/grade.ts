// Turns final results into stored grades. Safe to run as often as you like: the domain planner adds only what is
// missing, grade keys are deterministic, and a repeated insert is ignored by the database.

import type { Queryable } from "../db"
import { type Grade, type LeagueEvent, type ScoringPolicy, planGrading, policyFor } from "../domain"

type PolicyRow = { id: string; family: string; version: number; kind: ScoringPolicy["kind"]; label: string; rules: unknown; effective_from: Date; frozen_at: Date | null }

export async function loadPolicies(q: Queryable): Promise<ScoringPolicy[]> {
	const r = await q.query<PolicyRow>(`select id, family, version, kind, label, rules, effective_from, frozen_at from league_scoring_policies`)
	return r.rows.map((p) => ({ id: p.id, family: p.family, version: p.version, kind: p.kind, label: p.label, rules: p.rules, effectiveFrom: new Date(p.effective_from).toISOString(), frozenAt: p.frozen_at ? new Date(p.frozen_at).toISOString() : null }) as ScoringPolicy)
}

type EventRow = { id: string; kickoff: Date; lock_at: Date | null; state: LeagueEvent["state"]; away_score: number | null; home_score: number | null }
export const toLeagueEvent = (e: EventRow): LeagueEvent => ({
	id: e.id,
	kickoff: new Date(e.kickoff).toISOString(),
	lockAt: e.lock_at ? new Date(e.lock_at).toISOString() : null,
	state: e.state,
	result: e.state === "final" && e.away_score !== null && e.home_score !== null ? { away: e.away_score, home: e.home_score } : null,
})

type GradeRow = { key: string; entry_id: string; event_id: string; player_id: string; policy_id: string; result_hash: string; points: number; correct: boolean; margin_error: number | null; exact: boolean; voided: boolean; graded_at: Date; supersedes: string | null }
export const toGrade = (g: GradeRow): Grade => ({
	key: g.key,
	entryId: g.entry_id,
	eventId: g.event_id,
	playerId: g.player_id,
	policyId: g.policy_id,
	resultHash: g.result_hash,
	points: g.points,
	detail: { correct: g.correct, marginError: g.margin_error, exact: g.exact },
	voided: g.voided,
	gradedAt: new Date(g.graded_at).toISOString(),
	supersedes: g.supersedes,
})

export async function insertGrades(q: Queryable, grades: readonly Grade[]): Promise<number> {
	if (grades.length === 0) return 0
	const col = <T,>(f: (g: Grade) => T) => grades.map(f)
	const r = await q.query(
		`insert into league_grades (key, entry_id, event_id, player_id, policy_id, result_hash, points, correct, margin_error, exact, voided, graded_at, supersedes)
		 select * from unnest($1::text[], $2::uuid[], $3::uuid[], $4::uuid[], $5::text[], $6::text[], $7::int[], $8::bool[], $9::int[], $10::bool[], $11::bool[], $12::timestamptz[], $13::text[])
		 on conflict do nothing`,
		[col((g) => g.key), col((g) => g.entryId), col((g) => g.eventId), col((g) => g.playerId), col((g) => g.policyId), col((g) => g.resultHash), col((g) => g.points), col((g) => g.detail.correct), col((g) => g.detail.marginError), col((g) => g.detail.exact), col((g) => g.voided), col((g) => g.gradedAt), col((g) => g.supersedes)]
	)
	return r.rowCount ?? 0
}

export type GradeSummary = { created: number; skipped: number; unreadable: number }

/**
 * Grade every final or cancelled event of one competition that is missing a current grade, or whose result changed.
 * Pass `eventIds` to limit the work (an admin regrading one game).
 */
export async function gradeCompetition(q: Queryable, a: { competitionId: string; now: number; eventIds?: readonly string[] }): Promise<GradeSummary> {
	const out: GradeSummary = { created: 0, skipped: 0, unreadable: 0 }
	const comp = await q.query<{ policy_family: string }>(`select policy_family from league_competitions where id = $1`, [a.competitionId])
	if (comp.rows.length === 0) return out
	const policies = await loadPolicies(q)
	const nowIso = new Date(a.now).toISOString()

	const events = await q.query<EventRow>(
		`select distinct e.id, e.kickoff, e.lock_at, e.state, e.away_score, e.home_score from league_events e
		 join league_entries n on n.event_id = e.id and n.competition_id = $1
		 where e.state in ('final', 'cancelled') ${a.eventIds ? "and e.id = any($2::uuid[])" : ""}`,
		a.eventIds ? [a.competitionId, a.eventIds] : [a.competitionId]
	)
	for (const row of events.rows) {
		const ev = toLeagueEvent(row)
		const policy = policyFor(policies, comp.rows[0].policy_family, ev.lockAt ?? ev.kickoff)
		if (!policy) continue
		const entries = await q.query<{ id: string; player_id: string; event_id: string; payload: unknown }>(`select id, player_id, event_id, payload from league_entries where competition_id = $1 and event_id = $2 and voided_at is null`, [a.competitionId, ev.id])
		const existing = await q.query<GradeRow>(`select g.* from league_grades g join league_entries n on n.id = g.entry_id where n.competition_id = $1 and g.event_id = $2`, [a.competitionId, ev.id])
		const plan = planGrading({
			event: ev,
			entries: entries.rows.map((e) => ({ id: e.id, playerId: e.player_id, eventId: e.event_id, payload: e.payload })),
			existing: existing.rows.map(toGrade),
			policy,
			now: nowIso,
		})
		out.created += await insertGrades(q, plan.create)
		out.skipped += plan.skipped
		out.unreadable += plan.unreadable.length
	}
	return out
}
