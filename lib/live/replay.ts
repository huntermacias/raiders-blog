// Replaying a finished game: the same game, shown as it stood after the first `k` plays. Pure, so it can be tested. The page's field, score,
// win-probability line and play feed all read a LiveGame, so a replay is just a LiveGame cut short, with the score, clock and ball rewound.

import { allPlays } from "./series"
import type { LiveDrive, LiveGame, LivePlay } from "./types"

/** How long one play is on screen at 1x. */
export const PLAY_MS = 800
export const SPEEDS = [1, 2, 4, 8] as const

/** The game after its first `k` plays. At or past the last play it is the finished game itself. */
export function gameAtPlay(game: LiveGame, k: number): LiveGame {
	const plays = allPlays(game)
	if (k >= plays.length) return game
	const n = Math.max(0, Math.floor(k))
	const shown = plays.slice(0, n)
	const last = shown[shown.length - 1] ?? null
	const next = plays[n]
	const ids = new Set(shown.map((p) => p.id))

	const drives: LiveDrive[] = game.drives
		.map((d) => ({ d, ps: d.plays.filter((p) => ids.has(p.id)) }))
		.filter((x) => x.ps.length > 0)
		.map(({ d, ps }) =>
			// A drive that is still going has no result yet, and its summary would give away how it ends.
			ps.length === d.plays.length ? d : { ...d, plays: ps, result: "", yards: ps.reduce((a, p) => a + p.yards, 0), description: `${ps.length} play${ps.length === 1 ? "" : "s"}` },
		)

	const atSnap = next && next.down != null && next.distance != null && next.from != null
	return {
		...game,
		drives,
		stats: [],
		info: {
			...game.info,
			state: "in",
			detail: "Replay",
			period: last?.period ?? 1,
			clockSeconds: last ? last.clockSeconds : 900,
			away: { ...game.info.away, score: last?.away ?? 0 },
			home: { ...game.info.home, score: last?.home ?? 0 },
			possession: next?.team ?? null,
			situation: atSnap ? { down: next.down, distance: next.distance, yardsToGoal: 100 - (next.from as number), text: null, redZone: false } : null,
		},
	}
}

/** Where the win-probability line stands after `k` plays: an index into the full series (kickoff, one sample per timed play, then Final). */
export function seriesIndexAt(plays: readonly LivePlay[], k: number, seriesLength: number): number {
	if (seriesLength <= 0) return 0
	if (k >= plays.length) return seriesLength - 1
	let n = 0
	for (let i = 0; i < k; i++) if (plays[i].period > 0) n++
	return Math.min(n, seriesLength - 1)
}

/** The play counts at which a score has just happened, for the markers on the scrubber. */
export function scoreStops(plays: readonly LivePlay[]): number[] {
	const out: number[] = []
	plays.forEach((p, i) => {
		if (p.scoring) out.push(i + 1)
	})
	return out
}

/** The next score after `k` plays, or null at the end. */
export function nextScore(plays: readonly LivePlay[], k: number): number | null {
	return scoreStops(plays).find((s) => s > k) ?? null
}
