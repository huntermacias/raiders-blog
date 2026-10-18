// What a player chooses to show on their public page. Self-service: it only ever touches the signed-in player's row.

import type { Queryable } from "../db"
import { TEAMS } from "../../nfl"

export type ProfileSettings = { favoriteTeam: string | null; showProfile: boolean; showHistory: boolean }

export async function loadSettings(q: Queryable, userId: string): Promise<ProfileSettings | null> {
	const r = await q.query<{ favorite_team: string | null; show_profile: boolean; show_history: boolean }>(`select favorite_team, show_profile, show_history from league_players where user_id = $1 and disabled_at is null`, [userId])
	const x = r.rows[0]
	return x ? { favoriteTeam: x.favorite_team, showProfile: x.show_profile, showHistory: x.show_history } : null
}

const TEAM_ABBRS = TEAMS.map((t) => t.abbr)

export function parseSettings(raw: { favoriteTeam?: unknown; showProfile?: unknown; showHistory?: unknown }): { ok: true; value: ProfileSettings } | { ok: false; message: string } {
	const fav = raw.favoriteTeam === null || raw.favoriteTeam === "" || raw.favoriteTeam === undefined ? null : raw.favoriteTeam
	if (fav !== null && (typeof fav !== "string" || TEAM_ABBRS.indexOf(fav) < 0)) return { ok: false, message: "Pick a team from the list" }
	if (typeof raw.showProfile !== "boolean" || typeof raw.showHistory !== "boolean") return { ok: false, message: "Those settings are not valid" }
	// A hidden profile hides its history too: there is no page to show it on.
	return { ok: true, value: { favoriteTeam: fav, showProfile: raw.showProfile, showHistory: raw.showProfile ? raw.showHistory : false } }
}

export async function saveSettings(q: Queryable, userId: string, s: ProfileSettings): Promise<boolean> {
	const r = await q.query(`update league_players set favorite_team = $2, show_profile = $3, show_history = $4 where user_id = $1 and disabled_at is null`, [userId, s.favoriteTeam, s.showProfile, s.showHistory])
	return (r.rowCount ?? 0) > 0
}

/** Just the favorite team, for the "My team" button around the site. Leaves the privacy settings alone. */
export function parseFavoriteTeam(raw: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
	if (raw === null || raw === "" || raw === undefined) return { ok: true, value: null }
	if (typeof raw !== "string" || TEAM_ABBRS.indexOf(raw) < 0) return { ok: false, message: "Pick a team from the list" }
	return { ok: true, value: raw }
}

export async function saveFavoriteTeam(q: Queryable, userId: string, team: string | null): Promise<boolean> {
	const r = await q.query(`update league_players set favorite_team = $2 where user_id = $1 and disabled_at is null`, [userId, team])
	return (r.rowCount ?? 0) > 0
}
