// How teams stack up, position group by position group.
//
// scripts/lab/build_units.py grades every team on seven groups (quarterback, offensive line, receivers, run
// game, pass rush, run defense, coverage), each made of a few plain stats with a league rank where 1 is best.
// This file turns those tables into matchups: which unit of one team meets which unit of the other, who has the
// edge, who is missing, and how the two coaches compare. Pure functions of the data they are handed; like
// historyKit.ts it imports no data, so the server, the browser and the tests can all run it.

export type GroupKey = "qb" | "ol" | "rec" | "run" | "rush" | "rund" | "cov"
export type Metric = { v: number; rank: number } | null
export type Leader = { name: string; pos: string; stat: string; v: number; n?: number; x?: number }
export type GroupData = { score: number | null; rank: number; stats: Record<string, Metric>; leaders: Leader[] }
export type Practice = "DNP" | "Limited" | "Full"
/** One look at a player's status: when we saw it and what it was. Only changes are kept. */
export type TrailStep = { at: string; practice: Practice | null; status: string }
export type InjuryPlayer = {
	name: string
	pos: string
	group: GroupKey
	/** The game designation once the team has issued one; before that, how he practiced (DNP, Limited, or Full when he is back). */
	status: string
	/** How he practiced at the latest report. Old data files do not have it. */
	practice?: Practice | null
	injury: string | null
	starter: boolean
	snap: number | null
	/** Changes in his status over the report week, oldest first. Old data files do not have it. */
	trail?: TrailStep[]
}
export type Rec = { w: number; l: number; t: number }
export type AtsRec = { w: number; l: number; p: number }
export type Meeting = { season: number; week: number; pf: number; pa: number }
export type CoachVs = { coach: string; coachMeet: Rec & { n: number }; teamMeet: Rec & { n: number }; recent: Meeting[] }
export type Coaching = {
	name: string
	career: Rec & { n: number }
	withTeam: Rec & { since: number }
	ats: { season: AtsRec; career: AtsRec; favorite: AtsRec; underdog: AtsRec }
	bye: Rec
	vs: Record<string, CoachVs>
}
export type UnitTeam = {
	g: number
	w: number
	l: number
	t: number
	pf: number
	pa: number
	overall: { off: Metric; def: Metric }
	groups: Record<GroupKey, GroupData>
	style: { off: Record<string, Metric>; def: Record<string, Metric> }
	coach: Coaching | null
	injuries: { week: number | null; players: InjuryPlayer[] }
}
export type SlateGame = { away: string; home: string; day: string; time: string | null; spread: number | null; total: number | null }
export type UnitsData = {
	season: number
	week: number
	generatedAt: string
	source: string
	teams: Record<string, UnitTeam>
	slate: { week: number; games: SlateGame[] } | null
	/** When the injury reports last changed. The rest of the file is rebuilt weekly; the reports are refreshed through the week. */
	injuriesUpdatedAt?: string
}

// ------------------------------------------------------------------------------------------------ the catalog

type Fmt = "epa" | "pct" | "pct1" | "num1" | "pts" | "rating"
export type StatInfo = { label: string; better: "high" | "low"; fmt: Fmt }
export type GroupInfo = { side: "off" | "def"; label: string; short: string; players: string; stats: Record<string, StatInfo> }

