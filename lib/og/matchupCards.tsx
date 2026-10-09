// The share cards for a position-group matchup (/lab/matchup/lv-vs-ne). One matchup has six cards, one for each part
// of the page, each in two sizes:
//
//   overview   both teams' seven position groups on one radar, the score on paper and the biggest mismatches
//   pairs      each offense against the other defense, eight pairings, a circle (offense) and a diamond (defense)
//   tape       the seven units side by side, bars growing out from the middle
//   style      how each team likes to play (not good or bad, just the style)
//   coaches    the two head coaches: records, against the spread, head to head
//   injuries   who is on the report, starters first
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// buildMatchupSpec turns the tables into a small plain spec (no network, so it can be tested from fixed data) and
// renderMatchupCard (lib/og/matchupViews.tsx) turns the spec into JSX. See lib/og/kit.tsx for the Satori notes.

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import type { MatchupView } from "../lab/matchupShare"
import {
	type AtsRec,
	type Coaching,
	type GroupKey,
	type InjuryPlayer,
	type MatchupRow,
	type Rec,
	type UnitTeam,
	type UnitsData,
	GROUPS,
	GROUP_ORDER,
	STYLE,
	STYLE_ORDER,
	atsText,
	boardRows,
	edgeSentence,
	formatStyle,
	games,
	headline,
	isGameStatus,
	kickoffText,
	marketLine,
	matchupRows,
	paperEdge,
	practiceOf,
	practiceTrend,
	recText,
	reportedStarters,
	share,
	tally,
	teamCount,
	tierOf,
	trailSteps,
	updatedText,
	topEdges,
} from "../lab/unitsKit"
import { teamByAbbr } from "../nfl"
import { GOLD, SILVER, WHITE, accent } from "./kit"
import { renderMatchupView } from "./matchupViews"

export type TeamSide = 0 | 1

export type CardTeam = {
	abbr: string
	nick: string
	name: string
	color: string
	record: string
	/** League rank on offense and on defense, per play (1 is best), and the rank of the mean of the seven groups. */
	off: number | null
	def: number | null
	overall: number
}

export type PairingRow = {
	id: string
	label: string
	/** The team with the ball: 0 is the first team, 1 the second. */
	attacker: TeamSide
	attackRank: number
	defendRank: number
	/** 0 to 100, further right is better. */
	attackScore: number
	defendScore: number
	/** Who wins the pairing: 0, 1, or null when it is even. */
	winner: TeamSide | null
	big: boolean
}

export type Spoke = { key: GroupKey; label: string; off: boolean; ranks: [number, number]; a: number; b: number }
export type Callout = { team: TeamSide; big: boolean; text: string }
export type TapeGroup = { key: GroupKey; label: string; off: boolean; a: { score: number; rank: number }; b: { score: number; rank: number }; winner: TeamSide | null; big: boolean }
export type StyleSide = { text: string; rank: number; pct: number }
export type StyleRow = { key: string; label: string; off: boolean; a: StyleSide | null; b: StyleSide | null }
export type CoachCell = { main: string; sub: string | null }
export type CoachRow = { label: string; a: CoachCell; b: CoachCell; better: TeamSide | null }
export type Meeting = { text: string; won: boolean | null }
export type HurtStep = { day: string; practice: "DNP" | "Limited" | "Full" | null; label: string }
export type Hurt = { name: string; pos: string; group: string; status: string; practice: "DNP" | "Limited" | "Full" | null; injury: string | null; starter: boolean; trail: HurtStep[]; trend: "up" | "down" | null }
export type HurtSide = {
	/** Starters on the game report or limited or out of practice. */
	starters: number
	note: string | null
	players: Hurt[]
	more: number
	/** Players back at full practice, who are left off the card. */
	cleared: number
	empty: string
}

type Base = {
	type: "matchup"
	size: ShareSize
	teams: [CardTeam, CardTeam]
	line: string
	week: number | null
	/** "Raiders at Patriots" when the two meet on the coming slate. */
	game: string | null
	kickoff: string | null
	market: string | null
	/** Pairings with the edge for each team, out of eight. */
	edges: [number, number]
	/** Which team the position groups favor overall, or null when they cancel out. */
	lead: TeamSide | null
	season: number
	/** The week the ranks run through. */
	through: number
	n: number
}

