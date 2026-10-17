// Saving a player's pick. The server decides everything that matters: the clock, whether the game is open, whether the
// player may play, and what counts as a valid pick. The browser only proposes.

import type { Db } from "../db"
import { type Entry, type SubmitError, submitEntry, validateScorePick, validateWinnerPick } from "../domain"
import { uuidV5 } from "../ids"
import { toLeagueEvent } from "./grade"

export type PickResult = { ok: true; entryId: string; change: "created" | "revised" | "unchanged"; submittedAt: string } | { ok: false; error: SubmitError | "not_allowed"; message: string }

type EventRow = { id: string; kickoff: Date; lock_at: Date | null; state: "scheduled" | "postponed" | "in_progress" | "final" | "cancelled"; away_score: number | null; home_score: number | null; legacy_prediction_id: string | null; nfl_game_id: string | null }

export async function submitPick(db: Db, a: { competitionId: string; playerId: string; eventId: unknown; payload: unknown; now: number }): Promise<PickResult> {
	if (typeof a.eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(a.eventId)) return { ok: false, error: "not_found", message: "Game not found" }
	const payload = (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>
	return db.tx(async (q) => {
		const comp = await q.query<{ kind: string; enabled: boolean }>(`select kind, enabled from league_competitions where id = $1`, [a.competitionId])
		const c = comp.rows[0]
		if (!c || !c.enabled) return { ok: false, error: "not_found", message: "This competition is not open" } as const
		if (c.kind !== "btb" && c.kind !== "weekly-winners") return { ok: false, error: "not_found", message: "This competition does not take picks yet" } as const

		const player = await q.query(`select 1 from league_players where id = $1 and disabled_at is null`, [a.playerId])
		if (player.rows.length === 0) return { ok: false, error: "not_allowed", message: "This account cannot make picks" } as const

		const evr = await q.query<EventRow>(`select id, kickoff, lock_at, state, away_score, home_score, legacy_prediction_id, nfl_game_id from league_events where id = $1 and kind = 'game' for update`, [a.eventId])
		const row = evr.rows[0]
		const belongs = row && (c.kind === "btb" ? row.legacy_prediction_id !== null : row.nfl_game_id !== null)
		if (!row || !belongs) return { ok: false, error: "not_found", message: "Game not found" } as const

		const have = await q.query<{ id: string; payload: unknown; first_submitted_at: Date; submitted_at: Date; voided_at: Date | null }>(`select id, payload, first_submitted_at, submitted_at, voided_at from league_entries where competition_id = $1 and player_id = $2 and event_id = $3 for update`, [a.competitionId, a.playerId, row.id])
		if (have.rows[0]?.voided_at) return { ok: false, error: "not_allowed", message: "This pick was removed by the league admin and cannot be changed" } as const
		const revs = have.rows[0] ? await q.query<{ n: number; payload: unknown; at: Date }>(`select n, payload, at from league_entry_revisions where entry_id = $1 order by n`, [have.rows[0].id]) : { rows: [] }
		const existing: Entry<unknown> | null = have.rows[0]
			? { id: have.rows[0].id, playerId: a.playerId, eventId: row.id, payload: have.rows[0].payload, submittedAt: new Date(have.rows[0].submitted_at).toISOString(), firstSubmittedAt: new Date(have.rows[0].first_submitted_at).toISOString(), revisions: revs.rows.map((r) => ({ n: r.n, payload: r.payload, at: new Date(r.at).toISOString() })) }
			: null

		const clean = c.kind === "btb" ? { away: payload.away, home: payload.home } : { pick: payload.pick }
		const result = submitEntry(toLeagueEvent(row), existing, {
			entryId: have.rows[0]?.id ?? uuidV5(`entry:${a.playerId}:${row.id}:${a.competitionId}`),
			playerId: a.playerId,
			payload: clean as unknown,
			nowMs: a.now,
			validate: (p) => (c.kind === "btb" ? validateScorePick(p as { away?: unknown; home?: unknown }) : validateWinnerPick(p as { pick?: unknown })),
		})
		if (!result.ok) return result
		const e = result.entry
		if (result.change === "created") {
			await q.query(`insert into league_entries (id, competition_id, player_id, event_id, payload, first_submitted_at, submitted_at) values ($1, $2, $3, $4, $5::jsonb, $6, $6)`, [e.id, a.competitionId, a.playerId, row.id, JSON.stringify(e.payload), e.submittedAt])
			await q.query(`insert into league_entry_revisions (entry_id, n, payload, at) values ($1, 1, $2::jsonb, $3)`, [e.id, JSON.stringify(e.payload), e.submittedAt])
		} else if (result.change === "revised") {
			const rev = e.revisions[e.revisions.length - 1]
			await q.query(`update league_entries set payload = $2::jsonb, submitted_at = $3 where id = $1`, [e.id, JSON.stringify(e.payload), e.submittedAt])
			await q.query(`insert into league_entry_revisions (entry_id, n, payload, at) values ($1, $2, $3::jsonb, $4)`, [e.id, rev.n, JSON.stringify(e.payload), rev.at])
		}
		return { ok: true, entryId: e.id, change: result.change, submittedAt: e.submittedAt } as const
	})
}
