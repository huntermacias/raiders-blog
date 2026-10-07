// "Will it last?": what happened to teams that started a season the way the Raiders have.
//
// data/lab/history.json (scripts/lab/build_history.py, nflverse play-by-play, CC BY 4.0) holds, for every team
// since 1999, a handful of stats over its first N games and over the rest of that season. This file picks the
// Raiders' loudest numbers (best and worst, by league rank), finds the teams that started at least as far from
// average, and works out how far those teams drifted back. Everything here is plain data in and out, so the
// page, the share card and the tests all read the same answer.

import { getGames, getHistory, getScouting } from "./data"
import { type Dot, type Fmt, type Outcomes, type StartRecord, type Story, formatStat, isRaiders, ordinalOf, pctText, seasonGames } from "./historyKit"
import type { Key } from "./scouting"

export { formatStat, isRaiders, teamLabel } from "./historyKit"
export type { Dot, Outcomes, Story, StartRecord, VerdictId } from "./historyKit"

export type HistoryBlock = { w: number[]; s: Record<string, (number | null)[]>; r: Record<string, (number | null)[]> }

export type HistoryData = {
	source: string
	generatedAt: string
	first: number
	last: number
	scale: number
	/** "2007 NE": the row every list below is indexed by. */
	teams: string[]
	po: number[]
	wins: number[]
	stats: string[]
	n: Record<string, HistoryBlock>
}

export type StatDef = {
	/** "off.epaPass": the side and the key in the scouting data. */
	key: string
	side: "off" | "def"
	stat: Key
	/** The tab: "Takeaways". */
	label: string
	/** Mid-sentence: "takeaways". */
	short: string
	/** What one dot measures: "takeaways per game". */
	unit: string
	higherIsBetter: boolean
	fmt: Fmt
}

// Whether higher is better for each stat matches OFFENSE and DEFENSE in scripts/lab/build_scouting.py, and a
// test keeps them honest against the ranks in scouting.json.
export const STAT_DEFS: StatDef[] = [
	{ key: "off.epaPass", side: "off", stat: "epaPass", label: "Passing game", short: "passing", unit: "expected points added per pass", higherIsBetter: true, fmt: "epa" },
	{ key: "off.epaRush", side: "off", stat: "epaRush", label: "Running game", short: "running", unit: "expected points added per rush", higherIsBetter: true, fmt: "epa" },
	{ key: "off.third", side: "off", stat: "third", label: "Third-down offense", short: "third-down offense", unit: "share of third downs converted", higherIsBetter: true, fmt: "pct" },
	{ key: "off.redZone", side: "off", stat: "redZone", label: "Red-zone offense", short: "red-zone offense", unit: "share of red-zone trips that end in a touchdown", higherIsBetter: true, fmt: "pct" },
	{ key: "off.turnovers", side: "off", stat: "turnovers", label: "Ball security", short: "giveaways", unit: "giveaways per game", higherIsBetter: false, fmt: "per" },
	{ key: "off.sackRate", side: "off", stat: "sackRate", label: "Pass protection", short: "pass protection", unit: "share of dropbacks that end in a sack", higherIsBetter: false, fmt: "pct1" },
	{ key: "def.epaPass", side: "def", stat: "epaPass", label: "Pass defense", short: "pass defense", unit: "expected points allowed per pass", higherIsBetter: false, fmt: "epa" },
	{ key: "def.epaRush", side: "def", stat: "epaRush", label: "Run defense", short: "run defense", unit: "expected points allowed per rush", higherIsBetter: false, fmt: "epa" },
	{ key: "def.third", side: "def", stat: "third", label: "Third-down defense", short: "third-down defense", unit: "share of opponent third downs converted", higherIsBetter: false, fmt: "pct" },
	{ key: "def.redZone", side: "def", stat: "redZone", label: "Red-zone defense", short: "red-zone defense", unit: "share of opponent red-zone trips that end in a touchdown", higherIsBetter: false, fmt: "pct" },
	{ key: "def.turnovers", side: "def", stat: "turnovers", label: "Takeaways", short: "takeaways", unit: "takeaways per game", higherIsBetter: true, fmt: "per" },
	{ key: "def.sackRate", side: "def", stat: "sackRate", label: "Pass rush", short: "pass rush", unit: "share of opponent dropbacks that end in a sack", higherIsBetter: true, fmt: "pct1" },
]

