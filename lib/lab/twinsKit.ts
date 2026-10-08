// "Season twins": which past team-seasons looked most like the Raiders after the same number of games.
//
// Every team-season since 1999 is a point in a space with one axis per stat (the same 18 stats as "Will it
// last?"). Each axis is scaled by how much teams differ on it, so a stat is worth the same as any other, and the
// twins are the team-seasons closest to the Raiders in that space. Pure functions of the tables they are handed;
// like historyKit.ts this file imports no data, so the browser, the server and the tests can all run it.

import { type Meta, type Outcomes, type Table, isRaiders, outcomesFor, seasonGames, seasonOf, teamLabel } from "./historyKit"

export type TwinMode = "all" | "off" | "def"

export const TWIN_MODES: { id: TwinMode; label: string; note: string }[] = [
	{ id: "all", label: "The whole team", note: "Offense and defense together" },
	{ id: "off", label: "Offense only", note: "Teams whose offense looked like this one" },
	{ id: "def", label: "Defense only", note: "Teams whose defense looked like this one" },
]

export const isMode = (v: string | undefined): v is TwinMode => v === "all" || v === "off" || v === "def"

/** The closest team-seasons shown one by one. */
export const SHOWN = 5
/** The closest team-seasons whose seasons are added up for the forecast. Five is a good story and a poor forecast, thirty is the reverse. */
export const POOL = 30
/** Fewer stats than this and there is nothing to match on. */
export const MIN_STATS = 6

/** One stat, with where the Raiders stand on it. `pct` is the share of all team-seasons the number beats, so further out is always better. */
export type TwinStat = {
	key: string
	label: string
	short: string
	fmt: Table["fmt"]
	family: "off" | "def"
	higherIsBetter: boolean
	raiders: number
	raidersPct: number
}

export type Twin = {
	/** Index into the Meta lists. */
	i: number
	/** "2012 SEA". */
	row: string
	label: string
	/** Closeness: 0 is identical, and the scale is how much teams usually differ. */
	distance: number
	/** The share of all team-seasons that are further from the Raiders than this one: 0.99 means closer than 99% of them. */
	closer: number
	startWins: number
	startLosses: number
	wins: number
	losses: number
	games: number
	playoffs: boolean
	raiders: boolean
	/** Per stat, in the order of `TwinsResult.stats`. */
	values: (number | null)[]
	pcts: (number | null)[]
	rest: (number | null)[]
}

export type TwinsResult = {
	mode: TwinMode
	n: number
	stats: TwinStat[]
	twins: Twin[]
	/** The closest of the Raiders' own earlier teams, or null when none could be matched. */
	raidersTwin: Twin | null
	/** The POOL closest, added up. */
	pool: { size: number; outcomes: Outcomes; avgCloser: number }
	/** The typical distance from the Raiders to a team-season. */
	median: number
}

const usable = (tables: Table[], mode: TwinMode): Table[] => tables.filter((t) => t.family !== "net" && (mode === "all" || t.family === mode))

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

function spread(xs: number[], m: number): number {
	const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length)
	return Math.sqrt(v) || 1
}

/** Share of `sorted` that `v` beats (ties count half), turned so that a higher number is always better. */
function pctOf(sorted: number[], v: number, higherIsBetter: boolean): number {
	let lo = 0
	let hi = sorted.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (sorted[mid] < v) lo = mid + 1
		else hi = mid
	}
	const below = lo
	let eq = lo
	while (eq < sorted.length && sorted[eq] === v) eq++
	const frac = sorted.length ? (below + (eq - below) / 2) / sorted.length : 0.5
	return higherIsBetter ? frac : 1 - frac
}

type Space = {
	tables: Table[]
	mean: number[]
	sd: number[]
	sorted: number[][]
	/** Scaled values per team-season, null where a stat could not be measured. */
	z: (number | null)[][]
	need: number
}

function buildSpace(meta: Meta, tables: Table[]): Space {
	const m: number[] = []
	const sd: number[] = []
	const sorted: number[][] = []
	for (const t of tables) {
		const xs = t.start.filter((v): v is number => v !== null)
		const mu = mean(xs)
		m.push(mu)
		sd.push(spread(xs, mu))
		sorted.push([...xs].sort((a, b) => a - b))
	}
	const z = meta.teams.map((_, i) => tables.map((t, j) => (t.start[i] === null ? null : ((t.start[i] as number) - m[j]) / sd[j])))
	return { tables, mean: m, sd, sorted, z, need: Math.max(MIN_STATS, Math.ceil(tables.length * 0.75)) }
}

