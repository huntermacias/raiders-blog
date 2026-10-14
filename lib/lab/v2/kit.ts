// The v2 Player Lab model: three questions kept apart, each with its own number and its own name.
//
//   This season   what he has done, from this season's plays only (the observed value and his rank among players with enough plays).
//   Contribution  what he has added so far: EPA above an average player at his job over the plays he had, in total and per game.
//   Projection    where his level most likely sits, once his earlier seasons are counted too (the grade, always with a range).
//
// They disagree on purpose, and early in a season they disagree a lot: at week 5 most of a projection is earlier seasons. Nothing here
// merges them into one score, and nothing here calls a projection a verdict on this season. Pure: data in, plain objects out.
import {
	type PlayerGroup,
	type PlayerStat,
	GROUP_META,
	HEADLINE,
	formatStat,
	ordinal,
	statInfo,
	statOf,
} from "../playersKit"
import type { V2Contrib, V2Data, V2Other, V2Row } from "./types"

/** A stat's name in running text: the first letter lower-cased, but an acronym (EPA, CROE) keeps its capitals. */
export const lowerLabel = (label: string) => label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())

export const THIS_SEASON = "This season"
export const CONTRIBUTION = "Contribution so far"
export const PROJECTION = "Projection"
export const PROJECTION_ONE_LINE = "Where his level most likely sits once his earlier seasons count too. Not a verdict on this season."
export const THIS_SEASON_ONE_LINE = "What he has done in this season's games, nothing else. Ranked among players with enough plays."
export const CONTRIBUTION_ONE_LINE = "Points he has added above an average player at his job, over every play he had. More plays add more."
export const PROJECTION_LIMITS =
	"A projection carries his team, scheme, supporting cast and health. A new team, a new head coach, an injury or a change of role can move it, and those are flagged here, never adjusted for."

// ---------------------------------------------------------------------------------------------- this season

export type Observed = {
	key: string
	label: string
	short: string
	per: string
	value: number
	formatted: string
	/** Rank among players with enough plays, from this season's plays alone. Null when the stat is not ranked (a unit's number, a style). */
	rank: number | null
	of: number | null
	/** Plays behind the number. */
	n: number
	games: number
}

/** The stat the job is read on. A job with a primary stat uses it; a job without one (backs, defenders, linemen) uses its headline. */
export function observedKey(data: V2Data, group: PlayerGroup): string {
	return data.method.policy[group]?.primary ?? HEADLINE[group]
}

export function observedOf(data: V2Data, p: V2Row): Observed | null {
	const key = observedKey(data, p.group)
	const s = statOf(p, key)
	const info = statInfo(p.group, key)
	if (!s || !info) return null
	const of = data.yard[p.group]?.[key]?.n ?? null
	return {
		key,
		label: info.label,
		short: info.short,
		per: info.per,
		value: s.season.v,
		formatted: formatStat(p.group, key, s.season.v),
		rank: info.higher === null || info.unit ? null : (s.season.r ?? null),
		of: info.higher === null || info.unit ? null : of,
		n: s.season.n,
		games: p.games,
	}
}

// ---------------------------------------------------------------------------------------------- contribution

export type ContributionLine = {
	over: number
	perGame: number
	/** Rank among everyone at the job who has a contribution, with or without a card. */
	rank: number
	of: number
	parts: V2Contrib["parts"]
	/** True when the player has too few plays for a card: his plays still count here. */
	lowVolume: boolean
}

type Contributor = { id: string; contrib: V2Contrib; lowVolume: boolean; name: string; team: string; slug?: string; games: number }

export function contributors(data: V2Data, group: PlayerGroup): Contributor[] {
	const carded = data.players.filter((p) => p.group === group && p.contrib).map((p) => ({ id: p.id, contrib: p.contrib!, lowVolume: false, name: p.name, team: p.team, slug: p.slug, games: p.games }))
	const rest = (data.others ?? []).filter((o: V2Other) => o.group === group && o.contrib).map((o) => ({ id: o.id, contrib: o.contrib!, lowVolume: true, name: o.name, team: o.team, games: o.games }))
	return [...carded, ...rest].sort((a, b) => b.contrib.over - a.contrib.over || a.name.localeCompare(b.name))
}

