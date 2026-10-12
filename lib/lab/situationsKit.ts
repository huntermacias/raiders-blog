// Situational football: how a player does on each down, at each distance and inside the 20, against what the league's players do in the
// same spot. Pure functions over the JSON that scripts/lab/situations.py writes; no data imported here.
//
// A "cell" is the sums for one spot: [plays, yards, successful plays, EPA, first downs or touchdowns, touchdowns, extra]. Every split
// (a whole down, all of the red zone) is a sum of cells, so a rate is always a sum over a sum and never an average of averages.

import { GROUP_META, type PlayerGroup, type Yard } from "@/lib/lab/playersKit"

export type Role = "rush" | "pass" | "rec"
export type Cell = [number, number, number, number, number, number, number]
/** [quarter, down, yards to go, yards from the opponent's end zone, yards gained, successful 0/1, EPA, flags]. */
export type Play = [number, number, number, number, number, number, number, number]
export type SitEntry = { g: string; c: Record<string, Cell>; rz?: Cell; p: Record<string, Play[]> }
export type YardSplit = { min: number; m: Record<string, Yard> }
export type SitData = {
	season: number
	week: number
	generatedAt?: string
	source?: string
	league: Record<string, Record<string, Cell>>
	yard: Record<string, Record<string, YardSplit>>
	players: Record<string, Partial<Record<Role, SitEntry>>>
}

export const FLAG = { FIRST_DOWN: 1, TOUCHDOWN: 2, TURNOVER: 4, SACK: 8, INCOMPLETE: 16, SCRAMBLE: 32 } as const
export const BUCKETS = ["S", "M", "L", "X"] as const
export type Bucket = (typeof BUCKETS)[number]
export const BUCKET_LABEL: Record<Bucket, string> = { S: "1–3 yds to go", M: "4–6 yds", L: "7–10 yds", X: "11+ yds" }
export const BUCKET_SHORT: Record<Bucket, string> = { S: "Short", M: "Medium", L: "Long", X: "Very long" }
export const DOWN_WORD: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" }

export type Metric = "sr" | "ypp" | "epa" | "fd" | "x"
export const METRICS: Metric[] = ["sr", "ypp", "epa", "fd", "x"]

type RoleMeta = {
	tab: string
	noun: string
	nouns: string
	/** What each play is called in "per ..." phrases. */
	per: string
	label: Record<Metric, string>
	short: Record<Metric, string>
	/** Fewer is better for the extra column of a passer (sacks). */
	xLower: boolean
	blurb: string
}

export const ROLE: Record<Role, RoleMeta> = {
	rush: {
		tab: "Rushing",
		noun: "carry",
		nouns: "carries",
		per: "carry",
		label: { sr: "Success rate", ypp: "Yards per carry", epa: "EPA per carry", fd: "First-down rate", x: "10+ yard runs" },
		short: { sr: "Success", ypp: "Yds/carry", epa: "EPA/carry", fd: "1st down", x: "10+ yd" },
		xLower: false,
		blurb: "Every carry, scrambles included.",
	},
	pass: {
		tab: "Passing",
		noun: "dropback",
		nouns: "dropbacks",
		per: "dropback",
		label: { sr: "Success rate", ypp: "Yards per dropback", epa: "EPA per dropback", fd: "First-down rate", x: "Sack rate" },
		short: { sr: "Success", ypp: "Yds/drop", epa: "EPA/drop", fd: "1st down", x: "Sacked" },
		xLower: true,
		blurb: "Every dropback that ended in a throw or a sack. Scrambles count as runs.",
	},
	rec: {
		tab: "Receiving",
		noun: "target",
		nouns: "targets",
		per: "target",
		label: { sr: "Success rate", ypp: "Yards per target", epa: "EPA per target", fd: "First-down rate", x: "Catch rate" },
		short: { sr: "Success", ypp: "Yds/tgt", epa: "EPA/tgt", fd: "1st down", x: "Catch %" },
		xLower: false,
		blurb: "Every pass thrown to him, caught or not.",
	},
}

