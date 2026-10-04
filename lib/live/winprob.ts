// An estimate of the home team's chance of winning, from the score, time left, who has the ball,
// where, and the pregame spread. This is the classic Brownian-motion model: the final margin is
// normally distributed around (lead + what's left of the pregame edge + the value of the ball),
// with a spread that shrinks as the clock runs down. It is an estimate, not ESPN's or nflfastR's
// number, and the page says so. Pure, so it can be tested.

export const GAME_SECONDS = 3600
/** Standard deviation of an NFL game's final margin, in points. */
const SIGMA = 13.5

/** Expected points for the team with the ball, by yards from the goal it is attacking. Piecewise linear. */
const EP_TABLE: [number, number][] = [
	[99, -0.5],
	[90, -0.1],
	[80, 0.3],
	[75, 0.5],
	[65, 1.0],
	[50, 1.8],
	[35, 2.7],
	[20, 3.7],
	[10, 4.6],
	[5, 5.4],
	[1, 6.1],
]

export function expectedPoints(yardsToGoal: number): number {
	const y = Math.min(99, Math.max(1, yardsToGoal))
	for (let i = 0; i < EP_TABLE.length - 1; i++) {
		const [y0, e0] = EP_TABLE[i]
		const [y1, e1] = EP_TABLE[i + 1]
		if (y <= y0 && y >= y1) return e0 + ((e1 - e0) * (y0 - y)) / (y0 - y1)
	}
	return 0
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26). */
export function normalCdf(x: number): number {
	const sign = x < 0 ? -1 : 1
	const z = Math.abs(x) / Math.SQRT2
	const t = 1 / (1 + 0.3275911 * z)
	const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
	return 0.5 * (1 + sign * y)
}

export type WpInput = {
	/** Home score minus away score. */
	lead: number
	/** Seconds of regulation left. In overtime pass 0 and an overtime flag. */
	secondsLeft: number
	/** Which side has the ball, from the home team's view: 1 home, -1 away, 0 nobody (kickoff, between plays). */
	ball: 1 | -1 | 0
	/** Yards from the goal the team with the ball is attacking. */
	yardsToGoal?: number | null
	down?: number | null
	/** Home team's pregame spread: negative when the home team is the favorite. Null if unknown. */
	homeSpread?: number | null
	overtime?: boolean
}

const DOWN_FACTOR = [1, 1, 0.95, 0.82, 0.65]

/** The home team's chance of winning, from 0 to 1. */
export function homeWinProbability(i: WpInput): number {
	const left = Math.max(0, Math.min(GAME_SECONDS, i.secondsLeft))
	const frac = left / GAME_SECONDS

	// Overtime: close to a coin flip around the lead, with a small edge to the team with the ball.
	if (i.overtime) {
		const edge = i.ball * 0.12
		if (i.lead > 0) return 0.97
		if (i.lead < 0) return 0.03
		return Math.min(0.97, Math.max(0.03, 0.5 + edge))
	}

	// What's left of the pregame edge (a spread of -3 means the home team is 3 better over a full game).
	const prior = i.homeSpread != null ? -i.homeSpread * frac : 0
	// The ball is worth more early; with seconds left it hardly matters unless it can score.
	let ballValue = 0
	if (i.ball !== 0 && i.yardsToGoal != null) {
		const ep = expectedPoints(i.yardsToGoal) * (DOWN_FACTOR[Math.min(4, Math.max(1, i.down ?? 1))] ?? 1)
		const timeWeight = Math.min(1, left / 90)
		ballValue = i.ball * ep * timeWeight
	}
	const mean = i.lead + prior + ballValue
	const sd = SIGMA * Math.sqrt(frac) + 0.6
	return Math.min(0.999, Math.max(0.001, normalCdf(mean / sd)))
}

/** Seconds of regulation left for a period (1 to 4) and the seconds left in it. Overtime returns 0. */
export function secondsLeftIn(period: number, clockSeconds: number | null): number {
	if (period > 4) return 0
	const inPeriod = clockSeconds ?? 900
	return (4 - period) * 900 + Math.max(0, Math.min(900, inPeriod))
}

/** Seconds of game time elapsed, counting overtime periods as 10 minutes after 60:00. */
export function elapsedSeconds(period: number, clockSeconds: number | null): number {
	if (period > 4) return GAME_SECONDS + (period - 5) * 600 + (600 - Math.max(0, Math.min(600, clockSeconds ?? 600)))
	return GAME_SECONDS - secondsLeftIn(period, clockSeconds)
}
