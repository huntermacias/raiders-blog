// "Will it last?": what happened to teams that started a season the way the Raiders have.
//
// data/lab/history.json (scripts/lab/build_history.py, nflverse play-by-play, CC BY 4.0) holds, for every team
// since 1999, a set of stats over its first N games and over the rest of that season, with its record. This
// file turns that into the tables the page and the share cards use, picks the Raiders' loudest numbers (best
// and worst, by league rank), and writes the bottom line. The analysis itself lives in historyKit.ts, which
// the browser also runs so fans can filter by team and playoff result.

import { getGames, getHistory, getScouting } from "./data"
import { type Analysis, type CheckRow, type Fmt, type Meta, type StartRecord, type Table, analyze, checklist } from "./historyKit"
import type { Key } from "./scouting"

export { formatStat, isRaiders, teamLabel, analyze, checklist, outcomesFor, winsLine, fifthsOf, MIN_SIMILAR, MAX_SIMILAR } from "./historyKit"
export type { Analysis, Outcomes, StartRecord, VerdictId, Meta, Table, Filter, Row, CheckRow } from "./historyKit"
/** Older name for one analysed stat. */
export type Story = Analysis

export type HistoryBlock = { w: number[]; l: number[]; s: Record<string, (number | null)[]>; r: Record<string, (number | null)[]> }

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
	losses: number[]
	stats: string[]
	n: Record<string, HistoryBlock>
}

export type StatDef = {
	/** "off.epaPass", "def.turnovers" or "net.points". */
	key: string
	side: "off" | "def" | "net"
	/** The key in the scouting data; null for the two that are worked out from others. */
	stat: Key | null
	/** The tab: "Takeaways". */
	label: string
	/** Mid-sentence: "takeaways". */
	short: string
	/** What one dot measures: "takeaways per game". */
	unit: string
	higherIsBetter: boolean
	fmt: Fmt
	/** One of the stats the page picks its tabs from. The rest are under "More stats". */
	standout: boolean
}

const d = (side: "off" | "def", stat: Key, label: string, short: string, unit: string, higherIsBetter: boolean, fmt: Fmt, standout = true): StatDef => ({ key: `${side}.${stat}`, side, stat, label, short, unit, higherIsBetter, fmt, standout })

// Whether higher is better for each stat matches OFFENSE and DEFENSE in scripts/lab/build_scouting.py, and a
// test keeps them honest against the ranks in scouting.json.
export const STAT_DEFS: StatDef[] = [
	d("off", "epaPass", "Passing game", "passing", "expected points added per pass", true, "epa"),
	d("off", "epaRush", "Running game", "running", "expected points added per rush", true, "epa"),
	d("off", "third", "Third-down offense", "third-down offense", "share of third downs converted", true, "pct"),
	d("off", "redZone", "Red-zone offense", "red-zone offense", "share of red-zone trips that end in a touchdown", true, "pct"),
	d("off", "turnovers", "Ball security", "giveaways", "giveaways per game", false, "per"),
	d("off", "sackRate", "Pass protection", "pass protection", "share of dropbacks that end in a sack", false, "pct1"),
	d("def", "epaPass", "Pass defense", "pass defense", "expected points allowed per pass", false, "epa"),
	d("def", "epaRush", "Run defense", "run defense", "expected points allowed per rush", false, "epa"),
	d("def", "third", "Third-down defense", "third-down defense", "share of opponent third downs converted", false, "pct"),
	d("def", "redZone", "Red-zone defense", "red-zone defense", "share of opponent red-zone trips that end in a touchdown", false, "pct"),
	d("def", "turnovers", "Takeaways", "takeaways", "takeaways per game", true, "per"),
	d("def", "sackRate", "Pass rush", "pass rush", "share of opponent dropbacks that end in a sack", true, "pct1"),
	d("off", "epa", "Offense overall", "overall offense", "expected points added per play", true, "epa", false),
	d("off", "explosive", "Big plays", "big plays", "share of plays that gain 10 or more rushing or 20 or more passing yards", true, "pct1", false),
	d("off", "points", "Scoring", "scoring", "points scored per game", true, "pts", false),
	d("def", "epa", "Defense overall", "overall defense", "expected points allowed per play", false, "epa", false),
	d("def", "explosive", "Big plays allowed", "big plays allowed", "share of opponent plays that gain 10 or more rushing or 20 or more passing yards", false, "pct1", false),
	d("def", "points", "Points allowed", "points allowed", "points allowed per game", false, "pts", false),
	{ key: "net.points", side: "net", stat: null, label: "Point differential", short: "point differential", unit: "points per game, scored minus allowed", higherIsBetter: true, fmt: "diff", standout: false },
	{ key: "net.turnovers", side: "net", stat: null, label: "Turnover margin", short: "turnover margin", unit: "takeaways minus giveaways per game", higherIsBetter: true, fmt: "epa", standout: false },
]

export const MIN_GAMES = 3
export const MAX_GAMES = 12

export function statDef(key: string): StatDef | undefined {
	return STAT_DEFS.find((x) => x.key === key)
}

export type HistoryView = {
	season: number
	n: number
	first: number
	last: number
	meta: Meta
	tables: Table[]
	/** Keys of the Raiders' best and worst numbers, the page's first tabs. */
	standouts: string[]
	/** The standouts analysed with no filter: the page's first paint, the bottom line and the cards. */
	stories: Analysis[]
	checklist: CheckRow[]
	record: StartRecord | null
	/** The Raiders' own record through n games, when none was a tie. */
	start: { wins: number; losses: number } | null
	bottomLine: { title: string; body: string }
}

