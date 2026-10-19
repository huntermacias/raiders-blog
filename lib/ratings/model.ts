// Team strength and win chances for the playoff tools (Playoff Machine, Rooting Guide, their cards and the homepage band).
//
// The fitting happens offline in scripts/ratings/fit.py and lands in data/lab/ratings-model.json; this file only applies the
// result, so it is small, pure and has no clock and no randomness. scripts/ratings/fit.py writes a parity fixture and
// tests/lib/ratings/model.test.ts checks this code reproduces it to the last decimal, so the two cannot drift apart.
//
// Two kinds of information are combined, and each game uses the better one it has:
//
//   - A game with a posted point spread is priced from the spread alone. Closing lines are the best single forecast of an NFL game
//     and, in the back-test, nothing the site can add improved on them. (A spread outside the line-up of games is never invented.)
//   - Every other game is priced from the two teams' strength: an Elo rating built from the season's scores that starts from a
//     fraction of last season's rating, and a "market rating" backed out of the spreads of the games played and posted so far.
//
// The weights, the Elo settings and the strength uncertainty were all fitted on past seasons and scored on seasons they never saw
// (see "holdout" in the model file). Nothing here is hand-tuned to make an output look right.

import type { Game } from "../playoffs/types"

export type EloSettings = { k: number; hfa: number; carry: number }
export type MarketSettings = { lambda: number; carry: number; halfLife: number }
export type FarWeights = { home: number; elo: number; market: number }

export type ModelDraw = { far: [number, number, number]; line: number; sigma: number }

export type ScoreLine = { n: number; logLoss: number; brier: number; accuracy?: number }

export type RatingsModel = {
	version: number
	generatedAt: string
	source: string
	fitSeasons: [number, number]
	elo: EloSettings
	market: MarketSettings
	far: FarWeights
	line: { slope: number }
	/** Spread of a team's true strength around its rating, on the logit scale. Shared by all of the team's games in one simulated season. */
	sigma: number
	sigmaByWeeksPlayed: Record<string, number>
	/** Refits on seasons resampled with replacement. How much the odds depend on this particular fit. */
	draws: ModelDraw[]
	/** Ratings at the start of `season`, already carried over from the season before. */
	priors: { season: number; teams: string[]; elo: number[]; market: number[] }
	holdout: {
		trainedOn: string
		scoredOn: string
		coinFlip: { n: number; logLoss: number; brier: number }
		previousModel: { allGames: ScoreLine; nextWeek: ScoreLine; later: ScoreLine }
		newModel: { allGames: ScoreLine; nextWeek: ScoreLine; later: ScoreLine }
	}
	leaveOneSeasonOut: { later: ScoreLine; nextWeek: ScoreLine; recalibration: { intercept: number; slope: number } }
	calibration: { later: CalibrationBin[]; nextWeek: CalibrationBin[] }
}

export type CalibrationBin = { lo: number; hi: number; n: number; predicted: number; observed: number }

/** The numbers one forecast uses. Draw -1 or undefined is the fit on every season; 0.. are the resampled refits. */
export type Coefs = { home: number; elo: number; market: number; line: number; sigma: number }

export function coefsOf(model: RatingsModel, draw?: number): Coefs {
	if (draw === undefined || draw < 0) return { ...model.far, line: model.line.slope, sigma: model.sigma }
	const d = model.draws[draw % model.draws.length]
	return { home: d.far[0], elo: d.far[1], market: d.far[2], line: d.line, sigma: d.sigma }
}

export const FLAT_ELO = 1500

/** Everything a game's win chance is read from, for one set of games. */
export type Strength = {
	model: RatingsModel
	/** Elo by team. A team missing from the map is average. */
	elo: Record<string, number>
	/** Market rating by team, in points. A team missing from the map is average (0). */
	market: Record<string, number>
	/** The first week with a game still to play: the "week now" the market ratings are centred on. */
	week: number
	/** True when last season's ratings were used as the starting point. */
	primed: boolean
}

const SEASON_ID = /^(\d{4})_/

/** The season the games belong to, read from their ids ("2026_01_NE_SEA"), or null when they do not all say. */
export function seasonOf(games: readonly Pick<Game, "id">[]): number | null {
	let season: number | null = null
	for (const g of games) {
		const m = SEASON_ID.exec(g.id)
		if (!m) return null
		const y = Number(m[1])
		if (season !== null && season !== y) return null
		season = y
	}
	return season
}

