// "The Math": an Elo rating for every team, built from this season's final scores. Pure, so it can be
// tested and re-derived at any time. Teams start from `start` (last season's ratings pulled back toward
// the middle, see `carryOver`) or, with none, all level at 1500, so early in the year the ratings are noisy
// and mostly reflect who has won and by how much; they settle as games pile up.

export type FinalGame = {
	week: number
	/** Site team abbreviations. */
	home: string
	away: string
	homeScore: number
	awayScore: number
	/** Elo points added to the home side for rest and travel (see situation.ts). Left out means none. */
	edge?: number
}

export const START_RATING = 1500
/** How far one result can move a rating before the margin-of-victory scaling. */
export const K = 20
/** Elo points of home-field advantage (about 2 points on the scoreboard). */
export const HOME_FIELD = 48

export type Ratings = Record<string, number>

/**
 * Share of last season's distance from average that carries into the new one. FiveThirtyEight used two thirds;
 * this is half, so this season's games take over a little sooner. A back-test on 2025 could not tell 0.5 from
 * 0.67 (log loss 0.6500 against 0.6495), so the choice is about trust in the new season, not accuracy.
 */
export const CARRY_OVER = 0.5

/** Last season's final ratings, pulled back toward the middle: rosters turn over and results are partly luck. */
export function carryOver(last: Ratings, keep: number = CARRY_OVER): Ratings {
	return Object.fromEntries(Object.entries(last).map(([team, r]) => [team, START_RATING + keep * (r - START_RATING)]))
}

/** Chance the side with `diff` more Elo points wins. */
export function expected(diff: number): number {
	return 1 / (1 + Math.pow(10, -diff / 400))
}

/** Chance the home team wins, from the two ratings. */
export function homeWinProbability(home: number, away: number): number {
	return expected(home + HOME_FIELD - away)
}

/**
 * FiveThirtyEight's margin-of-victory multiplier: a blowout moves ratings more than a one-score game, but
 * less when the winner was already the much better team, so ratings don't run away.
 */
function marginMultiplier(margin: number, winnerEloEdge: number): number {
	return Math.pow(Math.abs(margin) + 3, 0.8) / (7.5 + 0.006 * winnerEloEdge)
}

/** One game's effect on the ratings: the home team's rating moved by `shiftHome`, the away team's by minus that. */
export type EloShift = { week: number; home: string; away: string; homeScore: number; awayScore: number; shiftHome: number }

export type EloRun = {
	/** Every game in the order it was played, with how far it moved the ratings. */
	log: EloShift[]
	/** Ratings after the last game. */
	ratings: Ratings
	/** Ratings after each week's games, keyed by week number. */
	byWeek: Record<number, Ratings>
	/** Games each team has played. */
	played: Record<string, number>
}

/** Plays the games in week order and returns the ratings after each week. Teams not in `start` begin at 1500. */
export function runElo(games: FinalGame[], start: Ratings = {}): EloRun {
	const ratings: Ratings = { ...start }
	const played: Record<string, number> = {}
	const byWeek: Record<number, Ratings> = {}
	const log: EloShift[] = []
	const get = (t: string) => ratings[t] ?? START_RATING

	const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b)
	for (const week of weeks) {
		for (const g of games.filter((x) => x.week === week)) {
			const home = get(g.home)
			const away = get(g.away)
			const edgeHome = home + HOME_FIELD + (g.edge ?? 0) - away
			const pHome = expected(edgeHome)
			const margin = g.homeScore - g.awayScore
			const actualHome = margin > 0 ? 1 : margin < 0 ? 0 : 0.5
			const winnerEdge = margin >= 0 ? edgeHome : -edgeHome
			const shift = K * marginMultiplier(margin, winnerEdge) * (actualHome - pHome)
			ratings[g.home] = home + shift
			ratings[g.away] = away - shift
			log.push({ week, home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore, shiftHome: shift })
			played[g.home] = (played[g.home] ?? 0) + 1
			played[g.away] = (played[g.away] ?? 0) + 1
		}
		byWeek[week] = { ...ratings }
	}
	return { log, ratings: { ...ratings }, byWeek, played }
}
