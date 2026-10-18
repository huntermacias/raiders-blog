// The penalty flags by situation: the score when they were called, the quarter, the down and distance, where on the field, the clock, home or away and
// which unit, and which penalties show up in which spot. Also a team's whole profile, and two teams side by side. Pure: no data, no clock.
// The one import is the flag type and a few helpers, so the browser components, the share cards and the server pages all use the same sums.

import { type Flag, byType, downName } from "./flagsKit"

export type DimId = "score" | "quarter" | "down" | "distance" | "field" | "clock" | "venue" | "unit"
export type Bucket = { id: string; label: string; /** For a card or a narrow column. */ short: string }
export type Dimension = {
	id: DimId
	label: string
	/** What the table answers, as a question. */
	question: string
	buckets: Bucket[]
	/** The bucket a flag falls in, or null when the flag has no value for this dimension (no spot, no down). */
	of: (f: Flag) => string | null
}

/** Seconds left in the quarter from "08:12". */
export function secondsLeft(tm: string): number {
	const [m, s] = tm.split(":").map(Number)
	return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0)
}

const b = (id: string, label: string, short = label): Bucket => ({ id, label, short })

export const DIMENSIONS: Dimension[] = [
	{
		id: "score",
		label: "Score",
		question: "What was the score when the flag came?",
		buckets: [b("t9", "Trailing by 9 or more", "Down 9+"), b("t1", "Trailing by 1 to 8", "Down 1-8"), b("tie", "Tied", "Tied"), b("l1", "Leading by 1 to 8", "Up 1-8"), b("l9", "Leading by 9 or more", "Up 9+")],
		of: (f) => (f.mg <= -9 ? "t9" : f.mg < 0 ? "t1" : f.mg === 0 ? "tie" : f.mg <= 8 ? "l1" : "l9"),
	},
	{
		id: "quarter",
		label: "Quarter",
		question: "In which quarter?",
		buckets: [b("1", "1st quarter", "Q1"), b("2", "2nd quarter", "Q2"), b("3", "3rd quarter", "Q3"), b("4", "4th quarter", "Q4"), b("5", "Overtime", "OT")],
		of: (f) => String(Math.min(5, Math.max(1, f.q))),
	},
	{
		id: "down",
		label: "Down",
		question: "On which down?",
		buckets: [b("1", "1st down", "1st"), b("2", "2nd down", "2nd"), b("3", "3rd down", "3rd"), b("4", "4th down", "4th"), b("0", "Kickoffs and tries (no down)", "Kicks")],
		of: (f) => String(f.dn && f.dn >= 1 && f.dn <= 4 ? f.dn : 0),
	},
	{
		id: "distance",
		label: "Distance",
		question: "How far to go for a first down?",
		buckets: [b("s", "1 to 3 yards to go", "1-3"), b("m", "4 to 7 yards", "4-7"), b("l", "8 to 10 yards", "8-10"), b("x", "11 or more yards", "11+")],
		of: (f) => (!f.dn || f.dn < 1 || f.dn > 4 || f.yd == null ? null : f.yd <= 3 ? "s" : f.yd <= 7 ? "m" : f.yd <= 10 ? "l" : "x"),
	},
	{
		id: "field",
		label: "Field position",
		question: "Where on the field?",
		buckets: [b("own20", "Inside their own 20", "Own 20"), b("own", "Their own side", "Own side"), b("opp", "The other side", "Other side"), b("rz", "Red zone (inside the other 20)", "Red zone")],
		of: (f) => (f.yl == null ? null : f.yl <= 20 ? "own20" : f.yl < 50 ? "own" : f.yl < 80 ? "opp" : "rz"),
	},
	{
		id: "clock",
		label: "Clock",
		question: "Late in a half, or not?",
		buckets: [b("two", "Last two minutes of a half", "2-min"), b("rest", "The rest of the game", "Other")],
		of: (f) => ((f.q === 2 || f.q === 4) && secondsLeft(f.tm) <= 120 ? "two" : "rest"),
	},
	{
		id: "venue",
		label: "Home or away",
		question: "At home or on the road?",
		buckets: [b("home", "At home", "Home"), b("away", "On the road", "Away")],
		of: (f) => (f.hm ? "home" : "away"),
	},
	{
		id: "unit",
		label: "Unit",
		question: "Which unit?",
		buckets: [b("offense", "Offense", "Offense"), b("defense", "Defense", "Defense"), b("special", "Special teams", "Special")],
		of: (f) => f.u,
	},
]

