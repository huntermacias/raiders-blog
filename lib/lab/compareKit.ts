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
	signalFor,
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
import { isV2Site } from "./labMethod"
import { type PlayerHistory, hasSeason, seasonData } from "./seasonKit"

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
	/** The season each man is looked at in; null is the one being played. They can differ: a man against himself two years ago. */
	sa: number | null
	sb: number | null
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/
const KEY = /^[A-Za-z][A-Za-z0-9]{0,30}$/
export const MAX_METRICS = 10
const RADAR_MAX = 8
const RADAR_MIN = 3

type Raw = { a?: string; b?: string; r?: string; m?: string; g?: string; y?: string; ya?: string; yb?: string }

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
	const year = (v?: string) => {
		const n = Number(v)
		return v && /^\d{4}$/.test(v) && n >= 2000 && n <= 2100 ? n : null
	}
	// `y` is both men's season; `ya` and `yb` set each one's own.
	return { a: slug(q.a), b: slug(q.b), range, metrics: metrics.length ? metrics : null, group, sa: year(q.ya) ?? year(q.y), sb: year(q.yb) ?? year(q.y) }
}

/** The query string that rebuilds a config. Defaults are left out so a plain comparison keeps a short link. */
export function configQuery(c: CompareConfig, extra: Record<string, string> = {}): string {
	const parts: string[] = []
	if (c.a) parts.push(`a=${encodeURIComponent(c.a)}`)
	if (c.b) parts.push(`b=${encodeURIComponent(c.b)}`)
	if (c.range !== "season") parts.push(`r=${c.range}`)
	if (c.metrics?.length) parts.push(`m=${c.metrics.map(encodeURIComponent).join(",")}`)
	if (c.group) parts.push(`g=${c.group}`)
	if (c.sa !== null && c.sa === c.sb) parts.push(`y=${c.sa}`)
	else {
		if (c.sa !== null) parts.push(`ya=${c.sa}`)
		if (c.sb !== null) parts.push(`yb=${c.sb}`)
	}
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
	/** When his earlier seasons are part of his grade: the level it puts him at and how far off that could still be. */
	post: { v: number; se: number } | null
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
	/** What the lead was decided on: this season's numbers alone, or those weighed with both men's earlier seasons. */
	basis: "season" | "history"
	/** Part of the job's default set. */
	core: boolean
}

export type RadarAxis = { key: string; label: string; short: string; a: number; b: number }

export type Comparison = {
	a: PlayerRow
	b: PlayerRow
	group: PlayerGroup
	range: RangeId
	/** The season each man is shown in. */
	seasons: { a: number; b: number }
	/** The data each man is measured against (a past season's league is not this season's). */
	views: { a: PlayersData; b: PlayersData }
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

/**
 * Picks the row of each man that does the same job. A man with two jobs is matched to the other's; `want` forces one. Each man is
 * looked up in his own season's data (`dataB`, when it is not the same as `data`), so a man can be set against himself in another year.
 */
export function resolvePair(data: PlayersData, c: Pick<CompareConfig, "a" | "b" | "group">, dataB: PlayersData = data): Pair {
	const rows = (d: PlayersData, slug: string) => (slug ? d.players.filter((p) => p.slug === slug).sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group)) : [])
	const ra = rows(data, c.a)
	const rb = rows(dataB, c.b)
	if (!ra.length || !rb.length) return { problem: "missing", a: ra[0] ?? null, b: rb[0] ?? null }
	if (c.a === c.b && data === dataB) return { problem: "same", a: ra[0], b: rb[0] }
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
	let post: MetricSide["post"] = null
	if (range === "season") {
		se = s.season.se ?? null
		const r = s.season.r ?? null
		if (r !== null && y?.n && info.higher !== null) {
			rank = r
			of = y.n
			pct = pctFromRank(r, y.n)
		}
		// v2 judges a comparison on this season's plays; the history-informed projection has its own block.
		if (!isV2Site() && s.season.hn && typeof s.season.a === "number" && typeof s.season.pe === "number") post = { v: s.season.a, se: s.season.pe }
	} else {
		// A standard error shrinks with the square root of the plays, so a window's error is the season's scaled by how few plays it has.
		if (s.season.se && s.season.n > 0) se = s.season.se * Math.sqrt(s.season.n / sl.n)
		if (y && info.higher !== null) {
			const vp = valuePct(sl.v, y)
			pct = info.higher === false ? 100 - vp : vp
		}
	}
	return { value: sl.v, text: formatStat(p.group, key, sl.v), n: sl.n, pct, rank, of, se, sure: sureness(post ? post.se : se, y), post }
}

