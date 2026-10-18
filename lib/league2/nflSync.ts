// Runs the ESPN -> Postgres sync for the NFL competition. Server only. Never throws.

import type { Runtime } from "./auth/server"
import { getPriorRatings, weekGames } from "../live/service"
import { currentWeek, weeksToSync } from "./nflWeek"
import { claimSync } from "./services/sync"
import { type NflFeedGame, syncNflFromFeed } from "./services/syncNfl"

export async function maybeSyncNfl(rt: Runtime, season: number, now: number = Date.now()): Promise<void> {
	try {
		if (!(await claimSync(rt.db, "nfl", 60_000))) return
		// Week 1's kickoff anchors the calendar. Its schedule is cached for ten minutes by the live service.
		const first = (await weekGames(1, season)).map((g) => g.kickoff).filter((k): k is string => Boolean(k)).sort()[0]
		if (!first) return
		const week = currentWeek(first, now)
		const weeks = await Promise.allSettled(weeksToSync(week).map((w) => weekGames(w, season)))
		const feed: NflFeedGame[] = weeks.flatMap((w) => (w.status === "fulfilled" ? w.value : [])).filter((g): g is typeof g & { id: string; kickoff: string } => Boolean(g.id && g.kickoff)).map((g) => ({ id: g.id, week: g.week, kickoff: g.kickoff, home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore }))
		const priorRatings = await getPriorRatings().catch(() => null)
		const report = await syncNflFromFeed(rt.db, feed, season, now, { currentWeek: week, priorRatings })
		await rt.db.query(`update league_sync_state set detail = $2::jsonb where key = $1`, ["nfl", JSON.stringify({ ...report, week })]).catch(() => null)
	} catch (e) {
		console.log("league: nfl sync failed:", (e as Error).message)
	}
}
