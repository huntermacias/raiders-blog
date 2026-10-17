// Reads a competition out of Postgres into plain objects the pure view builders can work on.
// Entries of other players are never loaded; only counts are, and the views reveal those after a game locks.

import type { Queryable } from "../db"
import type { PlayerInfo, StandingGrade } from "../domain"
import { toLeagueEvent } from "./grade"

export type EventView = {
	id: string
	legacyId: string | null
	nflGameId: string | null
	week: number
	awayTeam: string
	homeTeam: string
	kickoff: string
	lockAt: string | null
	state: "scheduled" | "postponed" | "in_progress" | "final" | "cancelled"
	result: { away: number; home: number } | null
	blogger: { away: number; home: number } | null
}

export type MyEntry = { entryId: string; eventId: string; payload: unknown; firstSubmittedAt: string; submittedAt: string; revisions: number }
export type EventTally = { eventId: string; entries: number; awayWins: number; homeWins: number }

export type CompetitionData = {
	competitionId: string
	events: EventView[]
	players: (PlayerInfo & { disabled: boolean })[]
	grades: StandingGrade[]
	mine: MyEntry[]
	tallies: Record<string, EventTally>
}

type EvRow = { id: string; legacy_prediction_id: string | null; nfl_game_id: string | null; week: number; away_team: string; home_team: string; kickoff: Date; lock_at: Date | null; state: EventView["state"]; away_score: number | null; home_score: number | null; b_away: number | null; b_home: number | null }

export async function loadCompetition(q: Queryable, competitionId: string, playerId: string | null): Promise<CompetitionData> {
	const comp = await q.query<{ season: number; kind: string }>(`select season, kind from league_competitions where id = $1`, [competitionId])
	if (comp.rows.length === 0) return { competitionId, events: [], players: [], grades: [], mine: [], tallies: {} }
	const { season, kind } = comp.rows[0]
	// A competition's events: the Raiders games for Beat the Blogger, every NFL game for the public leagues.
	const evSql = kind === "btb" ? `e.legacy_prediction_id is not null` : `e.nfl_game_id is not null`
	const ev = await q.query<EvRow>(
		`select e.id, e.legacy_prediction_id, e.nfl_game_id, e.week, e.away_team, e.home_team, e.kickoff, e.lock_at, e.state, e.away_score, e.home_score, b.away as b_away, b.home as b_home
		 from league_events e left join league_blogger_picks b on b.event_id = e.id
		 where e.season = $1 and e.kind = 'game' and ${evSql} order by e.kickoff, e.id`,
		[season]
	)
	const events: EventView[] = ev.rows.map((e) => ({
		id: e.id,
		legacyId: e.legacy_prediction_id,
		nflGameId: e.nfl_game_id,
		week: e.week,
		awayTeam: e.away_team,
		homeTeam: e.home_team,
		kickoff: new Date(e.kickoff).toISOString(),
		lockAt: e.lock_at ? new Date(e.lock_at).toISOString() : null,
		state: e.state,
		result: e.state === "final" && e.away_score !== null && e.home_score !== null ? { away: e.away_score, home: e.home_score } : null,
		blogger: e.b_away !== null && e.b_home !== null ? { away: e.b_away, home: e.b_home } : null,
	}))

	const pl = await q.query<{ id: string; handle: string; joined_at: Date; disabled_at: Date | null }>(`select id, handle, joined_at, disabled_at from league_players`)
	const players = pl.rows.map((p) => ({ id: p.id, handle: p.handle, joinedAt: new Date(p.joined_at).toISOString(), disabled: p.disabled_at !== null }))

	const gr = await q.query<{ player_id: string; event_id: string; points: number; voided: boolean; correct: boolean; margin_error: number | null; exact: boolean; week: number; submitted_at: Date }>(
		`select g.player_id, g.event_id, g.points, g.voided, g.correct, g.margin_error, g.exact, e.week, n.submitted_at
		 from league_current_grades g join league_entries n on n.id = g.entry_id join league_events e on e.id = g.event_id
		 where n.competition_id = $1`,
		[competitionId]
	)
	const grades: StandingGrade[] = gr.rows.map((g) => ({ playerId: g.player_id, eventId: g.event_id, points: g.points, voided: g.voided, detail: { correct: g.correct, marginError: g.margin_error, exact: g.exact }, week: g.week, submittedAt: new Date(g.submitted_at).toISOString() }))

	const mine: MyEntry[] = []
	if (playerId) {
		const m = await q.query<{ id: string; event_id: string; payload: unknown; first_submitted_at: Date; submitted_at: Date; revisions: number }>(
			`select n.id, n.event_id, n.payload, n.first_submitted_at, n.submitted_at, (select count(*)::int from league_entry_revisions r where r.entry_id = n.id) as revisions
			 from league_entries n where n.competition_id = $1 and n.player_id = $2 and n.voided_at is null`,
			[competitionId, playerId]
		)
		m.rows.forEach((r) => mine.push({ entryId: r.id, eventId: r.event_id, payload: r.payload, firstSubmittedAt: new Date(r.first_submitted_at).toISOString(), submittedAt: new Date(r.submitted_at).toISOString(), revisions: r.revisions }))
	}

	const tl = await q.query<{ event_id: string; entries: number; away_wins: number; home_wins: number }>(
		`select event_id, count(*)::int as entries,
		   count(*) filter (where (payload->>'away')::int > (payload->>'home')::int or payload->>'pick' = 'away')::int as away_wins,
		   count(*) filter (where (payload->>'home')::int > (payload->>'away')::int or payload->>'pick' = 'home')::int as home_wins
		 from league_entries where competition_id = $1 and voided_at is null group by event_id`,
		[competitionId]
	)
	const tallies: Record<string, EventTally> = {}
	tl.rows.forEach((t) => (tallies[t.event_id] = { eventId: t.event_id, entries: t.entries, awayWins: t.away_wins, homeWins: t.home_wins }))
	return { competitionId, events, players, grades, mine, tallies }
}

export { toLeagueEvent }
