// The position-group tables behind /lab/teams and /lab/matchup, bound to the data in the repo. All the logic
// lives in unitsKit.ts so it can run anywhere; this file only supplies the data and the team names.

import { teamByAbbr, TEAMS } from "@/lib/nfl"
import { getUnits } from "./data"
import { type MatchupRow, type Names, type SlateGame, type UnitTeam, headline, matchupRows, paperEdge } from "./unitsKit"

export const TEAM = "LV"

export function unitTeam(abbr: string): UnitTeam | null {
	return getUnits().teams[abbr.toUpperCase()] ?? null
}

/** Nicknames for the two teams in a matchup, e.g. { LV: "Raiders", NE: "Patriots" }. */
export function namesFor(...abbrs: string[]): Names {
	return Object.fromEntries(abbrs.map((a) => [a, teamByAbbr(a).nick]))
}

export function hasUnits(abbr: string): boolean {
	return Boolean(getUnits().teams[abbr.toUpperCase()])
}

/** Every team with a table, in the order the site lists them. */
export function listedTeams() {
	return TEAMS.filter((t) => hasUnits(t.abbr))
}

export function matchupFor(a: string, b: string): { rows: MatchupRow[]; edge: number; line: string } {
	const data = getUnits()
	const rows = matchupRows(data, a, b)
	return { rows, edge: paperEdge(rows, a), line: headline(rows, a, b, namesFor(a, b)) }
}

/** Parses "lv-vs-ne" into two different teams that both have tables, or null. */
export function parsePair(pair: string): { a: string; b: string } | null {
	const m = /^([a-z]{2,3})-vs-([a-z]{2,3})$/i.exec(pair)
	if (!m) return null
	const a = m[1].toUpperCase()
	const b = m[2].toUpperCase()
	return a !== b && hasUnits(a) && hasUnits(b) ? { a, b } : null
}

export function slateGames(): { week: number; games: SlateGame[] } | null {
	return getUnits().slate
}

/** The game the Raiders play in the coming slate, if any. */
export function raidersGame(): SlateGame | null {
	return getUnits().slate?.games.find((g) => g.home === TEAM || g.away === TEAM) ?? null
}
