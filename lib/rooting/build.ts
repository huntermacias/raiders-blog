// Puts the Sunday Rooting Guide's data together: the main pass over every open game, the tie runs for the games a fan will be shown,
// what the last couple of weeks' results were worth, and a snapshot of the odds after each finished week. Pure and deterministic.
// scripts/rooting/build.ts reads the schedule file, calls this and writes data/lab/rooting.json.

import type { Game } from "../playoffs/types"
import {
	EXACT_MAX_OPEN,
	HISTORY_SIMS,
	MODEL_VERSION,
	ROOTING_SIMS,
	SWING_SIMS,
	TIE_SIMS,
	gamesThroughWeek,
	makeContext,
	resultOf,
	resultSwing,
	resultsKey,
	simulateBaseline,
	simulateConditional,
	simulateTie,
} from "./engine"
import { tieTargets } from "./guide"
import { type CompletedGame, type HistoryPoint, type RootingData, SCALE } from "./types"

/** How many of the most recent weeks with a played game get "what was this result worth" worked out. */
export const COMPLETED_WEEKS = 2

export type BuildOptions = {
	season: number
	generatedAt: string
	source: string
	sims?: number
	tieSims?: number
	swingSims?: number
	historySims?: number
	exactMax?: number
	completedWeeks?: number
	/** The file from the last build. Snapshots whose results have not changed are reused instead of simulated again. */
	previous?: RootingData | null
	log?: (line: string) => void
}

const ints = (list: readonly number[]): number[] => list.map((v) => Math.round(v * SCALE))

/** The weeks in which every game has been played, in order. */
export function finishedWeeks(games: readonly Game[]): number[] {
	const left = new Map<string, number>()
	const weeks = new Set<number>()
	for (const g of games) {
		weeks.add(g.week)
		left.set(String(g.week), (left.get(String(g.week)) ?? 0) + (g.status === "final" ? 0 : 1))
	}
	return Array.from(weeks)
		.sort((a, b) => a - b)
		.filter((w) => left.get(String(w)) === 0)
}

export function buildRooting(games: readonly Game[], opts: BuildOptions): RootingData {
	const log = opts.log ?? (() => undefined)
	const sims = opts.sims ?? ROOTING_SIMS
	const tieSims = opts.tieSims ?? TIE_SIMS
	const swingSims = opts.swingSims ?? SWING_SIMS
	const historySims = opts.historySims ?? HISTORY_SIMS
	const exactMax = opts.exactMax ?? EXACT_MAX_OPEN

	const ctx = makeContext(games)
	const finals = games.filter((g) => g.status === "final")
	const throughWeek = finals.reduce((m, g) => Math.max(m, g.week), 0)

	log(`main pass: ${ctx.open.length} open games`)
	const cond = simulateConditional(ctx, { sims, exactMax })
	const data: RootingData = {
		version: MODEL_VERSION,
		season: opts.season,
		throughWeek,
		generatedAt: opts.generatedAt,
		resultsKey: resultsKey(games, { sims, tieSims }),
		finals: finals.length,
		open: ctx.open.length,
		sims: cond.sims,
		exact: cond.exact,
		tieSims,
		source: opts.source,
		teams: ctx.teams,
		baseline: ints(cond.baseline),
		games: ctx.open.map((g, i) => ({
			id: g.id,
			week: g.week,
			away: g.awayTeam,
			home: g.homeTeam,
			pHome: Math.round(ctx.chances[i] * SCALE),
			n: cond.games[i].n,
			H: ints(cond.games[i].H),
			A: ints(cond.games[i].A),
		})),
		ties: {},
		completed: [],
		history: [],
	}

	// Ties: only for the games a fan is shown (the top few for every team and goal), since each one needs its own run.
	const targets = tieTargets(data)
	log(`tie runs: ${targets.length} games`)
	for (const id of targets) {
		const index = ctx.open.findIndex((g) => g.id === id)
		if (index >= 0) data.ties[id] = ints(simulateTie(ctx, index, { sims: tieSims, exactMax }))
	}

	// What the recent results were worth.
	const weeks = Array.from(new Set(finals.map((g) => g.week))).sort((a, b) => a - b)
	const recent = new Set(weeks.slice(-(opts.completedWeeks ?? COMPLETED_WEEKS)))
	const done: CompletedGame[] = []
	for (const g of finals.filter((x) => recent.has(x.week)).sort((a, b) => a.week - b.week || (a.id < b.id ? -1 : 1))) {
		const result = resultOf(g)
		if (!result || g.homeScore === null || g.awayScore === null) continue
		log(`swing: ${g.id}`)
		const swing = result === "T" ? null : resultSwing(games, g.id, { sims: swingSims, exactMax })
		done.push({ id: g.id, week: g.week, away: g.awayTeam, home: g.homeTeam, awayScore: g.awayScore, homeScore: g.homeScore, result, swing: swing ? ints(swing) : [] })
	}
	data.completed = done

	// Snapshots after each finished week.
	const reuse = new Map((opts.previous?.history ?? []).map((h) => [h.key, h]))
	const history: HistoryPoint[] = []
	for (const w of finishedWeeks(games)) {
		const through = gamesThroughWeek(games, w)
		const key = resultsKey(through, { sims: historySims, tieSims: 0 })
		const old = reuse.get(key)
		if (old && old.week === w) {
			history.push(old)
			continue
		}
		log(`snapshot: week ${w}`)
		history.push({ week: w, key, p: ints(simulateBaseline(makeContext(through), { sims: historySims, exactMax })) })
	}
	data.history = history
	return data
}
