// The league map: every player at one job as a dot, two stats on the two axes. Pure functions, so the route that writes the data, the
// component that draws it and the tests all share one definition of "better is up and to the right".

import { type PlayerGroup, type PlayersData, statInfo } from "./playersKit"

/** One dot: [slug, name, team, position, {stat: [value, plays behind it]}]. */
export type MapPlayer = [string, string, string, string, Record<string, [number, number]>]
export type MapStat = { k: string; label: string; short: string; higher: boolean | null; per: string; counts?: false }
export type MapData = { group: PlayerGroup; season: number; stats: MapStat[]; players: MapPlayer[] }

/** Everything the map needs for one group, as small as it can be (the file is fetched by the browser, so it is kept off the page). */
export function mapData(data: PlayersData, group: PlayerGroup): MapData {
	const rows = data.players.filter((p) => p.group === group)
	const keys: string[] = []
	for (const p of rows) for (const s of p.stats) if (!keys.includes(s.k)) keys.push(s.k)
	const stats: MapStat[] = []
	for (const k of keys) {
		const i = statInfo(group, k)
		if (i) stats.push({ k, label: i.label, short: i.short, higher: i.higher, per: i.per, ...(i.counts === false ? { counts: false as const } : {}) })
	}
	const known = new Set(stats.map((s) => s.k))
	const players: MapPlayer[] = rows.map((p) => {
		const m: Record<string, [number, number]> = {}
		for (const s of p.stats) if (known.has(s.k)) m[s.k] = [Math.round(s.season.v * 10000) / 10000, s.season.n]
		return [p.slug, p.name, p.team, p.pos, m]
	})
	return { group, season: data.season, stats, players }
}

export type Dot = { slug: string; name: string; team: string; pos: string; x: number; y: number; nx: number; ny: number; n: number }
export type Extent = { lo: number; hi: number }

/** A plain number in the stat's own units that grows toward "better", so the axis always reads worse to better. */
const sign = (higher: boolean | null) => (higher === false ? -1 : 1)

/** The dots that have both stats, each with plain values and axis values (flipped when lower is better), plus the padded extents. */
export function dotsFor(map: MapData, xk: string, yk: string): { dots: Dot[]; x: Extent; y: Extent } {
	const xs = map.stats.find((s) => s.k === xk)
	const ys = map.stats.find((s) => s.k === yk)
	if (!xs || !ys) return { dots: [], x: { lo: 0, hi: 1 }, y: { lo: 0, hi: 1 } }
	const sx = sign(xs.higher)
	const sy = sign(ys.higher)
	const dots: Dot[] = []
	for (const [slug, name, team, pos, m] of map.players) {
		const a = m[xk]
		const b = m[yk]
		if (!a || !b) continue
		dots.push({ slug, name, team, pos, x: a[0], y: b[0], nx: a[0] * sx, ny: b[0] * sy, n: Math.min(a[1], b[1]) })
	}
	return { dots, x: extent(dots.map((d) => d.nx)), y: extent(dots.map((d) => d.ny)) }
}

function extent(v: number[]): Extent {
	if (!v.length) return { lo: 0, hi: 1 }
	const lo = Math.min(...v)
	const hi = Math.max(...v)
	const pad = (hi - lo || Math.abs(hi) || 1) * 0.06
	return { lo: lo - pad, hi: hi + pad }
}

export function median(v: number[]): number | null {
	if (!v.length) return null
	const a = v.slice().sort((p, q) => p - q)
	const m = a.length >> 1
	return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** Position on a 0..1 axis. */
export const unit = (v: number, e: Extent) => (v - e.lo) / (e.hi - e.lo || 1)

/** The dot closest to a point, in the same units as `px` (pixels), if it is within `reach`. Ties go to the first. */
export function nearest(points: { x: number; y: number }[], at: { x: number; y: number }, reach: number): number {
	let best = -1
	let bd = reach * reach
	for (let i = 0; i < points.length; i++) {
		const dx = points[i].x - at.x
		const dy = points[i].y - at.y
		const d = dx * dx + dy * dy
		if (d <= bd) {
			bd = d
			best = i
		}
	}
	return best
}

/** Two stats a reader would want to see against each other for a group: the headline, then the graded stat least tied to it. */
export function defaultAxes(map: MapData, headline: string): [string, string] {
	const graded = map.stats.filter((s) => s.higher !== null && s.counts !== false)
	const x = graded.find((s) => s.k === headline) ?? graded[0] ?? map.stats[0]
	const rest = graded.filter((s) => s !== x)
	if (!x) return ["", ""]
	if (!rest.length) return [x.k, x.k]
	// Least tied to the first = smallest absolute correlation across players.
	let best = rest[0]
	let bc = 2
	for (const s of rest) {
		const c = Math.abs(correlation(map, x.k, s.k))
		if (c < bc) {
			bc = c
			best = s
		}
	}
	return [x.k, best.k]
}

export function correlation(map: MapData, a: string, b: string): number {
	const pts: [number, number][] = []
	for (const [, , , , m] of map.players) if (m[a] && m[b]) pts.push([m[a][0], m[b][0]])
	if (pts.length < 5) return 0
	const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length
	const my = pts.reduce((s, p) => s + p[1], 0) / pts.length
	let sxy = 0
	let sxx = 0
	let syy = 0
	for (const [x, y] of pts) {
		sxy += (x - mx) * (y - my)
		sxx += (x - mx) ** 2
		syy += (y - my) ** 2
	}
	return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
}
