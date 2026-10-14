// Earlier seasons of the Player Lab. `player-history.json` holds, for each of the last few full seasons, every graded player's line
// (value, plays, uncertainty, grade, rank) and that season's league yardstick, all made by the same builder as the current season.
// This turns one past season into a `PlayersData`, so everything built for the current season (percentiles, the comparison, the
// cards) works on it unchanged, and lays a player's seasons side by side for his Career section. Pure: data in, plain objects out.

import {
	type PlayerGroup,
	type PlayerRow,
	type PlayerStat,
	type PlayersData,
	type Yard,
	GROUP_ORDER,
	HEADLINE,
	STAT,
	formatStat,
	hasOverall,
	isCore,
	overall,
	overallRank,
	pctFromRank,
	stretchGrade,
} from "./playersKit"

/** [stat, value, plays behind it, standard error, grade, rank]. Grade and rank are blank for a style stat. */
export type HistoryStat = [string, number, number, number | null, number | null, number | null]
/** [season, job, team, position, games, stats] */
export type HistoryRow = [number, PlayerGroup, string, string, number, HistoryStat[]]
export type HistoryPlayer = { n: string; r: HistoryRow[] }
export type PlayerHistory = {
	generatedAt: string
	source: string
	seasons: number[]
	/** Games in each season, by year. */
	weeks: Record<string, number>
	yard: Record<string, Partial<Record<PlayerGroup, Record<string, Yard>>>>
	/** How far apart players really are on a stat, and how far a player's true level moves in a year (variances). */
	model: Partial<Record<PlayerGroup, Record<string, { talent: number; drift: number }>>>
	/** Keyed by the league's own player id. */
	players: Record<string, HistoryPlayer>
}

/** Every season that can be looked at: the earlier ones in the file, then the current one. */
export function allSeasons(data: PlayersData, history: PlayerHistory | null | undefined): number[] {
	const out = new Set<number>([data.season])
	for (const s of history?.seasons ?? []) if (s < data.season) out.add(s)
	return Array.from(out).sort((a, b) => a - b)
}

/** True when `season` is one that can be shown. */
export const hasSeason = (data: PlayersData, history: PlayerHistory | null | undefined, season: number) => allSeasons(data, history).includes(season)

const cache = new WeakMap<PlayersData, WeakMap<PlayerHistory, Map<number, PlayersData>>>()

/**
 * One past season as a `PlayersData`: each man who played it and is in the current data (so he has a page and a slug), with that
 * season's line as his "season", and that season's league yardstick. The current season comes back as it is. A man who changed his
 * job has one row per job, as in the current data.
 */
export function seasonData(data: PlayersData, history: PlayerHistory | null | undefined, season: number | null | undefined): PlayersData {
	if (!history || season === null || season === undefined || season === data.season || !history.yard[String(season)]) return data
	let byHistory = cache.get(data)
	if (!byHistory) cache.set(data, (byHistory = new WeakMap()))
	let bySeason = byHistory.get(history)
	if (!bySeason) byHistory.set(history, (bySeason = new Map()))
	const hit = bySeason.get(season)
	if (hit) return hit

	const now = new Map<string, PlayerRow>()
	for (const p of data.players) if (!now.has(p.id)) now.set(p.id, p)
	const players: PlayerRow[] = []
	for (const [id, hp] of Object.entries(history.players)) {
		const cur = now.get(id)
		if (!cur) continue
		for (const [y, group, team, pos, games, stats] of hp.r) {
			if (y !== season) continue
			const row: PlayerRow = {
				id,
				slug: cur.slug,
				name: hp.n,
				team,
				pos,
				group,
				games,
				snaps: { season: null, form: null, earlier: null },
				stats: stats.map(([k, v, n, se, g, r]): PlayerStat => ({ k, season: { v, n, ...(se !== null ? { se } : {}), ...(g !== null ? { g } : {}), ...(r !== null ? { r } : {}) }, form: null, earlier: null })),
				mover: null,
				box: {},
				like: [],
			}
			if (cur.espn !== undefined) row.espn = cur.espn
			if (cur.shot !== undefined) row.shot = cur.shot
			players.push(row)
		}
	}
	players.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
	const yard = history.yard[String(season)]
	const week = history.weeks[String(season)] ?? 18
	const leagueN: PlayersData["leagueN"] = {}
	for (const g of GROUP_ORDER) {
		const n = yard[g]?.[HEADLINE[g]]?.n
		if (n) leagueN[g] = n
	}
	const view: PlayersData = {
		season,
		week,
		team: data.team,
		generatedAt: history.generatedAt,
		source: history.source,
		formGames: 0,
		weeks: Array.from({ length: week }, (_, i) => i + 1),
		formWeeks: [],
		defFormWeeks: [],
		defWeek: week,
		leagueN,
		opp: {},
		yard,
		players,
	}
	bySeason.set(season, view)
	return view
}

