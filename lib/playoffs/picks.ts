// Everything that changes a reader's picks. Each function returns a new object and never touches the one it was given,
// and none of them can change a game that has been played.

import { actualOutcome } from "./season"
import type { Game, Outcome, Predictions } from "./types"

export type Scope = {
	/** Only these weeks. Leave out for every week. */
	weeks?: readonly number[]
	/** Leave games the reader has already picked as they are, and fill in only the rest. */
	keepPicks?: boolean
}

const isOpenGame = (g: Game) => actualOutcome(g) === null

const has = (picks: Predictions, id: string) => Object.prototype.hasOwnProperty.call(picks, id)

function inScope(g: Game, scope: Scope, picks: Predictions = {}): boolean {
	return isOpenGame(g) && (!scope.weeks || scope.weeks.includes(g.week)) && !(scope.keepPicks && has(picks, g.id))
}

/** Drops picks for unknown games and for games that have been played, and anything that is not a valid pick. */
export function sanitizePicks(games: readonly Game[], picks: Predictions | null | undefined): Predictions {
	const out: Record<string, Outcome> = {}
	if (!picks) return out
	for (const g of games) {
		if (!isOpenGame(g)) continue
		const v = Object.prototype.hasOwnProperty.call(picks, g.id) ? picks[g.id] : undefined
		if (v === "H" || v === "A" || v === "T") out[g.id] = v
	}
	return out
}

/** Picks a result for one game. Picking the same result again takes it back. Played games cannot be picked. */
export function setPick(games: readonly Game[], picks: Predictions, gameId: string, outcome: Outcome): Predictions {
	const game = games.find((g) => g.id === gameId)
	if (!game || !isOpenGame(game)) return picks
	const next: Record<string, Outcome> = { ...picks }
	if (next[gameId] === outcome) delete next[gameId]
	else next[gameId] = outcome
	return next
}

/** Every open game a team plays in scope goes its way: the team wins all of them, or loses all of them. Other games are left alone. */
export function pickTeamGames(games: readonly Game[], picks: Predictions, team: string, result: "W" | "L", scope: Scope = {}): Predictions {
	const next: Record<string, Outcome> = { ...picks }
	for (const g of games) {
		if (!inScope(g, scope, picks) || (g.homeTeam !== team && g.awayTeam !== team)) continue
		const teamIsHome = g.homeTeam === team
		next[g.id] = (result === "W") === teamIsHome ? "H" : "A"
	}
	return next
}

/** Every open game in scope goes to the home team. */
export function pickHomeTeams(games: readonly Game[], picks: Predictions, scope: Scope = {}): Predictions {
	const next: Record<string, Outcome> = { ...picks }
	for (const g of games) if (inScope(g, scope, picks)) next[g.id] = "H"
	return next
}

/**
 * Every open game in scope goes to the team the market favors. A game with no spread, or a pick'em, is left as it was:
 * a favorite is never guessed at.
 */
export function pickFavorites(games: readonly Game[], picks: Predictions, scope: Scope = {}): Predictions {
	const next: Record<string, Outcome> = { ...picks }
	for (const g of games) {
		if (!inScope(g, scope, picks)) continue
		if (typeof g.spread !== "number" || g.spread === 0 || !Number.isFinite(g.spread)) continue
		next[g.id] = g.spread > 0 ? "H" : "A"
	}
	return next
}

/** How many open games in scope have a market favorite, so a button can say what it will actually do. */
export function favoritesAvailable(games: readonly Game[], scope: Scope = {}): number {
	return games.filter((g) => inScope(g, scope) && typeof g.spread === "number" && g.spread !== 0).length
}

/** Every open game in scope gets a fair coin flip. No ties. `random` returns a number from 0 up to, not including, 1. */
export function pickRandom(games: readonly Game[], picks: Predictions, random: () => number, scope: Scope = {}): Predictions {
	const next: Record<string, Outcome> = { ...picks }
	// Games are visited in schedule order so the same random sequence always gives the same scenario.
	for (const g of games) if (inScope(g, scope, picks)) next[g.id] = random() < 0.5 ? "H" : "A"
	return next
}

/** Takes back the picks in scope (all of them by default). Played games are not picks, so they are untouched. */
export function clearPicks(games: readonly Game[], picks: Predictions, scope: Scope = {}): Predictions {
	if (!scope.weeks) return {}
	const weeks = new Set(scope.weeks)
	const next: Record<string, Outcome> = { ...picks }
	for (const g of games) if (weeks.has(g.week)) delete next[g.id]
	return next
}

/** A small, fast seeded random number generator (mulberry32), so a "randomize" can be repeated in a test. */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export type WeekProgress = { week: number; total: number; played: number; picked: number; open: number }

/** For each week: how many games, how many are played, how many the reader has picked and how many are still open. */
export function weekProgress(games: readonly Game[], picks: Predictions): WeekProgress[] {
	const weeks = new Map<number, WeekProgress>()
	for (const g of games) {
		const w = weeks.get(g.week) ?? { week: g.week, total: 0, played: 0, picked: 0, open: 0 }
		w.total++
		if (!isOpenGame(g)) w.played++
		else if (Object.prototype.hasOwnProperty.call(picks, g.id)) w.picked++
		else w.open++
		weeks.set(g.week, w)
	}
	return Array.from(weeks.values()).sort((a, b) => a.week - b.week)
}

/** The first week that still has a game to pick, or the last week when the season is over. */
export function firstOpenWeek(games: readonly Game[]): number {
	const open = games.filter(isOpenGame).map((g) => g.week)
	if (open.length) return Math.min(...open)
	return games.reduce((m, g) => Math.max(m, g.week), 1)
}
