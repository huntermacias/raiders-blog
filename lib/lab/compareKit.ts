// The comparison behind /lab/players/compare and every share graphic of it. One model, so a number on the page, on the X preview and
// on a downloaded card can never disagree. Pure: data in, plain objects out, no site imports.
//
// What it does on top of the Lab's own numbers (playersKit.ts):
//  - the same player pair, range and metrics live in the URL (readConfig / configQuery), so a link rebuilds exactly what was on screen;
//  - three ranges: the season to date, the recent window (the team's last games) and the games before it;
//  - each metric gets a 0 to 100 percentile that always runs worse to better, so bars and the radar can be read on one scale whatever
//    the unit is, plus the value, the rank and how sure the sample is;
//  - who leads is decided on the real numbers and only called a clear lead when the gap is bigger than the noise the plays behind
//    each number could make (the same test the Lab uses: gap over combined standard error);
//  - jobs with no overall grade (offensive linemen) are compared on their own numbers; their line's numbers are listed, never scored.

import {
	type PlayerGroup,
	type PlayerRow,
	type PlayerStat,
	type PlayersData,
	type StatInfo,
	GROUP_META,
	GROUP_ORDER,
	HEADLINE,
	STAT,
	formName,
	formatStat,
	hasOverall,
	isCore,
	isEarly,
	lc,
	ordinal,
	overall,
	pctFromRank,
	shownPct,
	signalOf,
	statInfo,
	statOf,
	stretchGrade,
	sureness,
	valuePct,
	windowWeeks,
	yardOf,
	type Signal,
	type Sureness,
} from "./playersKit"

export type RangeId = "season" | "form" | "earlier"
export const RANGE_IDS: RangeId[] = ["season", "form", "earlier"]

export type CompareConfig = {
	a: string
	b: string
	range: RangeId
	/** The stats chosen on the page, in the order shown; null means the default set for the job. */
	metrics: string[] | null
	/** Which of two jobs to compare when a man has more than one (a receiver who returns punts). */
	group: PlayerGroup | null
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/
const KEY = /^[A-Za-z][A-Za-z0-9]{0,30}$/
export const MAX_METRICS = 10
const RADAR_MAX = 8
const RADAR_MIN = 3

type Raw = { a?: string; b?: string; r?: string; m?: string; g?: string }

/** A config from the page's query string. Anything unreadable falls back to the default, so a mangled link still opens something sensible. */
export function readConfig(q: Raw): CompareConfig {
	const slug = (v?: string) => (v && SLUG.test(v) ? v : "")
	const range: RangeId = q.r === "form" || q.r === "earlier" ? q.r : "season"
	const metrics = (q.m ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter((s, i, all) => KEY.test(s) && all.indexOf(s) === i)
		.slice(0, MAX_METRICS)
	const group = GROUP_ORDER.find((g) => g === q.g) ?? null
	return { a: slug(q.a), b: slug(q.b), range, metrics: metrics.length ? metrics : null, group }
}

/** The query string that rebuilds a config. Defaults are left out so a plain comparison keeps a short link. */
export function configQuery(c: CompareConfig, extra: Record<string, string> = {}): string {
	const parts: string[] = []
	if (c.a) parts.push(`a=${encodeURIComponent(c.a)}`)
	if (c.b) parts.push(`b=${encodeURIComponent(c.b)}`)
	if (c.range !== "season") parts.push(`r=${c.range}`)
	if (c.metrics?.length) parts.push(`m=${c.metrics.map(encodeURIComponent).join(",")}`)
	if (c.group) parts.push(`g=${c.group}`)
	for (const [k, v] of Object.entries(extra)) parts.push(`${k}=${encodeURIComponent(v)}`)
	return parts.join("&")
}

export const compareUrl = (c: CompareConfig) => `/lab/players/compare${configQuery(c) ? `?${configQuery(c)}` : ""}`

export type Lead = "a" | "b" | "even"
export type Strength = "clear" | "slight" | "toss-up" | "unknown"

export type MetricSide = {
	value: number
	text: string
	/** The plays behind it. */
	n: number
	/** Percentile among his job, 0 (worst) to 100 (best); null when the stat only describes a style or the yardstick is missing. */
	pct: number | null
	/** Season rank among his job; only the season has one. */
	rank: number | null
	of: number | null
	se: number | null
	sure: Sureness
}

export type Metric = {
	key: string
	label: string
	short: string
	info: StatInfo
	a: MetricSide
	b: MetricSide
	lead: Lead
	strength: Strength
	/** Percentile points between the two (0 when either has none). */
	gap: number
	signal: Signal
	/** Part of the job's default set. */
	core: boolean
}

export type RadarAxis = { key: string; label: string; short: string; a: number; b: number }

export type Comparison = {
	a: PlayerRow
	b: PlayerRow
	group: PlayerGroup
	range: RangeId
	/** "Season to date", "Last 2 games", "Before that". */
	rangeName: string
	/** "Through Week 5", "Weeks 4 and 5", "Weeks 1 to 3". */
	rangeWeeks: string
	/** What the percentile is measured against, for a footnote. */
	basis: string
	/** The metrics shown, in order. */
	metrics: Metric[]
	/** Everything that can be chosen for this job: graded, belonging to the man himself. */
	options: Metric[]
	/** Style stats: shown side by side, never scored. */
	style: Metric[]
	/** A line's numbers (offensive linemen): shared by five men, listed and never scored. */
	line: Metric[]
	/** Stats that mean something so far. `noise` counts the ones still mostly luck: shown, but never scored as a win. */
	tally: { a: number; b: number; even: number; clearA: number; clearB: number; noise: number }
	overall: { a: number | null; b: number | null; lead: Lead | null }
	radar: RadarAxis[]
	early: { a: boolean; b: boolean }
	insights: string[]
	headline: string
}

export type Pair = { a: PlayerRow; b: PlayerRow; group: PlayerGroup } | { problem: "missing" | "same" | "jobs"; a: PlayerRow | null; b: PlayerRow | null }

/** Picks the row of each man that does the same job. A man with two jobs is matched to the other's; `want` forces one. */
export function resolvePair(data: PlayersData, c: Pick<CompareConfig, "a" | "b" | "group">): Pair {
	const rows = (slug: string) => (slug ? data.players.filter((p) => p.slug === slug).sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group)) : [])
	const ra = rows(c.a)
	const rb = rows(c.b)
	if (!ra.length || !rb.length) return { problem: "missing", a: ra[0] ?? null, b: rb[0] ?? null }
	if (c.a === c.b) return { problem: "same", a: ra[0], b: rb[0] }
	const groups = c.group ? [c.group] : GROUP_ORDER
	for (const g of groups) {
		const A = ra.find((p) => p.group === g)
		const B = rb.find((p) => p.group === g)
		if (A && B) return { a: A, b: B, group: g }
	}
	return { problem: "jobs", a: ra[0], b: rb[0] }
}

