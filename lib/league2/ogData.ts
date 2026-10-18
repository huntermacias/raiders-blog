// Data for the NFL share cards (/api/og?type=nflleague). Reads straight from Postgres, never syncs or writes, and answers
// null when the League is off or the format is not switched on, so a card cannot reveal a league nobody has announced.
//
// What a card may show of a player: nothing unless they keep a public profile, and nothing from past weeks unless they
// also share their history. Picks of games that have not locked never reach the card (see buildNflLeagueSpec).

import { HANDLE_RE } from "../league"
import { type NflCardView, type NflLeagueCardSpec, buildNflLeagueSpec, inviteSpec } from "../og/nflLeagueCard"
import type { ShareSize } from "../lab/lastShare"
import { getRuntime } from "./auth/server"
import { competitionForMode, isNflMode } from "./competitions"
import { currentSeason } from "./http/handlers"
import { loadCompetition } from "./services/read"
import { buildNflWeek, defaultWeek } from "./view/nfl"
import { buildConfidenceWeek, buildUpsetWeek } from "./view/nflFormats"

export type NflCardQuery = { mode: string; week: string; view: string; handle: string; size: ShareSize }

export async function loadNflCardSpec(q: NflCardQuery, nowMs: number = Date.now()): Promise<NflLeagueCardSpec | null> {
	if (!isNflMode(q.mode)) return null
	const rt = getRuntime()
	if (!rt) return null
	const season = currentSeason()
	const competitionId = competitionForMode(q.mode, season)
	const wantedWeek = Number(q.week)
	const week = Number.isInteger(wantedWeek) && wantedWeek >= 1 && wantedWeek <= 22 ? wantedWeek : null
	const view: NflCardView = q.view === "me" || q.view === "board" || q.view === "alert" ? q.view : "invite"
	try {
		const on = await rt.db.query(`select 1 from league_competitions where id = $1 and enabled`, [competitionId])
		if (on.rows.length === 0) return null

		let me: { id: string } | null = null
		let handle: string | null = null
		let allowed = true
		if (view === "me") {
			if (!HANDLE_RE.test(q.handle)) allowed = false
			else {
				const p = await rt.db.query<{ id: string; handle: string; show_profile: boolean; show_history: boolean }>(`select id, handle, show_profile, show_history from league_players where handle_lower = $1 and disabled_at is null`, [q.handle.toLowerCase()])
				const row = p.rows[0]
				if (!row || !row.show_profile) allowed = false
				else {
					me = { id: row.id }
					handle = row.handle
				}
			}
		}

		const data = await loadCompetition(rt.db, competitionId, me ? me.id : null)
		// A player who hides their history shares this week only.
		if (me && week !== null && week !== defaultWeek(data.events, nowMs)) {
			const hist = await rt.db.query<{ show_history: boolean }>(`select show_history from league_players where id = $1`, [me.id])
			if (!hist.rows[0]?.show_history) allowed = false
		}
		const input = { size: q.size, view: allowed ? view : ("invite" as const), handle }
		if (q.mode === "winners") {
			const v = buildNflWeek(data, season, me, nowMs, week)
			return v ? buildNflLeagueSpec({ mode: "winners", view: v }, input) : inviteSpec("winners", q.size, season, null)
		}
		if (q.mode === "confidence") {
			const v = buildConfidenceWeek(data, season, me, nowMs, week)
			return v ? buildNflLeagueSpec({ mode: "confidence", view: v }, input) : inviteSpec("confidence", q.size, season, null)
		}
		const v = buildUpsetWeek(data, season, me, nowMs, week)
		return v ? buildNflLeagueSpec({ mode: "upset", view: v }, input) : inviteSpec("upset", q.size, season, null)
	} catch (e) {
		console.log("league: nfl card failed:", (e as Error).message)
		return null
	}
}
