// Rest and travel, as Elo points added to the home team for one game. Pure. Used both when the ratings are
// built from finished games and when the rest of the season is simulated.
//
// The sizes are judgment calls (FiveThirtyEight's travel number is the model for the second one): a bye week
// is worth about a point, a short week costs about half a point, and every thousand miles the visitor flew
// is worth about a sixth of a point to the home side. A back-test on 2025 could not tell rest and travel from
// noise (predictions were no better with them, and slightly worse at double strength), so the whole thing
// is applied at half strength (SITUATIONAL_SCALE). The numbers are named here so they can be argued with.

import { TEAMS } from "../nfl"

/** Elo points for the days since a team's previous game. Null (first game, or no kickoff time) is neutral. */
export function restPoints(days: number | null): number {
	if (days == null) return 0
	if (days <= 5) return -15 // Thursday after a Sunday
	if (days <= 8) return 0
	if (days <= 12) return 8 // extra days after a Thursday or Monday game
	return 25 // a bye
}

/** How much of the rest and travel adjustment is applied. See the note at the top. */
export const SITUATIONAL_SCALE = 0.5

/** Elo points per thousand miles the visiting team travels. */
export const TRAVEL_PER_1000_MILES = 4

/** Rough home-stadium coordinates [latitude, longitude] by site abbreviation. */
export const COORDS: Record<string, [number, number]> = {
	ARI: [33.53, -112.26],
	ATL: [33.76, -84.4],
	BAL: [39.28, -76.62],
	BUF: [42.77, -78.79],
	CAR: [35.23, -80.85],
	CHI: [41.86, -87.62],
	CIN: [39.1, -84.52],
	CLE: [41.51, -81.7],
	DAL: [32.75, -97.09],
	DEN: [39.74, -105.02],
	DET: [42.34, -83.05],
	GB: [44.5, -88.06],
	HOU: [29.68, -95.41],
	IND: [39.76, -86.16],
	JAX: [30.32, -81.64],
	KC: [39.05, -94.48],
	LV: [36.09, -115.18],
	LAC: [33.95, -118.34],
	LAR: [33.95, -118.34],
	MIA: [25.96, -80.24],
	MIN: [44.97, -93.26],
	NE: [42.09, -71.26],
	NO: [29.95, -90.08],
	NYG: [40.81, -74.07],
	NYJ: [40.81, -74.07],
	PHI: [39.9, -75.17],
	PIT: [40.45, -80.02],
	SF: [37.4, -121.97],
	SEA: [47.6, -122.33],
	TB: [27.98, -82.5],
	TEN: [36.17, -86.77],
	WAS: [38.91, -76.86],
}

const EARTH_MILES = 3958.8
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle miles between two teams' home cities; 0 when either is unknown. */
export function miles(a: string, b: string): number {
	const p = COORDS[a]
	const q = COORDS[b]
	if (!p || !q) return 0
	const dLat = rad(q[0] - p[0])
	const dLng = rad(q[1] - p[1])
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p[0])) * Math.cos(rad(q[0])) * Math.sin(dLng / 2) ** 2
	return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The Eastern calendar day a kickoff falls on, as a day number (late games stay on their own day). */
function etDay(ms: number): number {
	return Math.floor((ms - 5 * 3_600_000) / 86_400_000)
}

type Sched = { week: number; home: string; away: string; kickoff?: string | null }

/**
 * Days each side had since its last game, then the net edge for the home team in Elo points. `scale` multiplies
 * the edge (the default is the model's; 0 switches rest and travel off, which is how the back-test measures them).
 */
export function annotate<T extends Sched>(games: T[], scale: number = SITUATIONAL_SCALE): (T & { edge: number })[] {
	const days = new Map<number, { day: number; week: number }>()
	const byTeam = new Map<string, { i: number; day: number; week: number }[]>()
	games.forEach((g, i) => {
		const ms = g.kickoff ? Date.parse(g.kickoff) : NaN
		if (!Number.isFinite(ms)) return
		const day = etDay(ms)
		days.set(i, { day, week: g.week })
		for (const t of [g.home, g.away]) {
			const list = byTeam.get(t) ?? []
			list.push({ i, day, week: g.week })
			byTeam.set(t, list)
		}
	})
	// i -> team -> rest days
	const rest = new Map<string, number>()
	byTeam.forEach((list, team) => {
		list.sort((a, b) => a.day - b.day || a.week - b.week)
		for (let k = 1; k < list.length; k++) rest.set(`${list[k].i}:${team}`, list[k].day - list[k - 1].day)
	})
	return games.map((g, i) => {
		const rh = rest.get(`${i}:${g.home}`) ?? null
		const ra = rest.get(`${i}:${g.away}`) ?? null
		const edge = restPoints(rh) - restPoints(ra) + (TRAVEL_PER_1000_MILES * miles(g.away, g.home)) / 1000
		return { ...g, edge: edge * scale }
	})
}

/** Every team abbreviation the table knows, for tests. */
export const KNOWN = TEAMS.map((t) => t.abbr)
