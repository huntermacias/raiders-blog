// Lets ESPN stand in for two things Hunter would otherwise type into a Game Prediction doc by hand: the
// final score, and the kickoff time. Everything downstream (the schedule record, the homepage "Game on"
// banner, the league standings, the picks scoreboard) already reads those two fields, so filling them in
// here updates all of it at once. Nothing is written to Sanity; the doc stays exactly as typed, and a
// value typed there always wins over ESPN's final score.

import { teamInfo } from "../nfl"
import { siteAbbr } from "./espn"
import type { LiveGameInfo } from "./types"

export type FinalsGame = {
	awayTeam: string
	homeTeam: string
	kickoff: string
	actualAwayScore?: number | null
	actualHomeScore?: number | null
}

const HOUR = 3600_000
const DAY = 24 * HOUR

/** Games from this far back are checked; older gaps are Hunter's to fill in Studio. */
export const LOOKBACK_MS = 30 * DAY
/** Upcoming games this close get ESPN's kickoff time (flexed games, a mistyped time). */
export const LOOKAHEAD_MS = 8 * DAY
/** A game's ESPN event must be within this of the doc's kickoff to count as the same game. */
const MATCH_MS = 3 * DAY

const hasScore = (g: FinalsGame) => typeof g.actualAwayScore === "number" && typeof g.actualHomeScore === "number"
const ms = (iso: string | null | undefined) => {
	const t = iso ? Date.parse(iso) : NaN
	return Number.isFinite(t) ? t : null
}

/** Games worth asking ESPN about: not graded yet, and near enough to now to matter. */
export function candidates<T extends FinalsGame>(games: T[], now: number): T[] {
	return games.filter((g) => {
		if (hasScore(g)) return false
		const t = ms(g.kickoff)
		return t != null && t >= now - LOOKBACK_MS && t <= now + LOOKAHEAD_MS
	})
}

/** The scoreboard window that covers every candidate, as ESPN's yyyymmdd-yyyymmdd, or null for none. */
export function windowFor(games: FinalsGame[]): { from: number; to: number } | null {
	const ts = games.map((g) => ms(g.kickoff)).filter((t): t is number => t != null)
	if (ts.length === 0) return null
	return { from: Math.min(...ts) - DAY, to: Math.max(...ts) + DAY }
}

function eventFor(g: FinalsGame, events: LiveGameInfo[]): LiveGameInfo | null {
	const a = teamInfo(g.awayTeam).abbr
	const h = teamInfo(g.homeTeam).abbr
	const t = ms(g.kickoff)
	if (t == null) return null
	let best: LiveGameInfo | null = null
	let bestGap = Infinity
	for (const e of events) {
		const abbrs = [siteAbbr(e.home.abbr), siteAbbr(e.away.abbr)]
		if (!abbrs.includes(a) || !abbrs.includes(h)) continue
		const k = ms(e.kickoff)
		const gap = k == null ? MATCH_MS : Math.abs(k - t)
		if (gap <= MATCH_MS && gap < bestGap) {
			best = e
			bestGap = gap
		}
	}
	return best
}

/**
 * Applies ESPN's results to games that haven't been graded by hand: a final score once ESPN calls the
 * game over, and ESPN's kickoff time for a game that hasn't been played. Teams are matched by name
 * rather than by home and away, so a swapped home/away in Studio still lines up.
 */
export function mergeFinals<T extends FinalsGame>(games: T[], events: LiveGameInfo[], now: number): T[] {
	const open = new Set(candidates(games, now))
	return games.map((g) => {
		if (!open.has(g)) return g
		const e = eventFor(g, events)
		if (!e) return g
		if (e.state === "post") {
			const away = teamInfo(g.awayTeam).abbr
			const mineAway = siteAbbr(e.away.abbr) === away ? e.away : e.home
			const mineHome = mineAway === e.away ? e.home : e.away
			return { ...g, actualAwayScore: mineAway.score, actualHomeScore: mineHome.score, kickoff: e.kickoff ?? g.kickoff }
		}
		return e.kickoff ? { ...g, kickoff: e.kickoff } : g
	})
}
