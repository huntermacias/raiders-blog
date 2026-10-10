// The simulation behind the Sunday Rooting Guide. It reuses the Playoff Machine's engine as it is: the same schedule, the same Elo win
// chances (ratingsFor / homeChance), the same random numbers (uniform) and the same official seeding and tiebreakers (buildSeason +
// seedConference). Nothing about seeding is written again here; this file only asks that engine a different question.
//
// The question: for every game still to play, how do the odds of a team making the playoffs, winning its division or taking the top
// seed change depending on who wins? One pass answers it for all 32 teams and all three goals at once:
//
//   - Play the rest of the season N times. In each, note which teams made the playoffs, won a division and took a conference's
//     top seed, and who won every game.
//   - A team's odds "if the home team wins game G" are the share of the seasons where the home team won G in which the team got
//     there. The same seasons answer every game, every team and every goal, so the cost does not grow with them.
//
// Keeping that stable and honest:
//   - Common random numbers. Every game's dice come from a hash of (simulation number, game position), the same hash the Playoff
//     Machine uses, so results are exactly repeatable and every comparison is made on the same simulated seasons. The first sims
//     here are the same seasons the Playoff Machine's page odds use.
//   - Exact when it can be. With a dozen games or fewer left, every way the games can end is added up, weighted by its chance: no
//     sampling error at all, which is what the last weeks of the season need.
//   - A big sample. Hundreds of thousands of team-goal-game answers come from the same 60,000 seasons, and every answer keeps its
//     sample size, so the guide can tell a real swing from noise.
//   - Paired runs for the small questions. A tie is too rare to wait for, so it is forced in a run on the same dice. "What did this
//     result do?" for a finished game is answered the same way, as the difference between two runs that share every other die.
//
// Pure and deterministic: no clock, no Math.random.

import { MIN_BUCKET, homeChance, ratingsFor, uniform } from "../playoffs/odds"
import { NFL_LEAGUE, buildSeason, type Season } from "../playoffs/season"
import { seedConference } from "../playoffs/standings"
import type { Conference, Game, League, Outcome } from "../playoffs/types"
import { GOALS, type Result } from "./types"

/** Bump when the model or what is stored changes, so every guide made before it is recognized as out of date. */
export const MODEL_VERSION = 1

export const ROOTING_SIMS = 60_000
/** At or below this many open games every ending is added up exactly instead of sampled. */
export const EXACT_MAX_OPEN = 12
export const TIE_SIMS = 3_000
export const SWING_SIMS = 3_000
export const HISTORY_SIMS = 4_000
export { MIN_BUCKET }

const CODE: readonly Outcome[] = ["H", "A", "T"]

export type Context = {
	league: League
	games: readonly Game[]
	teams: string[]
	teamIndex: Map<string, number>
	/** Entries in a per-(team, goal) list. */
	size: number
	open: readonly Game[]
	/** The model's chance the home team wins each open game. */
	chances: number[]
	conferences: Conference[]
}

export function makeContext(games: readonly Game[], league: League = NFL_LEAGUE): Context {
	const season = buildSeason(league, games, {})
	const ratings = ratingsFor(games)
	const teams = league.teams.map((t) => t.id)
	return {
		league,
		games,
		teams,
		teamIndex: new Map(teams.map((id, i) => [id, i])),
		size: teams.length * GOALS.length,
		open: season.open,
		chances: season.open.map((g) => homeChance(ratings, g)),
		conferences: Array.from(new Set(league.teams.map((t) => t.conference))).sort() as Conference[],
	}
}

/** Which teams reached each goal in one finished season: out[team * 3 + goal] is 1 or 0. */
export function goalFlags(ctx: Context, season: Season, out: Uint8Array): void {
	out.fill(0)
	for (const c of ctx.conferences) {
		const s = seedConference(season, c)
		s.seeds.forEach((id, k) => {
			const t = ctx.teamIndex.get(id) as number
			out[t * 3] = 1
			if (k < ctx.league.byes) out[t * 3 + 2] = 1
		})
		for (const id of s.winners) out[(ctx.teamIndex.get(id) as number) * 3 + 1] = 1
	}
}

type Forced = { index: number; code: 0 | 1 | 2 }
type Visit = (codes: Uint8Array, weight: number, flags: Uint8Array) => void

