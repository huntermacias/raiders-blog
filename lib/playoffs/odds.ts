// Playoff odds: play the rest of the season thousands of times and count how often each team gets in.
//
// Win chances come from the site's own Elo ratings (lib/math/elo.ts), built from the games already played. The reader's
// picks are held fixed, so the odds answer "given what I have picked, how likely is each team to make it from here?"
//
// Pure and deterministic, like the rest of the engine: the same games and picks always give the same odds, with no clock
// and no Math.random. Every simulated game takes its random number from a hash of (simulation number, game id), not from
// a stream. That makes the dice the same in every scenario: picking one game changes only that game, so two scenarios are
// compared on the same simulated seasons instead of on two different sets of luck, and the odds do not jitter between
// reloads or between one pick and the next.
//
// The odds are a model, not a prediction. Ties are not simulated (about 1 game in 300 in the NFL), and the ratings do
// not know about injuries, rest or the spread.

import { type Ratings, START_RATING, homeWinProbability, runElo } from "../math/elo"
import { NFL_LEAGUE, buildSeason, openGamesFor } from "./season"
import { seedConference } from "./standings"
import type { Conference, Game, League, Outcome, Predictions } from "./types"

/** Simulated seasons per run. Enough that the odds move by less than about a point from one run to the next. */
export const DEFAULT_SIMS = 3000
/** Simulated seasons for the odds the page and its share card show, so the two always agree. */
export const PAGE_SIMS = 2000
/** A bucket with fewer simulated seasons than this is too small to quote. */
export const MIN_BUCKET = 120

export type Odds = {
	team: string
	/** 0 to 1: made the playoffs (any of the seven seeds). */
	playoffs: number
	/** 0 to 1: won the division. */
	division: number
	/** 0 to 1: took the top seed (the first-round bye). */
	bye: number
	/** 0 to 1 for seed 1, seed 2 and so on; the chance of finishing outside the seeds is 1 minus their sum. */
	seeds: number[]
}

export type GameLeverage = {
	gameId: string
	week: number
	opp: string
	home: boolean
	/** The model's chance this team wins the game. */
	pWin: number
	/** The team's playoff odds in the simulated seasons where it wins / loses this game. Null when too few seasons to say. */
	ifWin: number | null
	ifLose: number | null
	/** ifWin minus ifLose: how much the game is worth, in points of playoff odds. Null when either side is null. */
	swing: number | null
}

export type OddsResult = {
	sims: number
	/** True when no game is open: the answer is the table itself, not an estimate. */
	exact: boolean
	teams: Record<string, Odds>
	/** The tracked team's next open games, soonest first. Empty when no team is tracked. */
	leverage: GameLeverage[]
}

export type OddsInput = {
	games: readonly Game[]
	predictions?: Predictions
	league?: League
	/** Elo ratings by team. Left out, they are built from the played games with ratingsFor(). */
	ratings?: Ratings
	sims?: number
	/** The team whose games are scored for leverage. */
	track?: string
	/** How many of its next open games to score. */
	trackGames?: number
}

/** Elo ratings from the games already played this season (every team starts at 1500, as in the site's model). */
export function ratingsFor(games: readonly Game[]): Ratings {
	const finished = games
		.filter((g) => g.status === "final" && g.homeScore !== null && g.awayScore !== null)
		.map((g) => ({ week: g.week, home: g.homeTeam, away: g.awayTeam, homeScore: g.homeScore as number, awayScore: g.awayScore as number }))
	return runElo(finished).ratings
}

/** The chance the home team wins a game, from the two teams' ratings. */
export function homeChance(ratings: Ratings, g: Pick<Game, "homeTeam" | "awayTeam">): number {
	return homeWinProbability(ratings[g.homeTeam] ?? START_RATING, ratings[g.awayTeam] ?? START_RATING)
}

/** A number from 0 up to (not including) 1 that depends only on the simulation number and the game. Murmur3's finalizer. */
export function uniform(sim: number, gameIndex: number): number {
	let h = Math.imul(sim + 1, 0x9e3779b1) ^ Math.imul(gameIndex + 1, 0x85ebca6b)
	h ^= h >>> 16
	h = Math.imul(h, 0x85ebca6b)
	h ^= h >>> 13
	h = Math.imul(h, 0xc2b2ae35)
	h ^= h >>> 16
	return (h >>> 0) / 4294967296
}

export type OddsRun = {
	/** Plays up to `count` more simulated seasons. */
	step: (count: number) => void
	readonly done: boolean
	readonly played: number
	readonly total: number
	/** The odds so far. */
	result: () => OddsResult
}

