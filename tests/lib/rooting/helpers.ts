// Shared by the rooting tests: a stored guide for a small league (the build script only does the NFL), and a late-season NFL schedule.

import { getGames } from "@/lib/playoffs/data"
import type { Game, League } from "@/lib/playoffs/types"
import { MODEL_VERSION, makeContext, resultsKey, simulateConditional, simulateTie } from "@/lib/rooting/engine"
import { GOALS, type RootingData, SCALE } from "@/lib/rooting/types"

const ints = (xs: readonly number[]) => xs.map((v) => Math.round(v * SCALE))

/** What data/lab/rooting.json would hold for `games` in `league`, with ties worked out for every game. */
export function dataFor(games: readonly Game[], league: League, opts: { sims?: number; exactMax?: number } = {}): RootingData {
	const ctx = makeContext(games, league)
	const cond = simulateConditional(ctx, { sims: opts.sims, exactMax: opts.exactMax })
	const ties: Record<string, number[]> = {}
	ctx.open.forEach((g, i) => {
		ties[g.id] = ints(simulateTie(ctx, i, { sims: 2000, exactMax: opts.exactMax }))
	})
	const finals = games.filter((g) => g.status === "final")
	return {
		version: MODEL_VERSION,
		season: 2026,
		throughWeek: finals.reduce((m, g) => Math.max(m, g.week), 0),
		generatedAt: "2026-10-05T12:00:00Z",
		resultsKey: resultsKey(games),
		finals: finals.length,
		open: ctx.open.length,
		sims: cond.sims,
		exact: cond.exact,
		tieSims: 2000,
		source: "test",
		teams: ctx.teams,
		baseline: ints(cond.baseline),
		games: ctx.open.map((g, i) => ({ id: g.id, week: g.week, away: g.awayTeam, home: g.homeTeam, pHome: Math.round(ctx.chances[i] * SCALE), n: cond.games[i].n, H: ints(cond.games[i].H), A: ints(cond.games[i].A) })),
		ties,
		completed: [],
		history: [],
	}
}

export const goalIdx = (data: RootingData, team: string, goal: (typeof GOALS)[number]) => data.teams.indexOf(team) * GOALS.length + GOALS.indexOf(goal)

/**
 * The real schedule played out to the last `open` games with a fixed pattern of results (home wins, except every third game), so the
 * end-of-season states (clinched, eliminated, exact counting) can be tested without waiting for December.
 */
export function lateSeason(open = 6): Game[] {
	const games = getGames()
	const order = [...games].sort((a, b) => a.week - b.week || (a.id < b.id ? -1 : 1))
	const keep = new Set((open > 0 ? order.slice(-open) : []).map((g) => g.id))
	return games.map((g, i) => {
		if (keep.has(g.id)) return { ...g, homeScore: null, awayScore: null, status: "scheduled" as const, winner: null, tie: false }
		const awayWins = i % 3 === 0
		const hs = awayWins ? 17 : 24
		const as = awayWins ? 24 : 17
		return { ...g, homeScore: hs, awayScore: as, status: "final" as const, winner: awayWins ? g.awayTeam : g.homeTeam, tie: false }
	})
}