const sliceOf = (s: PlayerStat, range: RangeId) => (range === "season" ? s.season : range === "form" ? s.form : s.earlier)

function sideOf(data: PlayersData, p: PlayerRow, key: string, info: StatInfo, range: RangeId): MetricSide | null {
	const s = statOf(p, key)
	if (!s) return null
	const sl = sliceOf(s, range)
	if (!sl || !(sl.n > 0) || !Number.isFinite(sl.v)) return null
	const y = yardOf(data, p.group, key)
	let pct: number | null = null
	let rank: number | null = null
	let of: number | null = null
	let se: number | null = null
	if (range === "season") {
		se = s.season.se ?? null
		const r = s.season.r ?? null
		if (r !== null && y?.n && info.higher !== null) {
			rank = r
			of = y.n
			pct = pctFromRank(r, y.n)
		}
	} else {
		// A standard error shrinks with the square root of the plays, so a window's error is the season's scaled by how few plays it has.
		if (s.season.se && s.season.n > 0) se = s.season.se * Math.sqrt(s.season.n / sl.n)
		if (y && info.higher !== null) {
			const vp = valuePct(sl.v, y)
			pct = info.higher === false ? 100 - vp : vp
		}
	}
	return { value: sl.v, text: formatStat(p.group, key, sl.v), n: sl.n, pct, rank, of, se, sure: sureness(se, y) }
}

function metricOf(data: PlayersData, A: PlayerRow, B: PlayerRow, key: string, range: RangeId): Metric | null {
	const info = statInfo(A.group, key)
	if (!info) return null
	const a = sideOf(data, A, key, info, range)
	const b = sideOf(data, B, key, info, range)
	if (!a || !b) return null
	const y = yardOf(data, A.group, key)
	let lead: Lead = "even"
	let strength: Strength = "unknown"
	if (info.higher !== null) {
		const better = (a.value - b.value) * (info.higher ? 1 : -1)
		const se = a.se !== null && b.se !== null ? Math.hypot(a.se, b.se) : null
		if (se === null) strength = better === 0 ? "toss-up" : "unknown"
		else {
			const z = se > 0 ? Math.abs(a.value - b.value) / se : Infinity
			strength = z >= 1.5 ? "clear" : z >= 0.75 ? "slight" : "toss-up"
		}
		// With no error to test against, the better number still leads, but is not called clear.
		lead = strength === "toss-up" || better === 0 ? "even" : better > 0 ? "a" : "b"
	}
	return {
		key,
		label: info.label,
		short: info.short,
		info,
		a,
		b,
		lead,
		strength,
		gap: a.pct !== null && b.pct !== null ? Math.abs(a.pct - b.pct) : 0,
		signal: info.higher === null ? "partial" : signalOf(y),
		core: isCore(A.group, key),
	}
}

