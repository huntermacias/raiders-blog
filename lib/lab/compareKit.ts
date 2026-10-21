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
//  - jobs with no overall grade (offensive linemen) are compared on their own numbers; their line's numbers are listed, never scored;
//  - two different positions are compared too (crossKit.ts), but only on stats both are measured on the same way, read on one pool.

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
	type Yard,
} from "./playersKit"
import { type Family, type FamilyId, type Pool, type SharedStat, GROUP_TAG, familyFor, poolOf, rankIn, sharedFor } from "./crossKit"
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
	/** The spread this number is read against: his position's, or the two positions' together for a cross-position pair. */
	yard: Yard | null
	/** Across positions only: where he ranks among his own position, beside the rank in the shared pool. */
	own: { rank: number; of: number; pct: number } | null
}

export type Metric = {
	/** The stat's id in the address. Across positions it is the shared stat's id, and each man keeps it under his own catalog key (`keys`). */
	key: string
	keys: { a: string; b: string }
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

/** What a comparison across positions says about itself: which family it is in, who is in the pool, and the limits of reading it. */
export type Cross = {
	family: FamilyId
	/** "Receiving", "Pass rush". */
	title: string
	short: string
	/** "receiving", "rushing the passer": for a sentence. */
	topic: string
	/** "Tight end vs wide receiver" */
	label: string
	/** "TE vs WR" */
	tags: { a: string; b: string }
	/** What the percentile is measured against: "wide receivers and tight ends". */
	pool: string
	caveats: string[]
	skipped: string[]
	/** How many shared stats the two positions have in all (the page may show fewer). */
	shared: number
}

export type Comparison = {
	a: PlayerRow
	b: PlayerRow
	/** The job being compared; for a pair at different positions, the first man's. */
	group: PlayerGroup
	/** Set when the two play different positions. */
	cross: Cross | null
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

export type Pair = { a: PlayerRow; b: PlayerRow; group: PlayerGroup; family?: Family } | { problem: "missing" | "same" | "jobs"; a: PlayerRow | null; b: PlayerRow | null }

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
	// No job in common: two positions that are measured on some of the same stats can still be set side by side on those. A job named in the
	// address (`g`) picks which of a two-job man's rows to use when it is one of the two.
	const cross: { A: PlayerRow; B: PlayerRow; family: Family }[] = []
	for (const A of ra) {
		for (const B of rb) {
			const family = familyFor(A.group, B.group)
			if (family) cross.push({ A, B, family })
		}
	}
	const picked = cross.find((x) => c.group && (x.A.group === c.group || x.B.group === c.group)) ?? cross[0]
	if (picked) return { a: picked.A, b: picked.B, group: picked.A.group, family: picked.family }
	return { problem: "jobs", a: ra[0], b: rb[0] }
}

const sliceOf = (s: PlayerStat, range: RangeId) => (range === "season" ? s.season : range === "form" ? s.form : s.earlier)

function sideOf(data: PlayersData, p: PlayerRow, key: string, info: StatInfo, range: RangeId, pool: Pool | null = null): MetricSide | null {
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
	let own: MetricSide["own"] = null
	if (range === "season") {
		se = s.season.se ?? null
		const r = s.season.r ?? null
		if (r !== null && y?.n && info.higher !== null) {
			rank = r
			of = y.n
			pct = pctFromRank(r, y.n)
			// Across positions the shared pool sets the rank and percentile; his own position's rank stays beside it.
			if (pool) {
				own = { rank: r, of: y.n, pct }
				rank = rankIn(pool, sl.v)
				of = pool.n
				pct = pctFromRank(rank, of)
			}
		}
		// v2 judges a comparison on this season's plays; the history-informed projection has its own block.
		if (!isV2Site() && s.season.hn && typeof s.season.a === "number" && typeof s.season.pe === "number") post = { v: s.season.a, se: s.season.pe }
	} else {
		// A standard error shrinks with the square root of the plays, so a window's error is the season's scaled by how few plays it has.
		if (s.season.se && s.season.n > 0) se = s.season.se * Math.sqrt(s.season.n / sl.n)
		const yy = pool ? pool.y : y
		if (yy && info.higher !== null) {
			const vp = valuePct(sl.v, yy)
			pct = info.higher === false ? 100 - vp : vp
		}
	}
	return { value: sl.v, // Across positions both numbers are worded by the shared stat's own entry, so 12% is never set against 11.8%.
		text: info.fmt(sl.v), n: sl.n, pct, rank, of, se, sure: sureness(post ? post.se : se, y), post, yard: pool ? pool.y : y, own }
}

const SIGNAL_ORDER: Signal[] = ["luck", "partial", "real"]

/** One stat to compare: its id, the catalog key each man keeps it under, and (across positions) the shared stat with each man's pool. */
type Spec = { id: string; ka: string; kb: string; info?: StatInfo; shared?: SharedStat }

function metricOf(dA: PlayersData, dB: PlayersData, A: PlayerRow, B: PlayerRow, spec: Spec, range: RangeId): Metric | null {
	const key = spec.id
	const info = spec.info ?? statInfo(A.group, spec.ka)
	if (!info) return null
	const cross = !!spec.shared
	const a = sideOf(dA, A, spec.ka, info, range, spec.shared ? poolOf(dA, spec.shared, A.group, B.group) : null)
	const b = sideOf(dB, B, spec.kb, info, range, spec.shared ? poolOf(dB, spec.shared, A.group, B.group) : null)
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
	const side = (d: PlayersData, p: PlayerRow, k: string): Signal => {
		if (info.higher === null) return "partial"
		const y = yardOf(d, p.group, k)
		const s = statOf(p, k)
		return range === "season" && s ? signalFor(y, s.season) : signalOf(y)
	}
	const sigs = [side(dA, A, spec.ka), side(dB, B, spec.kb)]
	const signal = SIGNAL_ORDER[Math.max(...sigs.map((x) => SIGNAL_ORDER.indexOf(x)))]
	return {
		key,
		keys: { a: spec.ka, b: spec.kb },
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
		// Across positions the shared stats were chosen as the ones that count, so every graded one is part of the default set.
		core: cross ? true : isCore(A.group, spec.ka),
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
function keysFor(group: PlayerGroup): { graded: Spec[]; style: Spec[]; line: Spec[] } {
	const graded: Spec[] = []
	const style: Spec[] = []
	const line: Spec[] = []
	for (const [k, info] of Object.entries(STAT[group])) {
		const spec = { id: k, ka: k, kb: k }
		if (info.unit) line.push(spec)
		else if (info.higher === null) style.push(spec)
		else graded.push(spec)
	}
	return { graded, style, line }
}

/** The stats two different positions share, split the same way. A line's unit stats never cross (no lineman is in a family). */
function sharedKeys(family: Family, A: PlayerRow, B: PlayerRow): { graded: Spec[]; style: Spec[]; line: Spec[] } {
	const graded: Spec[] = []
	const style: Spec[] = []
	for (const { stat, info } of sharedFor(family, A.group, B.group)) {
		const spec = { id: stat.id, ka: stat.keys[A.group] as string, kb: stat.keys[B.group] as string, info, shared: stat }
		if (info.higher === null) style.push(spec)
		else graded.push(spec)
	}
	return { graded, style, line: [] }
}

const peersOf = (g: PlayerGroup) => GROUP_META[g].peers

/** What a comparison across positions says about itself. */
function crossOf(family: Family, A: PlayerRow, B: PlayerRow): Cross {
	const tag = (g: PlayerGroup) => GROUP_TAG[g] ?? g.toUpperCase()
	return {
		family: family.id,
		title: family.title,
		short: family.short,
		topic: family.topic,
		label: `${GROUP_META[A.group].single} vs ${GROUP_META[B.group].single.toLowerCase()}`,
		tags: { a: tag(A.group), b: tag(B.group) },
		pool: `${peersOf(A.group)} and ${peersOf(B.group)}`,
		caveats: family.caveats,
		skipped: family.skipped,
		shared: sharedFor(family, A.group, B.group).length,
	}
}

/** What the percentile is measured against: the position's peers, or both positions together across positions. */
export const peersWord = (c: Pick<Comparison, "group" | "cross">) => c.cross?.pool ?? GROUP_META[c.group].peers

/** "a tight end", "an edge rusher". */
const an_ = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word.toLowerCase()}`

const lastName = (p: PlayerRow) => p.name.trim().split(/\s+/).slice(1).join(" ") || p.name

/** A man's name as the comparison should say it: with his season beside it when the two are not in the same one. */
export function nameOf(c: Pick<Comparison, "a" | "b"> & { seasons?: Comparison["seasons"] }, side: "a" | "b"): string {
	const p = side === "a" ? c.a : c.b
	return !c.seasons || c.seasons.a === c.seasons.b ? p.name : `${p.name} (${side === "a" ? c.seasons.a : c.seasons.b})`
}

/** A man's name, with his position beside it when the two play different ones ("Brock Bowers (TE)"). */
export function taggedName(c: Pick<Comparison, "a" | "b"> & { seasons?: Comparison["seasons"]; cross?: Cross | null }, side: "a" | "b"): string {
	return c.cross ? `${nameOf(c, side)} (${c.cross.tags[side]})` : nameOf(c, side)
}

/** One plain sentence about who has the better number, for a share post and the page's headline. */
export function headlineOf(c: Pick<Comparison, "a" | "b" | "tally" | "metrics" | "rangeName" | "overall"> & { seasons?: Comparison["seasons"]; cross?: Cross | null }): string {
	const { tally } = c
	const an = taggedName(c, "a")
	const bn = taggedName(c, "b")
	const stats = c.cross ? "shared stats" : "stats"
	const n = tally.a + tally.b + tally.even
	if (!c.metrics.length) return `${an} and ${bn} have no stat in common over ${c.rangeName.toLowerCase()}.`
	if (n === 0) return `Too early to separate ${an} and ${bn}: every stat here is still mostly luck.`
	if (tally.a === 0 && tally.b === 0) return `${an} and ${bn} are too close to separate on ${n === 1 ? "the one stat that counts" : `these ${n} ${stats}`}.`
	if (tally.a === tally.b) return `${an} and ${bn} split ${tally.a + tally.b} ${stats} ${tally.a} to ${tally.b}${tally.even ? `, with ${tally.even} too close to call` : ""}.`
	const aLeads = tally.a > tally.b
	const lead = aLeads ? an : bn
	const win = aLeads ? tally.a : tally.b
	const clear = aLeads ? tally.clearA : tally.clearB
	// Two positions often share only one stat that counts: say which, instead of "1 of 1 shared stats".
	if (c.cross && n === 1) {
		const only = c.metrics.find((m) => m.signal !== "luck" && m.lead !== "even")
		if (only) return clear > 0 ? `${lead} is clearly ahead on ${lc(only.label)}, the one shared stat that counts here.` : `${lead} has a slight edge on ${lc(only.label)}, the one shared stat that counts here; the gap could still be noise.`
	}
	return clear > 0 ? `${lead} leads ${win} of ${n} ${stats}.` : `${lead} has a slight edge on ${win} of ${n} ${stats}; none of the gaps is clear yet.`
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
	const family = pair.family ?? null
	const cross = family ? crossOf(family, A, B) : null
	const keys = family ? sharedKeys(family, A, B) : keysFor(group)
	// A past season is a whole season: there is no "last two games" of it on file.
	const past = views.a.season !== data.season || views.b.season !== data.season
	const range: RangeId = past ? "season" : cfg.range

	const build = (specs: Spec[]) => specs.map((k) => metricOf(views.a, views.b, A, B, k, range)).filter((m): m is Metric => m !== null)
	const options = build(keys.graded)
	const style = build(keys.style)
	const line = build(keys.line)

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
	// Each man's overall is a rank within his own position, so two positions' overalls are not set against each other.
	const overallLead: Lead | null = cross || oa === null || ob === null ? null : Math.abs(oa - ob) < 2 ? "even" : oa > ob ? "a" : "b"

	const { name, weeks } = seasonLabels(data, views, range, A)
	const seasons = { a: views.a.season, b: views.b.season }
	const crossSeason = seasons.a !== seasons.b
	const base2: Comparison = {
		a: A,
		b: B,
		group,
		cross,
		range,
		seasons,
		views,
		rangeName: name,
		rangeWeeks: weeks,
		basis: cross
			? range === "season"
				? `One scale for both positions: each player's season rank among all ${cross.pool} graded on the stat, because it is measured the same way for both${past ? ` (in the season shown for each)` : ""}. Under each number, his rank among his own position.`
				: `One scale for both positions: each player's number from these games against the whole season's spread among ${cross.pool}. It rests on fewer plays, so it moves more.`
			: range === "season"
				? `Percentile is each player's season rank among ${GROUP_META[group].peers} with enough volume to be graded${past ? `, in the season shown${crossSeason ? " for each (a different season's league for each)" : ""}` : ""}.`
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

	if (c.cross) {
		out.push(
			`${a.name} is ${an_(GROUP_META[a.group].single)} and ${b.name} is ${an_(GROUP_META[b.group].single)}. They are set side by side only on stats both positions are measured on the same way, and ranked on one scale among all ${c.cross.pool} graded on each.`,
		)
	}
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

	// Across positions, a rank on one scale says nothing about how each does at his own job: give both.
	if (c.cross) {
		const m = metrics.find((x) => x.signal !== "luck" && x.a.own && x.b.own) ?? metrics.find((x) => x.a.own && x.b.own)
		if (m && m.a.own && m.b.own) {
			out.push(`Against his own position on ${lc(m.label)}, ${lastName(a)} ranks ${ordinal(m.a.own.rank)} of ${m.a.own.of} ${GROUP_META[a.group].peers} and ${lastName(b)} ${ordinal(m.b.own.rank)} of ${m.b.own.of} ${GROUP_META[b.group].peers}.`)
		}
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
	const tags = c.cross ? ` (${c.cross.tags.a} vs ${c.cross.tags.b})` : ""
	return `${nameOf(c, "a")} vs ${nameOf(c, "b")}${tags}${ctx}: ${head} Settle it with the numbers:`
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

/**
 * Comparisons across positions worth opening from an empty page: for each pair of positions that share stats, the best Raider at either
 * against the best player at the other, or the best of each when no Raider qualifies. Only pairs that really compare on this season's numbers.
 */
export function crossDebates(data: PlayersData, limit = 4): Debate[] {
	const grade = (p: PlayerRow) => overall(p) ?? -1
	const ready = (p: PlayerRow) => p.stats.some((s) => s.season.r !== null && s.season.r !== undefined)
	const best = (g: PlayerGroup, team?: string) =>
		data.players
			.filter((p) => p.group === g && ready(p) && (!team || p.team === team))
			.sort((x, y) => grade(y) - grade(x))[0]
	const pairs: [PlayerGroup, PlayerGroup][] = [["te", "wr"], ["rb", "wr"], ["edge", "idl"], ["cb", "saf"]]
	const out: Debate[] = []
	for (const [ga, gb] of pairs) {
		const fam = familyFor(ga, gb)
		if (!fam) continue
		const mine = [best(ga, data.team), best(gb, data.team)].filter((p): p is PlayerRow => !!p).sort((x, y) => grade(y) - grade(x))[0]
		const a = mine ?? best(ga)
		const b = a ? (a.group === ga ? best(gb) : best(ga)) : undefined
		if (!a || !b || a.slug === b.slug) continue
		const c = buildComparison(data, { a: a.slug, b: b.slug, range: "season", metrics: null, group: null, sa: null, sb: null })
		if (!c || !c.cross || !c.metrics.length) continue
		out.push({ a, b, tag: `${GROUP_META[a.group].single} vs ${GROUP_META[b.group].single.toLowerCase()}: ${fam.topic}` })
	}
	return out.slice(0, limit)
}
