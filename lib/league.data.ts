// Server-side loader for league pages. Uses the token-bearing client because
// league documents have dotted ids, which Sanity keeps out of the public API.

import { client } from "./sanity.client"
import { withEspnFinals } from "./live/service"
import { SEASON } from "./predictions"
import { LEAGUE_QUERY, type LeagueData, normalizeLeagueData } from "./league"

export const EMPTY_LEAGUE: LeagueData = { games: [], players: [], picks: [] }

/** Never throws: a league outage must not take a page down with it. */
export async function loadLeague(): Promise<{ data: LeagueData; ok: boolean }> {
	try {
		const raw = await client.fetch(LEAGUE_QUERY, { season: SEASON })
		const data = normalizeLeagueData(raw)
		// ESPN fills in a final score or kickoff time that is not in Studio yet, so the standings never wait on typing.
		return { data: { ...data, games: await withEspnFinals(data.games) }, ok: true }
	} catch (err) {
		console.log("league query failed", (err as { message?: string })?.message ?? err)
		return { data: EMPTY_LEAGUE, ok: false }
	}
}