export const dimension = (id: string | null | undefined): Dimension | undefined => DIMENSIONS.find((d) => d.id === id)
export const isDim = (id: string | null | undefined): id is DimId => !!dimension(id)

/** What one penalty name looks like inside a group of flags. */
export type TypeCount = { type: string; flags: number }

export type SitRow = {
	id: string
	label: string
	short: string
	flags: number
	/** Share of the group's flags (of those that have a value for this dimension), 0 to 1. */
	share: number
	costly: number
	/** Expected points lost, summed and per flag. */
	cost: number
	avg: number
	/** The penalties that come most often in this spot, the most first. */
	top: TypeCount[]
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/** The flags split by one dimension: every bucket in order, even an empty one, with how many flags, how much they cost and which penalties come most. */
export function situation(flags: readonly Flag[], dim: Dimension, topN = 3): SitRow[] {
	const by = new Map<string, Flag[]>(dim.buckets.map((x) => [x.id, []]))
	let n = 0
	for (const f of flags) {
		const id = dim.of(f)
		if (id == null) continue
		by.get(id)?.push(f)
		n++
	}
	return dim.buckets.map((x) => {
		const list = by.get(x.id) ?? []
		const cost = list.reduce((s, f) => s + f.c, 0)
		const counts = new Map<string, number>()
		for (const f of list) counts.set(f.ty, (counts.get(f.ty) ?? 0) + 1)
		return {
			id: x.id,
			label: x.label,
			short: x.short,
			flags: list.length,
			share: n ? list.length / n : 0,
			costly: list.filter((f) => f.tg.length).length,
			cost: round(cost),
			avg: list.length ? round(cost / list.length) : 0,
			top: Array.from(counts, ([type, c]) => ({ type, flags: c })).sort((a, c) => c.flags - a.flags || a.type.localeCompare(c.type)).slice(0, topN),
		}
	})
}

/** The league's mix, for a team or player to be read against: per dimension, per bucket, the share of flags and the average cost. */
export type Baseline = Record<DimId, Record<string, { share: number; avg: number }>>

export function baselineOf(flags: readonly Flag[]): Baseline {
	const out = {} as Baseline
	for (const d of DIMENSIONS) out[d.id] = Object.fromEntries(situation(flags, d, 0).map((r) => [r.id, { share: round(r.share, 4), avg: r.avg }]))
	return out
}

export type MixRow = SitRow & {
	/** The league's share in this spot. */
	base: number
	/** This group's share over the league's: 1.0 is the league's habit, 1.5 is half as much again, null when the league has none or the group has too few flags to say. */
	index: number | null
}

/** A situation table read against the league. `min` is how many flags the group needs before its index is shown, so a handful never reads like a habit. */
export function situationMix(flags: readonly Flag[], dim: Dimension, base: Baseline | null | undefined, min = 20): MixRow[] {
	const rows = situation(flags, dim)
	const total = rows.reduce((s, r) => s + r.flags, 0)
	return rows.map((r) => {
		const lg = base?.[dim.id]?.[r.id]?.share ?? 0
		return { ...r, base: lg, index: total >= min && lg > 0 ? round(r.share / lg, 2) : null }
	})
}

/** The bucket where a group stands out most from the league (its biggest index with at least `minFlags` flags in it), or null. */
export function standout(rows: readonly MixRow[], minFlags = 4): MixRow | null {
	const sure = rows.filter((r) => r.index != null && r.flags >= minFlags)
	return sure.length ? sure.reduce((a, c) => ((c.index ?? 0) > (a.index ?? 0) ? c : a)) : null
}

// ----- Penalties by situation -----

export type TypeRow = {
	type: string
	flags: number
	yards: number
	/** Average yards per flag. */
	avgYards: number
	cost: number
	avg: number
	costly: number
	/** The share of its flags that count like a turnover, 0 to 1. */
	costlyShare: number
	/** Share of all the flags in the group, 0 to 1. */
	share: number
}

/** Every penalty name in a group of flags, the costliest in total first. */
export function typeRows(flags: readonly Flag[]): TypeRow[] {
	const all = flags.length
	return byType(flags).map((g) => {
		const list = flags.filter((f) => f.ty === g.label)
		const yards = list.reduce((s, f) => s + f.yds, 0)
		return {
			type: g.label,
			flags: g.flags,
			yards,
			avgYards: g.flags ? round(yards / g.flags, 1) : 0,
			cost: g.cost,
			avg: g.flags ? round(g.cost / g.flags) : 0,
			costly: g.costly,
			costlyShare: g.flags ? round(g.costly / g.flags, 3) : 0,
			share: all ? round(g.flags / all, 4) : 0,
		}
	})
}

export type Matrix = { types: string[]; buckets: Bucket[]; /** flags[type][bucket] */ cells: number[][]; /** Flags in each bucket, over all penalty names. */ totals: number[] }

/** The most common penalty names (by flags) against the buckets of one dimension: how many of each in each spot. */
export function typeMatrix(flags: readonly Flag[], dim: Dimension, topN = 6): Matrix {
	const counts = new Map<string, number>()
	for (const f of flags) counts.set(f.ty, (counts.get(f.ty) ?? 0) + 1)
	const types = Array.from(counts, ([t, n]) => [t, n] as const)
		.sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]))
		.slice(0, topN)
		.map((x) => x[0])
	const idx = new Map(dim.buckets.map((x, i) => [x.id, i]))
	const cells = types.map(() => dim.buckets.map(() => 0))
	const totals = dim.buckets.map(() => 0)
	for (const f of flags) {
		const id = dim.of(f)
		const j = id == null ? undefined : idx.get(id)
		if (j == null) continue
		totals[j]++
		const i = types.indexOf(f.ty)
		if (i >= 0) cells[i][j]++
	}
	return { types, buckets: dim.buckets, cells, totals }
}