export const GROUPS: Record<GroupKey, GroupInfo> = {
	qb: {
		side: "off",
		label: "Quarterback",
		short: "QB",
		players: "The quarterback",
		stats: {
			epaDb: { label: "Points added per dropback", better: "high", fmt: "epa" },
			cpoe: { label: "Completions above expected", better: "high", fmt: "pts" },
			intRate: { label: "Interceptions per throw", better: "low", fmt: "pct1" },
			bigPass: { label: "Passes of 20+ yards per dropback", better: "high", fmt: "pct1" },
		},
	},
	ol: {
		side: "off",
		label: "Offensive line",
		short: "OL",
		players: "The five linemen with the most snaps",
		stats: {
			sackRate: { label: "Sacks allowed per dropback", better: "low", fmt: "pct1" },
			pressure: { label: "Pressure allowed per dropback", better: "low", fmt: "pct" },
			ybc: { label: "Rushing yards before contact", better: "high", fmt: "num1" },
			stuffed: { label: "Runs stopped at or behind the line", better: "low", fmt: "pct" },
		},
	},
	rec: {
		side: "off",
		label: "Receivers",
		short: "WR/TE",
		players: "The most-targeted pass catchers",
		stats: {
			epaTgt: { label: "Points added per target", better: "high", fmt: "epa" },
			yac: { label: "Yards after the catch", better: "high", fmt: "num1" },
			drop: { label: "Drops per target", better: "low", fmt: "pct1" },
			broken: { label: "Tackles broken per catch", better: "high", fmt: "pct1" },
		},
	},
	run: {
		side: "off",
		label: "Run game",
		short: "RB",
		players: "The ball carriers with the most runs",
		stats: {
			epaRush: { label: "Points added per run", better: "high", fmt: "epa" },
			success: { label: "Runs that keep the drive on track", better: "high", fmt: "pct" },
			yco: { label: "Rushing yards after contact", better: "high", fmt: "num1" },
			explosive: { label: "Runs of 10+ yards", better: "high", fmt: "pct1" },
		},
	},
	rush: {
		side: "def",
		label: "Pass rush",
		short: "DL/EDGE",
		players: "The most pressures this season",
		stats: {
			sackRate: { label: "Sacks per dropback", better: "high", fmt: "pct1" },
			pressure: { label: "Pressure per dropback", better: "high", fmt: "pct" },
			hitRate: { label: "Quarterback hits per dropback", better: "high", fmt: "pct1" },
		},
	},
	rund: {
		side: "def",
		label: "Run defense",
		short: "LB",
		players: "The linebackers with the most tackles",
		stats: {
			epaRush: { label: "Points allowed per run", better: "low", fmt: "epa" },
			stuff: { label: "Runs stopped at or behind the line", better: "high", fmt: "pct" },
			explosive: { label: "Runs of 10+ yards allowed", better: "low", fmt: "pct1" },
			missed: { label: "Missed tackles", better: "low", fmt: "pct1" },
		},
	},
	cov: {
		side: "def",
		label: "Pass coverage",
		short: "CB/S",
		players: "The defensive backs thrown at most",
		stats: {
			epaAtt: { label: "Points allowed per throw", better: "low", fmt: "epa" },
			cpoe: { label: "Completions allowed above expected", better: "low", fmt: "pts" },
			bigPass: { label: "Passes of 20+ yards allowed", better: "low", fmt: "pct1" },
			intRate: { label: "Interceptions per throw", better: "high", fmt: "pct1" },
			rating: { label: "Passer rating allowed", better: "low", fmt: "rating" },
		},
	},
}

export const GROUP_ORDER: GroupKey[] = ["qb", "ol", "rec", "run", "rush", "rund", "cov"]
export const OFFENSE_GROUPS = GROUP_ORDER.filter((g) => GROUPS[g].side === "off")
export const DEFENSE_GROUPS = GROUP_ORDER.filter((g) => GROUPS[g].side === "def")

export function isGroup(v: string): v is GroupKey {
	return v in GROUPS
}

const MINUS = "−"
const signed = (v: number, digits: number) => `${v >= 0 ? "+" : MINUS}${Math.abs(v).toFixed(digits)}`

export function formatStat(fmt: Fmt, v: number): string {
	switch (fmt) {
		case "epa":
			return signed(v, 2)
		case "pts":
			return signed(v, 1)
		case "pct":
			return `${(v * 100).toFixed(0)}%`
		case "pct1":
			return `${(v * 100).toFixed(1)}%`
		case "num1":
			return v.toFixed(1)
		case "rating":
			return v.toFixed(1)
	}
}

export function statValue(group: GroupKey, key: string, v: number): string {
	return formatStat(GROUPS[group].stats[key].fmt, v)
}

