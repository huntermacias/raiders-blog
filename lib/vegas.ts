// "Hunter vs. Vegas": how my score predictions for the Raiders compare with the closing point spread,
// game by game. Pure functions of the graded picks and the Lab's games (which carry the nflverse
// closing spread). No betting units and no profit: this is a way to check my margin picks against
// the market, and the page says so.
//
// Conventions, all from the Raiders' side:
//   margin = Raiders score minus opponent score (positive means the Raiders won by that much)
//   line   = how many points the Raiders were favored by (negative means underdog)
// A closing line of "Raiders -3.5" is line = +3.5, and the market's expected margin is +3.5.

import { labGameFor } from "./lab/match"
import type { LabGame } from "./lab/types"
import { RAIDERS, teamInfo } from "./nfl"
import { type GamePrediction, involvesRaiders, isFinal } from "./predictions"

export type Cover = "raiders" | "opponent" | "push"
export type AtsResult = "hit" | "miss" | "push" | "none"
export type Closer = "hunter" | "vegas" | "tie"

export type VegasGame = {
	week: number
	/** Opponent as stored in Studio, e.g. "New Orleans Saints". */
	opponent: string
	oppAbbr: string
	oppNick: string
	home: boolean
	/** Raiders-favored points at close. Negative when the Raiders were underdogs. */
	line: number
	/** My predicted margin. */
	hunterMargin: number
	hunterRaiders: number
	hunterOpponent: number
	/** The real margin. */
	actualMargin: number
	actualRaiders: number
	actualOpponent: number
	/** Who covered the closing line. */
	cover: Cover
	/** Which side of the line my margin took. null when my margin sat exactly on the line. */
	lean: "raiders" | "opponent" | null
	ats: AtsResult
	/** |my margin - actual| and |line - actual|, in points. */
	hunterError: number
	vegasError: number
	closer: Closer
}

export type VegasSummary = {
	games: number
	ats: { hits: number; misses: number; pushes: number; noLean: number }
	/** hits / (hits + misses), 0..1, or null before any decided game. */
	atsPct: number | null
	hunterAvgError: number | null
	vegasAvgError: number | null
	closer: { hunter: number; vegas: number; tie: number }
	/** Final Raiders picks that could not be compared because the Lab has no line for them yet. */
	missingLine: number
}

export type VegasBoard = { games: VegasGame[]; summary: VegasSummary }

/** The Raiders-side line from the Lab's spread, which is how many points the HOME team was favored by. */
export function raidersLine(spread: number | null | undefined, raidersHome: boolean): number | null {
	if (typeof spread !== "number" || !Number.isFinite(spread)) return null
	const line = raidersHome ? spread : -spread
	return line === 0 ? 0 : line // normalises -0
}

export function coverOf(actualMargin: number, line: number): Cover {
	const d = actualMargin - line
	return d > 0 ? "raiders" : d < 0 ? "opponent" : "push"
}

export function leanOf(hunterMargin: number, line: number): "raiders" | "opponent" | null {
	return hunterMargin > line ? "raiders" : hunterMargin < line ? "opponent" : null
}

export function atsOf(lean: "raiders" | "opponent" | null, cover: Cover): AtsResult {
	if (lean === null) return "none"
	if (cover === "push") return "push"
	return lean === cover ? "hit" : "miss"
}

/** Build one comparison, or null when the pick isn't a graded Raiders game or the Lab has no line for it. */
export function compare(p: GamePrediction, labGames: LabGame[]): VegasGame | null | "no-line" {
	if (!involvesRaiders(p) || !isFinal(p)) return null
	const raidersAway = p.awayTeam === RAIDERS
	const opponent = raidersAway ? p.homeTeam : p.awayTeam

	const lab = labGameFor({ opponent, gameDate: p.kickoff }, labGames)
	const line = lab ? raidersLine(lab.spread, lab.home) : null
	if (!lab || line === null) return "no-line"

	const hunterRaiders = raidersAway ? p.predictedAwayScore : p.predictedHomeScore
	const hunterOpponent = raidersAway ? p.predictedHomeScore : p.predictedAwayScore
	const actualRaiders = (raidersAway ? p.actualAwayScore : p.actualHomeScore) as number
	const actualOpponent = (raidersAway ? p.actualHomeScore : p.actualAwayScore) as number

	const hunterMargin = hunterRaiders - hunterOpponent
	const actualMargin = actualRaiders - actualOpponent
	const cover = coverOf(actualMargin, line)
	const lean = leanOf(hunterMargin, line)
	const hunterError = Math.abs(hunterMargin - actualMargin)
	const vegasError = Math.abs(line - actualMargin)
	const info = teamInfo(opponent)

	return {
		week: p.week,
		opponent,
		oppAbbr: info.abbr,
		oppNick: info.nick,
		home: !raidersAway,
		line,
		hunterMargin,
		hunterRaiders,
		hunterOpponent,
		actualMargin,
		actualRaiders,
		actualOpponent,
		cover,
		lean,
		ats: atsOf(lean, cover),
		hunterError,
		vegasError,
		closer: hunterError < vegasError ? "hunter" : hunterError > vegasError ? "vegas" : "tie",
	}
}

