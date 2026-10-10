// The Sunday Rooting Guide's link: which team, which goal and which week. Plain query parameters so a link reads as what it is
// (/lab/rooting-guide?team=LV&goal=playoffs&week=8) and so a crawler or a share card can read it with no script. Anything unknown or
// damaged falls back to the default instead of failing, so a shared link always opens on something true.

import { type Goal, DEFAULT_GOAL } from "./types"
import { isGoal } from "./guide"

export const ROOTING_PATH = "/lab/rooting-guide"
export const DEFAULT_TEAM = "LV"
export const SITE_URL = "https://www.raidersrundown.com"
/** Where a share goes when it carries tracking: the campaign name the share window tags links with. */
export const ROOTING_CAMPAIGN = "rooting_guide"

/** "week" is the games of the guide's week; "all" is every game still to play. */
export type Scope = "week" | "all"

export type GuideQuery = {
	team: string
	goal: Goal
	/** The week the link was made for, or null when it names none. */
	week: number | null
	scope: Scope
}

export type RawQuery = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "")

export function readTeam(value: string | null | undefined, teams: ReadonlySet<string>): string {
	const v = (value ?? "").trim().toUpperCase()
	return teams.has(v) ? v : DEFAULT_TEAM
}

export function readWeek(value: string | null | undefined): number | null {
	const n = Number(value)
	return Number.isInteger(n) && n >= 1 && n <= 22 ? n : null
}

export function readQuery(sp: RawQuery, teams: ReadonlySet<string>): GuideQuery {
	const goal = one(sp.goal).toLowerCase()
	return {
		team: readTeam(one(sp.team), teams),
		goal: isGoal(goal) ? goal : DEFAULT_GOAL,
		week: readWeek(one(sp.week)),
		scope: one(sp.scope) === "all" ? "all" : "week",
	}
}

/** The query string for a guide: team and goal always, and the week when there is one. A "week" scope is the default and is left out. */
export function guideQuery(q: { team: string; goal: Goal; week?: number | null; scope?: Scope }): string {
	const parts = [`team=${q.team}`, `goal=${q.goal}`]
	if (q.week) parts.push(`week=${q.week}`)
	if (q.scope === "all") parts.push("scope=all")
	return parts.join("&")
}

export const guidePath = (q: { team: string; goal: Goal; week?: number | null; scope?: Scope }) => `${ROOTING_PATH}?${guideQuery(q)}`

/** The page a team's guide is filed under in search: team only, so the goal and week variants are not separate pages. */
export function canonicalFor(team: string): string {
	return team === DEFAULT_TEAM ? `${SITE_URL}${ROOTING_PATH}` : `${SITE_URL}${ROOTING_PATH}?team=${team}`
}
