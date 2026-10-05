// Everything the Blogger vs. the Math page shows, worked out in one place from three inputs: the blogger's
// boards, the season's games (played and still to play) and the week to look at. Pure apart from the
// simulation's cost, which `buildOdds` isolates so the page can cache it.

import { teamInfo } from "../nfl"
import type { RankingsWeek } from "../rankings"
import { type MathRow, type Scorecard, compareBoard, gradeBoards, hotTakes, ratingRanks } from "./compare"
import type { FinalGame, Ratings } from "./elo"
import type { Underlying } from "./efficiency"
import { type Model, rateSeason } from "./model"
import { type SeasonGame, type SimResult, expectedMargin, simulateSeason, sosRanks, winChance } from "./season"

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
		.map((g) => ({ week: g.week, home: g.home, away: g.away, homeScore: g.homeScore as number, awayScore: g.awayScore as number, edge: g.edge }))
}

export type OddsBundle = {
	/** The simulation as of the chosen week. */
	now: SimResult
	/** Playoff odds after each earlier week, 0..1, keyed by week then team. */
	history: Record<number, Record<string, number>>
}

/** What the same season looks like on results alone: the comparison the page shows beside the full model. */
export type PlainOdds = Record<string, { playoffs: number; division: number; projWins: number }>

export function plainOdds(games: SeasonGame[], week: number): PlainOdds {
	const rated = rateSeason(finals(games, week), {})
	const sim = simulateSeason(asOf(games, week), rated.at(week), { sims: MAIN_SIMS })
	return Object.fromEntries(Object.entries(sim.teams).map(([a, t]) => [a, { playoffs: t.playoffs, division: t.division, projWins: t.projWins }]))
}

/** The expensive part: 10,000 simulated seasons for the week, and a lighter one for each earlier week. */
export function buildOdds(games: SeasonGame[], week: number, model: Model = {}): OddsBundle {
	const rated = rateSeason(finals(games, week), model)
	const now = simulateSeason(asOf(games, week), rated.at(week), { sims: MAIN_SIMS })
	const history: Record<number, Record<string, number>> = {}
	for (let w = 1; w < week; w++) {
		if (!rated.run.byWeek[w]) continue
		const sim = simulateSeason(asOf(games, w), rated.at(w), { sims: HISTORY_SIMS })
		history[w] = Object.fromEntries(Object.entries(sim.teams).map(([a, t]) => [a, t.playoffs]))
	}
	history[week] = Object.fromEntries(Object.entries(now.teams).map(([a, t]) => [a, t.playoffs]))
	return { now, history }
}

export type TeamResult = { week: number; opp: string; home: boolean; mine: number; theirs: number; result: "W" | "L" | "T"; shift: number }
export type TeamUpcoming = { week: number; opp: string; home: boolean; chance: number }

/** One game still to play, as the math sees it. */
export type SlateGame = {
	/** `w5-NE-LV`: the week, then away and home, enough to name the game in a vote. */
	key: string
	week: number
	home: string
	away: string
	/** ISO kickoff, when known. */
	kickoff: string | null
	/** Chance the home team wins, rest and travel included. */
	homeChance: number
	/** Expected home margin in points (negative: the visitor is favored). */
	homeMargin: number
	/** The team on top of my board, or null if either team isn't ranked. */
	bloggerPick: string | null
	/** The favorite on the math's numbers. */
	mathPick: string
	/** True when my board and the math pick different teams. */
	split: boolean
}

export type TeamDetail = MathRow & {
	nick: string
	note: string | null
	/** Math rating change from the previous week (0 in week 1). */
	ratingChange: number
	/** Each week's rank, mine and the math's; null where I had no board. */
	rankHistory: { week: number; me: number | null; math: number }[]
	results: TeamResult[]
	upcoming: TeamUpcoming[]
	/** Box-score view of the team (null until enough box scores are in). */
	under: Underlying | null
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
		/** The same three numbers from results alone, when the page is showing the fuller model. */
		plain: { playoffs: number; division: number; projWins: number } | null
	} | null
}