export function contributionOf(data: V2Data, p: V2Row): ContributionLine | null {
	if (!p.contrib) return null
	const all = contributors(data, p.group)
	const i = all.findIndex((x) => x.id === p.id)
	return { over: p.contrib.over, perGame: p.contrib.perGame, rank: i + 1, of: all.length, parts: p.contrib.parts, lowVolume: false }
}

// ---------------------------------------------------------------------------------------------- projection

export type Environment = { kind: "new-team" | "new-coach" | "steady" | "rookie"; text: string }

/** What changed around him since his last season. It is a warning on the projection, never an adjustment to it. */
export function environmentOf(p: V2Row): Environment {
	if (p.teamChanged === undefined) return { kind: "rookie", text: "No earlier season at this job, so the projection starts from the league average." }
	if (p.teamChanged) {
		return {
			kind: "new-team",
			text: `New team: he played for ${p.prevTeam} in ${p.prevSeason}. Past results travel poorly when a player changes team, and the projection is not adjusted for it. Lean on this season.`,
		}
	}
	if (p.coachChanged) return { kind: "new-coach", text: `New head coach: the ${p.team} changed head coach since ${p.prevSeason}. His earlier seasons came in a different system, and the projection is not adjusted for it.` }
	return { kind: "steady", text: "Same team and head coach as his last season." }
}

export type Projection = {
	key: string
	statLabel: string
	unit: string
	grade: number
	lo: number
	hi: number
	rank: number
	of: number
	/** 0 to 1: the share of the estimate that comes from this season's plays. */
	thisSeasonShare: number
	/** What the grade would be from this season alone. */
	seasonOnly: number | null
	early: boolean
	env: Environment
	/** The prediction target and horizon, in words. */
	target: string
}

export function projectionOf(data: V2Data, p: V2Row): Projection | null {
	const g = p.grade
	if (!g) return null
	const policy = data.method.policy[p.group]
	const info = statInfo(p.group, g.k)
	return {
		key: g.k,
		statLabel: info?.label ?? g.k,
		unit: policy?.unit ?? info?.label ?? g.k,
		grade: g.g,
		lo: g.lo,
		hi: g.hi,
		rank: g.rank,
		of: g.of,
		thisSeasonShare: g.cw ?? 0,
		seasonOnly: g.g0 ?? null,
		early: (g.cw ?? 1) < 0.3,
		env: environmentOf(p),
		target: `His ${lowerLabel(info?.label ?? g.k)} over the rest of the ${data.season} season, in his current situation.`,
	}
}

export function sharePct(share: number): string {
	const v = Math.round(share * 100)
	return v < 1 ? "under 1%" : `${v}%`
}

/** The sentence that says why "this season" and "projection" disagree (or that they do not). */
export function whyDiffer(data: V2Data, p: V2Row): string | null {
	const o = observedOf(data, p)
	const pr = projectionOf(data, p)
	if (!o || !pr || o.rank === null || o.of === null) return null
	const gap = pr.rank - o.rank
	const field = Math.max(o.of, pr.of)
	const first = p.name.split(" ").slice(-1)[0]
	const share = sharePct(pr.thisSeasonShare)
	if (Math.abs(gap) < Math.max(5, Math.round(field * 0.15))) {
		return `This season and the projection agree on ${first}: ${ordinal(o.rank)} on what he has done, ${ordinal(pr.rank)} on the projection.`
	}
	const lifted = pr.seasonOnly !== null ? pr.grade > pr.seasonOnly : gap < 0
	const why = lifted
		? `His earlier seasons were better than this start, and they count for ${100 - Math.round(pr.thisSeasonShare * 100)}% of the projection.`
		: `His earlier seasons were weaker than this start, and they count for ${100 - Math.round(pr.thisSeasonShare * 100)}% of the projection.`
	return `${first} is ${ordinal(o.rank)} on what he has done this season but ${ordinal(pr.rank)} on the projection. Only ${share} of the projection is this season's plays. ${why}`
}

// ---------------------------------------------------------------------------------------------- backs: components, never one grade

export type Component = {
	key: string
	label: string
	formatted: string
	n: number
	rank: number | null
	of: number | null
	/** Present only for the two graded components. */
	grade: { g: number; lo: number; hi: number; share: number } | null
	/** For the tracking component: how many of his carries the number rests on. */
	covered: { n: number; of: number; pct: number } | null
}