export const MIN_GAMES = 3
export const MAX_GAMES = 12
/** Fewer similar teams than this and the page uses the closest ones instead. */
export const MIN_SIMILAR = 30
/** More than this and the page keeps the closest ones, so the chart stays readable. */
export const MAX_SIMILAR = 250

export function statDef(key: string): StatDef | undefined {
	return STAT_DEFS.find((d) => d.key === key)
}

export type HistoryView = {
	season: number
	n: number
	first: number
	last: number
	stories: Story[]
	record: StartRecord | null
	/** The Raiders' own record through n games, when none was a tie. */
	start: { wins: number; losses: number } | null
	bottomLine: { title: string; body: string }
}

function quantile(sorted: number[], q: number): number {
	if (!sorted.length) return NaN
	const pos = (sorted.length - 1) * q
	const lo = Math.floor(pos)
	const hi = Math.ceil(pos)
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Least-squares slope of the rest of the season on the first games, across every team that has both. */
function slopeOf(start: number[], rest: number[]): number {
	const mx = mean(start)
	const my = mean(rest)
	let sxy = 0
	let sxx = 0
	for (let i = 0; i < start.length; i++) {
		sxy += (start[i] - mx) * (rest[i] - my)
		sxx += (start[i] - mx) ** 2
	}
	return sxx > 0 ? sxy / sxx : 0
}

function verdictFor(kept: number, good: boolean): Story["verdict"] {
	if (kept < 0.5) return good ? { id: "fade", text: "Likely to fade" } : { id: "improve", text: "Likely to improve" }
	if (kept >= 0.75) return good ? { id: "hold", text: "Likely to hold" } : { id: "linger", text: "Likely to linger" }
	return { id: "mixed", text: "Part real, part luck" }
}

/** How a set of team-seasons (row indexes) did in wins and playoffs, against all of `everyone`. */
export function outcomesFor(history: HistoryData, n: number, group: number[], everyone: number[]): Outcomes {
	const block = history.n[String(n)]
	const rest = (i: number) => {
		const games = seasonGames(Number(history.teams[i].split(" ")[0])) - n
		return { wins: history.wins[i] - block.w[i], games }
	}
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
	const restWin = (idx: number[]) => sum(idx.map((i) => rest(i).wins)) / sum(idx.map((i) => rest(i).games))
	return {
		startWin: sum(group.map((i) => block.w[i])) / (n * group.length),
		restWin: restWin(group),
		restWins: sum(group.map((i) => rest(i).wins)) / group.length,
		restGames: sum(group.map((i) => rest(i).games)) / group.length,
		playoffs: sum(group.map((i) => history.po[i])) / group.length,
		allRestWin: restWin(everyone),
		allPlayoffs: sum(everyone.map((i) => history.po[i])) / everyone.length,
		avgWins: sum(group.map((i) => history.wins[i])) / group.length,
	}
}

export function winsLine(o: Outcomes, n: number): string {
	const move = o.startWin - o.restWin
	const first = move > 0.05 ? `Their win rate fell from ${pctText(o.startWin)} in the first ${n} games to ${pctText(o.restWin)} after` : move < -0.05 ? `Their win rate rose from ${pctText(o.startWin)} in the first ${n} games to ${pctText(o.restWin)} after` : `Their win rate stayed near ${pctText(o.restWin)}`
	const diff = o.restWin - o.allRestWin
	const vs = diff >= 0.03 ? `, still above the average team's ${pctText(o.allRestWin)}` : diff <= -0.03 ? `, still below the average team's ${pctText(o.allRestWin)}` : `, about what the average team does`
	return `${first}${vs}. ${pctText(o.playoffs)} made the playoffs, against ${pctText(o.allPlayoffs)} of all teams.`
}

/** One story: the Raiders' number for a stat against every team that started at least as far from average. */
export function buildStory(history: HistoryData, def: StatDef, n: number, value: number, rank: number, season: number): Story | null {
	const block = history.n[String(n)]
	if (!block) return null
	const sRaw = block.s[def.key]
	const rRaw = block.r[def.key]
	if (!sRaw || !rRaw) return null
	const k = history.scale
	type Row = { i: number; start: number; rest: number }
	const rows: Row[] = []
	for (let i = 0; i < sRaw.length; i++) {
		const s = sRaw[i]
		const r = rRaw[i]
		if (s === null || r === null) continue
		rows.push({ i, start: s / k, rest: r / k })
	}
	if (rows.length < 100) return null

	const starts = rows.map((r) => r.start)
	const rests = rows.map((r) => r.rest)
	const base = mean(starts)
	const kept = slopeOf(starts, rests)
	const above = value >= base
	const good = def.higherIsBetter ? above : !above

	// Teams that started at least as far from average, on the same side, nearest the Raiders first.
	const beyond = rows.filter((r) => (above ? r.start >= value : r.start <= value)).sort((a, b) => Math.abs(a.start - value) - Math.abs(b.start - value))
	let picked = beyond
	let kind: Story["kind"] = "atLeast"
	if (beyond.length < MIN_SIMILAR) {
		picked = rows.slice().sort((a, b) => Math.abs(a.start - value) - Math.abs(b.start - value)).slice(0, MIN_SIMILAR)
		kind = "closest"
	} else if (beyond.length > MAX_SIMILAR) {
		picked = beyond.slice(0, MAX_SIMILAR)
		kind = "closest"
	}
	// A stable order for drawing, and the same one every time the data is the same.
	picked = picked.slice().sort((a, b) => a.i - b.i)

	const dots: Dot[] = picked.map((r) => ({
		team: history.teams[r.i],
		start: r.start,
		rest: r.rest,
		toward: Math.abs(r.rest - base) < Math.abs(r.start - base),
		raiders: isRaiders(history.teams[r.i]),
	}))
	const toward = dots.filter((d) => d.toward).length / dots.length
	const avgStart = mean(dots.map((d) => d.start))
	const avgRest = mean(dots.map((d) => d.rest))
	const restSorted = dots.map((d) => d.rest).sort((a, b) => a - b)
	const band: [number, number] = [quantile(restSorted, 0.25), quantile(restSorted, 0.75)]
	const typical = base + kept * (value - base)
	const keptShown = Math.min(1, Math.max(0, kept))

	const all = [...dots.flatMap((d) => [d.start, d.rest]), value, base, typical]
	const lo = Math.min(...all)
	const hi = Math.max(...all)
	const pad = (hi - lo) * 0.06 || 0.01
	const domain: [number, number] = [lo - pad, hi + pad]

	const outcomes = outcomesFor(history, n, picked.map((r) => r.i), rows.map((r) => r.i))
	const earlierRows = dots.filter((d) => d.raiders)
	const pct = `${Math.round(toward * 100)}%`
	const how = good ? "well" : "poorly"
	const headline =
		kind === "atLeast"
			? `${dots.length} teams since ${history.first} started at least as ${how} as the ${season} Raiders at ${def.short} through ${n} games. ${pct} finished the year closer to average.`
			: `The ${dots.length} teams since ${history.first} closest to the ${season} Raiders' ${def.short} through ${n} games. ${pct} finished the year closer to average.`
	const sub = `Each dot is one team in one season: its ${def.unit} through its first ${n} games, then over the rest of that season. The Raiders are at ${formatStat(def, value)}, ${ordinalOf(rank)} of 32 teams.`

	return {
		key: def.key,
		fmt: def.fmt,
		higherIsBetter: def.higherIsBetter,
		label: def.label,
		short: def.short,
		unit: def.unit,
		n,
		value,
		valueText: formatStat(def, value),
		rank,
		good,
		base,
		dots,
		kind,
		avgStart,
		avgRest,
		toward,
		band,
		typical,
		kept: keptShown,
		verdict: verdictFor(kept, good),
		outcomes,
		winsLine: winsLine(outcomes, n),
		earlier: { count: earlierRows.length, toward: earlierRows.filter((d) => d.toward).length },
		domain,
		headline,
		sub,
		startText: formatStat(def, avgStart),
		restText: formatStat(def, avgRest),
		baseText: formatStat(def, base),
		typicalText: formatStat(def, typical),
	}
}

/** The Raiders' best and worst numbers by league rank: up to two of each, only if they stand out. */
export function pickStats(scouting: ReturnType<typeof getScouting>): { def: StatDef; value: number; rank: number }[] {
	const lv = scouting.teams.LV
	if (!lv) return []
	const all = STAT_DEFS.flatMap((def) => {
		const m = lv[def.side][def.stat]
		return m ? [{ def, value: m.v, rank: m.rank }] : []
	})
	const best = all.filter((a) => a.rank <= 10).sort((a, b) => a.rank - b.rank).slice(0, 2)
	const worst = all.filter((a) => a.rank >= 23).sort((a, b) => b.rank - a.rank).slice(0, 2)
	if (best.length || worst.length) return [...best, ...worst]
	const mostExtreme = all.slice().sort((a, b) => Math.abs(b.rank - 16.5) - Math.abs(a.rank - 16.5))[0]
	return mostExtreme ? [mostExtreme] : []
}

function listOf(labels: string[]): string {
	const l = labels.map((s) => s.toLowerCase())
	const text = l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`
	return text.charAt(0).toUpperCase() + text.slice(1)
}

export function bottomLine(stories: Story[], record: StartRecord | null, n: number, season: number, first: number): HistoryView["bottomLine"] {
	const fade = stories.filter((s) => s.verdict.id === "fade")
	const improve = stories.filter((s) => s.verdict.id === "improve")
	const stay = stories.filter((s) => s.verdict.id === "hold" || s.verdict.id === "linger")
	const title =
		fade.length && improve.length
			? "Some of it will fade. Some of it will come back."
			: fade.length
				? "The best of it usually fades."
				: improve.length
					? "The worst of it usually recovers."
					: stay.length
						? "Some of these numbers are the real thing."
						: "None of this stands far from average."
	const parts: string[] = []
	if (fade.length) parts.push(`${listOf(fade.map((s) => s.label))} ${fade.length === 1 ? "is the kind of number that cools off" : "are the kind of numbers that cool off"}: teams that started this well gave back most of the edge.`)
	if (improve.length) parts.push(`${listOf(improve.map((s) => s.label))} ${improve.length === 1 ? "is the kind that bounces back" : "are the kind that bounce back"}: teams that started this poorly usually got closer to average.`)
	if (stay.length) parts.push(`${listOf(stay.map((s) => s.label))} ${stay.length === 1 ? "has" : "have"} tended to stay put, which makes ${stay.length === 1 ? "it" : "them"} more likely to be real.`)
	parts.push(`None of this is a prediction for one game. It is what happened to teams that looked like the ${season} Raiders after ${n} games.`)
	if (record) parts.push(`Of the ${record.teams} teams since ${first} that started ${record.wins}-${record.losses}, ${Math.round((record.playoffs / record.teams) * 100)}% made the playoffs and the average one finished with ${record.avgWins.toFixed(1)} wins.`)
	return { title, body: parts.join(" ") }
}

/** The Raiders' record through `n` games, and how teams with that record finished. Null with too few teams or any tie. */
export function recordStory(history: HistoryData, n: number, games: { result: string }[]): StartRecord | null {
	const block = history.n[String(n)]
	const played = games.slice(0, n)
	if (!block || played.length !== n || played.some((g) => g.result === "T")) return null
	const wins = played.filter((g) => g.result === "W").length
	let teams = 0
	let playoffs = 0
	let total = 0
	for (let i = 0; i < block.w.length; i++) {
		if (block.w[i] !== wins) continue
		teams++
		playoffs += history.po[i]
		total += history.wins[i]
	}
	if (teams < 20) return null
	return { wins, losses: n - wins, teams, playoffs, avgWins: total / teams }
}

/** Everything the page needs, or null when the Raiders have not played enough games (or have played too many) for the comparison. */
export function getHistoryView(): HistoryView | null {
	const history = getHistory()
	const scouting = getScouting()
	const lv = scouting.teams.LV
	if (!lv || lv.g < MIN_GAMES || lv.g > MAX_GAMES || !history.n[String(lv.g)]) return null
	const n = lv.g
	const stories = pickStats(scouting).flatMap(({ def, value, rank }) => {
		const s = buildStory(history, def, n, value, rank, scouting.season)
		return s ? [s] : []
	})
	if (!stories.length) return null
	const games = getGames().slice(0, n)
	const start = games.length === n && games.every((g) => g.result !== "T") ? { wins: games.filter((g) => g.result === "W").length, losses: games.filter((g) => g.result === "L").length } : null
	const record = recordStory(history, n, getGames())
	return { season: scouting.season, n, first: history.first, last: history.last, stories, record, start, bottomLine: bottomLine(stories, record, n, scouting.season, history.first) }
}

/** One stat's story by key, for any stat in the catalog (the share cards ask for these), or null when the history does not apply yet. */
export function getStory(key: string): { story: Story; n: number; first: number; last: number } | null {
	const def = statDef(key)
	const history = getHistory()
	const lv = getScouting().teams.LV
	if (!def || !lv || lv.g < MIN_GAMES || lv.g > MAX_GAMES) return null
	const m = lv[def.side][def.stat]
	if (!m) return null
	const story = buildStory(history, def, lv.g, m.v, m.rank, getScouting().season)
	return story ? { story, n: lv.g, first: history.first, last: history.last } : null
}