export const METRIC_WHAT: Record<Metric, string> = {
	sr: "How often a play leaves the offense better off than before it: it added expected points (EPA above zero). Roughly, that is gaining about 40% of the yards to go on 1st down, 60% on 2nd, and all of them on 3rd and 4th.",
	ypp: "Total yards over the number of plays. It rewards the long gain but does not know what down it came on.",
	epa: "Expected points added: how many points the play added to (or took from) the offense's scoring chances, given the down, the distance and the field position.",
	fd: "The share of plays that ended in a first down or a touchdown: the offense moved the chains or scored.",
	x: "The extra number that belongs to the job: runs of 10+ yards for a ball carrier, the catch rate for a receiver, and for a passer how often a dropback ends in a sack.",
}

/** Success, EPA and the rest are all better when higher, except a passer's sack rate. */
export const higherIsBetter = (role: Role, m: Metric): boolean => !(role === "pass" && m === "x")

export const SUCCESS_NOTE = METRIC_WHAT.sr

// ---------------------------------------------------------------------------------------------- cells

export type SplitStats = { n: number; ypp: number; sr: number; epa: number; fd: number; td: number; x: number }

export function addCells(a: Cell | undefined | null, b: Cell | undefined | null): Cell | null {
	if (!a) return b ? ([...b] as Cell) : null
	if (!b) return [...a] as Cell
	return a.map((x, i) => Math.round((x + b[i]) * 100) / 100) as Cell
}

export function cellStats(c: Cell | null | undefined): SplitStats | null {
	if (!c || !c[0]) return null
	const n = c[0]
	return { n, ypp: c[1] / n, sr: c[2] / n, epa: c[3] / n, fd: c[4] / n, td: c[5], x: c[6] / n }
}

/** The cell for one split of a set of cells: "1".."4" is a whole down, "3.S" one down and distance, "all" everything. */
export function splitCell(cells: Record<string, Cell>, split: string, rz?: Cell): Cell | null {
	if (split === "rz") return rz ?? null
	let out: Cell | null = null
	for (const [k, c] of Object.entries(cells)) {
		if (split === "all" || k === split || (!split.includes(".") && k.startsWith(`${split}.`))) out = addCells(out, c)
	}
	return out
}

/** Where a value sits in the league, 1-99, read off the 10th/25th/50th/75th/90th-percentile marks and carried past them gently. */
export function pctIn(v: number, y: Yard, higher: boolean): number {
	const knots: [number, number][] = [
		[y.q[0], 10],
		[y.q[1], 25],
		[y.q[2], 50],
		[y.q[3], 75],
		[y.q[4], 90],
	]
	let p: number
	if (v <= knots[0][0]) {
		const span = knots[1][0] - knots[0][0]
		p = span > 0 ? 10 - ((knots[0][0] - v) / span) * 15 : v < knots[0][0] ? 3 : 10
	} else if (v >= knots[4][0]) {
		const span = knots[4][0] - knots[3][0]
		p = span > 0 ? 90 + ((v - knots[4][0]) / span) * 15 : v > knots[4][0] ? 97 : 90
	} else {
		p = 50
		for (let i = 0; i < 4; i++) {
			const [x0, p0] = knots[i]
			const [x1, p1] = knots[i + 1]
			if (v >= x0 && v <= x1) {
				p = x1 > x0 ? p0 + ((v - x0) / (x1 - x0)) * (p1 - p0) : (p0 + p1) / 2
				break
			}
		}
	}
	p = Math.min(99, Math.max(1, p))
	return higher ? p : 100 - p
}

// ---------------------------------------------------------------------------------------------- the view a page hands to the chart

export type SplitRow = {
	key: string
	label: string
	mine: SplitStats
	lg: SplitStats | null
	/** Percentile among his position's players on each metric, only when he has enough plays in this spot to be ranked. */
	pct: Partial<Record<Metric, number>> | null
	min: number | null
}
export type GridCell = { down: number; bucket: Bucket; mine: SplitStats | null; lg: SplitStats | null }
export type GameView = { week: number; opp: string; result: string | null; won: boolean | null; plays: Play[] }
export type SituationView = {
	role: Role
	group: string
	peers: string
	single: string
	total: number
	rows: SplitRow[]
	grid: GridCell[]
	read: string[]
	games: GameView[]
	/** The league's success rate in all plays of this job, for the game summaries. */
	lgSr: number | null
	lgByDown: Record<string, number>
}

