// Loads the public NFL winners league for a page. Returns null while the competition is missing or switched off, so
// the page can answer 404 and nothing about an unannounced league leaks.

import { after } from "next/server"

import { getRuntime } from "./auth/server"
import { currentSeason } from "./http/handlers"
import { maybeSyncNfl } from "./nflSync"
import { NFL_COMPETITION } from "./services/syncNfl"
import { loadCompetition } from "./services/read"
import type { Account } from "./session"
import { type NflWeekView, buildNflWeek } from "./view/nfl"

export type NflPage = { view: NflWeekView; account: Account | null; signedInNoPlayer: boolean }

/** Is the NFL league switched on? Also keeps the schedule fresh, which is what creates the competition in the first place. */
export async function nflEnabled(): Promise<boolean> {
	const rt = getRuntime()
	if (!rt) return false
	try {
		const season = currentSeason()
		after(() => maybeSyncNfl(rt, season))
		const c = await rt.db.query(`select 1 from league_competitions where id = $1 and enabled`, [NFL_COMPETITION(season)])
		return c.rows.length > 0
	} catch {
		return false
	}
}

export async function loadNflWeek(account: Account | null, week: number | null): Promise<NflPage | null> {
	const rt = getRuntime()
	if (!rt) return null
	const season = currentSeason()
	try {
		if (!(await nflEnabled())) return null
		const data = await loadCompetition(rt.db, NFL_COMPETITION(season), account?.player?.id ?? null)
		const view = buildNflWeek(data, season, account?.player ? { id: account.player.id } : null, Date.now(), week)
		return view ? { view, account, signedInNoPlayer: Boolean(account && !account.player) } : { view: emptyView(season), account, signedInNoPlayer: Boolean(account && !account.player) }
	} catch (e) {
		console.log("league: nfl load failed:", (e as Error).message)
		return null
	}
}

function emptyView(season: number): NflWeekView {
	return {
		season,
		week: 1,
		weeks: [],
		now: new Date().toISOString(),
		games: [],
		summary: { total: 0, picked: 0, openUnpicked: 0, final: 0, correct: 0, pushes: 0, points: 0 },
		next: { kind: "waiting", title: "The schedule is loading", detail: "Games appear here as soon as the week's schedule is in. Check back in a minute." },
		weekBoard: { rows: [], total: 0, me: null },
		seasonBoard: { rows: [], total: 0, me: null, players: 0 },
		champions: [],
	}
}