/**
 * Plays out the open games and hands every finished season to `visit` with its weight. By dice (`sims` seasons, weight 1 each)
 * or, with `exact`, over every combination of home and away winners weighted by its chance (the sum of the weights is 1).
 * A forced game gets the same result in every season.
 */
export function scenarios(ctx: Context, opts: { sims: number; exact: boolean; forced?: Forced; chances?: number[]; games?: readonly Game[] }, visit: Visit): number {
	const open = ctx.open
	const chances = opts.chances ?? ctx.chances
	const games = opts.games ?? ctx.games
	const m = open.length
	const preds: Record<string, Outcome> = {}
	const codes = new Uint8Array(m)
	const flags = new Uint8Array(ctx.size)
	let count = 0

	const play = (weight: number) => {
		for (let i = 0; i < m; i++) preds[open[i].id] = CODE[codes[i]]
		goalFlags(ctx, buildSeason(ctx.league, games, preds), flags)
		visit(codes, weight, flags)
		count++
	}

	if (opts.exact) {
		const free: number[] = []
		for (let i = 0; i < m; i++) {
			if (opts.forced && opts.forced.index === i) codes[i] = opts.forced.code
			else free.push(i)
		}
		const total = 2 ** free.length
		for (let mask = 0; mask < total; mask++) {
			let w = 1
			free.forEach((gi, b) => {
				const home = ((mask >> b) & 1) === 1
				codes[gi] = home ? 0 : 1
				w *= home ? chances[gi] : 1 - chances[gi]
			})
			play(w)
		}
		return count
	}

	for (let s = 0; s < opts.sims; s++) {
		for (let i = 0; i < m; i++) {
			codes[i] = opts.forced && opts.forced.index === i ? opts.forced.code : uniform(s, i) < chances[i] ? 0 : 1
		}
		play(1)
	}
	return count
}

export type Conditional = {
	sims: number
	exact: boolean
	/** Chance of each (team, goal) over all the seasons, 0 to 1. */
	baseline: number[]
	/** Per open game, in the order of ctx.open: sample size on each side and each (team, goal)'s chance given that side won. */
	games: { n: [number, number]; H: number[]; A: number[] }[]
}

/** The main pass: every open game against every team and goal. */
export function simulateConditional(ctx: Context, opts: { sims?: number; exactMax?: number } = {}): Conditional {
	const G = ctx.open.length
	const F = ctx.size
	const exact = G <= (opts.exactMax ?? EXACT_MAX_OPEN)
	const sims = exact ? 0 : opts.sims ?? ROOTING_SIMS
	const hits = new Float64Array(G * 2 * F)
	const wsum = new Float64Array(G * 2)
	const n = new Int32Array(G * 2)
	const base = new Float64Array(F)
	let total = 0
	const hot = new Int32Array(F)

	scenarios(ctx, { sims, exact }, (codes, w, flags) => {
		let h = 0
		for (let f = 0; f < F; f++) {
			if (flags[f]) {
				hot[h++] = f
				base[f] += w
			}
		}
		total += w
		for (let i = 0; i < G; i++) {
			const k = i * 2 + codes[i]
			wsum[k] += w
			n[k]++
			const off = k * F
			for (let j = 0; j < h; j++) hits[off + hot[j]] += w
		}
	})

	const given = (i: number, side: 0 | 1): number[] => {
		const k = i * 2 + side
		const out = new Array<number>(F).fill(0)
		if (wsum[k] > 0) for (let f = 0; f < F; f++) out[f] = hits[k * F + f] / wsum[k]
		return out
	}
	return {
		sims,
		exact,
		baseline: Array.from(base, (v) => (total > 0 ? v / total : 0)),
		games: ctx.open.map((_, i) => ({ n: [n[i * 2], n[i * 2 + 1]] as [number, number], H: given(i, 0), A: given(i, 1) })),
	}
}

/** Each (team, goal)'s chance if open game `index` ended in a tie, the rest played on the same dice. */
export function simulateTie(ctx: Context, index: number, opts: { sims?: number; exactMax?: number } = {}): number[] {
	const F = ctx.size
	const exact = ctx.open.length <= (opts.exactMax ?? EXACT_MAX_OPEN)
	const hits = new Float64Array(F)
	let total = 0
	scenarios(ctx, { sims: opts.sims ?? TIE_SIMS, exact, forced: { index, code: 2 } }, (_c, w, flags) => {
		total += w
		for (let f = 0; f < F; f++) if (flags[f]) hits[f] += w
	})
	return Array.from(hits, (v) => (total > 0 ? v / total : 0))
}

