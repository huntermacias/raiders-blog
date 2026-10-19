// Playoff odds: play the rest of the season thousands of times and count how often each team gets in.
//
// Win chances come from lib/ratings (the fitted, back-tested strength model: posted spreads where there are any, calibrated
// Elo + market ratings elsewhere), and every simulated season also draws how strong each team really is, so a team that is
// better than its rating says wins more of its games all year, as real teams do. The reader's picks are held fixed, so the odds
// answer "given what I have picked, how likely is each team to make it from here?"
//
// Pure and deterministic, like the rest of the engine: the same games and picks always give the same odds, with no clock and no
// Math.random. Every random number comes from a hash of (simulation number, game id) or (simulation number, team), not from a
// stream and not from a game's position in a list. That makes the dice the same in every scenario: picking one game changes only
// that game, two scenarios are compared on the same simulated seasons, and a game keeps its dice when the games before it are
// played, hidden or reordered.
//
// The odds are a model, not a prediction. Ties are not simulated (about 1 game in 300 in the NFL), and the model does not know
// about injuries or rest beyond what the spread already contains.

import { type Coefs, type RatingsModel, type Strength, coefsOf, homeLogit, homeProbability, logistic, normalQuantile, stretch, strengthFor } from "../ratings/model"
import { getModel } from "../ratings/data"
import { NFL_LEAGUE, buildSeason, openGamesFor, recordOf, winValue } from "./season"
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

/** One game's pull on the tracked team's playoff odds, whoever is playing. */
export type RootingLeverage = {
	gameId: string
	week: number
	home: string
	away: string
	/** The tracked team's playoff odds in the simulated seasons where the home / away team wins. Null when too few seasons to say. */
	ifHome: number | null
	ifAway: number | null
	/** Absolute difference in points of odds (0 to 1). Null when either side is null. */
	swing: number | null
	/** The team the tracked team is better off with winning, or null when it makes no clear difference. */
	rootFor: string | null
}

/** How often the tracked team made the playoffs when it finished with this many wins, across the simulated seasons. */
export type WinsRow = { wins: number; seasons: number; made: number }

export type OddsResult = {
	sims: number
	/** True when no game is open: the answer is the table itself, not an estimate. */
	exact: boolean
	teams: Record<string, Odds>
	/** The tracked team's next open games, soonest first. Empty when no team is tracked. */
	leverage: GameLeverage[]
	/** Every open game ranked by how much it moves the tracked team's odds. Empty unless `rootAll` was asked for. */
	rooting: RootingLeverage[]
	/** The tracked team's win totals across the simulated seasons, fewest wins first. Empty when no team is tracked. */
	winsTable: WinsRow[]
}

export type OddsInput = {
	games: readonly Game[]
	predictions?: Predictions
	league?: League
	/** Team strength. Left out, it is built from the games with ratingsFor(). */
	ratings?: Strength
	/** Spread of a team's true strength around its rating (log-odds). Left out, the fitted value; 0 turns the shock off. */
	sigma?: number
	sims?: number
	/** The team whose games are scored for leverage. */
	track?: string
	/** How many of its next open games to score. */
	trackGames?: number
	/** Also score every open game, whoever plays in it, for the tracked team's odds. */
	rootAll?: boolean
}

/** Team strength for a set of games: Elo and market ratings from the model, starting from last season's where it has them. */
export function ratingsFor(games: readonly Game[], model: RatingsModel = getModel()): Strength {
	return strengthFor(games, model)
}

/** The calibrated chance the home team wins a game, from its spread when it has one and the two teams' ratings otherwise. */
export function homeChance(strength: Strength, g: Pick<Game, "homeTeam" | "awayTeam" | "spread" | "neutral">): number {
	return homeProbability(strength, g)
}

/** A number from 0 up to (not including) 1 that depends only on the simulation number and the key. Murmur3's finalizer. */
export function uniform(sim: number, key: number): number {
	let h = Math.imul(sim + 1, 0x9e3779b1) ^ Math.imul(key + 1, 0x85ebca6b)
	h ^= h >>> 16
	h = Math.imul(h, 0x85ebca6b)
	h ^= h >>> 13
	h = Math.imul(h, 0xc2b2ae35)
	h ^= h >>> 16
	return (h >>> 0) / 4294967296
}

/** A 32-bit number for a game or team id (FNV-1a), so its dice belong to the id and not to a position in a list. */
export function keyOf(id: string): number {
	let h = 0x811c9dc5
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i)
		h = Math.imul(h, 0x01000193)
	}
	return h >>> 0
}

/**
 * Plays one simulated season's dice: fills `homeWon` (1 = the home team won) for every game, and leaves behind what it drew
 * (`zeta`, each team's standard-normal strength draw; `prob`, each game's chance given those draws) so a caller can ask what the
 * same draws would have meant under a different model.
 */
export type Roller = ((sim: number, homeWon: Uint8Array) => void) & {
	/** Each team's standard-normal strength draw in the latest simulated season, by slot. */
	readonly zeta: Float64Array
	/** Each game's chance of a home win given those draws, in the order of the games. */
	readonly prob: Float64Array
	/** The slot of each game's home and away team in `zeta`. */
	readonly homeSlot: Int32Array
	readonly awaySlot: Int32Array
}