// ----- Teams -----

export type TeamProfile = {
	team: string
	games: number
	flags: number
	yards: number
	cost: number
	costly: number
	gifts: number
	/** Flags on a named player, on a quarterback's delay of game, and on the team and its coaches. */
	players: number
	quarterbacks: number
	coaches: number
	/** Flags, yards and cost per game. */
	perGame: { flags: number; yards: number; cost: number }
	/** Where the team ranks in cost per game, 1 = the most (of `of` teams). */
	rank: { cost: number; flags: number; of: number }
	dims: Record<DimId, SitRow[]>
	types: TypeRow[]
	/** The costliest flag of the season, for a card to quote. */
	worst: Flag | null
}

export function teamProfile(flags: readonly Flag[], team: string, games: number): TeamProfile {
	const mine = flags.filter((f) => f.t === team)
	const g = Math.max(1, games || new Set(mine.map((f) => f.g)).size)
	const cost = round(mine.reduce((s, f) => s + f.c, 0))
	const yards = mine.reduce((s, f) => s + f.yds, 0)
	const dims = {} as Record<DimId, SitRow[]>
	for (const d of DIMENSIONS) dims[d.id] = situation(mine, d)
	return {
		team,
		games: games || g,
		flags: mine.length,
		yards,
		cost,
		costly: mine.filter((f) => f.tg.length).length,
		gifts: mine.filter((f) => f.tg.includes("gift")).length,
		players: mine.filter((f) => f.ck === "player").length,
		quarterbacks: mine.filter((f) => f.ck === "qb").length,
		coaches: mine.filter((f) => f.ck === "team").length,
		perGame: { flags: round(mine.length / g, 1), yards: round(yards / g, 1), cost: round(cost / g) },
		rank: { cost: 0, flags: 0, of: 0 },
		dims,
		types: typeRows(mine),
		worst: mine.length ? mine.reduce((a, c) => (c.c > a.c ? c : a)) : null,
	}
}

/** A profile for every team in `teams`, ranked against one another by what their flags cost per game. */
export function teamProfiles(flags: readonly Flag[], teams: readonly string[], games: Record<string, number>): Record<string, TeamProfile> {
	const out: Record<string, TeamProfile> = {}
	for (const t of teams) out[t] = teamProfile(flags, t, games[t] ?? 0)
	const list = Object.values(out)
	const byCost = [...list].sort((a, c) => c.perGame.cost - a.perGame.cost || c.flags - a.flags || a.team.localeCompare(c.team))
	const byFlags = [...list].sort((a, c) => c.perGame.flags - a.perGame.flags || c.cost - a.cost || a.team.localeCompare(c.team))
	for (const p of list) p.rank = { cost: byCost.findIndex((x) => x.team === p.team) + 1, flags: byFlags.findIndex((x) => x.team === p.team) + 1, of: list.length }
	return out
}

