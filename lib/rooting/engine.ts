// The simulation behind the Sunday Rooting Guide. It reuses the Playoff Machine's engine as it is: the same schedule, the same
// calibrated win chances and team-strength draws (ratingsFor / rollerFor), the same random numbers (uniform) and the same official
// seeding and tiebreakers (buildSeason + seedConference). Nothing about seeding is written again here; this file only asks that
// engine a different question.
//
// The question: for every game still to play, how do the odds of a team making the playoffs, winning its division or taking the top
// seed change depending on who wins? One pass answers it for all 32 teams and all three goals at once:
//
//   - Play the rest of the season N times. In each, note which teams made the playoffs, won a division and took a conference's
//     top seed, and who won every game.
//   - A team's odds "if the home team wins game G" are the share of the seasons where the home team won G in which the team got
//     there. The same seasons answer every game, every team and every goal, so the cost does not grow with them.
//
// Conditioning on a result is the right question for a fan, and it is not the same as forcing it. Every simulated season draws how
// strong each team really is, so a season in which a team wins game G is also, on average, a season in which that team is better
// than its rating says, which helps it in its other games. That is real information a result carries, and it is why a win is worth
// a little more than the game alone.
//
// Keeping that stable and honest:
//   - Common random numbers. Every game's dice come from a hash of (simulation number, game id) and every team's strength draw from
//     (simulation number, team), the same hash the Playoff Machine uses, so results are exactly repeatable, a game keeps its dice
//     when the schedule around it changes, and every comparison is made on the same simulated seasons.
//   - Exact when it can be. With a dozen games or fewer left and no team in two of them, every way the games can end is added up,
//     weighted by its chance: no sampling error at all, which is what the last week of the season needs. (Strength draws only matter
//     to a team's second game, so with one game each the exact answer is also the model's answer.)
//   - A big sample. Hundreds of thousands of team-goal-game answers come from the same 60,000 seasons, and every answer keeps its
//     sample size, so the guide can tell a real swing from noise.
//   - Two kinds of doubt, kept apart. Sampling error (how much 60,000 seasons wobble) is a binomial error bar on every answer.
//     Model error (how much the answer would move if the model were fitted on different past seasons) is measured by replaying the
//     same simulated seasons under refits of the model, each season re-weighted by how likely it is under that refit.
//   - Paired runs for the small questions. A tie is too rare to wait for, so it is forced in a run on the same dice. "What did this
//     result do?" for a finished game is answered the same way, as the difference between two runs that share every other die.
//
// Pure and deterministic: no clock, no Math.random.

import { MIN_BUCKET, type Roller, ratingsFor, rollerFor } from "../playoffs/odds"
import { NFL_LEAGUE, buildSeason, type Season } from "../playoffs/season"
import { seedConference } from "../playoffs/standings"
import type { Conference, Game, League, Outcome } from "../playoffs/types"
import { getModel } from "../ratings/data"
import { type RatingsModel, type Strength, coefsOf, hasLine, homeLogit, logistic, stretch } from "../ratings/model"
import { GOALS, type Result } from "./types"

/** Bump when the model or what is stored changes, so every guide made before it is recognized as out of date. */
export const MODEL_VERSION = 2

export const ROOTING_SIMS = 60_000
/** At or below this many open games every ending is added up exactly instead of sampled. */
export const EXACT_MAX_OPEN = 12
export const TIE_SIMS = 3_000
export const SWING_SIMS = 3_000
export const HISTORY_SIMS = 4_000
/** Refits of the model replayed to measure model error, and how many of the simulated seasons they are replayed on. */
export const RANGE_DRAWS = 16
export const RANGE_SIMS = 20_000
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
	/** The model's calibrated chance the home team wins each open game (averaged over team-strength draws). */
	chances: number[]
	/** The same chances as log-odds, before the strength draws. */
	logits: number[]
	/** Whether each open game is priced from its posted spread (true) or from the two teams' ratings (false). */
	lined: boolean[]
	/** Spread of a team's true strength around its rating, on the log-odds scale. */
	sigma: number
	strength: Strength
	/** The dice for the open games: team-strength draws first, then each game's flip. */
	roll: Roller
	conferences: Conference[]
}

