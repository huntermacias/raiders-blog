// A second opinion on every team from the box scores: net yards per play and turnovers. Scoring margin is
// partly luck (a pick-six, a fumble on the goal line), yards per play is steadier, so a team that wins
// ugly is rated a little lower than its record says and one that loses despite outgaining everyone a
// little higher.
//
// How it is done, in order:
//  1. For each team, average its game margin and its net yards per play (own minus opponent's) over its games.
//  2. Rescale the yardage numbers to the same spread as the scoring margins across the league, so a team
//     that is +1.0 net yards per play is as far above average on yardage as +X points is on scoring. No
//     magic points-per-yard constant: both are measured in the same units, then compared.
//  3. The gap between the two is how lucky (or unlucky) the results have been. The rating is nudged
//     toward the yardage number by 30% of that gap, scaled up from nothing as games pile up
//     (games / (games + 12)) and capped at 40 Elo points (about 1.6 points a game).
// The weights come from a back-test on 2025 (255 games predicted from week 2 on): a nudge of 15% to 30%
// improved the log loss a little, and 50% or more made predictions worse, so the nudge is deliberately gentle.
// Turnovers are shown, not used: they decide games but, team to team, they mostly don't repeat.
// Pure; the fetching is in lib/live/service.ts.

import { siteAbbr } from "../live/espn"
import { ELO_PER_POINT } from "./season"

export type GameBox = {
	id: string
	week: number
	home: string
	away: string
	homeScore: number
	awayScore: number
	/** Offensive yards per play. */
	homeYpp: number
	awayYpp: number
	/** Turnovers committed (giveaways). */
	homeTo: number
	awayTo: number
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const numOf = (v: unknown): number | null => {
	const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.\-]/g, ""))
	return typeof v === "string" && v.trim() === "" ? null : Number.isFinite(n) ? n : null
}

/** One finished game's box from ESPN's summary, or null if it isn't final or the numbers aren't there. */
export function parseBox(json: unknown, meta: { id: string; week: number }): GameBox | null {
	const root = obj(json)
	const comp = obj(arr(obj(root.header).competitions)[0])
	if (obj(obj(comp.status).type).completed !== true) return null
	const sides = arr(comp.competitors).map(obj)
	const pick = (homeAway: string) => sides.find((s) => s.homeAway === homeAway)
	const home = pick("home")
	const away = pick("away")
	if (!home || !away) return null
	const teams = arr(obj(root.boxscore).teams).map(obj)
	const stat = (competitor: Obj, name: string): number | null => {
		const id = String(obj(competitor.team).id ?? "")
		const t = teams.find((x) => String(obj(x.team).id ?? "") === id)
		const s = arr(t?.statistics).map(obj).find((x) => x.name === name)
		return s ? numOf(s.displayValue) : null
	}
	const abbr = (c: Obj) => siteAbbr(typeof obj(c.team).abbreviation === "string" ? (obj(c.team).abbreviation as string) : null)
	const hs = numOf(home.score)
	const as = numOf(away.score)
	const hy = stat(home, "yardsPerPlay")
	const ay = stat(away, "yardsPerPlay")
	if (hs == null || as == null || hy == null || ay == null || hy <= 0 || ay <= 0) return null
	return {
		id: meta.id,
		week: meta.week,
		home: abbr(home),
		away: abbr(away),
		homeScore: hs,
		awayScore: as,
		homeYpp: hy,
		awayYpp: ay,
		homeTo: stat(home, "turnovers") ?? 0,
		awayTo: stat(away, "turnovers") ?? 0,
	}
}

/** How much of the luck gap to trust yardage with, before the games-played scaling. */
export const EFF_WEIGHT = 0.3
/** Games at which the nudge is half strength. */
export const EFF_HALF_GAMES = 12
/** The biggest nudge, in Elo points. */
export const EFF_CAP = 40
/** Fewer teams than this with a box score and the league-wide rescale isn't meaningful. */
const MIN_TEAMS = 8

export type Underlying = {
	/** Games with a box score. */
	games: number
	/** Average scoring margin per game. */
	margin: number
	/** Average net yards per play. */
	netYpp: number
	/** Net yards per play expressed as a scoring margin (same league-wide spread as `margin`). */
	yardageMargin: number
	/** Takeaways minus giveaways per game. */
	turnoverMargin: number
	/** Elo points added to the rating. */
	adj: number
}

export type EffOptions = { weight?: number; halfGames?: number; cap?: number }

/** Every team with a box score through `throughWeek`. Empty when too few teams have one. */
export function underlying(boxes: GameBox[], throughWeek: number, opts: EffOptions = {}): Record<string, Underlying> {
	const weight = opts.weight ?? EFF_WEIGHT
	const halfGames = opts.halfGames ?? EFF_HALF_GAMES
	const cap = opts.cap ?? EFF_CAP
	const acc: Record<string, { n: number; m: number; y: number; t: number }> = {}
	const add = (team: string, margin: number, net: number, turn: number) => {
		const a = (acc[team] ??= { n: 0, m: 0, y: 0, t: 0 })
		a.n++
		a.m += margin
		a.y += net
		a.t += turn
	}
	for (const b of boxes) {
		if (b.week > throughWeek) continue
		add(b.home, b.homeScore - b.awayScore, b.homeYpp - b.awayYpp, b.awayTo - b.homeTo)
		add(b.away, b.awayScore - b.homeScore, b.awayYpp - b.homeYpp, b.homeTo - b.awayTo)
	}
	const teams = Object.keys(acc)
	if (teams.length < MIN_TEAMS) return {}
	const mean = (f: (a: { n: number; m: number; y: number; t: number }) => number) => teams.reduce((s, t) => s + f(acc[t]), 0) / teams.length
	const mM = mean((a) => a.m / a.n)
	const mY = mean((a) => a.y / a.n)
	const sdM = Math.sqrt(mean((a) => (a.m / a.n - mM) ** 2))
	const sdY = Math.sqrt(mean((a) => (a.y / a.n - mY) ** 2))
	const out: Record<string, Underlying> = {}
	for (const t of teams) {
		const a = acc[t]
		const margin = a.m / a.n
		const netYpp = a.y / a.n
		const yardageMargin = sdY > 0 ? mM + ((netYpp - mY) / sdY) * sdM : margin
		const trust = a.n / (a.n + halfGames)
		const raw = weight * trust * (yardageMargin - margin) * ELO_PER_POINT
		out[t] = { games: a.n, margin, netYpp, yardageMargin, turnoverMargin: a.t / a.n, adj: Math.max(-cap, Math.min(cap, raw)) }
	}
	return out
}