/**
 * The dice for a set of games. Each simulated season first draws how strong every team really is (a normal shock of spread `sigma`
 * on the log-odds, the same shock in all of that team's games), then flips each game with the chance that follows. The log-odds
 * passed in are the calibrated forecasts; they are stretched by `stretch(sigma)` so that, averaged over the shocks, every game's
 * chance is that forecast again. With `sigma` 0 this is one independent flip per game at exactly the forecast.
 * `logits` are in the order of `games`.
 */
export function rollerFor(games: readonly Pick<Game, "id" | "homeTeam" | "awayTeam">[], logits: readonly number[], sigma: number): Roller {
	const k = sigma > 0 ? stretch(sigma) : 1
	const slots = new Map<string, number>()
	const teamKeys: number[] = []
	const slotOf = (t: string) => {
		let i = slots.get(t)
		if (i === undefined) {
			i = teamKeys.length
			slots.set(t, i)
			teamKeys.push(keyOf(`team:${t}`))
		}
		return i
	}
	const gameKeys = games.map((g) => keyOf(g.id))
	const homeSlot = Int32Array.from(games.map((g) => slotOf(g.homeTeam)))
	const awaySlot = Int32Array.from(games.map((g) => slotOf(g.awayTeam)))
	const z = logits.map((l) => l * k)
	const zeta = new Float64Array(teamKeys.length)
	const prob = new Float64Array(games.length)
	const roll = (sim: number, homeWon: Uint8Array) => {
		for (let i = 0; i < zeta.length; i++) zeta[i] = normalQuantile(uniform(sim, teamKeys[i]))
		for (let i = 0; i < gameKeys.length; i++) {
			const p = logistic(z[i] + sigma * (zeta[homeSlot[i]] - zeta[awaySlot[i]]))
			prob[i] = p
			homeWon[i] = uniform(sim, gameKeys[i]) < p ? 1 : 0
		}
	}
	return Object.assign(roll, { zeta, prob, homeSlot, awaySlot })
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
	const strength = input.ratings ?? ratingsFor(input.games)
	const coefs: Coefs = coefsOf(strength.model)
	const sigma = input.sigma ?? coefs.sigma
	const base = buildSeason(league, input.games, picks)
	const open = base.open
	const exact = open.length === 0
	const total = exact ? 1 : Math.max(1, input.sims ?? DEFAULT_SIMS)
	const conferences = Array.from(new Set(league.teams.map((t) => t.conference))).sort() as Conference[]

	const logits = open.map((g) => homeLogit(strength, g, coefs))
	const chances = logits.map(logistic)
	const roll = rollerFor(open, logits, sigma)
	const homeWon = new Uint8Array(open.length)

	const tally = new Map<string, { playoffs: number; division: number; seeds: number[] }>()
	for (const t of league.teams) tally.set(t.id, { playoffs: 0, division: 0, seeds: new Array<number>(8).fill(0) })

	const track = input.track && league.teams.some((t) => t.id === input.track) ? input.track : null
	const watched = track ? open.map((g, i) => ({ g, i })).filter(({ g }) => g.homeTeam === track || g.awayTeam === track).sort((a, b) => a.g.week - b.g.week).slice(0, Math.max(0, input.trackGames ?? 3)) : []
	const lever = watched.map(() => ({ win: 0, winIn: 0, lose: 0, loseIn: 0 }))
	// For rooting: per open game, how often the home team won and the tracked team got in then, and the same for the away team.
	const rootAll = Boolean(track && input.rootAll)
	const roots = rootAll ? open.map(() => ({ h: 0, hIn: 0, a: 0, aIn: 0 })) : []
	const winsSeen = new Map<number, { seasons: number; made: number }>()

	let played = 0

	function one(sim: number) {
		const preds: Record<string, Outcome> = { ...picks }
		roll(sim, homeWon)
		for (let i = 0; i < open.length; i++) preds[open[i].id] = homeWon[i] ? "H" : "A"
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
		if (track) {
			const wins = Math.round(winValue(recordOf(season, track).overall))
			const row = winsSeen.get(wins) ?? { seasons: 0, made: 0 }
			row.seasons++
			if (trackedIn) row.made++
			winsSeen.set(wins, row)
		}
		if (rootAll) {
			for (let i = 0; i < open.length; i++) {
				const r = roots[i]
				if (homeWon[i]) {
					r.h++
					if (trackedIn) r.hIn++
				} else {
					r.a++
					if (trackedIn) r.aIn++
				}
			}
		}
		watched.forEach(({ g, i }, w) => {
			const wins = (g.homeTeam === track) === (homeWon[i] === 1)
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
		const rooting: RootingLeverage[] = rootAll
			? open
					.map((g, i) => {
						const r = roots[i]
						const ifHome = r.h >= MIN_BUCKET ? r.hIn / r.h : null
						const ifAway = r.a >= MIN_BUCKET ? r.aIn / r.a : null
						const swing = ifHome !== null && ifAway !== null ? Math.abs(ifHome - ifAway) : null
						const rootFor = swing === null || swing < 0.01 ? null : (ifHome as number) > (ifAway as number) ? g.homeTeam : g.awayTeam
						return { gameId: g.id, week: g.week, home: g.homeTeam, away: g.awayTeam, ifHome, ifAway, swing, rootFor }
					})
					.sort((x, y) => (y.swing ?? -1) - (x.swing ?? -1) || x.week - y.week || x.gameId.localeCompare(y.gameId))
			: []
		const winsTable: WinsRow[] = Array.from(winsSeen, ([wins, v]) => ({ wins, ...v })).sort((x, y) => x.wins - y.wins)
		return { sims: played, exact, teams, leverage, rooting, winsTable }
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