type FinalGame = Pick<Game, "id" | "week" | "homeTeam" | "awayTeam" | "homeScore" | "awayScore" | "status"> & { neutral?: boolean }

function isFinal(g: FinalGame): g is FinalGame & { homeScore: number; awayScore: number } {
	return g.status === "final" && typeof g.homeScore === "number" && typeof g.awayScore === "number"
}

const expected = (diff: number) => 1 / (1 + Math.pow(10, -diff / 400))

/**
 * Elo after every final game, in week order, starting from the prior ratings. Same margin-of-victory rule as lib/math/elo.ts but with
 * the fitted K and home-field points, no home field at neutral sites, and a week's games applied together (a team plays once a week).
 */
export function eloRatings(games: readonly FinalGame[], model: RatingsModel, start: Record<string, number> = {}): Record<string, number> {
	const r: Record<string, number> = { ...start }
	const get = (t: string) => r[t] ?? FLAT_ELO
	const { k, hfa } = model.elo
	const finals = games.filter(isFinal)
	const weeks = Array.from(new Set(finals.map((g) => g.week))).sort((a, b) => a - b)
	for (const w of weeks) {
		const shift: Record<string, number> = {}
		for (const g of finals.filter((x) => x.week === w)) {
			const edge = get(g.homeTeam) + (g.neutral ? 0 : hfa) - get(g.awayTeam)
			const p = expected(edge)
			const margin = g.homeScore - g.awayScore
			const act = margin > 0 ? 1 : margin < 0 ? 0 : 0.5
			const wedge = margin >= 0 ? edge : -edge
			const s = k * (Math.pow(Math.abs(margin) + 3, 0.8) / (7.5 + 0.006 * wedge)) * (act - p)
			shift[g.homeTeam] = (shift[g.homeTeam] ?? 0) + s
			shift[g.awayTeam] = (shift[g.awayTeam] ?? 0) - s
		}
		for (const t of Object.keys(shift)) r[t] = get(t) + shift[t]
	}
	return r
}

/** Solves the symmetric positive-definite system m x = v in place (Cholesky). */
function solve(m: number[][], v: number[]): number[] {
	const n = v.length
	const l = m.map((row) => row.slice())
	for (let i = 0; i < n; i++) {
		for (let j = 0; j <= i; j++) {
			let s = l[i][j]
			for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k]
			if (i === j) l[i][i] = Math.sqrt(Math.max(s, 1e-12))
			else l[i][j] = s / l[j][j]
		}
	}
	const y = new Array<number>(n).fill(0)
	for (let i = 0; i < n; i++) {
		let s = v[i]
		for (let k = 0; k < i; k++) s -= l[i][k] * y[k]
		y[i] = s / l[i][i]
	}
	const x = new Array<number>(n).fill(0)
	for (let i = n - 1; i >= 0; i--) {
		let s = y[i]
		for (let k = i + 1; k < n; k++) s -= l[k][i] * x[k]
		x[i] = s / l[i][i]
	}
	return x
}

type Lined = Pick<Game, "week" | "homeTeam" | "awayTeam" | "spread"> & { neutral?: boolean }

/**
 * Market ratings: the team strengths, in points, that best explain the spreads posted so far this season (games already played and
 * the games coming up), with recent weeks counting more (a game's weight halves every `halfLife` weeks back) and every rating pulled
 * toward the carried-over prior. Ridge regression, the same normal equations scripts/ratings/fit.py solves.
 */
export function marketRatings(games: readonly Lined[], model: RatingsModel, week: number, prior: Record<string, number> = {}): Record<string, number> {
	const teams = Array.from(new Set(games.flatMap((g) => [g.homeTeam, g.awayTeam]))).sort()
	const idx = new Map(teams.map((t, i) => [t, i]))
	const n = teams.length
	const m = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0))
	const v = new Array<number>(n + 1).fill(0)
	for (const g of games) {
		if (typeof g.spread !== "number" || !Number.isFinite(g.spread) || g.week > week) continue
		const w = Math.pow(0.5, (week - 1 - g.week) / model.market.halfLife)
		const h = idx.get(g.homeTeam) as number
		const a = idx.get(g.awayTeam) as number
		const x: Array<[number, number]> = [
			[h, 1],
			[a, -1],
		]
		if (!g.neutral) x.push([n, 1])
		for (const [i, xi] of x) {
			for (const [j, xj] of x) m[i][j] += w * xi * xj
			v[i] += w * g.spread * xi
		}
	}
	for (let t = 0; t < n; t++) {
		m[t][t] += model.market.lambda
		v[t] += model.market.lambda * (prior[teams[t]] ?? 0)
	}
	m[n][n] += 1e-9
	const sol = solve(m, v)
	return Object.fromEntries(teams.map((t, i) => [t, sol[i]]))
}