export type ContextOptions = { model?: RatingsModel; /** Override the strength spread (0 turns the strength draws off). */ sigma?: number }

export function makeContext(games: readonly Game[], league: League = NFL_LEAGUE, opts: ContextOptions = {}): Context {
	const season = buildSeason(league, games, {})
	const model = opts.model ?? getModel()
	const strength = ratingsFor(games, model)
	const coefs = coefsOf(model)
	const sigma = opts.sigma ?? coefs.sigma
	const teams = league.teams.map((t) => t.id)
	const logits = season.open.map((g) => homeLogit(strength, g, coefs))
	return {
		league,
		games,
		teams,
		teamIndex: new Map(teams.map((id, i) => [id, i])),
		size: teams.length * GOALS.length,
		open: season.open,
		chances: logits.map(logistic),
		logits,
		lined: season.open.map((g) => hasLine(g)),
		sigma,
		strength,
		roll: rollerFor(season.open, logits, sigma),
		conferences: Array.from(new Set(league.teams.map((t) => t.conference))).sort() as Conference[],
	}
}

/**
 * Whether the open games can be added up exactly: few enough of them, and (when team strength is uncertain) no team in two of them,
 * since a strength draw is shared only between one team's games. In the last week of the season both hold.
 */
export function canEnumerate(ctx: Context, exactMax: number = EXACT_MAX_OPEN): boolean {
	if (ctx.open.length > exactMax) return false
	if (ctx.sigma <= 0) return true
	const seen = new Set<string>()
	for (const g of ctx.open) {
		if (seen.has(g.homeTeam) || seen.has(g.awayTeam)) return false
		seen.add(g.homeTeam)
		seen.add(g.awayTeam)
	}
	return true
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
type Visit = (codes: Uint8Array, weight: number, flags: Uint8Array, sim: number) => void

/**
 * Plays out the open games and hands every finished season to `visit` with its weight. By dice (`sims` seasons, weight 1 each)
 * or, with `exact`, over every combination of home and away winners weighted by its chance (the sum of the weights is 1).
 * A forced game gets the same result in every season.
 */
export function scenarios(ctx: Context, opts: { sims: number; exact: boolean; forced?: Forced; games?: readonly Game[] }, visit: Visit): number {
	const open = ctx.open
	const chances = ctx.chances
	const games = opts.games ?? ctx.games
	const m = open.length
	const preds: Record<string, Outcome> = {}
	const codes = new Uint8Array(m)
	const homeWon = new Uint8Array(m)
	const flags = new Uint8Array(ctx.size)
	let count = 0

	const play = (weight: number, sim: number) => {
		for (let i = 0; i < m; i++) preds[open[i].id] = CODE[codes[i]]
		goalFlags(ctx, buildSeason(ctx.league, games, preds), flags)
		visit(codes, weight, flags, sim)
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
			play(w, mask)
		}
		return count
	}

	for (let s = 0; s < opts.sims; s++) {
		ctx.roll(s, homeWon)
		for (let i = 0; i < m; i++) codes[i] = opts.forced && opts.forced.index === i ? opts.forced.code : homeWon[i] ? 0 : 1
		play(1, s)
	}
	return count
}

// ---------------------------------------------------------------------------------------------- model error

/** One refit of the model, ready to be replayed on the simulated seasons of the main pass. */
export type Replay = { logits: number[]; sigma: number; k: number }

export function replaysFor(ctx: Context, model: RatingsModel, count: number): Replay[] {
	const out: Replay[] = []
	const n = Math.min(count, model.draws.length)
	for (let d = 0; d < n; d++) {
		const c = coefsOf(model, d)
		out.push({ logits: ctx.open.map((g) => homeLogit(ctx.strength, g, c)), sigma: c.sigma, k: c.sigma > 0 ? stretch(c.sigma) : 1 })
	}
	return out
}

/**
 * How much more (or less) likely a simulated season is under a refit than under the model that rolled it: the product, over the
 * games, of the refit's chance of the result that happened divided by the rolled chance of it. The refit sees the very same strength
 * draws, so the weights stay close to 1 and no season is thrown away. `exact` seasons use the averaged chances on both sides.
 */