export function summarizeVegas(games: VegasGame[], missingLine = 0): VegasSummary {
	const ats = { hits: 0, misses: 0, pushes: 0, noLean: 0 }
	const closer = { hunter: 0, vegas: 0, tie: 0 }
	let hErr = 0
	let vErr = 0
	for (const g of games) {
		if (g.ats === "hit") ats.hits++
		else if (g.ats === "miss") ats.misses++
		else if (g.ats === "push") ats.pushes++
		else ats.noLean++
		closer[g.closer]++
		hErr += g.hunterError
		vErr += g.vegasError
	}
	const decided = ats.hits + ats.misses
	return {
		games: games.length,
		ats,
		atsPct: decided > 0 ? ats.hits / decided : null,
		hunterAvgError: games.length ? hErr / games.length : null,
		vegasAvgError: games.length ? vErr / games.length : null,
		closer,
		missingLine,
	}
}

/** Every graded Raiders pick set against its closing line, oldest week first. */
export function buildVegasBoard(picks: GamePrediction[], labGames: LabGame[]): VegasBoard {
	const games: VegasGame[] = []
	let missing = 0
	for (const p of picks.slice().sort((a, b) => a.week - b.week)) {
		const c = compare(p, labGames)
		if (c === null) continue
		if (c === "no-line") missing++
		else games.push(c)
	}
	return { games, summary: summarizeVegas(games, missing) }
}

// ---- display helpers ----------------------------------------------------------------------

const MINUS = "−"

/** "-3.5" with a real minus sign, "+6.5", or "0". */
export function signed(n: number): string {
	if (n === 0) return "0"
	const body = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1)
	return `${n < 0 ? MINUS : "+"}${body}`
}

/** "Raiders -3.5", "Chiefs -3.5" (from the favorite's side) or "Pick'em". */
export function lineText(line: number, oppNick: string): string {
	if (line === 0) return "Pick’em"
	return line > 0 ? `Raiders ${MINUS}${fmt(line)}` : `${oppNick} ${MINUS}${fmt(-line)}`
}

function fmt(n: number): string {
	return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** The side I took against the number: "Raiders -3.5", "Saints +3.5", or null. */
export function leanText(g: Pick<VegasGame, "lean" | "line" | "oppNick">): string | null {
	if (g.lean === null) return null
	if (g.lean === "raiders") return `Raiders ${signed(-g.line)}`
	return `${g.oppNick} ${signed(g.line)}`
}

/** "Covered by 7.5", "Missed by 3", "Pushed". */
export function coverText(g: Pick<VegasGame, "cover" | "actualMargin" | "line" | "oppNick">): string {
	if (g.cover === "push") return "Pushed"
	const by = Math.abs(g.actualMargin - g.line)
	const team = g.cover === "raiders" ? "Raiders" : g.oppNick
	return `${team} covered by ${fmt(by)}`
}

/** A margin as the Raiders-side words used on the chart: "Raiders by 7", "Saints by 3", "Tie". */
export function marginText(margin: number, oppNick: string): string {
	if (margin === 0) return "Tie"
	return margin > 0 ? `Raiders by ${fmt(margin)}` : `${oppNick} by ${fmt(-margin)}`
}

/**
 * The shared margin axis for the dumbbell rows: wide enough for every marker, padded, rounded out to
 * whole touchdowns so gridlines land on 7s, and always including zero.
 */
export function axisDomain(games: VegasGame[]): { lo: number; hi: number; ticks: number[] } {
	const values = [0]
	for (const g of games) values.push(g.line, g.hunterMargin, g.actualMargin)
	const lo = Math.floor((Math.min(...values) - 2) / 7) * 7
	const hi = Math.ceil((Math.max(...values) + 2) / 7) * 7
	// Never narrower than three touchdowns either side of nothing, so one game doesn't look huge.
	const lo2 = Math.min(lo, -7)
	const hi2 = Math.max(hi, 14)
	const ticks: number[] = []
	for (let t = lo2; t <= hi2; t += 7) ticks.push(t)
	return { lo: lo2, hi: hi2, ticks }
}

/** 0..100 position of a value on the axis. */
export function axisPct(v: number, d: { lo: number; hi: number }): number {
	return ((Math.min(Math.max(v, d.lo), d.hi) - d.lo) / (d.hi - d.lo)) * 100
}
