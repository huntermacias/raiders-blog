// The two formats that sit beside NFL game winners: confidence picks and the upset challenge.
//
// Both run on the same NFL games as the winners league, each as its own competition with its own picks.
//
//   Confidence: pick every winner in a week and give each pick a different rank, from 1 up to the number of games.
//   A correct pick scores its rank, so the game you are surest of should carry the biggest number. Ranks of games that
//   have started are fixed.
//
//   Upset challenge: before each week the site's own ratings name an underdog for every game and say how big an upset
//   it would be. Players call up to a handful of upsets a week. A called upset that happens scores 1 point, plus 1 for
//   each tier of rating gap above the first. A wrong call scores nothing, so the cap is what keeps it a game of nerve.
//
// Pure: no I/O, no clock.

import { type Ratings, HOME_FIELD, START_RATING, runElo } from "../../math/elo"
import { type UpsetSnapshot, underdogSnapshot, upsetTier } from "./grading"
import type { UpsetPolicy } from "./policy"

export const DEFAULT_MAX_UPSETS = 5

export type ConfidencePayload = { pick: "away" | "home"; rank: number }
export type UpsetPayload = { pick: "away" | "home" | "none" }

/** One confidence pick: a side and a rank from 1 to the number of games that week. */
export function validateConfidencePick(p: { pick?: unknown; rank?: unknown }, max: number): string | null {
	if (p.pick !== "away" && p.pick !== "home") return "Pick a team"
	if (typeof p.rank !== "number" || !Number.isInteger(p.rank) || p.rank < 1 || p.rank > max) return `Confidence ranks run from 1 to ${max}`
	return null
}

/**
 * An upset call. The only side that can be called is the underdog, because picking the favourite could never score.
 * "none" takes a call back before the game starts.
 */
export function validateUpsetCall(p: { pick?: unknown }, underdog: "away" | "home" | null): string | null {
	if (underdog === null) return "There is no underdog in this game"
	if (p.pick === "none") return null
	return p.pick === underdog ? null : "Only the underdog can be called as an upset"
}

/** Points a called upset is worth, from the favourite's win chance. */
export function upsetValue(policy: UpsetPolicy, favouriteWinChance: number): number {
	return policy.rules.base + (upsetTier(policy, favouriteWinChance) - 1) * policy.rules.perTier
}

export type UpsetLine = UpsetSnapshot & { homeRating: number; awayRating: number }

export type FinalResult = { week: number; home: string; away: string; homeScore: number; awayScore: number }

/** Ratings from the finished games so far. `prior` is last season's ratings already pulled toward the middle (see `carryOver`), or null for a flat start. */
export function ratingsFromFinals(finals: readonly FinalResult[], prior: Ratings | null): Ratings {
	const start = prior ?? {}
	return runElo(finals.map((g) => ({ week: g.week, home: g.home, away: g.away, homeScore: g.homeScore, awayScore: g.awayScore })), start).ratings
}

/** The underdog line for one game, or null for a dead heat. Ratings are rounded to two places so what is stored is what was used. */
export function upsetLineFor(home: string, away: string, ratings: Ratings): UpsetLine | null {
	const homeRating = Math.round((ratings[home] ?? START_RATING) * 100) / 100
	const awayRating = Math.round((ratings[away] ?? START_RATING) * 100) / 100
	const snap = underdogSnapshot(homeRating, awayRating, HOME_FIELD)
	if (!snap) return null
	// Five places is what the database keeps.
	return { ...snap, favouriteWinChance: Math.round(snap.favouriteWinChance * 100000) / 100000, homeRating, awayRating }
}

/** Does the player have room for another upset call this week? `calls` are the games they already call. */
export function canCallAnotherUpset(calls: number, max: number = DEFAULT_MAX_UPSETS): boolean {
	return calls < max
}

/** The most points a confidence week can offer: every rank from 1 to the number of games, all right. */
export const maxConfidencePoints = (games: number): number => (games * (games + 1)) / 2
