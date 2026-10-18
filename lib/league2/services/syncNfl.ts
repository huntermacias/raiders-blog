// Keeps the public NFL competition in step with ESPN's schedule and finals.
//
// Same rules as the Beat the Blogger sync: ids come from ESPN, running it twice changes nothing, a score an admin
// corrected stays corrected, and a cancelled game stays cancelled. The competition starts switched OFF, so nothing
// reaches players until an admin turns it on.

import type { Db, Queryable } from "../db"
import { type Ratings } from "../../math/elo"
import { teamByAbbr, teamInfo } from "../../nfl"
import { DEFAULT_MAX_UPSETS, ratingsFromFinals, upsetLineFor } from "../domain"
import { CONFIDENCE_COMPETITION, NFL_COMPETITION, UPSET_COMPETITION } from "../competitions"
import { uuidV5 } from "../ids"
import { ensureCompetition } from "./sync"
import { gradeCompetition } from "./grade"

export type NflFeedGame = { id: string; week: number; kickoff: string; home: string; away: string; homeScore: number | null; awayScore: number | null }

export { NFL_COMPETITION }

export type NflSyncReport = { gamesAdded: number; kickoffsMoved: number; resultsApplied: number; skipped: number; graded: number; linesSet: number }

export type NflSyncOptions = {
	/** The NFL week it is now. Upset lines are set for this week and earlier, never for weeks that have not opened. */
	currentWeek?: number
	/** Last season's final ratings, which the first weeks of the new season lean on a little. */
	priorRatings?: Ratings | null
}

export async function syncNflFromFeed(db: Db, games: readonly NflFeedGame[], season: number, now: number, opts: NflSyncOptions = {}): Promise<NflSyncReport> {
	const report: NflSyncReport = { gamesAdded: 0, kickoffsMoved: 0, resultsApplied: 0, skipped: 0, graded: 0, linesSet: 0 }
	const competitionId = NFL_COMPETITION(season)
	await db.tx(async (q) => {
		await ensureCompetition(q, { id: competitionId, season, kind: "weekly-winners", name: "NFL Weekly Winners", family: "nfl-winner", enabled: false })
		await ensureCompetition(q, { id: CONFIDENCE_COMPETITION(season), season, kind: "confidence", name: "NFL Confidence Picks", family: "nfl-confidence", enabled: false })
		await ensureCompetition(q, { id: UPSET_COMPETITION(season), season, kind: "upset", name: "NFL Upset Challenge", family: "nfl-upset", enabled: false })
		await q.query(`update league_competitions set config = jsonb_build_object('maxUpsets', $2::int) where id = $1 and config = '{}'::jsonb`, [UPSET_COMPETITION(season), DEFAULT_MAX_UPSETS])
		for (const g of games) {
			const kick = Date.parse(g.kickoff)
			const home = teamByAbbr(g.home)
			const away = teamByAbbr(g.away)
			if (!g.id || !Number.isFinite(kick) || !(g.week >= 1 && g.week <= 18) || home.name === away.name) {
				report.skipped++
				continue
			}
			const kickoff = new Date(kick).toISOString()
			const final = g.homeScore !== null && g.awayScore !== null && g.homeScore >= 0 && g.awayScore >= 0 && g.homeScore <= 99 && g.awayScore <= 99
			const id = uuidV5(`event:nfl:${g.id}`)
			const added = await q.query(
				`insert into league_events (id, kind, season, week, nfl_game_id, away_team, home_team, kickoff, state, away_score, home_score)
				 values ($1, 'game', $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict do nothing`,
				[id, season, g.week, g.id, away.name, home.name, kickoff, final ? "final" : "scheduled", final ? g.awayScore : null, final ? g.homeScore : null]
			)
			if (added.rowCount) {
				report.gamesAdded++
				if (final) await q.query(`insert into league_result_snapshots (event_id, source, away_score, home_score, hash) values ($1, 'espn', $2, $3, $4)`, [id, g.awayScore, g.homeScore, `${g.awayScore}-${g.homeScore}`])
				continue
			}
			const cur = await q.query<{ state: string; away_score: number | null; home_score: number | null; kickoff: Date; pinned: boolean }>(
				`select state, away_score, home_score, kickoff, result_pinned_at is not null as pinned from league_events where id = $1 for update`,
				[id]
			)
			const row = cur.rows[0]
			if (!row) continue
			if (row.state !== "final" && row.state !== "cancelled" && new Date(row.kickoff).toISOString() !== kickoff) {
				await q.query(`update league_events set kickoff = $2, week = $3, updated_at = now() where id = $1`, [id, kickoff, g.week])
				report.kickoffsMoved++
			}
			if (final && !row.pinned && row.state !== "cancelled" && (row.state !== "final" || row.away_score !== g.awayScore || row.home_score !== g.homeScore)) {
				await q.query(`update league_events set state = 'final', away_score = $2, home_score = $3, updated_at = now() where id = $1`, [id, g.awayScore, g.homeScore])
				await q.query(`insert into league_result_snapshots (event_id, source, away_score, home_score, hash) values ($1, 'espn', $2, $3, $4)`, [id, g.awayScore, g.homeScore, `${g.awayScore}-${g.homeScore}`])
				report.resultsApplied++
			}
		}
		if (opts.currentWeek !== undefined) report.linesSet = await setUpsetLines(q, season, opts.currentWeek, opts.priorRatings ?? null)
		for (const id of [competitionId, CONFIDENCE_COMPETITION(season), UPSET_COMPETITION(season)]) report.graded += (await gradeCompetition(q, { competitionId: id, now })).created
	})
	return report
}

/**
 * Name the underdog for every game of the weeks that have opened and do not have a line yet. A line, once set, is
 * never changed (the database refuses), so players always pick against the line they saw.
 */
export async function setUpsetLines(q: Queryable, season: number, currentWeek: number, prior: Ratings | null): Promise<number> {
	const need = await q.query<{ id: string; home_team: string; away_team: string }>(
		`select e.id, e.home_team, e.away_team from league_events e left join league_upset_lines l on l.event_id = e.id
		 where e.season = $1 and e.kind = 'game' and e.nfl_game_id is not null and l.event_id is null and e.week <= $2 and e.state in ('scheduled', 'postponed')`,
		[season, currentWeek]
	)
	if (need.rows.length === 0) return 0
	const done = await q.query<{ week: number; home_team: string; away_team: string; home_score: number; away_score: number }>(
		`select week, home_team, away_team, home_score, away_score from league_events where season = $1 and kind = 'game' and nfl_game_id is not null and state = 'final' order by week, kickoff`,
		[season]
	)
	const ratings = ratingsFromFinals(done.rows.map((r) => ({ week: r.week, home: teamInfo(r.home_team).abbr, away: teamInfo(r.away_team).abbr, homeScore: r.home_score, awayScore: r.away_score })), prior)
	let set = 0
	for (const e of need.rows) {
		const line = upsetLineFor(teamInfo(e.home_team).abbr, teamInfo(e.away_team).abbr, ratings)
		if (!line) continue
		const r = await q.query(`insert into league_upset_lines (event_id, underdog, favourite_win_chance, home_rating, away_rating) values ($1, $2, $3, $4, $5) on conflict do nothing`, [e.id, line.underdog, line.favouriteWinChance, line.homeRating, line.awayRating])
		set += r.rowCount ?? 0
	}
	return set
}
