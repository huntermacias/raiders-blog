// Plays out the rest of the season thousands of times from the Elo ratings: who wins each remaining game,
// who ends up where in the standings, who makes the playoffs. Pure and seeded, so the numbers don't jitter
// on a refresh and every result can be checked.
//
// Deliberately simple, and the page says so: ratings don't change during a simulated season, injuries and
// rest are ignored, and the tiebreaker is win percentage and then point differential (the league's own
// order of head-to-head, division and conference records is not reproduced).

import { TEAMS } from "../nfl"
import { normalCdf } from "../live/winprob"
import { HOME_FIELD, type Ratings, START_RATING } from "./elo"

export type SeasonGame = {
	week: number
	/** Site team abbreviations. */
	home: string
	away: string
	/** Null until the game is final. */
	homeScore: number | null
	awayScore: number | null
}

/** 25 Elo points are about one point on the scoreboard. */
export const ELO_PER_POINT = 25
/** Standard deviation of an NFL game's final margin around its expected margin. */
export const MARGIN_SD = 13.5

/** Expected home margin in points from the two ratings, home field included. */
export function expectedMargin(home: number, away: number): number {
	return (home + HOME_FIELD - away) / ELO_PER_POINT
}

/** Chance the home team wins, on the same margin model the simulation uses. */
export function winChance(home: number, away: number): number {
	return normalCdf(expectedMargin(home, away) / MARGIN_SD)
}

export type TeamOdds = {
	abbr: string
	/** Actual record so far. */
	record: { w: number; l: number; t: number }
	/** Average final wins over the simulations (a tie counts half). */
	projWins: number
	/** Chance of making the playoffs, winning the division, and getting the No. 1 seed, each 0..1. */
	playoffs: number
	division: number
	topSeed: number
	/** Chance of finishing with exactly k wins, k = 0..17. */
	winsDist: number[]
	/** Average rating of the remaining opponents, and how many games are left. */
	sos: number | null
	remaining: number
}

export type SimResult = {
	sims: number
	teams: Record<string, TeamOdds>
}

/** A small, fast seeded generator so a given season always simulates to the same numbers. */
export function mulberry32(seed: number) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const ABBRS = TEAMS.map((t) => t.abbr)
const INDEX = new Map(ABBRS.map((a, i) => [a, i]))
const CONF = TEAMS.map((t) => t.conference)
const DIVISIONS = Array.from(new Set(TEAMS.map((t) => t.division))).map((d) => ABBRS.filter((_, i) => TEAMS[i].division === d).map((a) => INDEX.get(a) as number))

export type SimOptions = { sims?: number; seed?: number }

/**
 * Simulates the games without a score `sims` times. Games with a score are results and are never replayed.
 * Teams missing from `ratings` are treated as average.
 */
export function simulateSeason(games: SeasonGame[], ratings: Ratings, opts: SimOptions = {}): SimResult {
	const sims = opts.sims ?? 10_000
	const rand = mulberry32(opts.seed ?? 2026)
	const n = ABBRS.length
	const rating = ABBRS.map((a) => ratings[a] ?? START_RATING)

	// What has happened.
	const w0 = new Array(n).fill(0)
	const l0 = new Array(n).fill(0)
	const t0 = new Array(n).fill(0)
	const pd0 = new Array(n).fill(0)
	const open: { h: number; a: number; edge: number }[] = []
	for (const g of games) {
		const h = INDEX.get(g.home)
		const a = INDEX.get(g.away)
		if (h == null || a == null) continue
		if (g.homeScore != null && g.awayScore != null) {
			const m = g.homeScore - g.awayScore
			pd0[h] += m
			pd0[a] -= m
			if (m > 0) {
				w0[h]++
				l0[a]++
			} else if (m < 0) {
				w0[a]++
				l0[h]++
			} else {
				t0[h]++
				t0[a]++
			}
		} else open.push({ h, a, edge: expectedMargin(rating[h], rating[a]) })
	}
	const base = w0.map((w, i) => w + t0[i] / 2)

	const playoffs = new Array(n).fill(0)
	const division = new Array(n).fill(0)
	const topSeed = new Array(n).fill(0)
	const winsSum = new Array(n).fill(0)
	const dist: number[][] = Array.from({ length: n }, () => new Array(19).fill(0))

	const wins = new Array(n).fill(0)
	const pd = new Array(n).fill(0)
	let spare: number | null = null
	const randn = () => {
		if (spare != null) {
			const v = spare
			spare = null
			return v
		}
		const u = Math.max(rand(), 1e-12)
		const r = Math.sqrt(-2 * Math.log(u))
		const th = 2 * Math.PI * rand()
		spare = r * Math.sin(th)
		return r * Math.cos(th)
	}
	const better = (x: number, y: number) => wins[y] - wins[x] || pd[y] - pd[x] || x - y

	for (let s = 0; s < sims; s++) {
		for (let i = 0; i < n; i++) {
			wins[i] = base[i]
			pd[i] = pd0[i]
		}
		for (const g of open) {
			const margin = g.edge + MARGIN_SD * randn()
			if (margin > 0) wins[g.h]++
			else wins[g.a]++
			pd[g.h] += margin
			pd[g.a] -= margin
		}
		const champs: number[][] = [[], []]
		const rest: number[][] = [[], []]
		for (const d of DIVISIONS) {
			const order = d.slice().sort(better)
			const c = CONF[order[0]] === "AFC" ? 0 : 1
			champs[c].push(order[0])
			rest[c].push(...order.slice(1))
			division[order[0]]++
		}
		for (let c = 0; c < 2; c++) {
			const seeds = champs[c].sort(better)
			topSeed[seeds[0]]++
			for (const t of seeds) playoffs[t]++
			for (const t of rest[c].sort(better).slice(0, 3)) playoffs[t]++
		}
		for (let i = 0; i < n; i++) {
			winsSum[i] += wins[i]
			dist[i][Math.min(18, Math.floor(wins[i]))]++
		}
	}

	// Strength of the remaining schedule.
	const oppSum = new Array(n).fill(0)
	const oppCount = new Array(n).fill(0)
	for (const g of open) {
		oppSum[g.h] += rating[g.a]
		oppCount[g.h]++
		oppSum[g.a] += rating[g.h]
		oppCount[g.a]++
	}

	const teams: Record<string, TeamOdds> = {}
	ABBRS.forEach((abbr, i) => {
		teams[abbr] = {
			abbr,
			record: { w: w0[i], l: l0[i], t: t0[i] },
			projWins: winsSum[i] / sims,
			playoffs: playoffs[i] / sims,
			division: division[i] / sims,
			topSeed: topSeed[i] / sims,
			winsDist: dist[i].slice(0, 18).map((c) => c / sims),
			sos: oppCount[i] ? oppSum[i] / oppCount[i] : null,
			remaining: oppCount[i],
		}
	})
	return { sims, teams }
}

/** Order from 1 (hardest remaining schedule) down, by average opponent rating. Teams with no games left are left out. */
export function sosRanks(result: SimResult): Record<string, number> {
	const list = Object.values(result.teams)
		.filter((t) => t.sos != null)
		.sort((a, b) => (b.sos as number) - (a.sos as number) || a.abbr.localeCompare(b.abbr))
	return Object.fromEntries(list.map((t, i) => [t.abbr, i + 1]))
}
