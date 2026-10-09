// Picks the share card for a request to /api/og?type=playoffs: reads the scenario code and the team out of the query, plays the
// scenario and the rest of the season, and hands the result to the card. Kept out of the route so it can be tested without Next.
// It reads only the schedule in the repo, so it needs no network.

import { isSize } from "../lab/lastShare"
import { PAGE_SIMS, simulateOdds } from "../playoffs/odds"
import { getGames, getSchedule } from "../playoffs/data"
import { NFL_LEAGUE } from "../playoffs/season"
import { DEFAULT_TEAM, decodeScenario, readTeam } from "../playoffs/share"
import { simulateSeason } from "../playoffs/simulator"
import type { CardSpec } from "./cards"
import { buildPlayoffsSpec } from "./playoffsCard"

const TEAM_IDS: ReadonlySet<string> = new Set(NFL_LEAGUE.teams.map((t) => t.id))

export type PlayoffsQuery = { s?: string; t?: string; size?: string }

/**
 * The card for a scenario. A code that does not fit this schedule (an old link) gets the card for the race as it stands, never an
 * error, so a shared link always shows something true. An unknown team is the Raiders.
 */
export function playoffsSpec(q: PlayoffsQuery): CardSpec | null {
	const games = getGames()
	const schedule = getSchedule()
	const team = readTeam(q.t, TEAM_IDS) || DEFAULT_TEAM
	const decoded = q.s ? decodeScenario(games, q.s) : null
	const predictions = decoded && decoded.ok ? decoded.predictions : {}
	const sim = simulateSeason({ games, predictions })
	// Odds are only worth working out while games remain; once the season is complete the table is the answer.
	const odds = sim.complete ? null : simulateOdds({ games, predictions, sims: PAGE_SIMS, track: team, trackGames: 0 })
	return buildPlayoffsSpec({ sim, odds, team, picks: Object.keys(predictions).length, season: schedule.season, throughWeek: schedule.throughWeek, size: isSize(q.size) ? q.size : "wide" })
}
