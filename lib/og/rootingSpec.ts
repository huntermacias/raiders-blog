// Picks the share card for a request to /api/og?type=rooting: reads the team, goal and week out of the query, looks the guide up in the
// stored file (no simulation) and hands the same view the page shows to the card. Kept out of the route so it can be tested without Next.
// It reads only files in the repo, so it needs no network.

import { isSize } from "../lab/lastShare"
import { getGames, getSchedule } from "../playoffs/data"
import { NFL_LEAGUE } from "../playoffs/season"
import { getRooting } from "../rooting/data"
import { settledGames } from "../rooting/live"
import { readQuery } from "../rooting/share"
import { buildView } from "../rooting/view"
import type { CardSpec } from "./cards"
import { buildRootingSpec } from "./rootingCard"

const TEAM_IDS: ReadonlySet<string> = new Set(NFL_LEAGUE.teams.map((t) => t.id))

export type RootingQuery = { team?: string; goal?: string; week?: string; size?: string }

/**
 * The card for a team and goal. An unknown team is the Raiders and an unknown goal is the playoffs, so a shared link always shows
 * something true. Null only when the guide's data file is missing, which sends the route to the default card.
 */
export function rootingSpec(q: RootingQuery): CardSpec | null {
	const data = getRooting()
	if (!data) return null
	const games = getGames()
	const query = readQuery({ team: q.team, goal: q.goal, week: q.week }, TEAM_IDS)
	const view = buildView({ data, schedule: games, query, settled: settledGames(data, games, []), season: getSchedule().season })
	return buildRootingSpec(view, { season: data.season, size: isSize(q.size) ? q.size : "wide" })
}
