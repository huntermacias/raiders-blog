// Simulate the rest of the season for the reader: every open game gets a result from the same Elo ratings that drive the
// playoff odds, so the two can never contradict each other. A sim is a plain set of picks, so it can be edited, undone,
// compared and shared like any other scenario.
//
// Deterministic: a game's dice depend only on the sim number and the game's place in the schedule, never on which other
// games are open. Re-running sim #42 after the reader changes one pick re-rolls nothing else.
// The model starts every team at the same rating and learns only from this season's final scores; it knows nothing about
// injuries, rest or the spread, and it never simulates a tie. It is a model, not a forecast.

import { type Ratings, START_RATING } from "../math/elo"
import { homeChance, ratingsFor, uniform } from "./odds"
import { actualOutcome } from "./season"
import type { Game, Outcome, Predictions } from "./types"

export type SimRule =
	/** Each game goes the way a seeded roll says, weighted by the model's win chance. */
	| "model"
	/** Every game goes to the team the model favors. The single most likely result for each game, not the most likely season. */
	| "favorites"

export type SimScope = {
	weeks?: readonly number[]
	/** Leave games the reader has already picked as they are. */
	keepPicks?: boolean
}

export type SimOptions = SimScope & {
	rule?: SimRule
	/** Which simulated season. Any non-negative integer. */
	seed?: number
	ratings?: Ratings
}

/** The model's chance that the home team wins, for every open game by id. */
export function gameChances(games: readonly Game[], ratings: Ratings = ratingsFor(games)): Record<string, number> {
	const out: Record<string, number> = {}
	for (const g of games) if (actualOutcome(g) === null) out[g.id] = homeChance(ratings, g)
	return out
}

export function simulateRemaining(games: readonly Game[], picks: Predictions, options: SimOptions = {}): Predictions {
	const rule = options.rule ?? "model"
	const seed = Math.max(0, Math.floor(options.seed ?? 0))
	const ratings = options.ratings ?? ratingsFor(games)
	const next: Record<string, Outcome> = { ...picks }
	games.forEach((g, index) => {
		if (actualOutcome(g) !== null) return
		if (options.weeks && !options.weeks.includes(g.week)) return
		if (options.keepPicks && Object.prototype.hasOwnProperty.call(picks, g.id)) return
		const p = homeChance(ratings, g)
		const home = rule === "favorites" ? p >= 0.5 : uniform(seed, index) < p
		next[g.id] = home ? "H" : "A"
	})
	return next
}

/** How the model sees one game, for a label on the game card. */
export function chanceLabel(games: readonly Game[], ratings: Ratings, g: Game): { team: string; pct: number } {
	const p = homeChance(ratings, g)
	return p >= 0.5 ? { team: g.homeTeam, pct: Math.round(p * 100) } : { team: g.awayTeam, pct: Math.round((1 - p) * 100) }
}

export const EVEN_RATING = START_RATING