export type MathReport = {
	week: number
	teams: TeamDetail[]
	card: Scorecard
	takes: MathRow[]
	/** Games still to play from the chosen week and the one after it, soonest first. */
	slate: SlateGame[]
	/** What the model leaned on, for the "how it works" note. */
	basis: { prior: boolean; boxes: number; situational: boolean }
	hasOdds: boolean
	sims: number
}

/**
 * The report for `week` (one of the boards' weeks). `odds` is null when the schedule isn't complete, in which
 * case the comparison still works and the playoff numbers are simply left out.
 */
export function buildReport(boards: RankingsWeek[], games: SeasonGame[], week: number, odds: OddsBundle | null, model: Model = {}, plain: PlainOdds | null = null): MathReport {
	const shown = boards.filter((b) => b.week <= week)
	const latest = shown[shown.length - 1]
	const all = finals(games, week)
	const rated = rateSeason(all, model)
	const run = rated.run
	const ratings: Ratings = rated.at(week)
	const under = rated.under(week)
	const byWeek: Record<number, Ratings> = {}
	for (const w of Object.keys(run.byWeek).map(Number)) byWeek[w] = rated.at(w)
	const rows = compareBoard(latest, ratings)
	const card = gradeBoards(shown, all, byWeek)
	const names = latest.rows.map((r) => r.team)
	const mathRanks = new Map<number, Map<string, number>>()
	for (let w = 1; w <= week; w++) if (byWeek[w]) mathRanks.set(w, ratingRanks(byWeek[w], names))
	const sos = odds ? sosRanks(odds.now) : {}
	const board = asOf(games, week)

	const teams: TeamDetail[] = rows.map((r) => {
		const myRankIn = (w: number) => shown.find((b) => b.week === w)?.rows.find((x) => x.team === r.team)?.rank ?? null
		const prev = byWeek[week - 1]?.[r.abbr] ?? model.prior?.[r.abbr] ?? 1500
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
				const pHome = winChance(ratings[g.home] ?? 1500, ratings[g.away] ?? 1500, g.edge ?? 0)
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
			under: under[r.abbr] ?? null,
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
						plain: plain?.[r.abbr] ?? null,
				  }
				: null,
		}
	})

	const myRank = new Map(latest.rows.map((x) => [teamInfo(x.team).abbr, x.rank]))
	const slate: SlateGame[] = board
		.filter((g) => g.homeScore == null && g.week <= week + 1)
		.map((g): SlateGame => {
			const rh = ratings[g.home] ?? 1500
			const ra = ratings[g.away] ?? 1500
			const homeChance = winChance(rh, ra, g.edge ?? 0)
			const a = myRank.get(g.away)
			const h = myRank.get(g.home)
			const bloggerPick = a != null && h != null && a !== h ? (h < a ? g.home : g.away) : null
			const mathPick = homeChance >= 0.5 ? g.home : g.away
			return {
				key: `w${g.week}-${g.away}-${g.home}`,
				week: g.week,
				home: g.home,
				away: g.away,
				kickoff: g.kickoff ?? null,
				homeChance,
				homeMargin: expectedMargin(rh, ra, g.edge ?? 0),
				bloggerPick,
				mathPick,
				split: bloggerPick != null && bloggerPick !== mathPick,
			}
		})
		.sort((x, y) => x.week - y.week || (x.kickoff ?? "").localeCompare(y.kickoff ?? "") || x.key.localeCompare(y.key))

	return {
		week,
		teams,
		card,
		takes: hotTakes(rows, HOT),
		slate,
		basis: { prior: model.prior != null, boxes: Object.keys(under).length > 0 ? (model.boxes ?? []).filter((b) => b.week <= week).length : 0, situational: games.some((g) => g.edge != null) },
		hasOdds: odds != null,
		sims: odds?.now.sims ?? 0,
	}
}