const SIGNAL_ORDER: Signal[] = ["luck", "partial", "real"]

function metricOf(dA: PlayersData, dB: PlayersData, A: PlayerRow, B: PlayerRow, key: string, range: RangeId): Metric | null {
	const info = statInfo(A.group, key)
	if (!info) return null
	const a = sideOf(dA, A, key, info, range)
	const b = sideOf(dB, B, key, info, range)
	if (!a || !b) return null
	let lead: Lead = "even"
	let strength: Strength = "unknown"
	// With both men's earlier seasons in their grades, the lead is judged on the level each is now thought to be at and how far off that
	// could still be; otherwise on this season's numbers and the noise in them.
	const basis: Metric["basis"] = a.post && b.post ? "history" : "season"
	if (info.higher !== null) {
		const va = basis === "history" ? (a.post as { v: number }).v : a.value
		const vb = basis === "history" ? (b.post as { v: number }).v : b.value
		const better = (va - vb) * (info.higher ? 1 : -1)
		const sa = basis === "history" ? (a.post as { se: number }).se : a.se
		const sb = basis === "history" ? (b.post as { se: number }).se : b.se
		const se = sa !== null && sb !== null ? Math.hypot(sa, sb) : null
		if (se === null) strength = better === 0 ? "toss-up" : "unknown"
		else {
			const z = se > 0 ? Math.abs(va - vb) / se : Infinity
			strength = z >= 1.5 ? "clear" : z >= 0.75 ? "slight" : "toss-up"
		}
		// With no error to test against, the better number still leads, but is not called clear.
		lead = strength === "toss-up" || better === 0 ? "even" : better > 0 ? "a" : "b"
	}
	// A comparison is as settled as its better-known side: the lead test above already weighs how unsure the other one is.
	const side = (d: PlayersData, p: PlayerRow): Signal => {
		if (info.higher === null) return "partial"
		const y = yardOf(d, p.group, key)
		const s = statOf(p, key)
		return range === "season" && s ? signalFor(y, s.season) : signalOf(y)
	}
	const sigs = [side(dA, A), side(dB, B)]
	const signal = SIGNAL_ORDER[Math.max(...sigs.map((x) => SIGNAL_ORDER.indexOf(x)))]
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
		signal,
		basis,
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

/** What the comparison covers, in words: this season so far, one past season, or two different seasons. */
export function seasonLabels(data: PlayersData, views: { a: PlayersData; b: PlayersData }, range: RangeId, A: PlayerRow): { name: string; weeks: string } {
	const sa = views.a.season
	const sb = views.b.season
	const part = (d: PlayersData) => (d.season === data.season ? `through Week ${d.week}` : "full season")
	if (sa !== sb) return { name: `${sa} and ${sb}`, weeks: `${sa}: ${part(views.a)}. ${sb}: ${part(views.b)}.` }
	if (sa !== data.season) return { name: `${sa} season`, weeks: `${sa}: ${part(views.a)}` }
	return rangeLabels(data, A, range)
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

/** A man's name as the comparison should say it: with his season beside it when the two are not in the same one. */
export function nameOf(c: Pick<Comparison, "a" | "b"> & { seasons?: Comparison["seasons"] }, side: "a" | "b"): string {
	const p = side === "a" ? c.a : c.b
	return !c.seasons || c.seasons.a === c.seasons.b ? p.name : `${p.name} (${side === "a" ? c.seasons.a : c.seasons.b})`
}

/** One plain sentence about who has the better number, for a share post and the page's headline. */
export function headlineOf(c: Pick<Comparison, "a" | "b" | "tally" | "metrics" | "rangeName" | "overall"> & { seasons?: Comparison["seasons"] }): string {
	const { tally } = c
	const an = nameOf(c, "a")
	const bn = nameOf(c, "b")
	const n = tally.a + tally.b + tally.even
	if (!c.metrics.length) return `${an} and ${bn} have no stat in common over ${c.rangeName.toLowerCase()}.`
	if (n === 0) return `Too early to separate ${an} and ${bn}: every stat here is still mostly luck.`
	if (tally.a === 0 && tally.b === 0) return `${an} and ${bn} are too close to separate on ${n === 1 ? "the one stat that counts" : `these ${n} stats`}.`
	if (tally.a === tally.b) return `${an} and ${bn} split ${tally.a + tally.b} stats ${tally.a} to ${tally.b}${tally.even ? `, with ${tally.even} too close to call` : ""}.`
	const aLeads = tally.a > tally.b
	const lead = aLeads ? an : bn
	const win = aLeads ? tally.a : tally.b
	const clear = aLeads ? tally.clearA : tally.clearB
	return clear > 0 ? `${lead} leads ${win} of ${n} stats.` : `${lead} has a slight edge on ${win} of ${n} stats; none of the gaps is clear yet.`
}

/** The data each man is measured against. A season that is not on file is the current one, so a stale link still opens something. */
export function viewsFor(data: PlayersData, cfg: Pick<CompareConfig, "sa" | "sb">, history?: PlayerHistory | null): { a: PlayersData; b: PlayersData } {
	const seasonFor = (s: number | null) => (s !== null && history && hasSeason(data, history, s) ? s : data.season)
	return { a: seasonData(data, history, seasonFor(cfg.sa)), b: seasonData(data, history, seasonFor(cfg.sb)) }
}

/** Builds everything the page and the cards show for a pair and a config. Null when the pair cannot be compared. */
export function buildComparison(data: PlayersData, cfg: CompareConfig, history?: PlayerHistory | null): Comparison | null {
	const views = viewsFor(data, cfg, history)
	const pair = resolvePair(views.a, cfg, views.b)
	if ("problem" in pair) return null
	const { a: A, b: B, group } = pair
	const keys = keysFor(group)
	// A past season is a whole season: there is no "last two games" of it on file.
	const past = views.a.season !== data.season || views.b.season !== data.season
	const range: RangeId = past ? "season" : cfg.range

	const options = keys.graded.map((k) => metricOf(views.a, views.b, A, B, k, range)).filter((m): m is Metric => m !== null)
	const style = keys.style.map((k) => metricOf(views.a, views.b, A, B, k, range)).filter((m): m is Metric => m !== null)
	const line = keys.line.map((k) => metricOf(views.a, views.b, A, B, k, range)).filter((m): m is Metric => m !== null)

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

	const ov = (d: PlayersData, p: PlayerRow) => {
		if (!hasOverall(p.group)) return null
		return stretchGrade(d, overall(p, range))
	}
	const oa = ov(views.a, A)
	const ob = ov(views.b, B)
	const overallLead: Lead | null = oa === null || ob === null ? null : Math.abs(oa - ob) < 2 ? "even" : oa > ob ? "a" : "b"

	const { name, weeks } = seasonLabels(data, views, range, A)
	const seasons = { a: views.a.season, b: views.b.season }
	const cross = seasons.a !== seasons.b
	const base2: Comparison = {
		a: A,
		b: B,
		group,
		range,
		seasons,
		views,
		rangeName: name,
		rangeWeeks: weeks,
		basis:
			range === "season"
				? `Percentile is each player's season rank among ${GROUP_META[group].peers} with enough volume to be graded${past ? `, in the season shown${cross ? " for each (a different season's league for each)" : ""}` : ""}.`
				: `Percentile places each player's number from these games against the whole season's spread among ${GROUP_META[group].peers}. It rests on fewer plays, so it moves more.`,
		metrics,
		options,
		style,
		line,
		tally,
		overall: { a: oa, b: ob, lead: overallLead },
		radar: radar.length >= RADAR_MIN ? radar : [],
		early: { a: isEarly(views.a, A), b: isEarly(views.b, B) },
		insights: [],
		headline: "",
	}
	base2.headline = headlineOf(base2)
	base2.insights = insightsOf(base2, data)
	return base2
}

/** Plain sentences that say what the comparison means, each one backed by a number on the page. */
export function insightsOf(c: Comparison, data?: PlayersData): string[] {
	const out: string[] = []
	const { a, b, tally, metrics } = c
	const an = nameOf(c, "a")
	const bn = nameOf(c, "b")
	if (!metrics.length) return out

	const clear = tally.clearA + tally.clearB
	const counted = tally.a + tally.b + tally.even
	const noise = tally.noise ? ` ${tally.noise} more ${tally.noise === 1 ? "is" : "are"} shown but still mostly luck, so ${tally.noise === 1 ? "it is" : "they are"} not scored.` : ""
	if (!counted) {
		out.push(`Every stat here is still mostly luck at this point in the season, so nobody is scored as ahead.${noise}`)
	} else if (tally.a || tally.b) {
		const lead = tally.a >= tally.b ? an : bn
		const trail = tally.a >= tally.b ? bn : an
		const lw = Math.max(tally.a, tally.b)
		const tw = Math.min(tally.a, tally.b)
		out.push(
			`${lead} has the better number on ${lw} of ${counted} stats that count, ${trail} on ${tw}${tally.even ? `, with ${tally.even} too close to call` : ""}. ${clear ? `${clear} ${clear === 1 ? "gap is" : "gaps are"} bigger than the noise the plays behind them could make.` : "None of the gaps is bigger than that noise yet, so treat the lead as a lean."}${noise}`,
		)
	} else {
		out.push(`${an} and ${bn} are level on the stats that count: every gap is inside the noise the plays behind it could make.${noise}`)
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
		const trailName = nameOf(c, side)
		const best = [...real].filter((m) => m.lead === side).sort((x, y) => y.gap - x.gap)[0]
		if (best) out.push(`${trailName}'s best answer is ${lc(best.label)}: ${(side === "a" ? best.a : best.b).text} against ${(side === "a" ? best.b : best.a).text}.`)
	}

	// Honest caveats.
	if (c.early.a || c.early.b) {
		const who = c.early.a && c.early.b ? `${an} and ${bn}` : c.early.a ? an : bn
		out.push(`Early read: fewer than two of ${who}'s stats have settled, so treat these as where things stand so far, not a verdict.`)
	}
	if (c.range !== "season") out.push(`These cover only ${c.rangeWeeks.toLowerCase()}. A few games is a small sample, so the numbers swing more than a full season's.`)
	const usedHistory = metrics.some((m) => m.basis === "history") && data?.priorSeasons?.length
	if (usedHistory && data?.priorSeasons) {
		const ps = data.priorSeasons
		out.push(`Where both men have a record, the lead is judged on his ${ps[0]}${ps.length > 1 ? ` to ${ps[ps.length - 1]}` : ""} seasons together with this one, so it can reflect a track record and not only the games so far. His own number shown is this season's alone.`)
	}
	const small = metrics.filter((m) => m.a.sure === "thin" || m.b.sure === "thin").length
	if (c.range === "season" && small >= Math.ceil(metrics.length / 2)) out.push(`Most of these rest on a small number of plays so far; they will firm up as the season goes on.`)
	if (!hasOverall(c.group)) out.push(`Offensive linemen have no overall grade: no public data credits one lineman with a block. Only his own numbers are scored here; his line's numbers are listed below and not scored.`)
	return out
}

/** The text of a post that goes with a comparison. Short enough to leave room for the link. */
export function shareText(c: Comparison): string {
	const head = c.headline
	const ctx = c.seasons.a !== c.seasons.b ? "" : c.range === "season" && c.rangeName === "Season to date" ? "" : ` (${c.rangeName.toLowerCase()})`
	return `${nameOf(c, "a")} vs ${nameOf(c, "b")}${ctx}: ${head} Settle it with the numbers:`
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
