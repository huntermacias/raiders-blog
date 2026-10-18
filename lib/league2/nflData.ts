// Loads the public NFL winners league for a page. Returns null while the competition is missing or switched off, so
// the page can answer 404 and nothing about an unannounced league leaks.

import { after } from "next/server"

import { getRuntime } from "./auth/server"
import { currentSeason } from "./http/handlers"
import { maybeSyncNfl } from "./nflSync"
import { UPSET_V1 } from "./domain"
import { NFL_COMPETITION, type NflMode, competitionForMode } from "./competitions"
import { loadCompetition } from "./services/read"
import type { Account } from "./session"
import { type NflWeekView, buildNflWeek } from "./view/nfl"
import { type ConfidenceView, type UpsetView, buildConfidenceWeek, buildUpsetWeek } from "./view/nflFormats"

export type NflPage = { view: NflWeekView; account: Account | null; signedInNoPlayer: boolean }

/** Is the NFL league switched on? Also keeps the schedule fresh, which is what creates the competition in the first place. */
export async function nflEnabled(mode: NflMode = "winners"): Promise<boolean> {
	const rt = getRuntime()
	if (!rt) return false
	try {
		const season = currentSeason()
		after(() => maybeSyncNfl(rt, season))
		const c = await rt.db.query(`select 1 from league_competitions where id = $1 and enabled`, [competitionForMode(mode, season)])
		return c.rows.length > 0
	} catch {
		return false
	}
}

/** Which of the three NFL formats an admin has switched on. */
export async function nflModesOpen(): Promise<Record<NflMode, boolean>> {
	const none = { winners: false, confidence: false, upset: false }
	const rt = getRuntime()
	if (!rt) return none
	try {
		const season = currentSeason()
		const ids = { winners: competitionForMode("winners", season), confidence: competitionForMode("confidence", season), upset: competitionForMode("upset", season) }
		const r = await rt.db.query<{ id: string }>(`select id from league_competitions where id = any($1::text[]) and enabled`, [Object.values(ids)])
		const on = new Set(r.rows.map((x) => x.id))
		return { winners: on.has(ids.winners), confidence: on.has(ids.confidence), upset: on.has(ids.upset) }
	} catch {
		return none
	}
}

export type FormatPage<V> = { view: V; account: Account | null; signedInNoPlayer: boolean }

async function loadFormat<V>(mode: NflMode, account: Account | null, build: (data: Awaited<ReturnType<typeof loadCompetition>>, season: number, me: { id: string } | null) => V | null, empty: (season: number) => V): Promise<FormatPage<V> | null> {
	const rt = getRuntime()
	if (!rt) return null
	const season = currentSeason()
	try {
		if (!(await nflEnabled(mode))) return null
		const data = await loadCompetition(rt.db, competitionForMode(mode, season), account?.player?.id ?? null)
		const view = build(data, season, account?.player ? { id: account.player.id } : null) ?? empty(season)
		return { view, account, signedInNoPlayer: Boolean(account && !account.player) }
	} catch (e) {
		console.log(`league: ${mode} load failed:`, (e as Error).message)
		return null
	}
}

export const loadConfidenceWeek = (account: Account | null, week: number | null) =>
	loadFormat<ConfidenceView>("confidence", account, (d, s, me) => buildConfidenceWeek(d, s, me, Date.now(), week), (s) => ({ ...emptyView(s), games: [], gameCount: 0, summary: { ...emptyView(s).summary, ranked: 0, maxPossible: 0, bestStillAlive: 0 } }))

export const loadUpsetWeek = (account: Account | null, week: number | null) =>
	loadFormat<UpsetView>("upset", account, (d, s, me) => buildUpsetWeek(d, s, me, Date.now(), week), (s) => {
		const e = emptyView(s)
		return { ...e, games: [], calls: { used: 0, max: 5, left: 5 }, summary: { called: 0, hits: 0, misses: 0, pending: 0, points: 0, final: 0 }, upsetOfWeek: null, rules: UPSET_V1.rules }
	})

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