/** The seasons a man has a line in, for a job (any job when none is given), oldest first; the current season counts when he is in it. */
export function seasonsOf(data: PlayersData, history: PlayerHistory | null | undefined, slug: string, group?: PlayerGroup): number[] {
	const rows = data.players.filter((p) => p.slug === slug && (!group || p.group === group))
	if (!rows.length) return []
	const ids = new Set(rows.map((p) => p.id))
	const out = new Set<number>([data.season])
	Array.from(ids).forEach((id) => {
		for (const r of history?.players[id]?.r ?? []) if (!group || r[1] === group) out.add(r[0])
	})
	return Array.from(out).sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------------------------- career

export type CareerCell = { k: string; text: string; pct: number | null; rank: number | null; of: number | null; n: number }
export type CareerRow = {
	season: number
	/** The season still being played. */
	current: boolean
	team: string
	games: number
	/** Overall, 1 to 99, and his place at his job that season. Null for a job with no overall grade. */
	overall: number | null
	place: { rank: number; of: number } | null
	cells: (CareerCell | null)[]
}
export type Career = { keys: string[]; rows: CareerRow[] }

/** The stats a career table is built on: the job's own graded, headline-first stats, as many as fit. */
export function careerKeys(group: PlayerGroup, limit = 4): string[] {
	const keys = Object.entries(STAT[group] ?? {})
		.filter(([k, info]) => isCore(group, k) && info.higher !== null && !info.unit)
		.map(([k]) => k)
	const head = HEADLINE[group]
	return [...(keys.includes(head) ? [head] : []), ...keys.filter((k) => k !== head)].slice(0, limit)
}

function rowFor(view: PlayersData, row: PlayerRow): PlayerRow | undefined {
	return view.players.find((p) => p.id === row.id && p.group === row.group)
}

/**
 * A man's seasons side by side, oldest first, the one being played last. Each season is measured against that season's league, so a
 * 70 in 2022 and a 70 in 2025 both mean "better than most of the league that year". Null when there is only the current season.
 */
export function careerOf(data: PlayersData, history: PlayerHistory | null | undefined, row: PlayerRow): Career | null {
	const keys = careerKeys(row.group)
	if (!keys.length) return null
	const rows: CareerRow[] = []
	for (const season of seasonsOf(data, history, row.slug, row.group)) {
		const view = seasonData(data, history, season)
		const p = season === data.season ? row : rowFor(view, row)
		if (!p) continue
		const ov = hasOverall(p.group) ? overall(p) : null
		const cells = keys.map((k): CareerCell | null => {
			const s = p.stats.find((x) => x.k === k)
			if (!s) return null
			const y = view.yard[p.group]?.[k]
			const r = s.season.r ?? null
			return { k, text: formatStat(p.group, k, s.season.v), pct: r !== null && y?.n ? pctFromRank(r, y.n) : null, rank: r, of: y?.n ?? null, n: s.season.n }
		})
		rows.push({
			season,
			current: season === data.season,
			team: p.team,
			games: p.games,
			overall: ov === null ? null : stretchGrade(view, ov),
			place: ov === null ? null : overallRank(view, p),
			cells,
		})
	}
	return rows.length > 1 ? { keys, rows } : null
}

/** One plain sentence on how his Overall has moved, from the seasons that have a grade. */
export function careerLine(career: Career, data: PlayersData): string {
	const graded = career.rows.filter((r) => r.overall !== null)
	if (graded.length < 2) return ""
	const full = graded.filter((r) => !r.current)
	const now = graded.find((r) => r.current)
	const tail = full[full.length - 1]
	const best = full.reduce((a, b) => ((b.overall as number) > (a.overall as number) ? b : a))
	const parts: string[] = []
	if (full.length === 1) parts.push(`His Overall was ${full[0].overall} in ${full[0].season}.`)
	else if (full.length === 2) parts.push(`His Overall was ${full[0].overall} in ${full[0].season} and ${tail.overall} in ${tail.season}.`)
	else parts.push(`His Overall went ${full.map((r) => r.overall).join(", ")} from ${full[0].season} to ${tail.season}.`)
	const last = tail
	if (full.length > 2 && best.season !== last.season && (best.overall as number) - (last.overall as number) >= 5) parts.push(`His best year was ${best.season}.`)
	if (now) parts.push(`It is ${now.overall} so far in ${data.season}, through Week ${data.week}.`)
	return parts.join(" ")
}