const COMPONENT_KEYS = ["epaRush", "success", "explosive", "yco", "ryoe"]
const RB_OVERLAP_NOTE =
	"Explosive runs and yards after contact overlap: a back who breaks tackles also breaks long runs. They are shown as two grades and never averaged into one."

export const rbOverlapNote = () => RB_OVERLAP_NOTE

/** A back is read on separate components. Rushing yards over expected is tracking data for only some carries and is observed, never graded. */
export function componentsOf(data: V2Data, p: V2Row): Component[] {
	if (p.group !== "rb") return []
	const graded = new Set(data.method.policy.rb?.grade ?? [])
	const out: Component[] = []
	for (const key of COMPONENT_KEYS) {
		const s = statOf(p, key)
		const info = statInfo("rb", key)
		if (!s || !info) continue
		const yard = data.yard.rb?.[key]
		const ts = yard?.ts
		let grade: Component["grade"] = null
		if (graded.has(key) && typeof s.season.g === "number" && s.season.pe !== undefined && ts) {
			const half = 1.2816 * data.method.scale.calibration * data.method.scale.perSd * (s.season.pe / ts)
			grade = { g: s.season.g, lo: s.season.g - half, hi: s.season.g + half, share: s.season.cw ?? 0 }
		}
		const covered = key === "ryoe" && p.tracked?.plays !== undefined && p.tracked.ofPlays ? { n: p.tracked.plays, of: p.tracked.ofPlays, pct: Math.round((100 * p.tracked.plays) / p.tracked.ofPlays) } : null
		out.push({ key, label: info.label, formatted: formatStat("rb", key, s.season.v), n: s.season.n, rank: s.season.r ?? null, of: yard?.n ?? null, grade, covered })
	}
	return out
}

// ---------------------------------------------------------------------------------------------- the pairwise chance

export type PairResult =
	| { kind: "chance"; leader: string; trailer: string; shown: number; text: string }
	| { kind: "toss-up"; text: string }
	| { kind: "none"; text: string }

const SEASON_GAMES = 17
const MIN_REST_PLAYS = 150
const phi = (z: number) => {
	// Abramowitz and Stegun 7.1.26 for erf.
	const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
	const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
	return 0.5 * (1 + Math.sign(z) * y)
}

function teamGames(data: V2Data, p: V2Row): number {
	return Object.keys(data.opp[p.team] ?? {}).length
}

/**
 * The published chance that one quarterback does better than another over the rest of the season: only for two quarterbacks of the
 * same season, each with 4 to 10 games and enough of the season left, and only in a bucket where the replay on past seasons showed
 * the claimed chance holds. Rounded DOWN to 5 points, never above 85%; under 55% it is a toss-up. Everywhere else, nothing.
 * What it measures is `method.pairwise.target`, not who is the better quarterback.
 */
export function pairChance(data: V2Data, a: V2Row, b: V2Row): PairResult {
	const pw = data.method.pairwise
	const none = (text: string): PairResult => ({ kind: "none", text })
	if (!pw) return none("No validated chance is available.")
	if (a.group !== "qb" || b.group !== "qb") return none("Chances are published for quarterback pairs only, because that is the only job they were checked on.")
	if (a.id === b.id) return none("Same player.")
	const lo = Math.min(...pw.cutoffGames)
	const hi = Math.max(...pw.cutoffGames)
	for (const p of [a, b]) {
		if (p.games < lo || p.games > hi) return none(`A chance is published only after ${lo} to ${hi} games; ${p.name} has played ${p.games}.`)
	}
	const ea = statOf(a, "epaDb")?.season
	const eb = statOf(b, "epaDb")?.season
	const ps = data.yard.qb?.epaDb?.ps
	if (!ea || !eb || ea.a == null || eb.a == null || ea.pe == null || eb.pe == null || !ps) return none("Not enough information for a chance.")
	const rest = (p: V2Row, e: PlayerStat["season"]) => Math.max(0, SEASON_GAMES - teamGames(data, p)) * (e.n / Math.max(1, p.games))
	const ra = rest(a, ea)
	const rb = rest(b, eb)
	if (ra < MIN_REST_PLAYS || rb < MIN_REST_PLAYS) return none("Too little of the season is left for a published chance.")
	const z = Math.abs(ea.a - eb.a) / Math.sqrt(ea.pe ** 2 + eb.pe ** 2 + ps ** 2 / ra + ps ** 2 / rb)
	const p = phi(z)
	const leader = ea.a >= eb.a ? a : b
	const trailer = leader === a ? b : a
	// The bucket this chance falls in: the highest one that starts at or below it (the top bucket is everything from its start up).
	const bucket = pw.buckets.filter((x) => p >= x.lo - 1e-9).sort((x, y) => y.lo - x.lo)[0]
	if (p < pw.display.floor) return { kind: "toss-up", text: "Too close to call over the rest of the season." }
	if (!bucket || !bucket.publish) return none("This size of gap has not been checked well enough on past seasons to publish a chance.")
	const shown = Math.min(pw.display.cap, Math.floor(p / pw.display.step + 1e-9) * pw.display.step)
	const pct = Math.round(shown * 100)
	return { kind: "chance", leader: leader.name, trailer: trailer.name, shown, text: `${leader.name} has about a ${pct}% chance${shown >= pw.display.cap ? " or better" : ""} of a higher EPA per dropback than ${trailer.name} over the rest of the season.` }
}

