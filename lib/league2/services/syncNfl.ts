// Keeps the public NFL competition in step with ESPN's schedule and finals.
//
// Same rules as the Beat the Blogger sync: ids come from ESPN, running it twice changes nothing, a score an admin
// corrected stays corrected, and a cancelled game stays cancelled. The competition starts switched OFF, so nothing
// reaches players until an admin turns it on.

import type { Db } from "../db"
import { teamByAbbr } from "../../nfl"
import { uuidV5 } from "../ids"
import { ensureCompetition } from "./sync"
import { gradeCompetition } from "./grade"

export type NflFeedGame = { id: string; week: number; kickoff: string; home: string; away: string; homeScore: number | null; awayScore: number | null }

export const NFL_COMPETITION = (season: number) => `nfl-winners-${season}`

export type NflSyncReport = { gamesAdded: number; kickoffsMoved: number; resultsApplied: number; skipped: number; graded: number }

export async function syncNflFromFeed(db: Db, games: readonly NflFeedGame[], season: number, now: number): Promise<NflSyncReport> {
	const report: NflSyncReport = { gamesAdded: 0, kickoffsMoved: 0, resultsApplied: 0, skipped: 0, graded: 0 }
	const competitionId = NFL_COMPETITION(season)
	await db.tx(async (q) => {
		await ensureCompetition(q, { id: competitionId, season, kind: "weekly-winners", name: "NFL Weekly Winners", family: "nfl-winner", enabled: false })
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
		report.graded = (await gradeCompetition(q, { competitionId, now })).created
	})
	return report
}
