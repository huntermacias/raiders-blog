// Everything the Blogger vs. the Math page shows, worked out in one place from three inputs: the blogger's
// boards, the season's games (played and still to play) and the week to look at. Pure apart from the
// simulation's cost, which `buildOdds` isolates so the page can cache it.

import { teamInfo } from "../nfl"
import type { RankingsWeek } from "../rankings"
import { type MathRow, type Scorecard, compareBoard, gradeBoards, hotTakes, ratingRanks } from "./compare"
import { type FinalGame, type Ratings, runElo } from "./elo"
import { type SeasonGame, type SimResult, simulateSeason, sosRanks, winChance } from "./season"

export const HOT = 6
const MAIN_SIMS = 10_000
const HISTORY_SIMS = 3_000

/** The games as they stood after `week`: later weeks haven't been played yet, whatever the scores say. */
export function asOf(games: SeasonGame[], week: number): SeasonGame[] {
	return games.map((g) => (g.week <= week ? g : { ...g, homeScore: null, awayScore: null }))
}

export function finals(games: SeasonGame[], week: number): FinalGame[] {
	return games
		.filter((g) => g.week <= week && g.homeScore != null && g.awayScore != null)
		.map((g) => ({ week: g.week, home: g.home, away: g.away, homeScore: g.homeScore as number, awayScore: g.awayScore as number }))
}

export type OddsBundle = {
	/** The simulation as of the chosen week. */
	now: SimResult
	/** Playoff odds after each earlier week, 0..1, keyed by week then team. */
	history: Record<number, Record<string, number>>
}

/** The expensive part: 10,000 simulated seasons for the week, and a lighter one for each earlier week. */
export function buildOdds(games: SeasonGame[], week: number): OddsBundle {
	const all = finals(games, week)
	const run = runElo(all)
	const now = simulateSeason(asOf(games, week), run.byWeek[week] ?? run.ratings, { sims: MAIN_SIMS })
	const history: Record<number, Record<string, number>> = {}
	for (let w = 1; w < week; w++) {
		const ratings = run.byWeek[w]
		if (!ratings) continue
		const sim = simulateSeason(asOf(games, w), ratings, { sims: HISTORY_SIMS })
		history[w] = Object.fromEntries(Object.entries(sim.teams).map(([a, t]) => [a, t.playoffs]))
	}
	history[week] = Object.fromEntries(Object.entries(now.teams).map(([a, t]) => [a, t.playoffs]))
	return { now, history }
}

export type TeamResult = { week: number; opp: string; home: boolean; mine: number; theirs: number; result: "W" | "L" | "T"; shift: number }
export type TeamUpcoming = { week: number; opp: string; home: boolean; chance: number }

export type TeamDetail = MathRow & {
	nick: string
	note: string | null
	/** Math rating change from the previous week (0 in week 1). */
	ratingChange: number
	/** Each week's rank, mine and the math's; null where I had no board. */
	rankHistory: { week: number; me: number | null; math: number }[]
	results: TeamResult[]
	upcoming: TeamUpcoming[]
	record: { w: number; l: number; t: number }
	odds: {
		playoffs: number
		division: number
		topSeed: number
		projWins: number
		sos: number | null
		sosRank: number | null
		remaining: number
		winsDist: number[]
		history: { week: number; playoffs: number }[]
	} | null
}

export type MathReport = {
	week: number
	teams: TeamDetail[]
	card: Scorecard
	takes: MathRow[]
	hasOdds: boolean
	sims: number
}

/**
 * The report for `week` (one of the boards' weeks). `odds` is null when the schedule isn't complete, in which
 * case the comparison still works and the playoff numbers are simply left out.
 */
export function buildReport(boards: RankingsWeek[], games: SeasonGame[], week: number, odds: OddsBundle | null): MathReport {
	const shown = boards.filter((b) => b.week <= week)
	const latest = shown[shown.length - 1]
	const all = finals(games, week)
	const run = runElo(all)
	const ratings: Ratings = run.byWeek[week] ?? run.ratings
	const rows = compareBoard(latest, ratings)
	const card = gradeBoards(shown, all, run.byWeek)
	const names = latest.rows.map((r) => r.team)
	const mathRanks = new Map<number, Map<string, number>>()
	for (let w = 1; w <= week; w++) if (run.byWeek[w]) mathRanks.set(w, ratingRanks(run.byWeek[w], names))
	const sos = odds ? sosRanks(odds.now) : {}
	const board = asOf(games, week)

	const teams: TeamDetail[] = rows.map((r) => {
		const myRankIn = (w: number) => shown.find((b) => b.week === w)?.rows.find((x) => x.team === r.team)?.rank ?? null
		const prev = run.byWeek[week - 1]?.[r.abbr] ?? 1500
		const results: TeamResult[] = run.log
			.filter((g) => g.home === r.abbr || g.away === r.abbr)
			.map((g) => {
				const home = g.home === r.abbr
				const mine = home ? g.homeScore : g.awayScore
				const theirs = home ? g.awayScore : g.homeScore
				return { week: g.week, opp: home ? g.away : g.home, home, mine, theirs, result: mine > theirs ? "W" : mine < theirs ? "L" : "T", shift: home ? g.shiftHome : -g.shiftHome }
			})
		const upcoming: TeamUpcoming[] = board
			.filter((g) => g.homeScore == null && (g.home === r.abbr || g.away === r.abbr))
			.sort((a, b) => a.week - b.week)
			.map((g) => {
				const home = g.home === r.abbr
				const pHome = winChance(ratings[g.home] ?? 1500, ratings[g.away] ?? 1500)
				return { week: g.week, opp: home ? g.away : g.home, home, chance: home ? pHome : 1 - pHome }
			})
		const o = odds?.now.teams[r.abbr]
		return {
			...r,
			nick: teamInfo(r.team).nick,
			note: latest.rows.find((x) => x.team === r.team)?.note ?? null,
			ratingChange: (ratings[r.abbr] ?? 1500) - prev,
			rankHistory: Array.from(mathRanks.keys()).map((w) => ({ week: w, me: myRankIn(w), math: mathRanks.get(w)?.get(r.abbr) as number })),
			results,
			upcoming,
			record: o?.record ?? results.reduce((acc, g) => ({ w: acc.w + (g.result === "W" ? 1 : 0), l: acc.l + (g.result === "L" ? 1 : 0), t: acc.t + (g.result === "T" ? 1 : 0) }), { w: 0, l: 0, t: 0 }),
			odds: o
				? {
						playoffs: o.playoffs,
						division: o.division,
						topSeed: o.topSeed,
						projWins: o.projWins,
						sos: o.sos,
						sosRank: sos[r.abbr] ?? null,
						remaining: o.remaining,
						winsDist: o.winsDist,
						history: Object.keys(odds?.history ?? {})
							.map(Number)
							.sort((a, b) => a - b)
							.map((w) => ({ week: w, playoffs: odds?.history[w]?.[r.abbr] ?? 0 })),
				  }
				: null,
		}
	})

	return { week, teams, card, takes: hotTakes(rows, HOT), hasOdds: odds != null, sims: odds?.now.sims ?? 0 }
}