/** The Raiders' value and rank (1 is best) for a stat, from the scouting file. Null when it is not there. */
function raidersStanding(def: StatDef, scouting: ReturnType<typeof getScouting>): { value: number; rank: number } | null {
	const teams = scouting.teams
	if (!teams.LV) return null
	if (def.stat) {
		const m = teams.LV[def.side as "off" | "def"][def.stat]
		return m ? { value: m.v, rank: m.rank } : null
	}
	const net = (t: (typeof teams)[string]): number | null => {
		if (def.key === "net.points") return t.off.points && t.def.points ? t.off.points.v - t.def.points.v : null
		return t.off.turnovers && t.def.turnovers ? t.def.turnovers.v - t.off.turnovers.v : null
	}
	const all = Object.values(teams).flatMap((t) => {
		const v = net(t)
		return v === null ? [] : [v]
	})
	const mine = net(teams.LV)
	if (mine === null) return null
	return { value: mine, rank: 1 + all.filter((v) => (def.higherIsBetter ? v > mine : v < mine)).length }
}

/** The history cut at `n` games as the lists the analysis reads, and one table per stat the Raiders have a number for. */
export function buildTables(history: HistoryData, n: number, scouting: ReturnType<typeof getScouting>): { meta: Meta; tables: Table[] } | null {
	const block = history.n[String(n)]
	if (!block) return null
	const k = history.scale
	const meta: Meta = { n, first: history.first, last: history.last, teams: history.teams, po: history.po, wins: history.wins, losses: history.losses, startWins: block.w, startLosses: block.l }
	const col = (src: Record<string, (number | null)[]>, key: string) => src[key]?.map((v) => (v === null ? null : v / k)) ?? null
	const tables: Table[] = []
	for (const def of STAT_DEFS) {
		const me = raidersStanding(def, scouting)
		if (!me) continue
		let start: (number | null)[] | null
		let rest: (number | null)[] | null
		if (def.side === "net") {
			const [a, b] = def.key === "net.points" ? ["off.points", "def.points"] : ["def.turnovers", "off.turnovers"]
			const sa = col(block.s, a)
			const sb = col(block.s, b)
			const ra = col(block.r, a)
			const rb = col(block.r, b)
			if (!sa || !sb || !ra || !rb) continue
			start = sa.map((v, i) => (v === null || sb[i] === null ? null : v - (sb[i] as number)))
			rest = ra.map((v, i) => (v === null || rb[i] === null ? null : v - (rb[i] as number)))
		} else {
			start = col(block.s, def.key)
			rest = col(block.r, def.key)
		}
		if (!start || !rest) continue
		tables.push({ key: def.key, label: def.label, short: def.short, unit: def.unit, fmt: def.fmt, higherIsBetter: def.higherIsBetter, family: def.side, value: me.value, rank: me.rank, start, rest })
	}
	return { meta, tables }
}

/** The Raiders' best and worst numbers by league rank among the standout stats: up to two of each, only if they stand out. */
export function pickStandouts(tables: Table[]): string[] {
	const all = tables.filter((t) => statDef(t.key)?.standout)
	const best = all.filter((t) => t.rank <= 10).sort((a, b) => a.rank - b.rank).slice(0, 2)
	const worst = all.filter((t) => t.rank >= 23).sort((a, b) => b.rank - a.rank).slice(0, 2)
	if (best.length || worst.length) return [...best, ...worst].map((t) => t.key)
	const mostExtreme = all.slice().sort((a, b) => Math.abs(b.rank - 16.5) - Math.abs(a.rank - 16.5))[0]
	return mostExtreme ? [mostExtreme.key] : []
}

function listOf(labels: string[]): string {
	const l = labels.map((s) => s.toLowerCase())
	const text = l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`
	return text.charAt(0).toUpperCase() + text.slice(1)
}

export function bottomLine(stories: Analysis[], record: StartRecord | null, n: number, season: number, first: number): HistoryView["bottomLine"] {
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
	if (!lv || lv.g < MIN_GAMES || lv.g > MAX_GAMES) return null
	const n = lv.g
	const built = buildTables(history, n, scouting)
	if (!built) return null
	const standouts = pickStandouts(built.tables)
	const stories = standouts.flatMap((key) => {
		const t = built.tables.find((x) => x.key === key)
		const a = t ? analyze(built.meta, t, scouting.season) : null
		return a ? [a] : []
	})
	if (!stories.length) return null
	const games = getGames().slice(0, n)
	const start = games.length === n && games.every((g) => g.result !== "T") ? { wins: games.filter((g) => g.result === "W").length, losses: games.filter((g) => g.result === "L").length } : null
	const record = recordStory(history, n, getGames())
	return { season: scouting.season, n, first: history.first, last: history.last, meta: built.meta, tables: built.tables, standouts, stories, checklist: checklist(built.meta, built.tables), record, start, bottomLine: bottomLine(stories, record, n, scouting.season, history.first) }
}

/** One stat's analysis by key, for any stat in the catalog (the share cards ask for these), or null when the history does not apply yet. */
export function getStory(key: string): { story: Analysis; n: number; first: number; last: number } | null {
	const history = getHistory()
	const scouting = getScouting()
	const lv = scouting.teams.LV
	if (!statDef(key) || !lv || lv.g < MIN_GAMES || lv.g > MAX_GAMES) return null
	const built = buildTables(history, lv.g, scouting)
	const t = built?.tables.find((x) => x.key === key)
	const story = built && t ? analyze(built.meta, t, scouting.season) : null
	return story ? { story, n: lv.g, first: history.first, last: history.last } : null
}
