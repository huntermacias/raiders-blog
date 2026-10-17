// Turns an import plan into one reviewable SQL script. Nothing runs it automatically: the owner reads it, then runs
// it with psql against the new database. Every insert is `on conflict do nothing`, so running it twice changes
// nothing, and the whole script is one transaction, so it either all lands or none of it does.

import type { Plan } from "./backfill"

const q = (v: string | number | boolean | null): string => {
	if (v === null) return "null"
	if (typeof v === "number") return String(v)
	if (typeof v === "boolean") return v ? "true" : "false"
	return `'${v.replace(/'/g, "''")}'`
}
const row = (cols: (string | number | boolean | null)[]) => `(${cols.map(q).join(", ")})`

function insert(table: string, columns: string[], rows: (string | number | boolean | null)[][], conflict = "on conflict do nothing"): string {
	if (rows.length === 0) return `-- ${table}: nothing to import`
	return `insert into ${table} (${columns.join(", ")}) values\n\t${rows.map(row).join(",\n\t")}\n${conflict};`
}

export function planToSql(plan: Plan): string {
	const out: string[] = ["begin;", ""]
	const c = plan.competition
	out.push(insert("league_competitions", ["id", "season", "kind", "name", "policy_family", "enabled"], [[c.id, c.season, c.kind, c.name, c.policyFamily, c.enabled]]))
	out.push(insert("league_players", ["id", "handle", "legacy_handle_lower", "joined_at", "disabled_at", "disabled_reason"], plan.players.map((p) => [p.id, p.handle, p.legacyHandleLower, p.joinedAt, p.disabledAt, p.disabledReason])))
	out.push(insert("league_legacy_identities", ["handle_lower", "player_id", "key_hash", "state", "source_doc_id"], plan.legacy.map((l) => [l.handleLower, l.playerId, l.keyHash, "unclaimed", l.sourceDocId])))
	out.push(
		insert(
			"league_events",
			["id", "kind", "season", "week", "legacy_prediction_id", "away_team", "home_team", "kickoff", "state", "away_score", "home_score"],
			plan.events.map((e) => [e.id, "game", e.season, e.week, e.legacyPredictionId, e.awayTeam, e.homeTeam, e.kickoff, e.state, e.awayScore, e.homeScore])
		)
	)
	out.push(insert("league_result_snapshots", ["event_id", "source", "away_score", "home_score", "hash"], plan.snapshots.map((s) => [s.eventId, s.source, s.awayScore, s.homeScore, s.hash])))
	out.push(insert("league_blogger_picks", ["event_id", "away", "home", "entered_at"], plan.bloggerPicks.map((b) => [b.eventId, b.away, b.home, b.enteredAt])))
	out.push(insert("league_blogger_pick_revisions", ["event_id", "n", "away", "home", "at", "reason", "after_lock", "imported"], plan.bloggerPicks.map((b) => [b.eventId, 1, b.away, b.home, b.enteredAt, "Imported from Studio", false, true])))
	out.push(
		insert(
			"league_entries",
			["id", "competition_id", "player_id", "event_id", "payload", "first_submitted_at", "submitted_at"],
			plan.entries.map((e) => [e.id, e.competitionId, e.playerId, e.eventId, JSON.stringify(e.payload), e.firstSubmittedAt, e.submittedAt])
		)
	)
	out.push(insert("league_entry_revisions", ["entry_id", "n", "payload", "at"], plan.entries.map((e) => [e.id, 1, JSON.stringify(e.payload), e.firstSubmittedAt])))
	out.push(
		insert(
			"league_grades",
			["key", "entry_id", "event_id", "player_id", "policy_id", "result_hash", "points", "correct", "margin_error", "exact", "voided", "graded_at", "supersedes"],
			plan.grades.map((g) => [g.key, g.entryId, g.eventId, g.playerId, g.policyId, g.resultHash, g.points, g.detail.correct, g.detail.marginError, g.detail.exact, g.voided, g.gradedAt, g.supersedes])
		)
	)
	out.push("", "commit;")
	return out.join("\n\n")
}
