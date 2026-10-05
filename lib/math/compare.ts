// Puts the blogger's power rankings next to the Elo ratings: where the two disagree, and which has been
// right about the games that followed. Pure functions of the board and the ratings.

import { teamInfo } from "../nfl"
import type { RankingsWeek } from "../rankings"
import type { FinalGame, Ratings } from "./elo"

export type MathRow = {
	team: string
	abbr: string
	/** My rank this week. */
	blogger: number
	/** The math's rank among the same teams. */
	math: number
	rating: number
	/** Positive: I have the team higher than the math does. Negative: lower. */
	gap: number
}

/** Rank of each team by rating, best first. Equal ratings keep the order of `teams`. */
export function ratingRanks(ratings: Ratings, teams: string[]): Map<string, number> {
	const abbrs = teams.map((t) => teamInfo(t).abbr)
	const order = abbrs
		.map((a, i) => ({ a, i, r: ratings[a] ?? 1500 }))
		.sort((x, y) => y.r - x.r || x.i - y.i)
	return new Map(order.map((o, i) => [o.a, i + 1]))
}

/** One row per team on the blogger's board, with the math's rank beside it. Sorted by my rank. */
export function compareBoard(board: RankingsWeek, ratings: Ratings): MathRow[] {
	const ranks = ratingRanks(ratings, board.rows.map((r) => r.team))
	return board.rows
		.map((r) => {
			const abbr = teamInfo(r.team).abbr
			const math = ranks.get(abbr) as number
			return { team: r.team, abbr, blogger: r.rank, math, rating: ratings[abbr] ?? 1500, gap: math - r.rank }
		})
		.sort((a, b) => a.blogger - b.blogger)
}

/** Disagreements of at least `min` spots, the biggest first. */
export function hotTakes(rows: MathRow[], min = 6): MathRow[] {
	return rows.filter((r) => Math.abs(r.gap) >= min).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.blogger - b.blogger)
}

export type GradedGame = {
	week: number
	home: string
	away: string
	homeScore: number
	awayScore: number
	/** Abbreviations of the team each side picked (the higher-ranked one). */
	bloggerPick: string
	mathPick: string
	winner: string
}

export type Tally = { right: number; games: number }

export type Scorecard = {
	/** Every game both could call. */
	blogger: Tally
	math: Tally
	/** Only the games where we picked different teams. */
	split: { games: number; blogger: number; math: number }
	games: GradedGame[]
}

/**
 * Grades each week's rankings on the next week's games, using only what was known when the rankings came
 * out. A pick is simply the higher-ranked team (no home field, no spread) for both sides, so the match-up
 * is fair. Tied games are skipped.
 */
export function gradeBoards(boards: RankingsWeek[], games: FinalGame[], byWeek: Record<number, Ratings>): Scorecard {
	const out: GradedGame[] = []
	for (const board of boards) {
		const ratings = byWeek[board.week]
		if (!ratings) continue
		const rank = new Map(board.rows.map((r) => [teamInfo(r.team).abbr, r.rank]))
		for (const g of games.filter((x) => x.week === board.week + 1)) {
			const ra = rank.get(g.away)
			const rh = rank.get(g.home)
			if (ra == null || rh == null || g.homeScore === g.awayScore) continue
			const homeRating = ratings[g.home] ?? 1500
			const awayRating = ratings[g.away] ?? 1500
			if (homeRating === awayRating) continue
			out.push({
				week: g.week,
				home: g.home,
				away: g.away,
				homeScore: g.homeScore,
				awayScore: g.awayScore,
				bloggerPick: rh < ra ? g.home : g.away,
				mathPick: homeRating > awayRating ? g.home : g.away,
				winner: g.homeScore > g.awayScore ? g.home : g.away,
			})
		}
	}
	const split = out.filter((g) => g.bloggerPick !== g.mathPick)
	return {
		blogger: { right: out.filter((g) => g.bloggerPick === g.winner).length, games: out.length },
		math: { right: out.filter((g) => g.mathPick === g.winner).length, games: out.length },
		split: { games: split.length, blogger: split.filter((g) => g.bloggerPick === g.winner).length, math: split.filter((g) => g.mathPick === g.winner).length },
		games: out,
	}
}
