// Things worked out from a LiveGame: the win-probability line, the swings, and the current number.
// Pure, so it can be tested.

import { elapsedSeconds, GAME_SECONDS, homeWinProbability, secondsLeftIn } from "./winprob"
import type { LiveGame, LiveGameInfo, LivePlay, WpSample } from "./types"

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** The home team's chance of winning right now: exact once the game is over. */
export function currentHomeWp(info: LiveGameInfo): number {
	if (info.state === "post") return info.home.score > info.away.score ? 1 : info.home.score < info.away.score ? 0 : 0.5
	const spread = info.odds?.homeSpread ?? null
	if (info.state === "pre") return homeWinProbability({ lead: 0, secondsLeft: GAME_SECONDS, ball: 0, homeSpread: spread })
	const s = info.situation
	const ball = info.possession === info.home.abbr ? 1 : info.possession === info.away.abbr ? -1 : 0
	return homeWinProbability({
		lead: info.home.score - info.away.score,
		secondsLeft: secondsLeftIn(info.period, info.clockSeconds),
		ball,
		yardsToGoal: s?.yardsToGoal ?? null,
		down: s?.down ?? null,
		homeSpread: spread,
		overtime: info.period > 4,
	})
}

/** Everything the game has done, flattened and in order. */
export function allPlays(game: LiveGame): LivePlay[] {
	return game.drives.flatMap((d) => d.plays).sort((a, b) => a.seq - b.seq)
}

/** Win probability after each play, plus a starting point at kickoff. */
export function wpSeries(game: LiveGame): WpSample[] {
	const { info } = game
	const spread = info.odds?.homeSpread ?? null
	const out: WpSample[] = [
		{ el: 0, home: homeWinProbability({ lead: 0, secondsLeft: GAME_SECONDS, ball: 0, homeSpread: spread }), away: 0, homeScore: 0, text: "Kickoff" },
	]
	let lastEl = 0
	// Who had the ball after the previous play, so a penalty that doesn't say where the ball is
	// doesn't hand the game a free swing by dropping possession to neutral.
	let prevBall: 0 | 1 | -1 = 0
	for (const p of allPlays(game)) {
		if (p.period <= 0) continue
		const el = Math.max(lastEl, elapsedSeconds(p.period, p.clockSeconds))
		lastEl = el
		const snap = p.kind === "run" || p.kind === "pass" || p.kind === "sack" || p.kind === "penalty" || p.penalty
		const ongoing = snap && !p.scoring && !p.turnover && p.team && p.to != null
		const carried = !ongoing && p.penalty && !p.scoring && !p.turnover
		const ball: 0 | 1 | -1 = ongoing ? (p.team === info.home.abbr ? 1 : -1) : carried ? prevBall : 0
		prevBall = ball
		out.push({
			el,
			home: homeWinProbability({
				lead: p.home - p.away,
				secondsLeft: secondsLeftIn(p.period, p.clockSeconds),
				ball,
				yardsToGoal: ongoing && p.to != null ? 100 - p.to : null,
				down: 1,
				homeSpread: spread,
				overtime: p.period > 4,
			}),
			away: p.away,
			homeScore: p.home,
			text: p.text,
		})
	}
	// A finished game ends at exactly 0, 50 or 100 percent.
	if (info.state === "post" && out.length > 1) {
		const last = out[out.length - 1]
		out.push({ el: Math.max(last.el, GAME_SECONDS), home: currentHomeWp(info), away: info.away.score, homeScore: info.home.score, text: "Final" })
	}
	return out
}

export type Swing = { sample: WpSample; delta: number }

/** The plays that moved the win probability most, biggest first. */
export function biggestSwings(series: WpSample[], count = 3): Swing[] {
	const swings: Swing[] = []
	for (let i = 1; i < series.length; i++) swings.push({ sample: series[i], delta: series[i].home - series[i - 1].home })
	return swings.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, count)
}

/** The play feed: newest first, optionally only the plays worth highlighting. */
export function feedOf(game: LiveGame, onlyBig: boolean): LivePlay[] {
	const plays = allPlays(game)
	return (onlyBig ? plays.filter((p) => p.big) : plays).slice().reverse()
}

/** The drive in progress, or the last one played. */
export function currentDrive(game: LiveGame) {
	return game.drives[game.drives.length - 1] ?? null
}

export { clamp01 }
