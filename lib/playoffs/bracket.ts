// The playoff bracket for one conference, from its seeds. The home team is the better seed.

import type { Conference } from "./types"

export type BracketGame = {
	round: "wild-card"
	homeSeed: number
	awaySeed: number
	home: string
	away: string
}

export type Bracket = {
	conference: Conference
	/** The teams that skip the first round, best seed first. */
	byes: { seed: number; team: string }[]
	/** The first-round games, e.g. 2 vs 7, 3 vs 6, 4 vs 5. */
	wildCard: BracketGame[]
}

/**
 * `seeds` lists the playoff teams, seed 1 first. With seven teams and one bye: the 1 seed rests, and the first round is
 * 2 hosts 7, 3 hosts 6 and 4 hosts 5. Fewer teams than the format needs give a shorter bracket.
 */
export function buildBracket(conference: Conference, seeds: readonly string[], byes = 1): Bracket {
	const byeTeams = seeds.slice(0, byes).map((team, i) => ({ seed: i + 1, team }))
	const playing = seeds.slice(byes)
	const wildCard: BracketGame[] = []
	for (let i = 0; i < Math.floor(playing.length / 2); i++) {
		const hi = i
		const lo = playing.length - 1 - i
		wildCard.push({ round: "wild-card", homeSeed: byes + hi + 1, awaySeed: byes + lo + 1, home: playing[hi], away: playing[lo] })
	}
	return { conference, byes: byeTeams, wildCard }
}

/**
 * The next round after the first: the NFL reseeds, so the best remaining seed hosts the worst, the next best hosts
 * the next worst, and so on. `survivors` are seed numbers, in any order. Pairs are [home, away].
 */
export function reseed(survivors: readonly number[]): [number, number][] {
	const sorted = [...survivors].sort((a, b) => a - b)
	const pairs: [number, number][] = []
	for (let i = 0; i < Math.floor(sorted.length / 2); i++) pairs.push([sorted[i], sorted[sorted.length - 1 - i]])
	return pairs
}