/** Root-mean-square gap between two scaled rows over the stats both have; null when they share too few. */
function gap(a: (number | null)[], b: (number | null)[], need: number): number | null {
	let s = 0
	let k = 0
	for (let j = 0; j < a.length; j++) {
		const x = a[j]
		const y = b[j]
		if (x === null || y === null) continue
		s += (x - y) ** 2
		k++
	}
	return k >= need ? Math.sqrt(s / k) : null
}

function median(xs: number[]): number {
	if (!xs.length) return NaN
	const s = [...xs].sort((a, b) => a - b)
	const mid = s.length >> 1
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Share of the `total` ranked team-seasons that sit further out than the one at 0-based `rank`. */
const closerOf = (rank: number, total: number): number => (total > 1 ? (total - 1 - rank) / (total - 1) : 1)

function twinAt(meta: Meta, space: Space, i: number, d: number, closer: number): Twin {
	const row = meta.teams[i]
	return {
		i,
		row,
		label: teamLabel(row),
		distance: d,
		closer,
		startWins: meta.startWins[i],
		startLosses: meta.startLosses[i],
		wins: meta.wins[i],
		losses: meta.losses[i],
		games: seasonGames(seasonOf(row)),
		playoffs: meta.po[i] === 1,
		raiders: isRaiders(row),
		values: space.tables.map((t) => t.start[i]),
		pcts: space.tables.map((t, j) => (t.start[i] === null ? null : pctOf(space.sorted[j], t.start[i] as number, t.higherIsBetter))),
		rest: space.tables.map((t) => t.rest[i]),
	}
}

/**
 * The team-seasons that looked most like the Raiders after `meta.n` games. `shown` of them are returned one by one;
 * the closest `pool` are added up in `pool`. Returns null when too few stats are available to match on.
 */
export function findTwins(meta: Meta, allTables: Table[], mode: TwinMode = "all", shown = SHOWN, pool = POOL): TwinsResult | null {
	const tables = usable(allTables, mode)
	if (tables.length < MIN_STATS) return null
	const space = buildSpace(meta, tables)
	const me = tables.map((t, j) => (t.value - space.mean[j]) / space.sd[j])
	const ranked: { i: number; d: number }[] = []
	for (let i = 0; i < meta.teams.length; i++) {
		const d = gap(me, space.z[i], space.need)
		if (d !== null) ranked.push({ i, d })
	}
	if (ranked.length < pool) return null
	ranked.sort((a, b) => a.d - b.d || a.i - b.i)
	const med = median(ranked.map((r) => r.d))
	const stats: TwinStat[] = tables.map((t, j) => ({
		key: t.key,
		label: t.label,
		short: t.short,
		fmt: t.fmt,
		family: t.family as "off" | "def",
		higherIsBetter: t.higherIsBetter,
		raiders: t.value,
		raidersPct: pctOf(space.sorted[j], t.value, t.higherIsBetter),
	}))
	const total = ranked.length
	const twins = ranked.slice(0, shown).map((r, k) => twinAt(meta, space, r.i, r.d, closerOf(k, total)))
	const mineAt = ranked.findIndex((r) => isRaiders(meta.teams[r.i]))
	const group = ranked.slice(0, pool)
	return {
		mode,
		n: meta.n,
		stats,
		twins,
		raidersTwin: mineAt >= 0 ? (twins.find((t) => t.i === ranked[mineAt].i) ?? twinAt(meta, space, ranked[mineAt].i, ranked[mineAt].d, closerOf(mineAt, total))) : null,
		pool: { size: group.length, outcomes: outcomesFor(meta, group.map((r) => r.i), ranked.map((r) => r.i)), avgCloser: mean(group.map((_, k) => closerOf(k, total))) },
		median: med,
	}
}

/** Stats ordered by how closely a twin matches the Raiders on them: the gap in league standing, smallest first. */
export function agreement(result: TwinsResult, twin: Twin): { index: number; gap: number }[] {
	return result.stats
		.map((s, index) => {
			const p = twin.pcts[index]
			return p === null ? null : { index, gap: Math.abs(p - s.raidersPct) }
		})
		.filter((x): x is { index: number; gap: number } => x !== null)
		.sort((a, b) => a.gap - b.gap || a.index - b.index)
}

export type Backtest = {
	/** Team-seasons tested. */
	seasons: number
	/** Typical miss (root-mean-square) in a team's win rate over the rest of its season, guessing from its twins, from the league average, and from its own start record. */
	twinsMiss: number
	averageMiss: number
	startMiss: number
	/** How much smaller the twins' miss is than guessing the league average: 0.1 is 10% smaller. */
	gain: number
	/** Correlation between the twins' guess and what happened. */
	corr: number
}

/**
 * Does matching on these stats say anything about the rest of a season? For every team-season, find its `pool`
 * nearest others (never itself), guess its win rate over the rest of the season from theirs, and compare the miss
 * with two plain guesses. This is the number that decides how much weight the page gives the twins.
 */
export function backtest(meta: Meta, allTables: Table[], mode: TwinMode = "all", pool = POOL): Backtest | null {
	const tables = usable(allTables, mode)
	if (tables.length < MIN_STATS) return null
	const space = buildSpace(meta, tables)
	const rows: number[] = []
	const rest: number[] = []
	const start: number[] = []
	for (let i = 0; i < meta.teams.length; i++) {
		const g = seasonGames(seasonOf(meta.teams[i])) - meta.n
		if (g <= 0 || space.z[i].filter((v) => v !== null).length < space.need) continue
		rows.push(i)
		rest.push((meta.wins[i] - meta.startWins[i]) / g)
		start.push(meta.startWins[i] / meta.n)
	}
	if (rows.length < pool + 1) return null
	const avg = mean(rest)
	const guess: number[] = []
	for (let a = 0; a < rows.length; a++) {
		const ds: { b: number; d: number }[] = []
		for (let b = 0; b < rows.length; b++) {
			if (a === b) continue
			const d = gap(space.z[rows[a]], space.z[rows[b]], space.need)
			if (d !== null) ds.push({ b, d })
		}
		ds.sort((x, y) => x.d - y.d)
		guess.push(mean(ds.slice(0, pool).map((x) => rest[x.b])))
	}
	const rms = (g: number[]) => Math.sqrt(mean(g.map((v, k) => (v - rest[k]) ** 2)))
	const twinsMiss = rms(guess)
	const averageMiss = rms(rest.map(() => avg))
	const startMiss = rms(start)
	const mg = mean(guess)
	const mr = mean(rest)
	let sxy = 0
	let sxx = 0
	let syy = 0
	for (let k = 0; k < guess.length; k++) {
		sxy += (guess[k] - mg) * (rest[k] - mr)
		sxx += (guess[k] - mg) ** 2
		syy += (rest[k] - mr) ** 2
	}
	return { seasons: rows.length, twinsMiss, averageMiss, startMiss, gain: 1 - twinsMiss / averageMiss, corr: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0 }
}

/** The pool's seasons in a sentence: how they finished their seasons, against every team. */
export function poolLine(r: TwinsResult): string {
	const o = r.pool.outcomes
	const pct = (v: number) => `${Math.round(v * 100)}%`
	const rest = `After game ${r.n} the ${r.pool.size} closest team-seasons won ${pct(o.restWin)} of their games, against ${pct(o.allRestWin)} for the average team`
	return `${rest}. ${pct(o.playoffs)} of them made the playoffs, against ${pct(o.allPlayoffs)} of all teams.`
}

/** One twin's season in a sentence: "The 2022 Jaguars started 2-2, then finished 9-8 and made the playoffs." */
export function twinStory(t: Twin, n: number): string {
	const ties = (w: number, l: number, g: number) => (g - w - l > 0 ? `${w}-${l}-${g - w - l}` : `${w}-${l}`)
	const start = ties(t.startWins, t.startLosses, n)
	const end = ties(t.wins, t.losses, t.games)
	return `The ${t.label} started ${start}, then finished ${end} and ${t.playoffs ? "made the playoffs" : "missed the playoffs"}.`
}

/** How far to trust the twins, from the backtest, in plain words. */
export function trustLine(b: Backtest, first: number): string {
	const pts = (v: number) => `${(v * 100).toFixed(1)}`
	const gain = Math.round(b.gain * 100)
	const verdict = gain >= 6 ? "That is a real but modest edge." : gain >= 2 ? "That is a small edge." : "That is barely better than guessing the average."
	return `We tested this on all ${b.seasons} team-seasons since ${first}: guessing a team's win rate over the rest of its season from its ${POOL} closest twins missed by ${pts(b.twinsMiss)} percentage points, against ${pts(b.averageMiss)} for guessing the league average and ${pts(b.startMiss)} for repeating its own start. ${verdict}`
}