function ratios(ctx: Context, replays: readonly Replay[], codes: Uint8Array, exact: boolean, out: Float64Array): void {
	const m = codes.length
	const { zeta, prob, homeSlot, awaySlot } = ctx.roll
	for (let d = 0; d < replays.length; d++) {
		const r = replays[d]
		let lw = 0
		for (let i = 0; i < m; i++) {
			const pd = exact ? logistic(r.logits[i]) : logistic(r.logits[i] * r.k + r.sigma * (zeta[homeSlot[i]] - zeta[awaySlot[i]]))
			const pc = exact ? ctx.chances[i] : prob[i]
			lw += codes[i] === 0 ? Math.log(pd / pc) : Math.log((1 - pd) / (1 - pc))
		}
		out[d] = Math.exp(lw)
	}
}

export type Conditional = {
	sims: number
	exact: boolean
	/** Chance of each (team, goal) over all the seasons, 0 to 1. */
	baseline: number[]
	/** Per open game, in the order of ctx.open: sample size on each side and each (team, goal)'s chance given that side won. */
	games: { n: [number, number]; H: number[]; A: number[]; /** Lowest and highest (H minus A) across the refits (and the main estimate), per (team, goal). */ swingLo?: number[]; swingHi?: number[] }[]
	/** How far the chances move under refits of the model; absent when none were asked for. */
	range: { draws: number; sims: number; baselineLo: number[]; baselineHi: number[] } | null
}

/** The main pass: every open game against every team and goal. */
export function simulateConditional(ctx: Context, opts: { sims?: number; exactMax?: number; replays?: readonly Replay[]; rangeSims?: number } = {}): Conditional {
	const G = ctx.open.length
	const F = ctx.size
	const exact = canEnumerate(ctx, opts.exactMax ?? EXACT_MAX_OPEN)
	const sims = exact ? 0 : opts.sims ?? ROOTING_SIMS
	const hits = new Float64Array(G * 2 * F)
	const wsum = new Float64Array(G * 2)
	const n = new Int32Array(G * 2)
	const base = new Float64Array(F)
	let total = 0
	const hot = new Int32Array(F)

	const replays = opts.replays ?? []
	const D = replays.length
	const rangeSims = exact ? Infinity : Math.min(opts.rangeSims ?? RANGE_SIMS, sims)
	const rHits = new Float64Array(D * G * 2 * F)
	const rWsum = new Float64Array(D * G * 2)
	const rBase = new Float64Array(D * F)
	const rTotal = new Float64Array(D)
	const rr = new Float64Array(D)

	scenarios(ctx, { sims, exact }, (codes, w, flags, sim) => {
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
		if (D && (exact || sim < rangeSims)) {
			ratios(ctx, replays, codes, exact, rr)
			for (let d = 0; d < D; d++) {
				const wd = w * rr[d]
				rTotal[d] += wd
				for (let j = 0; j < h; j++) rBase[d * F + hot[j]] += wd
				for (let i = 0; i < G; i++) {
					const k = (d * G + i) * 2 + codes[i]
					rWsum[k] += wd
					const off = k * F
					for (let j = 0; j < h; j++) rHits[off + hot[j]] += wd
				}
			}
		}
	})

	const given = (i: number, side: 0 | 1): number[] => {
		const k = i * 2 + side
		const out = new Array<number>(F).fill(0)
		if (wsum[k] > 0) for (let f = 0; f < F; f++) out[f] = hits[k * F + f] / wsum[k]
		return out
	}
	const baseline = Array.from(base, (v) => (total > 0 ? v / total : 0))
	const gamesOut = ctx.open.map((_, i) => ({ n: [n[i * 2], n[i * 2 + 1]] as [number, number], H: given(i, 0), A: given(i, 1) }) as Conditional["games"][number])

	let range: Conditional["range"] = null
	if (D) {
		const lo = baseline.slice()
		const hi = baseline.slice()
		for (let d = 0; d < D; d++) {
			if (rTotal[d] <= 0) continue
			for (let f = 0; f < F; f++) {
				const v = rBase[d * F + f] / rTotal[d]
				if (v < lo[f]) lo[f] = v
				if (v > hi[f]) hi[f] = v
			}
		}
		range = { draws: D, sims: exact ? 0 : rangeSims, baselineLo: lo, baselineHi: hi }
		// A refit's answer for a game counts only where its side of the game held enough weight to say anything (the same floor the
		// main answers use), so a thin bucket cannot stretch the range.
		const floor = exact ? 0 : MIN_BUCKET * (rangeSims / sims)
		for (let i = 0; i < G; i++) {
			const g = gamesOut[i]
			const slo = new Array<number>(F)
			const shi = new Array<number>(F)
			for (let f = 0; f < F; f++) {
				slo[f] = g.H[f] - g.A[f]
				shi[f] = slo[f]
			}
			for (let d = 0; d < D; d++) {
				const kH = (d * G + i) * 2
				const kA = kH + 1
				if (rWsum[kH] <= floor || rWsum[kA] <= floor) continue
				for (let f = 0; f < F; f++) {
					const v = rHits[kH * F + f] / rWsum[kH] - rHits[kA * F + f] / rWsum[kA]
					if (v < slo[f]) slo[f] = v
					if (v > shi[f]) shi[f] = v
				}
			}
			g.swingLo = slo
			g.swingHi = shi
		}
	}
	return { sims, exact, baseline, games: gamesOut, range }
}