export function rangeLabels(data: PlayersData, p: PlayerRow, range: RangeId): { name: string; weeks: string } {
	const form = windowWeeks(data, p.group)
	const all = data.weeks
	if (range === "season") return { name: "Season to date", weeks: `Through Week ${data.week}` }
	const span = (w: number[]) => (w.length === 0 ? "" : w.length === 1 ? `Week ${w[0]}` : w.length === 2 ? `Weeks ${w[0]} and ${w[1]}` : `Weeks ${w[0]} to ${w[w.length - 1]}`)
	if (range === "form") return { name: formName(data, p.group), weeks: span(form) }
	const before = all.filter((w) => !form.includes(w))
	return { name: "Before that", weeks: span(before) }
}

/** The graded stats that belong to the man himself, in the catalog's order. Unit stats (a line's) are separate. */
function keysFor(group: PlayerGroup): { graded: string[]; style: string[]; line: string[] } {
	const graded: string[] = []
	const style: string[] = []
	const line: string[] = []
	for (const [k, info] of Object.entries(STAT[group])) {
		if (info.unit) line.push(k)
		else if (info.higher === null) style.push(k)
		else graded.push(k)
	}
	return { graded, style, line }
}

const lastName = (p: PlayerRow) => p.name.trim().split(/\s+/).slice(1).join(" ") || p.name

/** One plain sentence about who has the better number, for a share post and the page's headline. */
export function headlineOf(c: Pick<Comparison, "a" | "b" | "tally" | "metrics" | "rangeName" | "overall">): string {
	const { a, b, tally } = c
	const n = tally.a + tally.b + tally.even
	if (!c.metrics.length) return `${a.name} and ${b.name} have no stat in common over ${c.rangeName.toLowerCase()}.`
	if (n === 0) return `Too early to separate ${a.name} and ${b.name}: every stat here is still mostly luck.`
	if (tally.a === 0 && tally.b === 0) return `${a.name} and ${b.name} are too close to separate on ${n === 1 ? "the one stat that counts" : `these ${n} stats`}.`
	if (tally.a === tally.b) return `${a.name} and ${b.name} split ${tally.a + tally.b} stats ${tally.a} to ${tally.b}${tally.even ? `, with ${tally.even} too close to call` : ""}.`
	const aLeads = tally.a > tally.b
	const lead = aLeads ? a : b
	const win = aLeads ? tally.a : tally.b
	const clear = aLeads ? tally.clearA : tally.clearB
	return clear > 0 ? `${lead.name} leads ${win} of ${n} stats.` : `${lead.name} has a slight edge on ${win} of ${n} stats; none of the gaps is clear yet.`
}