/** The first week with a game still to play, or one past the last week when the season is over. */
export function currentWeek(games: readonly Pick<Game, "week" | "status">[]): number {
	let open: number | null = null
	let last = 0
	for (const g of games) {
		last = Math.max(last, g.week)
		if (g.status !== "final" && (open === null || g.week < open)) open = g.week
	}
	return open ?? last + 1
}

/**
 * Strength for a set of games. Last season's ratings are the starting point when the model has them for this season (read from
 * the games' ids), and every team is average otherwise, as in a made-up league.
 */
export function strengthFor(games: readonly (FinalGame & Pick<Game, "spread">)[], model: RatingsModel): Strength {
	const season = seasonOf(games)
	const primed = season !== null && season === model.priors.season
	const eloStart: Record<string, number> = {}
	const mktStart: Record<string, number> = {}
	if (primed) {
		model.priors.teams.forEach((t, i) => {
			eloStart[t] = model.priors.elo[i]
			mktStart[t] = model.priors.market[i]
		})
	}
	const week = currentWeek(games)
	return { model, elo: eloRatings(games, model, eloStart), market: marketRatings(games, model, week, mktStart), week, primed }
}

/** Whether a spread can be used as the market price of a game. */
export function hasLine(g: Pick<Game, "spread">): g is { spread: number } {
	return typeof g.spread === "number" && Number.isFinite(g.spread)
}

/** The log-odds the home team wins, before any team-strength shock: from the spread when there is one, from the ratings otherwise. */
export function homeLogit(s: Strength, g: Pick<Game, "homeTeam" | "awayTeam" | "spread"> & { neutral?: boolean }, c: Coefs = coefsOf(s.model)): number {
	if (hasLine(g)) return (c.line * g.spread) / 10
	const eloD = (s.elo[g.homeTeam] ?? FLAT_ELO) - (s.elo[g.awayTeam] ?? FLAT_ELO)
	const mktD = (s.market[g.homeTeam] ?? 0) - (s.market[g.awayTeam] ?? 0)
	return c.home * (g.neutral ? 0 : 1) + (c.elo * eloD) / 100 + (c.market * mktD) / 10
}

export const logistic = (z: number) => 1 / (1 + Math.exp(-z))

/** The chance the home team wins, as far as anyone can tell before the season is played: the calibrated forecast. */
export function homeProbability(s: Strength, g: Pick<Game, "homeTeam" | "awayTeam" | "spread"> & { neutral?: boolean }, c?: Coefs): number {
	return logistic(homeLogit(s, g, c))
}

// ---------------------------------------------------------------------------------------------- team-strength uncertainty

/**
 * How much stronger a game's log-odds must be, before the two teams' shocks are added, for the chance averaged over those shocks to
 * come out at the calibrated forecast. A normal shock of variance v on the log-odds pulls an average chance toward 50%, by the
 * factor 1 / sqrt(1 + pi v / 8) (the usual logistic-normal approximation); two teams each with spread sigma give v = 2 sigma^2.
 */
export function stretch(sigma: number): number {
	return Math.sqrt(1 + (Math.PI * sigma * sigma) / 4)
}

/** The standard normal quantile (Acklam's rational approximation, relative error under 1.2e-9). u is strictly between 0 and 1. */
export function normalQuantile(u: number): number {
	const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
	const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
	const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
	const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
	const p = Math.min(Math.max(u, 1e-12), 1 - 1e-12)
	if (p < 0.02425) {
		const q = Math.sqrt(-2 * Math.log(p))
		return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
	}
	if (p > 1 - 0.02425) {
		const q = Math.sqrt(-2 * Math.log(1 - p))
		return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
	}
	const q = p - 0.5
	const r = q * q
	return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}