/** The chance of each (team, goal) over the open games as they stand: the baseline alone, for the snapshots. */
export function simulateBaseline(ctx: Context, opts: { sims?: number; exactMax?: number } = {}): number[] {
	const F = ctx.size
	const exact = ctx.open.length <= (opts.exactMax ?? EXACT_MAX_OPEN)
	const hits = new Float64Array(F)
	let total = 0
	scenarios(ctx, { sims: opts.sims ?? HISTORY_SIMS, exact }, (_c, w, flags) => {
		total += w
		for (let f = 0; f < F; f++) if (flags[f]) hits[f] += w
	})
	return Array.from(hits, (v) => (total > 0 ? v / total : 0))
}

/** The same game with the other team having won it by a point. Null for a tie, which has no other way to have gone. */
export function flipped(g: Game): Game | null {
	if (g.status !== "final" || g.homeScore === null || g.awayScore === null || g.homeScore === g.awayScore) return null
	const homeWon = g.homeScore > g.awayScore
	return { ...g, homeScore: homeWon ? 0 : 1, awayScore: homeWon ? 1 : 0, winner: homeWon ? g.awayTeam : g.homeTeam, tie: false }
}

/**
 * What a finished game's result is worth to every team and goal: each one's chance now, minus its chance had the other team won
 * (ratings included, since the result moved them), with every other open game on the same dice. Null for a tie.
 */
export function resultSwing(games: readonly Game[], gameId: string, opts: { sims?: number; exactMax?: number } = {}, league: League = NFL_LEAGUE): number[] | null {
	const g = games.find((x) => x.id === gameId)
	const alt = g ? flipped(g) : null
	if (!g || !alt) return null
	const flippedGames = games.map((x) => (x.id === gameId ? alt : x))
	const a = makeContext(games, league)
	const b = makeContext(flippedGames, league)
	const pa = simulateBaseline(a, { sims: opts.sims ?? SWING_SIMS, exactMax: opts.exactMax })
	const pb = simulateBaseline(b, { sims: opts.sims ?? SWING_SIMS, exactMax: opts.exactMax })
	return pa.map((v, i) => v - pb[i])
}

/** Games as they stood when `week` had just finished: later weeks become unplayed again. */
export function gamesThroughWeek(games: readonly Game[], week: number): Game[] {
	return games.map((g) => (g.week <= week ? g : { ...g, homeScore: null, awayScore: null, status: "scheduled" as const, winner: null, tie: false }))
}

/** A short fingerprint (FNV-1a, 32 bits, base 36) of a list of strings. */
export function hashStrings(parts: readonly string[]): string {
	let h = 0x811c9dc5
	for (const part of parts) {
		for (let i = 0; i < part.length; i++) {
			h ^= part.charCodeAt(i)
			h = Math.imul(h, 0x01000193) >>> 0
		}
		h ^= 0x7c
		h = Math.imul(h, 0x01000193) >>> 0
	}
	return h.toString(36).padStart(7, "0")
}

/**
 * Names the results the guide was made from: the model version, the settings, every game's id and, for finished games, its score.
 * The guide is current when this still matches the schedule file. A changed kickoff time does not change it; a new final score does.
 */
export function resultsKey(games: readonly Game[], settings: { sims?: number; tieSims?: number } = {}): string {
	const parts = [`v${MODEL_VERSION}`, `s${settings.sims ?? ROOTING_SIMS}`, `t${settings.tieSims ?? TIE_SIMS}`]
	for (const g of [...games].sort((x, y) => (x.id < y.id ? -1 : 1))) {
		parts.push(g.status === "final" && g.homeScore !== null && g.awayScore !== null ? `${g.id}=${g.awayScore}-${g.homeScore}` : g.id)
	}
	return hashStrings(parts)
}

export function resultOf(g: Game): Result | null {
	if (g.status !== "final" || g.homeScore === null || g.awayScore === null) return null
	return g.homeScore === g.awayScore ? "T" : g.homeScore > g.awayScore ? "H" : "A"
}