export type MatchupCardSpec = Base &
	(
		| { view: "overview"; radar: Spoke[]; callouts: Callout[]; verdict: string }
		| { view: "pairs"; rows: PairingRow[] }
		| { view: "tape"; groups: TapeGroup[] }
		| { view: "style"; rows: StyleRow[] }
		| { view: "coaches"; coaches: [{ name: string }, { name: string }]; rows: CoachRow[]; meetings: Meeting[]; note: string | null }
		| { view: "injuries"; sides: [HurtSide, HurtSide] }
	)

// ---- colors -----------------------------------------------------------------------------------------------

const hexOf = (c: string): [number, number, number] => {
	const m = /^#([0-9a-f]{6})$/i.exec(c)
	if (!m) return [167, 174, 179]
	const n = parseInt(m[1], 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const apart = (x: string, y: string): number => {
	const [a, b] = [hexOf(x), hexOf(y)]
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Each team's color on the dark card. The Raiders are silver-white; two teams in nearly the same color get a different second color. */
export function cardColors(a: string, b: string): [string, string] {
	const of = (abbr: string) => (abbr === "LV" ? WHITE : accent(opponentColors(abbr).dark))
	const first = of(a)
	let second = of(b)
	if (apart(first, second) < 70) second = apart(first, GOLD) < 70 ? SILVER : GOLD
	return [first, second]
}

// ---- building ---------------------------------------------------------------------------------------------

const RADAR_LABEL: Record<GroupKey, string> = { qb: "QB", ol: "O-line", rec: "Receivers", run: "Run game", rush: "Pass rush", rund: "Run D", cov: "Coverage" }

const round1 = (v: number) => Math.round(v * 10) / 10
const pct = (r: { w: number; l: number }) => (r.w + r.l ? Math.round((r.w / (r.w + r.l)) * 100) : null)

/** The better record of two, as 0 or 1, or null when either has no games or they match. */
function betterShare(a: Rec | AtsRec, b: Rec | AtsRec): TeamSide | null {
	const sa = share({ w: a.w, l: a.l, t: "t" in a ? a.t : 0 })
	const sb = share({ w: b.w, l: b.l, t: "t" in b ? b.t : 0 })
	if (sa === null || sb === null || Math.abs(sa - sb) < 0.005) return null
	return sa > sb ? 0 : 1
}

function coachRows(ta: UnitTeam, tb: UnitTeam, a: string, b: string, size: ShareSize): { rows: CoachRow[]; meetings: Meeting[]; note: string | null } | null {
	const ca = ta.coach
	const cb = tb.coach
	if (!ca || !cb) return null
	const none: CoachCell = { main: "—", sub: null }
	const recCell = (r: Rec, sub: string | null): CoachCell => (games(r) ? { main: recText(r), sub } : none)
	const atsCell = (r: AtsRec): CoachCell => (games(r) ? { main: atsText(r), sub: pct(r) === null ? null : `${pct(r)}% cover` } : none)
	const career = (c: Coaching, t: UnitTeam): CoachCell => recCell(c.career, c.career.n <= t.g ? "first year" : `${c.career.n} games`)
	const withTeam = (c: Coaching): CoachCell => recCell(c.withTeam, `since ${c.withTeam.since}`)
	const meet = (t: UnitTeam, other: string): CoachCell => {
		const v = t.coach!.vs[other]
		return v && v.coachMeet.n ? { main: recText(v.coachMeet), sub: null } : { main: "Not met", sub: null }
	}
	const series = (t: UnitTeam, other: string): CoachCell => {
		const v = t.coach!.vs[other]
		return v && v.teamMeet.n ? { main: recText(v.teamMeet), sub: `${v.teamMeet.n} games` } : none
	}
	const meetBetter = (): TeamSide | null => {
		const va = ca.vs[b]
		return va && va.coachMeet.n ? betterShare(va.coachMeet, invert(va.coachMeet)) : null
	}
	const seriesBetter = (): TeamSide | null => {
		const va = ca.vs[b]
		return va && va.teamMeet.n ? betterShare(va.teamMeet, invert(va.teamMeet)) : null
	}
	const all: CoachRow[] = [
		{ label: "Career record", a: career(ca, ta), b: career(cb, tb), better: betterShare(ca.career, cb.career) },
		{ label: "With this team", a: withTeam(ca), b: withTeam(cb), better: betterShare(ca.withTeam, cb.withTeam) },
		{ label: "Against the spread, this season", a: atsCell(ca.ats.season), b: atsCell(cb.ats.season), better: betterShare(ca.ats.season, cb.ats.season) },
		{ label: "Against the spread, career", a: atsCell(ca.ats.career), b: atsCell(cb.ats.career), better: betterShare(ca.ats.career, cb.ats.career) },
		{ label: "As an underdog", a: atsCell(ca.ats.underdog), b: atsCell(cb.ats.underdog), better: betterShare(ca.ats.underdog, cb.ats.underdog) },
		{ label: "As a favorite", a: atsCell(ca.ats.favorite), b: atsCell(cb.ats.favorite), better: betterShare(ca.ats.favorite, cb.ats.favorite) },
		{ label: "Coming off a bye", a: recCell(ca.bye, null), b: recCell(cb.bye, null), better: betterShare(ca.bye, cb.bye) },
		{ label: "Coach against coach", a: meet(ta, b), b: meet(tb, a), better: meetBetter() },
		{ label: "Team against team since 1999", a: series(ta, b), b: series(tb, a), better: seriesBetter() },
	]
	const wide = ["Career record", "With this team", "Against the spread, this season", "Against the spread, career", "Coach against coach", "Team against team since 1999"]
	const rows = size === "tall" ? all : all.filter((r) => wide.includes(r.label))
	const recent = ca.vs[b]?.recent ?? []
	const meetings: Meeting[] = recent.slice(0, 5).map((m) => ({ text: `${m.pf}-${m.pa}  ${m.season} Wk ${m.week}`, won: m.pf === m.pa ? null : m.pf > m.pa }))
	return { rows, meetings, note: null }
}

const invert = (r: Rec): Rec => ({ w: r.l, l: r.w, t: r.t })

const STATUS_ORDER = ["Out", "Doubtful", "Questionable"]

function hurtSide(t: UnitTeam, week: number | null, size: ShareSize, updated: string | null): HurtSide {
	const max = size === "tall" ? 8 : 4
	// Players back at full practice are cleared; the card is about who might not play.
	const flagged = t.injuries.players.filter((p) => practiceOf(p) !== "Full" || isGameStatus(p.status))
	const rank = (p: InjuryPlayer) => (isGameStatus(p.status) ? 0 : 10) + (p.starter ? 0 : 3) + Math.max(0, STATUS_ORDER.indexOf(p.status))
	const sorted = [...flagged].sort((x, y) => rank(x) - rank(y))
	const w = t.injuries.week
	const stamp = updated ? ` · ${updated}` : ""
	const note = w === null ? "No report yet" : week !== null && w < week ? `Week ${w} report · Week ${week} not out${stamp}` : `Week ${w} report${stamp}`
	return {
		starters: reportedStarters(t).length,
		note,
		players: sorted.slice(0, max).map((p) => ({
			name: p.name,
			pos: p.pos,
			group: GROUPS[p.group].label,
			status: p.status,
			practice: practiceOf(p),
			injury: p.injury,
			starter: p.starter,
			trail: trailSteps(p).map((s) => ({ day: s.day, practice: s.practice, label: s.label })),
			trend: practiceTrend(p),
		})),
		more: Math.max(0, sorted.length - max),
		cleared: t.injuries.players.length - flagged.length,
		empty: w === null ? "No report yet." : "Nobody at a tracked position is limited or out.",
	}
}

export function buildMatchupSpec(data: UnitsData, a: string, b: string, size: ShareSize, view: MatchupView = "overview"): MatchupCardSpec | null {
	const ta = data.teams[a]
	const tb = data.teams[b]
	if (!ta || !tb || a === b) return null
	const rows = matchupRows(data, a, b)
	if (!rows.length) return null
	const names = { [a]: teamByAbbr(a).nick, [b]: teamByAbbr(b).nick }
	const edge = paperEdge(rows, a)
	const [ca, cb] = cardColors(a, b)
	const board = new Map(boardRows(data).map((r) => [r.abbr, r.compositeRank]))
	const team = (abbr: string, t: UnitTeam, color: string): CardTeam => ({
		abbr,
		nick: teamByAbbr(abbr).nick,
		name: teamByAbbr(abbr).name,
		color,
		record: recText({ w: t.w, l: t.l, t: t.t }),
		off: t.overall.off?.rank ?? null,
		def: t.overall.def?.rank ?? null,
		overall: board.get(abbr) ?? 0,
	})
	const slate = data.slate?.games.find((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a)) ?? null
	const lead: TeamSide | null = Math.abs(edge) < 6 ? null : edge > 0 ? 0 : 1
	const n = teamCount(data)
	const base: Base = {
		type: "matchup",
		size,
		teams: [team(a, ta, ca), team(b, tb, cb)],
		line: headline(rows, a, b, names),
		week: slate && data.slate ? data.slate.week : null,
		game: slate ? `${names[slate.away]} at ${names[slate.home]}` : null,
		kickoff: slate ? kickoffText(slate.day, slate.time) : null,
		market: slate ? marketLine(slate, names) : null,
		edges: [tally(rows, a).edges, tally(rows, b).edges],
		lead,
		season: data.season,
		through: data.week,
		n,
	}
	const sideIdx = (abbr: string): TeamSide => (abbr === a ? 0 : 1)

	if (view === "pairs") {
		return {
			...base,
			view,
			rows: rows.map((r) => ({
				id: r.pair.id,
				label: r.pair.label,
				attacker: sideIdx(r.attacker),
				attackRank: r.attack.rank,
				defendRank: r.defend.rank,
				attackScore: round1(r.attack.score),
				defendScore: round1(r.defend.score),
				winner: r.tier === "even" ? null : sideIdx(r.edge > 0 ? r.attacker : r.defender),
				big: r.tier === "big",
			})),
		}
	}

	if (view === "tape") {
		const groups: TapeGroup[] = []
		for (const key of GROUP_ORDER) {
			const ga = ta.groups[key]
			const gb = tb.groups[key]
			if (ga.score === null || gb.score === null) continue
			const diff = ga.score - gb.score
			const tier = tierOf(Math.abs(diff))
			groups.push({ key, label: GROUPS[key].label, off: GROUPS[key].side === "off", a: { score: round1(ga.score), rank: ga.rank }, b: { score: round1(gb.score), rank: gb.rank }, winner: tier === "even" ? null : diff > 0 ? 0 : 1, big: tier === "big" })
		}
		return groups.length ? { ...base, view, groups } : null
	}

	if (view === "style") {
		const side = (t: UnitTeam, off: boolean, key: string): StyleSide | null => {
			const m = (off ? t.style.off : t.style.def)[key]
			return m ? { text: formatStyle(key, m.v), rank: m.rank, pct: n < 2 ? 0.5 : (n - m.rank) / (n - 1) } : null
		}
		const out: StyleRow[] = []
		for (const off of [true, false]) {
			for (const key of off ? STYLE_ORDER.off : STYLE_ORDER.def) out.push({ key, label: STYLE[key].label, off, a: side(ta, off, key), b: side(tb, off, key) })
		}
		return out.some((r) => r.a || r.b) ? { ...base, view, rows: out } : null
	}

	if (view === "coaches") {
		const c = coachRows(ta, tb, a, b, size)
		return c ? { ...base, view, coaches: [{ name: ta.coach!.name }, { name: tb.coach!.name }], rows: c.rows, meetings: c.meetings, note: c.note } : null
	}

	if (view === "injuries") {
		const stamp = data.injuriesUpdatedAt ? updatedText(data.injuriesUpdatedAt) : null
		return { ...base, view, sides: [hurtSide(ta, base.week, size, stamp), hurtSide(tb, base.week, size, stamp)] }
	}

	const radar: Spoke[] = GROUP_ORDER.map((key) => ({
		key,
		label: RADAR_LABEL[key],
		off: GROUPS[key].side === "off",
		ranks: [ta.groups[key].rank, tb.groups[key].rank],
		a: ta.groups[key].score === null ? 0.5 : round1(ta.groups[key].score!) / 100,
		b: tb.groups[key].score === null ? 0.5 : round1(tb.groups[key].score!) / 100,
	}))
	const picks: Array<{ team: TeamSide; r: MatchupRow }> = [...topEdges(rows, a, 3).map((r) => ({ team: 0 as TeamSide, r })), ...topEdges(rows, b, 3).map((r) => ({ team: 1 as TeamSide, r }))]
		.sort((x, y) => Math.abs(y.r.edge) - Math.abs(x.r.edge))
		.slice(0, 3)
	const callouts: Callout[] = picks.map(({ team: side, r }) => ({ team: side, big: r.tier === "big", text: edgeSentence(r, side === 0 ? a : b, names) }))
	const verdict = lead === null ? "A toss-up on paper" : `${names[lead === 0 ? a : b]} hold the edge on paper`
	return { ...base, view: "overview", radar, callouts, verdict }
}

export const matchupCardSize = (spec: Pick<MatchupCardSpec, "size">) => SIZE_PIXELS[spec.size]

export function renderMatchupCard(spec: MatchupCardSpec): ReactElement {
	return renderMatchupView(spec)
}