export const SPLIT_LABEL = (key: string): string => {
	if (key === "all") return "All plays"
	if (key === "rz") return "Inside the 20"
	if (key.includes(".")) {
		const [d, b] = key.split(".")
		return `${DOWN_WORD[Number(d)]} down, ${BUCKET_SHORT[b as Bucket].toLowerCase()}`
	}
	return `${DOWN_WORD[Number(key)]} down`
}

export const pct0 = (v: number): string => `${Math.round(v * 100)}%`

export function formatMetric(m: Metric, v: number): string {
	if (m === "ypp") return v.toFixed(1)
	if (m === "epa") return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`
	return pct0(v)
}

function minFor(sit: SitData, combo: string, split: string, role: Role): number {
	const y = sit.yard[combo]?.[split]
	if (y) return y.min
	const base = { rush: 20, pass: 40, rec: 12 }[role]
	if (split === "all") return base
	return split.includes(".") || split === "rz" ? Math.max(3, Math.round(base * 0.2)) : Math.max(5, Math.round(base * 0.4))
}

/** The plain-English read of where this player's situations differ from the league's. */
export function situationRead(role: Role, group: PlayerGroup, rows: SplitRow[], total: number): string[] {
	const meta = ROLE[role]
	const single = GROUP_META[group].single.toLowerCase()
	const out: string[] = []
	const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
	const candidates = ["1", "2", "3"]
		.map((k) => byKey[k])
		.filter((r): r is SplitRow => !!r && !!r.lg && r.pct !== null)
		.map((r) => ({ r, diff: r.mine.sr - (r.lg as SplitStats).sr }))
		.sort((a, b) => b.diff - a.diff)
	const good = candidates[0]
	const bad = candidates[candidates.length - 1]
	const line = (r: SplitRow, lead: string) =>
		`${lead} ${Math.round(r.mine.sr * r.mine.n)} of ${r.mine.n} ${meta.nouns} were successful (${pct0(r.mine.sr)}), against ${pct0((r.lg as SplitStats).sr)} for the average ${single}.`
	if (good && good.diff >= 0.08) out.push(line(good.r, `He is at his best on ${DOWN_WORD[Number(good.r.key)]} down:`))
	if (bad && bad !== good && bad.diff <= -0.08) out.push(line(bad.r, `${DOWN_WORD[Number(bad.r.key)]} down is the weak spot:`))
	if (!out.length && candidates.length) out.push(`Nothing stands out by down: his success rate is within a few points of the average ${single} on each one he has enough ${meta.nouns} on.`)
	const third = byKey["3"]
	if (third && third.lg && third.pct !== null) {
		out.push(`On 3rd down he moved the chains or scored on ${pct0(third.mine.fd)} of his ${meta.nouns}, against ${pct0(third.lg.fd)} for the average ${single}. Third downs differ a lot in difficulty, so the grid below splits them by distance.`)
	}
	const rz = byKey["rz"]
	if (rz && rz.mine.n >= 3) out.push(`Inside the 20 he has ${rz.mine.n} ${rz.mine.n === 1 ? meta.noun : meta.nouns}: ${Math.round(rz.mine.sr * rz.mine.n)} successful and ${rz.mine.td} ${rz.mine.td === 1 ? "touchdown" : "touchdowns"}.`)
	if (!candidates.length) out.push(`${total} ${total === 1 ? meta.noun : meta.nouns} so far is too few to say how he does on one down or another. The numbers below fill in as the season goes on.`)
	return out.slice(0, 4)
}

/** Everything the situational section needs for one player and one job, as plain data a page can hand to a client component. */
export function situationView(
	sit: SitData,
	slug: string,
	role: Role,
	group: PlayerGroup,
	ctx: { opp: (week: number) => string; result: (week: number) => { text: string; won: boolean | null } | null },
): SituationView | null {
	const e = sit.players[slug]?.[role]
	if (!e || e.g !== group) return null
	const combo = `${role}.${group}`
	const lgCells = sit.league[combo] ?? {}
	const total = Object.values(e.c).reduce((a, c) => a + c[0], 0)
	if (total < 5) return null
	const keys = ["1", "2", "3", "4", "rz", "all"]
	const rows: SplitRow[] = []
	for (const key of keys) {
		const mine = cellStats(splitCell(e.c, key, e.rz))
		if (!mine) continue
		const lg = cellStats(lgCells[key])
		const min = minFor(sit, combo, key, role)
		const yard = sit.yard[combo]?.[key]?.m
		let pct: SplitRow["pct"] = null
		if (yard && mine.n >= min) {
			pct = {}
			for (const m of METRICS) {
				const y = yard[m]
				if (y) pct[m] = pctIn(mine[m], y, higherIsBetter(role, m))
			}
		}
		rows.push({ key, label: SPLIT_LABEL(key), mine, lg, pct, min })
	}
	const grid: GridCell[] = []
	for (let down = 1; down <= 4; down++) {
		for (const bucket of BUCKETS) {
			const k = `${down}.${bucket}`
			grid.push({ down, bucket, mine: cellStats(e.c[k]), lg: cellStats(lgCells[k]) })
		}
	}
	const lgByDown: Record<string, number> = {}
	for (const d of ["1", "2", "3", "4"]) {
		const s = cellStats(splitCell(lgCells, d))
		if (s) lgByDown[d] = s.sr
	}
	const games: GameView[] = Object.entries(e.p)
		.map(([w, plays]) => {
			const week = Number(w)
			const r = ctx.result(week)
			return { week, opp: ctx.opp(week), result: r?.text ?? null, won: r?.won ?? null, plays }
		})
		.sort((a, b) => a.week - b.week)
	return {
		role,
		group,
		peers: GROUP_META[group].peers,
		single: GROUP_META[group].single,
		total,
		rows,
		grid,
		read: situationRead(role, group, rows, total),
		games,
		lgSr: cellStats(lgCells.all)?.sr ?? null,
		lgByDown,
	}
}

// ---------------------------------------------------------------------------------------------- one game

export const spot = (yl: number): string => (yl === 50 ? "midfield" : yl < 50 ? `opp ${yl}` : `own ${100 - yl}`)

const yardsWord = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? "yard" : "yards"}`

/** What happened on a play, in a few words, from the point of view of the job being read. */
export function playResult(role: Role, play: Play): string {
	const yds = play[4]
	const flags = play[7]
	const extra: string[] = []
	if (flags & FLAG.TOUCHDOWN) extra.push("touchdown")
	else if (flags & FLAG.FIRST_DOWN) extra.push("first down")
	if (flags & FLAG.TURNOVER && !(flags & FLAG.INCOMPLETE)) extra.push("fumble lost")
	let base: string
	if (role === "rush") {
		base = `${flags & FLAG.SCRAMBLE ? "scramble" : "run"} for ${yds === 0 ? "no gain" : yds > 0 ? yardsWord(yds) : `a loss of ${yardsWord(yds)}`}`
	} else if (flags & FLAG.SACK) {
		base = `sacked for a loss of ${yardsWord(yds)}`
	} else if (flags & FLAG.INCOMPLETE) {
		base = flags & FLAG.TURNOVER ? "intercepted" : "incomplete"
		if (role === "rec") base = flags & FLAG.TURNOVER ? "target intercepted" : "target incomplete"
	} else {
		base = role === "rec" ? `caught for ${yds === 0 ? "no gain" : yardsWord(yds)}` : `completed for ${yds === 0 ? "no gain" : yardsWord(yds)}`
	}
	return [base, ...extra].join(", ")
}

export function epaText(epa: number): string {
	return `${epa >= 0 ? "+" : "−"}${Math.abs(epa).toFixed(2)} EPA`
}

/** "Q2 · 3rd & 4 at opp 35 · caught for 7 yards, first down · +0.82 EPA". */
export function playLine(role: Role, play: Play): string {
	return `Q${play[0]} · ${DOWN_WORD[play[1]] ?? `${play[1]}th`} & ${play[2]} at ${spot(play[3])} · ${playResult(role, play)} · ${epaText(play[6])}`
}

export type GameSummary = { n: number; wins: number; rate: number; byDown: { down: number; n: number; wins: number }[] }

export function gameSummary(plays: Play[]): GameSummary {
	const by: Record<number, { n: number; wins: number }> = {}
	let wins = 0
	for (const p of plays) {
		by[p[1]] = by[p[1]] ?? { n: 0, wins: 0 }
		by[p[1]].n++
		by[p[1]].wins += p[5]
		wins += p[5]
	}
	return {
		n: plays.length,
		wins,
		rate: plays.length ? wins / plays.length : 0,
		byDown: [1, 2, 3, 4].filter((d) => by[d]).map((d) => ({ down: d, ...by[d] })),
	}
}

/** The one sentence over a game's chart. */
export function gameLine(role: Role, g: GameView, lgSr: number | null, single: string): string {
	const meta = ROLE[role]
	const s = gameSummary(g.plays)
	if (!s.n) return ""
	const base = `${s.wins} of ${s.n} ${s.n === 1 ? meta.noun : meta.nouns} were successful (${pct0(s.rate)})`
	const lg = lgSr === null ? "." : `, against ${pct0(lgSr)} for the average ${single.toLowerCase()} over the season.`
	return base + lg
}


// ---------------------------------------------------------------------------------------------- the leaderboards

export type SitBoardDef = { slug: string; role: Role; group: PlayerGroup; title: string }

/** The jobs that have a situational leaderboard, each with its own page. */
export const SIT_BOARDS: SitBoardDef[] = [
	{ slug: "quarterbacks-passing", role: "pass", group: "qb", title: "Quarterbacks passing" },
	{ slug: "running-backs-rushing", role: "rush", group: "rb", title: "Running backs rushing" },
	{ slug: "wide-receivers-receiving", role: "rec", group: "wr", title: "Wide receivers receiving" },
	{ slug: "tight-ends-receiving", role: "rec", group: "te", title: "Tight ends receiving" },
	{ slug: "running-backs-receiving", role: "rec", group: "rb", title: "Running backs receiving" },
	{ slug: "quarterbacks-rushing", role: "rush", group: "qb", title: "Quarterbacks running" },
]

export const sitBoardOf = (slug: string): SitBoardDef | undefined => SIT_BOARDS.find((b) => b.slug === slug)
export const sitBoardHref = (slug: string): string => `/lab/players/situations/${slug}`

/** Every split a reader can rank players on, in the order they appear in the picker. */
export const SPLIT_CHOICES: { key: string; label: string }[] = [
	{ key: "all", label: "All plays" },
	{ key: "1", label: "1st down" },
	{ key: "2", label: "2nd down" },
	{ key: "3", label: "3rd down" },
	{ key: "4", label: "4th down" },
	{ key: "rz", label: "Inside the 20" },
	{ key: "3.S", label: "3rd and short (1–3)" },
	{ key: "3.M", label: "3rd and medium (4–6)" },
	{ key: "3.L", label: "3rd and long (7–10)" },
	{ key: "3.X", label: "3rd and very long (11+)" },
	{ key: "2.S", label: "2nd and short (1–3)" },
	{ key: "2.M", label: "2nd and medium (4–6)" },
	{ key: "2.L", label: "2nd and long (7–10)" },
	{ key: "2.X", label: "2nd and very long (11+)" },
	{ key: "1.L", label: "1st and 10" },
]

export type SitBoardRow = { slug: string; name: string; team: string; pos: string; espn?: number; c: Record<string, Cell>; rz?: Cell }

/** Everyone with plays in this job and position, with their cells, for the leaderboard to rank on any split. */
export function sitBoardRows(sit: SitData, players: { slug: string; name: string; team: string; pos: string; group: string; espn?: number }[], def: SitBoardDef): SitBoardRow[] {
	const out: SitBoardRow[] = []
	for (const p of players) {
		if (p.group !== def.group) continue
		const e = sit.players[p.slug]?.[def.role]
		if (!e || e.g !== def.group) continue
		out.push({ slug: p.slug, name: p.name, team: p.team, pos: p.pos, ...(p.espn ? { espn: p.espn } : {}), c: e.c, ...(e.rz ? { rz: e.rz } : {}) })
	}
	return out
}

/** The plays a player needs on a split to be ranked: what the league's yardstick used, or a small default before it exists. */
export function minPlaysFor(sit: SitData, def: SitBoardDef, split: string): number {
	return minFor(sit, `${def.role}.${def.group}`, split, def.role)
}