/** Each (team, goal)'s chance if open game `index` ended in a tie, the rest played on the same dice. */
export function simulateTie(ctx: Context, index: number, opts: { sims?: number; exactMax?: number } = {}): number[] {
	const F = ctx.size
	const exact = canEnumerate(ctx, opts.exactMax ?? EXACT_MAX_OPEN)
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
	const exact = canEnumerate(ctx, opts.exactMax ?? EXACT_MAX_OPEN)
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
export function resultSwing(games: readonly Game[], gameId: string, opts: { sims?: number; exactMax?: number } = {}, league: League = NFL_LEAGUE, model?: RatingsModel): number[] | null {
	const g = games.find((x) => x.id === gameId)
	const alt = g ? flipped(g) : null
	if (!g || !alt) return null
	const flippedGames = games.map((x) => (x.id === gameId ? alt : x))
	const a = makeContext(games, league, { model })
	const b = makeContext(flippedGames, league, { model })
	const pa = simulateBaseline(a, { sims: opts.sims ?? SWING_SIMS, exactMax: opts.exactMax })
	const pb = simulateBaseline(b, { sims: opts.sims ?? SWING_SIMS, exactMax: opts.exactMax })
	return pa.map((v, i) => v - pb[i])
}

/**
 * Games as they stood when `week` had just finished: later weeks become unplayed again, and only the next week's games still carry a
 * spread (the market had posted no others then), so the snapshot is priced the way the guide would have priced it that day.
 */
export function gamesThroughWeek(games: readonly Game[], week: number): Game[] {
	return games.map((g) => (g.week <= week ? g : { ...g, homeScore: null, awayScore: null, status: "scheduled" as const, winner: null, tie: false, spread: g.week === week + 1 ? g.spread ?? null : null }))
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
 * Names what the guide was made from: the model version, the fitted ratings model, the settings, every game's id and, for finished
 * games, its score and, for the rest, the spread it is priced from. The guide is current when this still matches the schedule file.
 * A changed kickoff time does not change it; a new final score or a moved spread does.
 */
export function resultsKey(games: readonly Game[], settings: { sims?: number; tieSims?: number; model?: RatingsModel } = {}): string {
	const m = settings.model ?? getModel()
	const parts = [`v${MODEL_VERSION}`, `m${m.version}.${m.generatedAt}`, `s${settings.sims ?? ROOTING_SIMS}`, `t${settings.tieSims ?? TIE_SIMS}`]
	for (const g of [...games].sort((x, y) => (x.id < y.id ? -1 : 1))) {
		if (g.status === "final" && g.homeScore !== null && g.awayScore !== null) parts.push(`${g.id}=${g.awayScore}-${g.homeScore}`)
		else parts.push(hasLine(g) ? `${g.id}@${g.spread}` : g.id)
	}
	return hashStrings(parts)
}

export function resultOf(g: Game): Result | null {
	if (g.status !== "final" || g.homeScore === null || g.awayScore === null) return null
	return g.homeScore === g.awayScore ? "T" : g.homeScore > g.awayScore ? "H" : "A"
}