export function ordinal(n: number): string {
	const mod100 = n % 100
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`
	switch (n % 10) {
		case 1:
			return `${n}st`
		case 2:
			return `${n}nd`
		case 3:
			return `${n}rd`
		default:
			return `${n}th`
	}
}

/** Where a rank sits from 0 (last) to 100 (first). */
export function percentile(rank: number, n: number): number {
	return n < 2 ? 50 : ((n - rank) / (n - 1)) * 100
}

export const teamCount = (data: UnitsData) => Object.keys(data.teams).length

// ------------------------------------------------------------------------------------------------ the pairings

export type Part = { group: GroupKey; stats?: string[] }
export type Pair = {
	id: "protection" | "ground" | "passing" | "targets"
	label: string
	/** What to call each side in a sentence. */
	offName: string
	defName: string
	off: Part[]
	def: Part[]
}

/** The four places an offense meets a defense. A stat can sit in two pairings, as the line blocks for both the pass and the run. */
export const PAIRS: Pair[] = [
	{ id: "protection", label: "Pass protection vs pass rush", offName: "pass protection", defName: "pass rush", off: [{ group: "ol", stats: ["sackRate", "pressure"] }], def: [{ group: "rush" }] },
	{
		id: "ground",
		label: "Run game vs run defense",
		offName: "run game",
		defName: "run defense",
		off: [{ group: "run" }, { group: "ol", stats: ["ybc", "stuffed"] }],
		def: [{ group: "rund" }],
	},
	{ id: "passing", label: "Quarterback vs coverage", offName: "quarterback play", defName: "pass coverage", off: [{ group: "qb" }], def: [{ group: "cov", stats: ["epaAtt", "cpoe", "intRate"] }] },
	{ id: "targets", label: "Receivers vs coverage", offName: "receiving corps", defName: "pass coverage", off: [{ group: "rec" }], def: [{ group: "cov", stats: ["bigPass", "rating", "epaAtt"] }] },
]

/** A side of a pairing is the mean percentile of its stats' league ranks. */
export function partScore(team: UnitTeam, parts: Part[], n: number): number | null {
	const pcts: number[] = []
	for (const part of parts) {
		const stats = team.groups[part.group]?.stats ?? {}
		for (const key of part.stats ?? Object.keys(GROUPS[part.group].stats)) {
			const m = stats[key]
			if (m) pcts.push(percentile(m.rank, n))
		}
	}
	return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
}

/** Every team's score and rank for one side of one pairing. */
export function pairBoard(data: UnitsData, pair: Pair, side: "off" | "def"): Record<string, { score: number; rank: number }> {
	const n = teamCount(data)
	const parts = side === "off" ? pair.off : pair.def
	const rows = Object.keys(data.teams)
		.map((abbr) => ({ abbr, score: partScore(data.teams[abbr], parts, n) }))
		.filter((r): r is { abbr: string; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score || a.abbr.localeCompare(b.abbr))
	return Object.fromEntries(rows.map((r, i) => [r.abbr, { score: r.score, rank: i + 1 }]))
}

export type Tier = "big" | "edge" | "even"
export const BIG_EDGE = 30
export const EDGE = 12

export function tierOf(edge: number): Tier {
	const a = Math.abs(edge)
	return a >= BIG_EDGE ? "big" : a >= EDGE ? "edge" : "even"
}

export type MatchupRow = {
	pair: Pair
	/** The team with the ball in this pairing, and the one defending. */
	attacker: string
	defender: string
	/** Percentile scores, 0 to 100, and the rank among all teams. */
	attack: { score: number; rank: number }
	defend: { score: number; rank: number }
	/** Positive when the offense wins the pairing, in percentile points. */
	edge: number
	tier: Tier
}

/** All eight pairings between two teams: each team's offense against the other's defense. */
export function matchupRows(data: UnitsData, a: string, b: string): MatchupRow[] {
	if (!data.teams[a] || !data.teams[b]) return []
	const rows: MatchupRow[] = []
	for (const [attacker, defender] of [
		[a, b],
		[b, a],
	]) {
		for (const pair of PAIRS) {
			const atk = pairBoard(data, pair, "off")[attacker]
			const def = pairBoard(data, pair, "def")[defender]
			if (!atk || !def) continue
			const edge = atk.score - def.score
			rows.push({ pair, attacker, defender, attack: atk, defend: def, edge, tier: tierOf(edge) })
		}
	}
	return rows
}

/** The mean edge of a team's four attacking pairings, minus the other team's. Positive favors `a`. */
export function paperEdge(rows: MatchupRow[], a: string): number {
	const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)
	const mine = rows.filter((r) => r.attacker === a).map((r) => r.edge)
	const theirs = rows.filter((r) => r.attacker !== a).map((r) => r.edge)
	return mean(mine) - mean(theirs)
}

/** Who wins a pairing, from the point of view of `team`: 1 if it has the edge, -1 if the other side does, 0 if it is even. */
export function sideOf(row: MatchupRow, team: string): 1 | 0 | -1 {
	if (row.tier === "even") return 0
	const offenseWins = row.edge > 0
	const teamAttacks = row.attacker === team
	return offenseWins === teamAttacks ? 1 : -1
}

export function edgeWord(tier: Tier): string {
	return tier === "big" ? "Big edge" : tier === "edge" ? "Edge" : "Even"
}

/** The pairings most worth a look: the biggest edge for each team, most lopsided first. */
export function topEdges(rows: MatchupRow[], team: string, count = 2): MatchupRow[] {
	return rows
		.filter((r) => sideOf(r, team) === 1)
		.sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge))
		.slice(0, count)
}

export type Names = Record<string, string>

export function rowSentence(row: MatchupRow, names: Names): string {
	const atk = names[row.attacker] ?? row.attacker
	const def = names[row.defender] ?? row.defender
	return `The ${atk} ${row.pair.offName} ranks ${ordinal(row.attack.rank)}. The ${def} ${row.pair.defName} ranks ${ordinal(row.defend.rank)}.`
}

/** The line a card or preview leads with. */
export function headline(rows: MatchupRow[], a: string, b: string, names: Names): string {
	if (!rows.length) return `How the ${names[a] ?? a} and ${names[b] ?? b} stack up, position group by position group.`
	const best = [...rows].filter((r) => r.tier !== "even").sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge))[0]
	if (!best) return `On paper the ${names[a] ?? a} and ${names[b] ?? b} are even in every position-group matchup.`
	const winner = best.edge > 0 ? best.attacker : best.defender
	const unit = best.edge > 0 ? best.pair.offName : best.pair.defName
	const loser = best.edge > 0 ? best.defender : best.attacker
	const otherUnit = best.edge > 0 ? best.pair.defName : best.pair.offName
	return `The biggest mismatch: the ${names[winner] ?? winner} ${unit} (${ordinal(best.edge > 0 ? best.attack.rank : best.defend.rank)}) against the ${names[loser] ?? loser} ${otherUnit} (${ordinal(best.edge > 0 ? best.defend.rank : best.attack.rank)}).`
}

export function tally(rows: MatchupRow[], team: string): { edges: number; against: number; even: number } {
	let edges = 0
	let against = 0
	let even = 0
	for (const r of rows) {
		const s = sideOf(r, team)
		if (s === 1) edges++
		else if (s === -1) against++
		else even++
	}
	return { edges, against, even }
}

// ------------------------------------------------------------------------------------------------ injuries

/** Players on the game-day report. Practice-only entries (did not practice, limited) are kept apart. */
export const GAME_STATUS = ["Out", "Doubtful", "Questionable"] as const

export function isGameStatus(status: string): boolean {
	return (GAME_STATUS as readonly string[]).includes(status)
}

/** How he practiced, from the new field or, in older data files, from the status. */
export function practiceOf(p: InjuryPlayer): Practice | null {
	if (p.practice !== undefined) return p.practice
	return p.status === "DNP" || p.status === "Limited" || p.status === "Full" ? p.status : null
}

const PRACTICE_RANK: Record<Practice, number> = { DNP: 0, Limited: 1, Full: 2 }
const PRACTICE_TEXT: Record<Practice, string> = { DNP: "Did not practice", Limited: "Limited in practice", Full: "Full practice" }
const PRACTICE_SHORT: Record<Practice, string> = { DNP: "DNP", Limited: "Limited", Full: "Full" }

export const practiceText = (practice: Practice): string => PRACTICE_TEXT[practice]

/** Whether he is practicing more ("up"), less ("down") or the same as at our previous look. Null with no earlier look. */
export function practiceTrend(p: InjuryPlayer): "up" | "down" | null {
	const seen = (p.trail ?? []).filter((t) => t.practice)
	if (seen.length < 2) return null
	const diff = PRACTICE_RANK[seen[seen.length - 1].practice as Practice] - PRACTICE_RANK[seen[seen.length - 2].practice as Practice]
	return diff > 0 ? "up" : diff < 0 ? "down" : null
}

const ET = "America/New_York"
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: ET }).format(new Date(iso))

/** "Fri, Oct 9, 7:23 PM ET": when the reports last changed, in the NFL's own time zone so every reader sees the same thing. */
export function updatedText(iso: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ""
	const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: ET }).format(d)
	const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET }).format(d)
	return `${date}, ${time} ET`
}

/** "Wed DNP → Thu Limited → Fri Full": his practice week as we saw it. A player we have looked at once reads "Fri Limited". */
export type TrailLabel = { day: string; practice: Practice | null; label: string; game: string | null }

/** His practice week as separate steps, for a view that wants to draw them. */
export function trailSteps(p: InjuryPlayer): TrailLabel[] {
	return (p.trail ?? []).map((t) => ({
		day: dayOf(t.at),
		practice: t.practice,
		label: t.practice ? PRACTICE_SHORT[t.practice] : t.status,
		game: isGameStatus(t.status) ? t.status.toLowerCase() : null,
	}))
}

export function trailText(p: InjuryPlayer): string {
	return trailSteps(p)
		.map((t) => `${t.day} ${t.label}${t.game ? ` (${t.game})` : ""}`)
		.join(" → ")
}

/** Report entries in these groups, those on the game-day report first and starters first. */
export function groupInjuries(team: UnitTeam, groups: GroupKey[]): InjuryPlayer[] {
	return team.injuries.players.filter((p) => groups.includes(p.group))
}

/** Starters on the game-day report: the ones that move a matchup. */
export function missingStarters(team: UnitTeam, groups?: GroupKey[]): InjuryPlayer[] {
	return team.injuries.players.filter((p) => p.starter && isGameStatus(p.status) && (!groups || groups.includes(p.group)))
}

/** Starters who are on the game-day report or did not practice fully this week, which is how a game designation is usually foreshadowed. */
export function reportedStarters(team: UnitTeam, groups?: GroupKey[]): InjuryPlayer[] {
	return team.injuries.players.filter((p) => {
		if (!p.starter || (groups && !groups.includes(p.group))) return false
		const practice = practiceOf(p)
		return isGameStatus(p.status) || practice === "DNP" || practice === "Limited"
	})
}

/** What to say about one player on the report: "questionable, limited in practice, knee". */
export function injuryNote(p: InjuryPlayer): string {
	const practice = practiceOf(p)
	const parts: string[] = []
	if (isGameStatus(p.status)) parts.push(p.status.toLowerCase())
	if (practice) parts.push(PRACTICE_TEXT[practice].toLowerCase())
	if (p.injury) parts.push(p.injury.toLowerCase())
	return parts.join(", ")
}

export function groupsOfPair(pair: Pair, side: "off" | "def"): GroupKey[] {
	return Array.from(new Set((side === "off" ? pair.off : pair.def).map((p) => p.group)))
}

/** "Report from Week 4" when it is not for the game being previewed. */
export function reportNote(team: UnitTeam, week: number | null): string | null {
	const w = team.injuries.week
	if (w === null) return "No report yet."
	if (week !== null && w < week) return `Latest report is from Week ${w}; the Week ${week} report is not out yet.`
	return null
}

// ------------------------------------------------------------------------------------------------ how teams play

export type StyleInfo = { label: string; side: "off" | "def"; fmt: "pct" | "pts" | "num1"; high: string; low: string }

export const STYLE: Record<string, StyleInfo> = {
	proe: { label: "Pass rate over expected", side: "off", fmt: "pts", high: "throws more than the situation calls for", low: "runs more than the situation calls for" },
	playAction: { label: "Play-action share of dropbacks", side: "off", fmt: "pct", high: "leans on play-action", low: "rarely uses play-action" },
	motion: { label: "Plays with pre-snap motion", side: "off", fmt: "pct", high: "moves players before almost every snap", low: "keeps its formations still" },
	noHuddle: { label: "No-huddle plays", side: "off", fmt: "pct", high: "hurries to the line", low: "huddles up" },
	shotgun: { label: "Plays from the shotgun", side: "off", fmt: "pct", high: "lives in the shotgun", low: "stays under center" },
	blitz: { label: "Blitz rate", side: "def", fmt: "pct", high: "sends extra rushers often", low: "rarely blitzes" },
	rushers: { label: "Pass rushers sent", side: "def", fmt: "num1", high: "sends the most rushers", low: "rushes with the fewest" },
	loadedBox: { label: "Runs against a loaded box (8+)", side: "def", fmt: "pct", high: "stacks the box against the run", low: "stays light in the box" },
}

export const STYLE_ORDER = { off: ["proe", "playAction", "motion", "noHuddle", "shotgun"], def: ["blitz", "rushers", "loadedBox"] } as const

export function formatStyle(key: string, v: number): string {
	const info = STYLE[key]
	return info.fmt === "pts" ? `${signed(v, 1)} pts` : info.fmt === "pct" ? `${(v * 100).toFixed(0)}%` : v.toFixed(1)
}

/** "Among the most" for the top quarter of the league, "among the fewest" for the bottom quarter, else null. */
export function styleTrait(key: string, rank: number, n: number): string | null {
	const info = STYLE[key]
	if (!info) return null
	if (rank <= Math.ceil(n / 4)) return info.high
	if (rank > n - Math.ceil(n / 4)) return info.low
	return null
}

// ------------------------------------------------------------------------------------------------ coaching

export const recText = (r: Rec): string => `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`
export const atsText = (r: AtsRec): string => `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}`
export const games = (r: Rec | AtsRec): number => Object.values(r).reduce((s, x) => s + x, 0)

/** A win share, or null when there are no games. */
export function share(r: Rec): number | null {
	const g = games(r)
	return g ? (r.w + r.t / 2) / g : null
}

export function sampleNote(g: number): string {
	if (g <= 0) return "No games yet."
	if (g < 4) return `Only ${g} game${g === 1 ? "" : "s"} so far, so treat this as a first look.`
	if (g < 8) return `${g} games in. Samples are still small, so a rank can move a lot in a week.`
	return `${g} games of play-by-play.`
}

/** Heat for a board cell: 0 (last) to 1 (first). */
export function heat(rank: number | undefined, n: number): number | null {
	return rank === undefined || n < 2 ? null : (n - rank) / (n - 1)
}

// ------------------------------------------------------------------------------------------------ reading a row

/** A pairing from one team's side: its own unit, the one it meets, and how far ahead it is (negative when behind). */
export function viewOf(row: MatchupRow, team: string): { mine: { name: string; rank: number }; theirs: { name: string; rank: number }; edge: number } {
	const attacks = row.attacker === team
	return attacks
		? { mine: { name: row.pair.offName, rank: row.attack.rank }, theirs: { name: row.pair.defName, rank: row.defend.rank }, edge: row.edge }
		: { mine: { name: row.pair.defName, rank: row.defend.rank }, theirs: { name: row.pair.offName, rank: row.attack.rank }, edge: -row.edge }
}

/** "Raiders pass rush (2nd) against the Patriots pass protection (28th)". */
export function edgeSentence(row: MatchupRow, team: string, names: Names): string {
	const other = row.attacker === team ? row.defender : row.attacker
	const v = viewOf(row, team)
	return `${names[team] ?? team} ${v.mine.name} (${ordinal(v.mine.rank)}) against the ${names[other] ?? other} ${v.theirs.name} (${ordinal(v.theirs.rank)})`
}

export function tierLabel(row: MatchupRow, names: Names): string {
	if (row.tier === "even") return "Even"
	const winner = row.edge > 0 ? row.attacker : row.defender
	return `${names[winner] ?? winner} ${row.tier === "big" ? "big edge" : "edge"}`
}

export type StatLine = { group: GroupKey; key: string; label: string; value: string; rank: number }

/** The stats a side of a pairing is graded on, with the team's number and league rank for each. */
export function statLines(team: UnitTeam, parts: Part[]): StatLine[] {
	const out: StatLine[] = []
	for (const part of parts) {
		for (const key of part.stats ?? Object.keys(GROUPS[part.group].stats)) {
			const m = team.groups[part.group]?.stats[key]
			if (m) out.push({ group: part.group, key, label: GROUPS[part.group].stats[key].label, value: statValue(part.group, key, m.v), rank: m.rank })
		}
	}
	return out
}

/** The players behind the groups in `parts`: quarterback, linemen, top receivers, rushers... */
export function watchPlayers(team: UnitTeam, parts: Part[]): Array<Leader & { group: GroupKey }> {
	return parts.flatMap((p) => (team.groups[p.group]?.leaders ?? []).map((l) => ({ ...l, group: p.group })))
}

export function leaderLine(l: Leader): string {
	const pct = (v: number) => `${Math.round(v * 100)}%`
	switch (l.stat) {
		case "epaDb":
			return `${formatStat("epa", l.v)} per dropback${l.n ? ` on ${l.n}` : ""}`
		case "epaTgt":
			return `${formatStat("epa", l.v)} per target${l.n ? ` on ${l.n}` : ""}`
		case "epaRush":
			return `${formatStat("epa", l.v)} per run${l.n ? ` on ${l.n}` : ""}`
		case "snapPct":
			return `${pct(l.v)} of snaps`
		case "pressures":
			return `${l.v} pressures${l.x ? `, ${l.x} sacks` : ""}`
		case "tackles":
			return `${l.v} tackles${l.x ? `, ${l.x} missed` : ""}`
		case "rating":
			return `${l.v.toFixed(1)} passer rating allowed on ${l.n ?? 0} targets`
		default:
			return ""
	}
}

// ------------------------------------------------------------------------------------------------ coaches side by side

export type TapeRow = { label: string; a: string; b: string }

const atsOr = (r: AtsRec) => (games(r) ? atsText(r) : "none yet")

/** The two head coaches, row by row, from each coach's own side. */
export function coachTape(a: string, b: string, data: UnitsData): TapeRow[] {
	const ta = data.teams[a]
	const tb = data.teams[b]
	if (!ta?.coach || !tb?.coach) return []
	const head = (t: UnitTeam) => {
		const c = t.coach!
		const rec = games(c.career) ? `${recText(c.career)} in ${c.career.n} games` : "No games yet"
		return c.career.n <= t.g ? `${rec} (first year)` : rec
	}
	const withTeam = (t: UnitTeam) => (games(t.coach!.withTeam) ? `${recText(t.coach!.withTeam)} since ${t.coach!.withTeam.since}` : "none yet")
	const meet = (t: UnitTeam, other: string) => {
		const v = t.coach!.vs[other]
		return v && v.coachMeet.n ? `${recText(v.coachMeet)} against ${v.coach}` : "Have not met"
	}
	const series = (t: UnitTeam, other: string) => {
		const v = t.coach!.vs[other]
		return v && v.teamMeet.n ? recText(v.teamMeet) : "none"
	}
	return [
		{ label: "Head coach", a: ta.coach.name, b: tb.coach.name },
		{ label: "Record as a head coach", a: head(ta), b: head(tb) },
		{ label: "With this team", a: withTeam(ta), b: withTeam(tb) },
		{ label: "Against the spread, this season", a: atsOr(ta.coach.ats.season), b: atsOr(tb.coach.ats.season) },
		{ label: "Against the spread, career", a: atsOr(ta.coach.ats.career), b: atsOr(tb.coach.ats.career) },
		{ label: "Against the spread as an underdog", a: atsOr(ta.coach.ats.underdog), b: atsOr(tb.coach.ats.underdog) },
		{ label: "Against the spread as a favorite", a: atsOr(ta.coach.ats.favorite), b: atsOr(tb.coach.ats.favorite) },
		{ label: "Coming off a bye", a: games(ta.coach.bye) ? recText(ta.coach.bye) : "none yet", b: games(tb.coach.bye) ? recText(tb.coach.bye) : "none yet" },
		{ label: "Head coach against head coach", a: meet(ta, b), b: meet(tb, a) },
		{ label: "Team against team since 1999", a: series(ta, b), b: series(tb, a) },
	]
}

// ------------------------------------------------------------------------------------------------ the board and the slate

export type BoardRow = {
	abbr: string
	record: string
	g: number
	off: number | null
	def: number | null
	/** Rank in each group, 1 is best. */
	groups: Record<GroupKey, number>
	/** The mean grade of the seven groups, 0 to 100. */
	composite: number
	/** Where that mean ranks, 1 is best. */
	compositeRank: number
}

/** The compact per-team table behind /lab/teams: ranks only, so it is light enough to send to the browser. */
export function boardRows(data: UnitsData): BoardRow[] {
	const rows = Object.entries(data.teams).map(([abbr, t]) => {
		const scores = GROUP_ORDER.map((g) => t.groups[g].score).filter((s): s is number => s !== null)
		return {
			abbr,
			record: recText({ w: t.w, l: t.l, t: t.t }),
			g: t.g,
			off: t.overall.off?.rank ?? null,
			def: t.overall.def?.rank ?? null,
			groups: Object.fromEntries(GROUP_ORDER.map((g) => [g, t.groups[g].rank])) as Record<GroupKey, number>,
			composite: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
			compositeRank: 0,
		}
	})
	const order = [...rows].sort((a, b) => b.composite - a.composite || a.abbr.localeCompare(b.abbr))
	order.forEach((r, i) => (r.compositeRank = i + 1))
	return rows
}

/** The one URL for a pairing: the Raiders first when they play, otherwise alphabetical. */
export function canonicalPair(a: string, b: string): [string, string] {
	if (a === "LV") return [a, b]
	if (b === "LV") return [b, a]
	return a < b ? [a, b] : [b, a]
}

/** The pairing's URL, e.g. /lab/matchup/lv-vs-ne. */
export function matchupPath(a: string, b: string): string {
	const [x, y] = canonicalPair(a, b)
	return `/lab/matchup/${x.toLowerCase()}-vs-${y.toLowerCase()}`
}

/** "Patriots favored by 3.5". The games file's spread is how many points the home team is favored by. */
export function marketLine(game: SlateGame, names: Names): string | null {
	if (game.spread === null) return null
	if (game.spread === 0) return "Pick 'em"
	const fav = game.spread > 0 ? game.home : game.away
	return `${names[fav] ?? fav} favored by ${Math.abs(game.spread)}`
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Sun, Oct 11 · 1:00 PM ET" from "2026-10-11" and "13:00" (the games file lists Eastern time). */
export function kickoffText(day: string, time: string | null): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
	if (!m) return day
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
	const date = `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
	const t = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null
	if (!t) return date
	const h = Number(t[1])
	return `${date} · ${h % 12 || 12}:${t[2]} ${h >= 12 ? "PM" : "AM"} ET`
}