/** What a profile needs on a page that compares two teams, without the flags themselves: the card and the compare page are drawn from this. */
export type Edge = { key: string; text: string; /** Whose number is worse (the one that commits more or loses more): "a", "b" or null when even. */ worse: "a" | "b" | null }

const better = (a: number, b: number, tol = 0.05): "a" | "b" | null => (Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * tol ? null : a > b ? "a" : "b")

/**
 * The sentences that say where two teams differ most, from their per-game numbers: flags, cost, the costly ones, and the spots (a down, a score, a
 * field zone) where one commits much more than the other. At most `n`, the biggest gaps first. A spot counts only when each team has at least
 * `min` flags in it, so a handful never makes a headline.
 */
export function compareEdges(a: TeamProfile, b: TeamProfile, n = 4, min = 5): Edge[] {
	const out: (Edge & { size: number })[] = []
	const gap = (x: number, y: number) => (Math.min(x, y) > 0 ? Math.max(x, y) / Math.min(x, y) : Math.max(x, y) > 0 ? 9 : 1)
	if (a.games && b.games) {
		const w = better(a.perGame.flags, b.perGame.flags)
		if (w) {
			const hi = w === "a" ? a : b
			const lo = w === "a" ? b : a
			out.push({ key: "flags", worse: w, size: gap(hi.perGame.flags, lo.perGame.flags) + 0.3, text: `${hi.team} gets ${hi.perGame.flags.toFixed(1)} flags a game, ${lo.team} ${lo.perGame.flags.toFixed(1)}.` })
		}
		const c = better(a.perGame.cost, b.perGame.cost, 0.1)
		if (c) {
			const hi = c === "a" ? a : b
			const lo = c === "a" ? b : a
			out.push({ key: "cost", worse: c, size: gap(hi.perGame.cost, lo.perGame.cost) + 0.4, text: `${hi.team}'s flags cost ${hi.perGame.cost.toFixed(1)} points a game; ${lo.team}'s cost ${lo.perGame.cost.toFixed(1)}.` })
		}
		const k = better(a.costly / a.games, b.costly / b.games, 0.15)
		if (k && Math.max(a.costly, b.costly) >= 2) {
			const hi = k === "a" ? a : b
			const lo = k === "a" ? b : a
			out.push({ key: "costly", worse: k, size: 1.6, text: `${hi.team} has ${hi.costly} turnover-like flags to ${lo.team}'s ${lo.costly}.` })
		}
	}
	for (const d of DIMENSIONS) {
		if (d.id === "unit" || d.id === "venue") continue
		const ra = a.dims[d.id]
		const rb = b.dims[d.id]
		ra.forEach((x, i) => {
			const y = rb[i]
			if (!y || x.flags < min || y.flags < min || !a.games || !b.games) return
			const pa = x.flags / a.games
			const pb = y.flags / b.games
			const w = better(pa, pb, 0.3)
			if (!w) return
			const hi = w === "a" ? { t: a, r: x, p: pa } : { t: b, r: y, p: pb }
			const lo = w === "a" ? { t: b, r: y, p: pb } : { t: a, r: x, p: pa }
			out.push({
				key: `${d.id}:${x.id}`,
				worse: w,
				size: gap(hi.p, lo.p),
				text: `${d.id === "score" ? `When ${x.label.toLowerCase()}` : d.id === "down" ? `On ${x.id === "0" ? "kicks" : downName(Number(x.id))} down` : `${d.label}: ${x.label.toLowerCase()}`}, ${hi.t.team} gets ${hi.p.toFixed(2)} flags a game and ${lo.t.team} ${lo.p.toFixed(2)}.`,
			})
		})
	}
	return out
		.sort((p, q) => q.size - p.size || p.key.localeCompare(q.key))
		.slice(0, n)
		.map(({ key, text, worse }) => ({ key, text, worse }))
}

/** The share of a flag count that is turnover-like, as text: "12%". */
export const pctText = (n: number, of: number): string => (of ? `${Math.round((n / of) * 100)}%` : "0%")
