// ESPN's league standings, as the win-loss-tie record for each team, keyed by the team names used on
// this site. Lets the rankings page and the season tracker show real records without anyone typing them
// into Studio after every game. Pure, so it can be tested with a saved sample.

import { TEAMS } from "../nfl"
import { siteAbbr } from "./espn"
import type { SeasonGame } from "../math/season"

export type TeamRecord = { w: number; l: number; t: number }
export type RecordsByTeam = Record<string, TeamRecord>

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Every standings entry in the feed, whether it nests conferences, divisions or neither. */
function entries(node: unknown): Obj[] {
	const n = obj(node)
	return [...arr(obj(n.standings).entries).map(obj), ...arr(n.children).flatMap(entries)]
}

/** Records for the teams the feed lists. Returns {} when the feed doesn't look like a full league. */
export function parseStandings(json: unknown): RecordsByTeam {
	const out: RecordsByTeam = {}
	for (const e of entries(json)) {
		const abbr = siteAbbr((obj(e.team).abbreviation as string | undefined) ?? null)
		const team = TEAMS.find((t) => t.abbr === abbr)
		if (!team) continue
		const stat = (name: string) => {
			const s = arr(e.stats).map(obj).find((x) => x.name === name)
			const v = Number(s?.value)
			return Number.isFinite(v) ? v : null
		}
		const w = stat("wins")
		const l = stat("losses")
		if (w == null || l == null) continue
		out[team.name] = { w, l, t: stat("ties") ?? 0 }
	}
	return Object.keys(out).length >= 30 ? out : {}
}

/**
 * Team rows with ESPN's wins/losses/ties laid over whatever was typed. ESPN wins: these fields default
 * to 0 in Studio, so a typed value can't be told apart from "never filled in". A team ESPN doesn't list
 * keeps its typed record.
 */
export function overlayRecords<T extends { team: string; wins?: number | null; losses?: number | null; ties?: number | null }>(teams: T[], records: RecordsByTeam): T[] {
	return teams.map((t) => {
		const r = records[t.team]
		return r ? { ...t, wins: r.w, losses: r.l, ties: r.t } : t
	})
}

/** A game is over about three hours after kickoff; used so a board posted mid-game does not count that game. */
const GAME_MS = 3 * 3_600_000

/**
 * Win-loss-tie records counting only the games that had been played when a set of rankings was posted:
 * final games from weeks 1 through `week`, and, when `postedAt` is known, only those that kicked off
 * early enough to be over by then. Every team is listed, 0-0 included, so a team on a bye still shows a
 * record. Pure: the caller supplies the games.
 */
export function recordsAsOf(games: SeasonGame[], week: number, postedAt: number | null): RecordsByTeam {
	const out: RecordsByTeam = {}
	for (const t of TEAMS) out[t.name] = { w: 0, l: 0, t: 0 }
	const name = (abbr: string) => TEAMS.find((t) => t.abbr === siteAbbr(abbr))?.name
	for (const g of games) {
		if (g.week > week || g.homeScore == null || g.awayScore == null) continue
		if (postedAt != null) {
			const k = g.kickoff ? Date.parse(g.kickoff) : NaN
			if (Number.isFinite(k) && k + GAME_MS > postedAt) continue
		}
		const home = out[name(g.home) ?? ""]
		const away = out[name(g.away) ?? ""]
		if (!home || !away) continue
		if (g.homeScore === g.awayScore) {
			home.t++
			away.t++
		} else {
			const homeWon = g.homeScore > g.awayScore
			;(homeWon ? home : away).w++
			;(homeWon ? away : home).l++
		}
	}
	return out
}
