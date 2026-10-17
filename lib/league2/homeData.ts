// Loads the Beat the Blogger home page from Postgres. Returns null when the Postgres League is not ready yet, so the page
// can fall back to the existing Sanity-backed League and nothing breaks during rollout.

import { after } from "next/server"

import { getRuntime } from "./auth/server"
import { nflEnabled } from "./nflData"
import { currentSeason } from "./http/handlers"
import { maybeSyncBtb } from "./sanitySync"
import { loadCompetition } from "./services/read"
import type { Account } from "./session"
import { type HomeView, buildHome } from "./view/btb"

export type BtbHome = { view: HomeView; account: Account | null; signedInNoPlayer: boolean; nflOpen: boolean }

export async function loadBtbHome(account: Account | null, opts: { challengerHandle?: string } = {}): Promise<BtbHome | null> {
	const rt = getRuntime()
	if (!rt) return null
	const season = currentSeason()
	const competitionId = `btb-${season}`
	try {
		const c = await rt.db.query(`select 1 from league_competitions where id = $1 and enabled`, [competitionId])
		if (c.rows.length === 0) return null
		after(() => maybeSyncBtb(rt, season))
		const data = await loadCompetition(rt.db, competitionId, account?.player?.id ?? null)
		const nflOpen = await nflEnabled()
		return { view: buildHome(data, season, account?.player ? { id: account.player.id } : null, Date.now(), opts), account, signedInNoPlayer: Boolean(account && !account.player), nflOpen }
	} catch (e) {
		console.log("league: home load failed:", (e as Error).message)
		return null
	}
}

import { type ProfileView, buildProfile } from "./view/btb"

/** A player's public page data, or null when the Postgres League is off, not ready, or the handle is unknown. */
export async function loadProfile(handle: string): Promise<ProfileView | null> {
	const rt = getRuntime()
	if (!rt) return null
	const season = currentSeason()
	const competitionId = `btb-${season}`
	try {
		const c = await rt.db.query(`select 1 from league_competitions where id = $1 and enabled`, [competitionId])
		if (c.rows.length === 0) return null
		const p = await rt.db.query<{ id: string; show_profile: boolean; show_history: boolean; favorite_team: string | null }>(`select id, show_profile, show_history, favorite_team from league_players where handle_lower = $1 and disabled_at is null`, [handle.toLowerCase()])
		if (p.rows.length === 0) return null
		const data = await loadCompetition(rt.db, competitionId, p.rows[0].id)
		const view = buildProfile(data, handle, season, Date.now())
		return view ? { ...view, privacy: { profile: p.rows[0].show_profile, history: p.rows[0].show_history }, favoriteTeam: p.rows[0].favorite_team } : null
	} catch (e) {
		console.log("league: profile load failed:", (e as Error).message)
		return null
	}
}