/** Builds everything the page and the cards show for a pair and a config. Null when the pair cannot be compared. */
export function buildComparison(data: PlayersData, cfg: CompareConfig): Comparison | null {
	const pair = resolvePair(data, cfg)
	if ("problem" in pair) return null
	const { a: A, b: B, group } = pair
	const keys = keysFor(group)
	const range = cfg.range

	const options = keys.graded.map((k) => metricOf(data, A, B, k, range)).filter((m): m is Metric => m !== null)
	const style = keys.style.map((k) => metricOf(data, A, B, k, range)).filter((m): m is Metric => m !== null)
	const line = keys.line.map((k) => metricOf(data, A, B, k, range)).filter((m): m is Metric => m !== null)

	// The default set: the job's own graded stats, leaving out the ones that are still mostly luck when enough others have settled.
	const core = options.filter((m) => m.core)
	const settled = core.filter((m) => m.signal !== "luck")
	const extra = options.filter((m) => !m.core && m.signal !== "luck")
	const luck = core.filter((m) => m.signal === "luck")
	// Settled core stats first, then other graded stats that mean something; if that is still thin, the early (luck) core stats fill in, shown but not scored.
	let base = [...settled, ...extra].slice(0, RADAR_MAX)
	if (base.length < 4) base = [...base, ...luck].slice(0, RADAR_MAX)
	if (!base.length) base = (core.length ? core : options).slice(0, RADAR_MAX)
	const picked = cfg.metrics ? cfg.metrics.map((k) => options.find((m) => m.key === k)).filter((m): m is Metric => !!m) : []
	const metrics = picked.length ? picked : base

	const tally = { a: 0, b: 0, even: 0, clearA: 0, clearB: 0, noise: 0 }
	for (const m of metrics) {
		if (m.signal === "luck") {
			tally.noise += 1
			continue
		}
		if (m.lead === "a") {
			tally.a += 1
			if (m.strength === "clear") tally.clearA += 1
		} else if (m.lead === "b") {
			tally.b += 1
			if (m.strength === "clear") tally.clearB += 1
		} else tally.even += 1
	}

	const radar: RadarAxis[] = metrics
		.filter((m) => m.a.pct !== null && m.b.pct !== null)
		.slice(0, RADAR_MAX)
		.map((m) => ({ key: m.key, label: m.label, short: m.short, a: m.a.pct as number, b: m.b.pct as number }))

	const slice = range
	const ov = (p: PlayerRow) => {
		if (!hasOverall(p.group)) return null
		const o = overall(p, slice)
		return stretchGrade(data, o)
	}
	const oa = ov(A)
	const ob = ov(B)
	const overallLead: Lead | null = oa === null || ob === null ? null : Math.abs(oa - ob) < 2 ? "even" : oa > ob ? "a" : "b"

	const { name, weeks } = rangeLabels(data, A, range)
	const base2: Comparison = {
		a: A,
		b: B,
		group,
		range,
		rangeName: name,
		rangeWeeks: weeks,
		basis:
			range === "season"
				? `Percentile is each player's season rank among ${GROUP_META[group].peers} with enough volume to be graded.`
				: `Percentile places each player's number from these games against the whole season's spread among ${GROUP_META[group].peers}. It rests on fewer plays, so it moves more.`,
		metrics,
		options,
		style,
		line,
		tally,
		overall: { a: oa, b: ob, lead: overallLead },
		radar: radar.length >= RADAR_MIN ? radar : [],
		early: { a: isEarly(data, A), b: isEarly(data, B) },
		insights: [],
		headline: "",
	}
	base2.headline = headlineOf(base2)
	base2.insights = insightsOf(base2)
	return base2
}

/** Plain sentences that say what the comparison means, each one backed by a number on the page. */
export function insightsOf(c: Comparison): string[] {
	const out: string[] = []
	const { a, b, tally, metrics } = c
	if (!metrics.length) return out

	const clear = tally.clearA + tally.clearB
	const counted = tally.a + tally.b + tally.even
	const noise = tally.noise ? ` ${tally.noise} more ${tally.noise === 1 ? "is" : "are"} shown but still mostly luck, so ${tally.noise === 1 ? "it is" : "they are"} not scored.` : ""
	if (!counted) {
		out.push(`Every stat here is still mostly luck at this point in the season, so nobody is scored as ahead.${noise}`)
	} else if (tally.a || tally.b) {
		const lead = tally.a >= tally.b ? a : b
		const trail = lead === a ? b : a
		const lw = Math.max(tally.a, tally.b)
		const tw = Math.min(tally.a, tally.b)
		out.push(
			`${lead.name} has the better number on ${lw} of ${counted} stats that count, ${trail.name} on ${tw}${tally.even ? `, with ${tally.even} too close to call` : ""}. ${clear ? `${clear} ${clear === 1 ? "gap is" : "gaps are"} bigger than the noise the plays behind them could make.` : "None of the gaps is bigger than that noise yet, so treat the lead as a lean."}${noise}`,
		)
	} else {
		out.push(`${a.name} and ${b.name} are level on the stats that count: every gap is inside the noise the plays behind it could make.${noise}`)
	}

	// The widest gap among stats that mean something so far.
	const real = metrics.filter((m) => m.signal !== "luck" && m.a.pct !== null && m.b.pct !== null && m.lead !== "even")
	const widest = [...real].sort((x, y) => y.gap - x.gap)[0]
	if (widest) {
		const w = widest.lead === "a" ? a : b
		const l = widest.lead === "a" ? b : a
		const ws = widest.lead === "a" ? widest.a : widest.b
		const ls = widest.lead === "a" ? widest.b : widest.a
		out.push(`The widest gap is ${lc(widest.label)}: ${lastName(w)} ${ws.text}, ${lastName(l)} ${ls.text} (${Math.round(widest.gap)} percentile points apart).`)
	}

	// What the trailing man does better.
	const trailing = tally.a === tally.b ? null : tally.a > tally.b ? b : a
	if (trailing) {
		const side = trailing === a ? "a" : "b"
		const best = [...real].filter((m) => m.lead === side).sort((x, y) => y.gap - x.gap)[0]
		if (best) out.push(`${trailing.name}'s best answer is ${lc(best.label)}: ${(side === "a" ? best.a : best.b).text} against ${(side === "a" ? best.b : best.a).text}.`)
	}

	// Honest caveats.
	if (c.early.a || c.early.b) {
		const who = c.early.a && c.early.b ? `${a.name} and ${b.name}` : c.early.a ? a.name : b.name
		out.push(`Early read: fewer than two of ${who}'s stats have settled, so treat these as where things stand so far, not a verdict.`)
	}
	if (c.range !== "season") out.push(`These cover only ${c.rangeWeeks.toLowerCase()}. A few games is a small sample, so the numbers swing more than a full season's.`)
	const small = metrics.filter((m) => m.a.sure === "thin" || m.b.sure === "thin").length
	if (c.range === "season" && small >= Math.ceil(metrics.length / 2)) out.push(`Most of these rest on a small number of plays so far; they will firm up as the season goes on.`)
	if (!hasOverall(c.group)) out.push(`Offensive linemen have no overall grade: no public data credits one lineman with a block. Only his own numbers are scored here; his line's numbers are listed below and not scored.`)
	return out
}