// ---------------------------------------------------------------------------------------------- boards

export type ViewId = "season" | "contribution" | "projection"
export const VIEW_PATH: Record<Exclude<ViewId, "season">, string> = { contribution: "contribution-so-far", projection: "projection" }

export type ProjectionRow = { player: V2Row; grade: number; lo: number; hi: number; rank: number; thisSeasonShare: number; observedRank: number | null; env: Environment }
export type ContributionRow = { id: string; name: string; team: string; slug?: string; over: number; perGame: number; rank: number; games: number; lowVolume: boolean }

export function hasProjectionBoard(data: V2Data, group: PlayerGroup): boolean {
	return data.method.policy[group]?.mode === "primary" && data.players.some((p) => p.group === group && p.grade)
}

export function hasContributionBoard(data: V2Data, group: PlayerGroup): boolean {
	return contributors(data, group).length > 0
}

export function projectionBoard(data: V2Data, group: PlayerGroup): ProjectionRow[] {
	return data.players
		.filter((p) => p.group === group && p.grade)
		.map((p) => ({ player: p, grade: p.grade!.g, lo: p.grade!.lo, hi: p.grade!.hi, rank: p.grade!.rank, thisSeasonShare: p.grade!.cw ?? 0, observedRank: observedOf(data, p)?.rank ?? null, env: environmentOf(p) }))
		.sort((a, b) => a.rank - b.rank || a.player.name.localeCompare(b.player.name))
}

export function contributionBoard(data: V2Data, group: PlayerGroup): ContributionRow[] {
	return contributors(data, group).map((c, i) => ({ id: c.id, name: c.name, team: c.team, slug: c.slug, over: c.contrib.over, perGame: c.contrib.perGame, rank: i + 1, games: c.games, lowVolume: c.lowVolume }))
}

/** "Best right now / most contributed / best projected" for a job, for the three-way header of a leaderboard. */
export function topThree(data: V2Data, group: PlayerGroup): { season: string | null; contribution: string | null; projection: string | null; seasonSample: { n: number; typical: number; per: string; small: boolean } | null } {
	const key = observedKey(data, group)
	const info = statInfo(group, key)
	const ranked = data.players.filter((p) => p.group === group && statOf(p, key)?.season.r != null).sort((a, b) => statOf(a, key)!.season.r! - statOf(b, key)!.season.r!)
	const lead = info && info.higher !== null && !info.unit ? ranked[0] : undefined
	const counts = ranked.map((p) => statOf(p, key)!.season.n).sort((a, b) => a - b)
	const typical = counts.length ? counts[Math.floor(counts.length / 2)] : 0
	const n = lead ? statOf(lead, key)!.season.n : 0
	return {
		season: lead?.name ?? null,
		// A leader on a fraction of the usual plays is named with the count and flagged: the ranking is the plain order of this season's numbers.
		seasonSample: lead ? { n, typical, per: info!.per, small: n < typical * SMALL_SAMPLE_SHARE } : null,
		contribution: contributionBoard(data, group)[0]?.name ?? null,
		projection: hasProjectionBoard(data, group) ? (projectionBoard(data, group)[0]?.player.name ?? null) : null,
	}
}

/** A named leader with fewer than this share of the typical qualifier's plays is flagged as a small sample. */
export const SMALL_SAMPLE_SHARE = 0.6

