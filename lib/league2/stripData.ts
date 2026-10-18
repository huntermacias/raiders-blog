// The numbers behind the strip: one small read for the signed-in player. No writes.

import type { Queryable } from "./db"
import type { Strip } from "./strip"
import { loadCompetition } from "./services/read"
import { buildHome } from "./view/btb"

export async function loadStrip(db: Queryable, user: { id: string }, season: number, nowMs: number): Promise<Extract<Strip, { signedIn: true }>> {
	const p = (await db.query<{ id: string; handle: string; favorite_team: string | null }>(`select id, handle, favorite_team from league_players where user_id = $1 and disabled_at is null`, [user.id])).rows[0]
	const base = { signedIn: true as const, handle: p?.handle ?? null, favoriteTeam: p?.favorite_team ?? null, next: null, rank: null }
	if (!p) return base
	const competitionId = `btb-${season}`
	const on = await db.query(`select 1 from league_competitions where id = $1 and enabled`, [competitionId])
	if (on.rows.length === 0) return base
	const view = buildHome(await loadCompetition(db, competitionId, p.id), season, { id: p.id }, nowMs)
	const a = view.nextAction
	return {
		...base,
		next: { kind: a.kind, title: a.title, detail: a.detail, lockAt: "lockAt" in a ? a.lockAt : null },
		rank: view.me && view.me.of > 0 && view.me.games > 0 ? { rank: view.me.rank, of: view.me.of, points: view.me.points } : null,
	}
}