/** The text of a post that goes with a comparison. Short enough to leave room for the link. */
export function shareText(c: Comparison): string {
	const head = c.headline
	const ctx = c.range === "season" ? "" : ` (${c.rangeName.toLowerCase()})`
	return `${c.a.name} vs ${c.b.name}${ctx}: ${head} Settle it with the numbers:`
}

/** The strongest numbers for one player in a pair: where he beats the other, then where he ranks best. For the spotlight card. */
export function spotlightOf(c: Comparison, side: "a" | "b", limit = 4): Metric[] {
	const pctOf = (m: Metric) => (side === "a" ? m.a.pct : m.b.pct) ?? -1
	const wins = c.metrics.filter((m) => m.lead === side && m.signal !== "luck")
	const rest = c.metrics.filter((m) => !wins.includes(m) && m.signal !== "luck" && pctOf(m) >= 50)
	const out = [...wins.sort((x, y) => y.gap - x.gap), ...rest.sort((x, y) => pctOf(y) - pctOf(x))]
	// Early in a season most stats are still mostly luck; if that leaves too little to say, his better early numbers still count, marked as such.
	if (out.length < 2) {
		const early = c.metrics.filter((m) => m.signal === "luck" && pctOf(m) >= 60).sort((x, y) => pctOf(y) - pctOf(x))
		out.push(...early)
	}
	return out.slice(0, limit)
}

/** "Top 12%" / "88th percentile" for a percentile, in the words a reader expects. */
export function pctWord(pct: number | null): string {
	if (pct === null) return ""
	const p = shownPct(pct)
	return p >= 50 ? `Top ${Math.max(1, 100 - p)}%` : `${ordinal(p)} percentile`
}

export { lastName }

export type Debate = { a: PlayerRow; b: PlayerRow; tag: string }

/**
 * Comparisons worth opening from an empty page: each Raider against the best player at his job, then the top two at the big positions.
 * Only players with the job's headline stat (so there is something to compare), and no pair twice.
 */
export function featuredDebates(data: PlayersData, limit = 10): Debate[] {
	const ok = (p: PlayerRow) => p.stats.some((s) => s.k === HEADLINE[p.group])
	const grade = (p: PlayerRow) => overall(p) ?? -1
	const out: Debate[] = []
	const seen = new Set<string>()
	const add = (a: PlayerRow, b: PlayerRow | undefined, tag: string) => {
		if (!b || a.slug === b.slug) return
		const key = [a.slug, b.slug].sort().join("|")
		if (seen.has(key)) return
		seen.add(key)
		out.push({ a, b, tag })
	}
	const byGrade = (g: PlayerGroup) => data.players.filter((p) => p.group === g && ok(p)).sort((x, y) => grade(y) - grade(x))
	for (const p of data.players.filter((x) => x.team === data.team && ok(x) && hasOverall(x.group)).sort((x, y) => grade(y) - grade(x))) {
		add(p, byGrade(p.group).find((x) => x.slug !== p.slug), `${GROUP_META[p.group].title}: a Raider against the best`)
	}
	const raiders = out.length
	for (const g of ["qb", "wr", "te", "rb", "edge", "cb"] as const) {
		const [first, second] = byGrade(g)
		if (first && second) add(first, second, `${GROUP_META[g].title}: the top two`)
	}
	return [...out.slice(0, Math.min(raiders, Math.ceil(limit / 2))), ...out.slice(raiders)].slice(0, limit)
}