/** How much is behind a player's this-season number next to the typical ranked player at his job (the median), and whether that is thin. */
export function sampleOf(data: V2Data, p: V2Row): { n: number; typical: number; per: string; small: boolean } | null {
	const key = observedKey(data, p.group)
	const info = statInfo(p.group, key)
	const mine = statOf(p, key)?.season
	if (!info || !mine || info.higher === null || info.unit) return null
	const counts = data.players.filter((x) => x.group === p.group && statOf(x, key)?.season.r != null).map((x) => statOf(x, key)!.season.n).sort((a, b) => a - b)
	const typical = counts.length ? counts[Math.floor(counts.length / 2)] : 0
	return { n: mine.n, typical, per: info.per, small: typical > 0 && mine.n < typical * SMALL_SAMPLE_SHARE }
}

export const viewName = (group: PlayerGroup, view: ViewId) =>
	view === "season" ? `${GROUP_META[group].title}: ${THIS_SEASON.toLowerCase()}` : view === "contribution" ? `${GROUP_META[group].title}: contribution so far` : `${GROUP_META[group].title}: projection`

// ---------------------------------------------------------------------------------------------- two players, three questions

export type ThreeWay = {
	id: "season" | "contribution" | "projection"
	title: string
	a: { text: string; sub: string } | null
	b: { text: string; sub: string } | null
	/** Who is ahead on this question. Null when either has no number or the gap is smaller than its own uncertainty. */
	lead: "a" | "b" | null
	/** Why there is no leader, when there is none and both have numbers. */
	close: boolean
}

/**
 * Two players of the same job, answered the three ways. A lead is declared only when the gap is larger than what the two numbers'
 * own uncertainty allows (a standard error each for this season; the ranges for the projection; for contribution, never: it adds
 * points and a gap in plays played is a gap in points, so it is shown, not scored).
 */
export function threeWay(data: V2Data, a: V2Row, b: V2Row): ThreeWay[] {
	const out: ThreeWay[] = []
	const oa = observedOf(data, a)
	const ob = observedOf(data, b)
	const key = observedKey(data, a.group)
	const info = statInfo(a.group, key)
	const sa = statOf(a, key)?.season
	const sb = statOf(b, key)?.season
	let seasonLead: "a" | "b" | null = null
	let seasonClose = false
	if (oa && ob && info && info.higher !== null && !info.unit) {
		const gap = (oa.value - ob.value) * (info.higher ? 1 : -1)
		const se = Math.sqrt((sa?.se ?? 0) ** 2 + (sb?.se ?? 0) ** 2)
		if (Math.abs(gap) > se) seasonLead = gap > 0 ? "a" : "b"
		else seasonClose = true
	}
	const side = (o: Observed | null) => (o ? { text: o.formatted, sub: `${o.rank !== null && o.of !== null ? `${ordinal(o.rank)} of ${o.of}` : "not ranked"} · ${Math.round(o.n)} ${o.per}` } : null)
	out.push({ id: "season", title: THIS_SEASON, a: side(oa), b: side(ob), lead: seasonLead, close: seasonClose })

	const ca = contributionOf(data, a)
	const cb = contributionOf(data, b)
	const cside = (c: ContributionLine | null) => (c ? { text: `${c.over >= 0 ? "+" : "−"}${Math.abs(c.over).toFixed(1)} EPA`, sub: `${c.perGame >= 0 ? "+" : "−"}${Math.abs(c.perGame).toFixed(2)} per game · ${ordinal(c.rank)} of ${c.of}` } : null)
	out.push({ id: "contribution", title: CONTRIBUTION, a: cside(ca), b: cside(cb), lead: null, close: false })

	const pa = projectionOf(data, a)
	const pb = projectionOf(data, b)
	const pside = (p: Projection | null) => (p ? { text: `${Math.round(p.grade)}`, sub: `likely ${Math.round(p.lo)} to ${Math.round(p.hi)} · ${ordinal(p.rank)} of ${p.of}` } : null)
	let projLead: "a" | "b" | null = null
	let projClose = false
	if (pa && pb) {
		// Leading means the ranges do not overlap.
		if (pa.lo > pb.hi) projLead = "a"
		else if (pb.lo > pa.hi) projLead = "b"
		else projClose = true
	}
	out.push({ id: "projection", title: PROJECTION, a: pside(pa), b: pside(pb), lead: projLead, close: projClose })
	return out
}