/**
 * A run that can be played a few simulations at a time, so a page can keep responding while it works. `step` until `done`,
 * then `result()`. Reading the result early gives the odds from the seasons played so far.
 */
export function oddsRun(input: OddsInput): OddsRun {
	const league = input.league ?? NFL_LEAGUE
	const picks = input.predictions ?? {}
	const ratings = input.ratings ?? ratingsFor(input.games)
	const base = buildSeason(league, input.games, picks)
	const open = base.open
	const exact = open.length === 0
	const total = exact ? 1 : Math.max(1, input.sims ?? DEFAULT_SIMS)
	const conferences = Array.from(new Set(league.teams.map((t) => t.conference))).sort() as Conference[]

	const chances = open.map((g) => homeChance(ratings, g))

	const tally = new Map<string, { playoffs: number; division: number; seeds: number[] }>()
	for (const t of league.teams) tally.set(t.id, { playoffs: 0, division: 0, seeds: new Array<number>(8).fill(0) })

	const track = input.track && league.teams.some((t) => t.id === input.track) ? input.track : null
	const watched = track ? open.map((g, i) => ({ g, i })).filter(({ g }) => g.homeTeam === track || g.awayTeam === track).sort((a, b) => a.g.week - b.g.week).slice(0, Math.max(0, input.trackGames ?? 3)) : []
	const lever = watched.map(() => ({ win: 0, winIn: 0, lose: 0, loseIn: 0 }))

	let played = 0

	function one(sim: number) {
		const preds: Record<string, Outcome> = { ...picks }
		const homeWon: boolean[] = new Array<boolean>(open.length)
		for (let i = 0; i < open.length; i++) {
			const home = uniform(sim, i) < chances[i]
			homeWon[i] = home
			preds[open[i].id] = home ? "H" : "A"
		}
		const season = exact ? base : buildSeason(league, input.games, preds)
		let trackedIn = false
		for (const c of conferences) {
			const s = seedConference(season, c)
			s.seeds.forEach((id, k) => {
				const row = tally.get(id) as { playoffs: number; division: number; seeds: number[] }
				row.playoffs++
				row.seeds[k + 1]++
				if (id === track) trackedIn = true
			})
			for (const id of s.winners) (tally.get(id) as { division: number }).division++
		}
		watched.forEach(({ g, i }, w) => {
			const wins = (g.homeTeam === track) === homeWon[i]
			if (wins) {
				lever[w].win++
				if (trackedIn) lever[w].winIn++
			} else {
				lever[w].lose++
				if (trackedIn) lever[w].loseIn++
			}
		})
		played++
	}

	const result = (): OddsResult => {
		const n = Math.max(1, played)
		const teams: Record<string, Odds> = {}
		for (const t of league.teams) {
			const row = tally.get(t.id) as { playoffs: number; division: number; seeds: number[] }
			const seeds = row.seeds.slice(1).map((c) => c / n)
			teams[t.id] = { team: t.id, playoffs: row.playoffs / n, division: row.division / n, bye: row.seeds[1] / n, seeds: seeds.slice(0, 7) }
		}
		const leverage: GameLeverage[] = watched.map(({ g, i }, w) => {
			const home = g.homeTeam === track
			const ifWin = lever[w].win >= MIN_BUCKET ? lever[w].winIn / lever[w].win : null
			const ifLose = lever[w].lose >= MIN_BUCKET ? lever[w].loseIn / lever[w].lose : null
			return {
				gameId: g.id,
				week: g.week,
				opp: home ? g.awayTeam : g.homeTeam,
				home,
				pWin: home ? chances[i] : 1 - chances[i],
				ifWin,
				ifLose,
				swing: ifWin !== null && ifLose !== null ? ifWin - ifLose : null,
			}
		})
		return { sims: played, exact, teams, leverage }
	}

	return {
		step(count: number) {
			const end = Math.min(total, played + Math.max(0, count))
			while (played < end) one(played)
		},
		get done() {
			return played >= total
		},
		get played() {
			return played
		},
		total,
		result,
	}
}

/** All the simulated seasons in one go. Use `oddsRun` to spread the work out. */
export function simulateOdds(input: OddsInput): OddsResult {
	const run = oddsRun(input)
	run.step(run.total)
	return run.result()
}

/** Open games a team has left under these picks. */
export function gamesLeft(games: readonly Game[], picks: Predictions, team: string, league: League = NFL_LEAGUE): number {
	return openGamesFor(buildSeason(league, games, picks), team)
}
