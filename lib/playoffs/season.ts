// Turns a schedule plus a reader's picks into the facts the tiebreakers need: who played whom, with what result,
// and every team's record overall, in its division and in its conference. Pure and deterministic.

import { TEAMS } from "../nfl"
import type { Game, League, Outcome, Predictions, ResolvedGame, Team, WLT } from "./types"

/** The NFL as of 2026: 32 teams, seven playoff berths per conference (four division winners, three wild cards, one bye). */
export const NFL_LEAGUE: League = {
	teams: TEAMS.map((t) => ({ id: t.abbr, name: t.name, conference: t.conference, division: t.division })),
	wildCards: 3,
	byes: 1,
}

export const emptyWLT = (): WLT => ({ w: 0, l: 0, t: 0 })

export const gamesPlayed = (r: WLT): number => r.w + r.l + r.t

/** Win-loss-tie percentage, a tie counting as half a win. A team with no games has 0. */
export function pct(r: WLT): number {
	const g = gamesPlayed(r)
	return g === 0 ? 0 : (r.w + r.t / 2) / g
}

/** Wins with a tie counted as half. Used to bound what a team can still finish with. */
export const winValue = (r: WLT): number => r.w + r.t / 2

export function recordText(r: WLT): string {
	return r.t > 0 ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`
}

export type TeamGame = {
	gameId: string
	week: number
	opp: string
	result: "W" | "L" | "T"
	home: boolean
	/** Points for and against; null when the game is a pick and has no score. */
	pf: number | null
	pa: number | null
}

export type TeamRecord = { team: string; overall: WLT; division: WLT; conference: WLT }

export type Season = {
	league: League
	teamById: ReadonlyMap<string, Team>
	/** Every game with a result in this scenario, in schedule order. */
	results: readonly ResolvedGame[]
	/** Games with no result yet: not played, and not picked. */
	open: readonly Game[]
	picked: number
	byTeam: ReadonlyMap<string, readonly TeamGame[]>
	records: ReadonlyMap<string, TeamRecord>
	/** True only when every game of the season has been played, so points-based tiebreakers have real scores. */
	scoresKnown: boolean
}

/** The result of a played game, or null for one that has not been played. */
export function actualOutcome(g: Game): Outcome | null {
	if (g.status !== "final" || g.homeScore === null || g.awayScore === null) return null
	if (g.tie || g.homeScore === g.awayScore) return "T"
	return g.homeScore > g.awayScore ? "H" : "A"
}

/**
 * Splits the schedule into games that have a result in this scenario and games that are still open.
 * A played game always keeps its real result: a pick for it is ignored. The input is never changed.
 */
export function resolveGames(games: readonly Game[], predictions: Predictions): { results: ResolvedGame[]; open: Game[]; picked: number } {
	const results: ResolvedGame[] = []
	const open: Game[] = []
	let picked = 0
	for (const g of games) {
		const real = actualOutcome(g)
		if (real) {
			results.push({ id: g.id, week: g.week, homeTeam: g.homeTeam, awayTeam: g.awayTeam, outcome: real, source: "actual", homeScore: g.homeScore, awayScore: g.awayScore })
			continue
		}
		const pick = Object.prototype.hasOwnProperty.call(predictions, g.id) ? predictions[g.id] : undefined
		if (pick === "H" || pick === "A" || pick === "T") {
			results.push({ id: g.id, week: g.week, homeTeam: g.homeTeam, awayTeam: g.awayTeam, outcome: pick, source: "pick", homeScore: null, awayScore: null })
			picked++
		} else {
			open.push(g)
		}
	}
	return { results, open, picked }
}

function resultFor(outcome: Outcome, home: boolean): "W" | "L" | "T" {
	if (outcome === "T") return "T"
	return (outcome === "H") === home ? "W" : "L"
}

function bump(r: WLT, res: "W" | "L" | "T") {
	if (res === "W") r.w++
	else if (res === "L") r.l++
	else r.t++
}

export function buildSeason(league: League, games: readonly Game[], predictions: Predictions = {}): Season {
	const teamById = new Map(league.teams.map((t) => [t.id, t]))
	for (const g of games) {
		if (!teamById.has(g.homeTeam) || !teamById.has(g.awayTeam)) throw new Error(`Game ${g.id} names a team that is not in the league`)
		if (g.homeTeam === g.awayTeam) throw new Error(`Game ${g.id} has the same team on both sides`)
	}

	const { results, open, picked } = resolveGames(games, predictions)
	const byTeam = new Map<string, TeamGame[]>(league.teams.map((t) => [t.id, []]))
	const records = new Map<string, TeamRecord>(league.teams.map((t) => [t.id, { team: t.id, overall: emptyWLT(), division: emptyWLT(), conference: emptyWLT() }]))

	for (const r of results) {
		const h = teamById.get(r.homeTeam) as Team
		const a = teamById.get(r.awayTeam) as Team
		const sameDivision = h.division === a.division
		const sameConference = h.conference === a.conference
		for (const side of ["home", "away"] as const) {
			const isHome = side === "home"
			const me = isHome ? h : a
			const opp = isHome ? a : h
			const res = resultFor(r.outcome, isHome)
			const known = r.homeScore !== null && r.awayScore !== null
			;(byTeam.get(me.id) as TeamGame[]).push({
				gameId: r.id,
				week: r.week,
				opp: opp.id,
				result: res,
				home: isHome,
				pf: known ? ((isHome ? r.homeScore : r.awayScore) as number) : null,
				pa: known ? ((isHome ? r.awayScore : r.homeScore) as number) : null,
			})
			const rec = records.get(me.id) as TeamRecord
			bump(rec.overall, res)
			if (sameDivision) bump(rec.division, res)
			if (sameConference) bump(rec.conference, res)
		}
	}

	return { league, teamById, results, open, picked, byTeam, records, scoresKnown: open.length === 0 && results.every((r) => r.source === "actual") }
}

/** A team's games still open in this scenario. */
export function openGamesFor(season: Season, team: string): number {
	let n = 0
	for (const g of season.open) if (g.homeTeam === team || g.awayTeam === team) n++
	return n
}

export function recordOf(season: Season, team: string): TeamRecord {
	return season.records.get(team) as TeamRecord
}
