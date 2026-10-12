// Player movers: who is playing better or worse than he was, in numbers the box score hides.
//
// scripts/lab/build_players.py grades every Raiders player on a few advanced stats against the league's players at his position, on
// the scouting scale (50 is average, every 10 points is one standard deviation, and a higher grade is always better). Each stat comes
// in three slices: the whole season, the last two games ("form") and everything before that ("earlier"). A mover is the average
// change in grade from earlier to form. This file turns that into words and lists. Pure functions of the data they are handed; like
// unitsKit.ts it imports no data, so the server, the browser and the tests can all run it.

import { ordinal } from "./unitsKit"

export { ordinal }

export type PlayerGroup = "qb" | "rec" | "run" | "rush" | "rund" | "cov"
export type Slice = { v: number; n: number; pct: number | null; g: number | null } | null
export type PlayerStat = { k: string; season: Slice; form: Slice; earlier: Slice; delta?: number }
export type Mover = { score: number; driver: string; stats: number; agree: number }
export type WeekPoint = { w: number; opp: string; v: number | null; n: number }
export type PlayerRow = {
	id: string
	name: string
	pos: string
	group: PlayerGroup
	games: number
	stats: PlayerStat[]
	mover: Mover | null
	weekly: WeekPoint[]
	snaps: { season: number | null; form: number | null; earlier: number | null }
}
export type PlayersData = {
	season: number
	week: number
	team: string
	generatedAt: string
	source: string
	formGames: number
	formWeeks: number[]
	defFormWeeks: number[]
	defWeek: number
	games: { w: number; opp: string }[]
	leagueN: Partial<Record<PlayerGroup, number>>
	players: PlayerRow[]
}

export const GROUP_ORDER: PlayerGroup[] = ["qb", "rec", "run", "rush", "rund", "cov"]
export const GROUP_LABEL: Record<PlayerGroup, { title: string; peers: string }> = {
	qb: { title: "Quarterback", peers: "quarterbacks" },
	rec: { title: "Receivers", peers: "receivers and tight ends" },
	run: { title: "Running backs", peers: "running backs" },
	rush: { title: "Pass rush", peers: "linemen and edge rushers" },
	rund: { title: "Linebackers", peers: "linebackers" },
	cov: { title: "Secondary", peers: "defensive backs" },
}

// ---------------------------------------------------------------------------------------------- the stats

const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`
const pct0 = (v: number) => `${(v * 100).toFixed(0)}%`
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`

export type StatInfo = {
	label: string
	/** One sentence a fan can use: what it counts and why the box score misses it. */
	what: string
	fmt: (v: number) => string
	/** True when more is better, false when less is better, null when it only describes a style. Mirrors STATS in build_players.py. */
	higher: boolean | null
	/** What the number is out of, for "(13 targets)". */
	per: string
}

const EPA_NOTE = "Expected points added: how much each play moved the team's scoring chances, which a yard total cannot say."

export const STAT: Record<PlayerGroup, Record<string, StatInfo>> = {
	qb: {
		epaDb: { label: "EPA per dropback", what: `${EPA_NOTE} Counts sacks and scrambles, so it is the whole of what he does when he drops back.`, fmt: (v) => signed(v, 2), higher: true, per: "dropbacks" },
		success: { label: "Success rate", what: "How often a dropback keeps the offense on schedule: enough yards for the down, not just a gain.", fmt: pct0, higher: true, per: "dropbacks" },
		cpoe: { label: "Accuracy over expected", what: "His completion rate compared with what the difficulty of each throw predicted (depth, pressure, where the receiver was). Plus means he is making throws he should not.", fmt: (v) => `${signed(v, 1)} pts`, higher: true, per: "throws" },
		badThrow: { label: "Bad throws", what: "The share of his attempts that Pro Football Reference's charters called a bad throw: off target, not just incomplete. Fewer is better.", fmt: pct1, higher: false, per: "attempts" },
		adot: { label: "Average depth of throw", what: "How far past the line of scrimmage he is throwing on average. It is a style, not a grade.", fmt: (v) => `${v.toFixed(1)} yds`, higher: null, per: "throws" },
	},
	rec: {
		epaTgt: { label: "EPA per target", what: `${EPA_NOTE} Every target counts, caught or not, so a receiver cannot hide behind a catch total.`, fmt: (v) => signed(v, 2), higher: true, per: "targets" },
		croe: { label: "Catches over expected", what: "His catch rate compared with what each target's difficulty predicted. Plus means he is catching balls most receivers would not.", fmt: (v) => `${signed(v * 100, 1)} pts`, higher: true, per: "targets" },
		yacOe: { label: "Yards after catch over expected", what: "The yards he gains after the catch compared with what a typical receiver gets from that spot. It separates the player who makes defenders miss from the one who is simply open.", fmt: (v) => `${signed(v, 1)} yds`, higher: true, per: "catches" },
		drop: { label: "Drop rate", what: "Passes charted as drops, per target. Fewer is better.", fmt: pct1, higher: false, per: "targets" },
		share: { label: "Share of the team's passes", what: "The portion of the team's pass attempts thrown his way in the games he was targeted in. It shows whether he is the focus of the offense.", fmt: pct0, higher: true, per: "team attempts" },
		adot: { label: "Average depth of target", what: "How far downfield his targets are. It is a role, not a grade.", fmt: (v) => `${v.toFixed(1)} yds`, higher: null, per: "targets" },
	},
	run: {
		epaRush: { label: "EPA per carry", what: `${EPA_NOTE} A run for 4 yards on 3rd-and-8 can lose points even though the box score shows a gain.`, fmt: (v) => signed(v, 2), higher: true, per: "carries" },
		success: { label: "Success rate", what: "How often a carry gains enough to keep the offense on schedule.", fmt: pct0, higher: true, per: "carries" },
		explosive: { label: "Explosive runs", what: "The share of his carries that go 10 yards or more.", fmt: pct1, higher: true, per: "carries" },
		yco: { label: "Yards after contact", what: "Yards he gains per carry after the first defender touches him. This is the part the back creates, not the blockers.", fmt: (v) => `${v.toFixed(1)} yds`, higher: true, per: "carries" },
		broken: { label: "Broken tackles", what: "Tackles he breaks per carry, as charted by Pro Football Reference.", fmt: (v) => `${(v * 100).toFixed(1)} per 100`, higher: true, per: "carries" },
		ybc: { label: "Yards before contact", what: "Yards per carry before a defender touches him. That is mostly the line and the blocking scheme, so it is shown, not graded.", fmt: (v) => `${v.toFixed(1)} yds`, higher: null, per: "carries" },
	},
	rush: {
		pressRate: { label: "Pressures per 100 snaps", what: "Sacks, hits and hurries as Pro Football Reference charts them, for every 100 snaps he plays. It is the pass rusher's real production; sacks alone miss most of it.", fmt: (v) => v.toFixed(1), higher: true, per: "snaps" },
		missedPct: { label: "Missed tackles", what: "The share of his tackle chances he missed. Fewer is better.", fmt: pct0, higher: false, per: "tackle chances" },
	},
	rund: {
		missedPct: { label: "Missed tackles", what: "The share of his tackle chances he missed. Fewer is better.", fmt: pct0, higher: false, per: "tackle chances" },
		tackleRate: { label: "Tackles per 100 snaps", what: "Tackles for every 100 snaps he plays. It shows how often the ball is finding him.", fmt: (v) => v.toFixed(1), higher: true, per: "snaps" },
	},
	cov: {
		yardsTgt: { label: "Yards allowed per target", what: "The yards the receiver he is covering gets each time he is targeted. Fewer is better.", fmt: (v) => v.toFixed(1), higher: false, per: "targets" },
		rating: { label: "Passer rating allowed", what: "The passer rating of quarterbacks throwing at him. 158.3 is perfect for the passer; lower is better for the defender.", fmt: (v) => v.toFixed(0), higher: false, per: "targets" },
		missedPct: { label: "Missed tackles", what: "The share of his tackle chances he missed. Fewer is better.", fmt: pct0, higher: false, per: "tackle chances" },
	},
}

/** The stat a player's weekly bars and one-line summary follow. Mirrors HEADLINE in build_players.py. */
export const HEADLINE: Record<PlayerGroup, string> = { qb: "epaDb", rec: "epaTgt", run: "epaRush", rush: "pressRate", rund: "missedPct", cov: "yardsTgt" }

export function statInfo(group: PlayerGroup, key: string): StatInfo | null {
	return STAT[group]?.[key] ?? null
}

export function formatStat(group: PlayerGroup, key: string, v: number | null | undefined): string {
	if (v === null || v === undefined || Number.isNaN(v)) return "–"
	return statInfo(group, key)?.fmt(v) ?? String(v)
}

// ---------------------------------------------------------------------------------------------- grades in words

/** A scouting-scale grade in words, so "62" reads without a legend. */
export function gradeWord(g: number | null | undefined): string {
	if (g === null || g === undefined || Number.isNaN(g)) return "not enough yet"
	if (g >= 70) return "elite"
	if (g >= 60) return "well above average"
	if (g >= 55) return "above average"
	if (g > 45) return "about average"
	if (g > 40) return "below average"
	if (g > 30) return "well below average"
	return "among the worst"
}

/** Mean grade over the player's graded stats in one slice: where he sits in the league in that stretch. */
export function level(p: PlayerRow, slice: "season" | "form" | "earlier"): number | null {
	// Drop rate is left out for the same reason it is left out of the mover score: it is mostly zeros.
	const gs = p.stats.filter((s) => statInfo(p.group, s.k)?.higher !== null && s.k !== "drop" && typeof s[slice]?.g === "number").map((s) => s[slice]!.g as number)
	if (!gs.length) return null
	return gs.reduce((a, b) => a + b, 0) / gs.length
}

// ---------------------------------------------------------------------------------------------- movers

/** Below this, a change is noise; a faller or riser is at least this many grade points. */
export const MOVE_MIN = 3

export type MoverTier = "hot" | "cold" | "steady"

export function tierOf(p: PlayerRow): MoverTier {
	const s = p.mover?.score
	if (s === undefined) return "steady"
	return s >= MOVE_MIN ? "hot" : s <= -MOVE_MIN ? "cold" : "steady"
}

export function players(data: PlayersData, group?: PlayerGroup): PlayerRow[] {
	return data.players.filter((p) => !group || p.group === group)
}

/** The players moving up and down the most, biggest first. Players with no mover score (too little recent volume) are left out. */
export function risersFallers(data: PlayersData, limit = 4): { risers: PlayerRow[]; fallers: PlayerRow[] } {
	const scored = data.players.filter((p) => p.mover)
	const risers = scored.filter((p) => tierOf(p) === "hot").sort((a, b) => b.mover!.score - a.mover!.score || a.name.localeCompare(b.name))
	const fallers = scored.filter((p) => tierOf(p) === "cold").sort((a, b) => a.mover!.score - b.mover!.score || a.name.localeCompare(b.name))
	return { risers: risers.slice(0, limit), fallers: fallers.slice(0, limit) }
}

export function statOf(p: PlayerRow, key: string): PlayerStat | null {
	return p.stats.find((s) => s.k === key) ?? null
}

/** The stat that moved a player the most, if he has a mover score. */
export function driverOf(p: PlayerRow): PlayerStat | null {
	return p.mover ? statOf(p, p.mover.driver) : null
}

/** "Last 2 games" or "Last game", for the window a player's recent form covers. */
export function formName(data: PlayersData, group: PlayerGroup): string {
	const weeks = group === "rush" || group === "rund" || group === "cov" ? data.defFormWeeks : data.formWeeks
	return weeks.length === 1 ? "Last game" : `Last ${weeks.length} games`
}

/** The week range the recent window covers, e.g. "Weeks 4 and 5". */
export function formWeeks(data: PlayersData, group: PlayerGroup): string {
	const weeks = group === "rush" || group === "rund" || group === "cov" ? data.defFormWeeks : data.formWeeks
	if (!weeks.length) return ""
	if (weeks.length === 1) return `Week ${weeks[0]}`
	return `Weeks ${weeks.slice(0, -1).join(", ")} and ${weeks[weeks.length - 1]}`
}

/**
 * One plain sentence on why a player moved: the stat that changed the most, now against before.
 * "EPA per target is +0.42 over the last 2 games (13 targets), against +0.12 before that."
 */
export function describeMove(data: PlayersData, p: PlayerRow): string {
	const d = driverOf(p)
	const info = d ? statInfo(p.group, d.k) : null
	if (!d || !info || !d.form || !d.earlier) return ""
	const f = formatStat(p.group, d.k, d.form.v)
	const e = formatStat(p.group, d.k, d.earlier.v)
	const recent = formName(data, p.group).toLowerCase()
	return `${info.label} is ${f} over the ${recent} (${Math.round(d.form.n)} ${info.per}), against ${e} before that.`
}

/** "Mixed" when the stats disagree on which way he moved, so a reader is not told a flat story about a split picture. */
export function isMixed(p: PlayerRow): boolean {
	return Boolean(p.mover && p.mover.stats >= 3 && p.mover.agree / p.mover.stats < 0.75)
}

/** "+4.2" for a grade change, with a real minus sign. */
export function moveText(score: number): string {
	return signed(score, 1)
}

// ---------------------------------------------------------------------------------------------- standouts

export type Standout = { player: PlayerRow; stat: PlayerStat; info: StatInfo; pct: number; g: number }

/** The stats that make a player stand out over the whole season: best and worst percentile among his league peers. */
export function standouts(data: PlayersData, opts: { top?: number; hi?: number; lo?: number } = {}): { best: Standout[]; worst: Standout[] } {
	const { top = 6, hi = 85, lo = 15 } = opts
	const all: Standout[] = []
	for (const p of data.players) {
		// A player only counts for what he is paid to do: a running back's pressure numbers, or a quarterback's share of the team's passes, are not in the data.
		for (const s of p.stats) {
			const info = statInfo(p.group, s.k)
			if (!info || info.higher === null || !s.season || s.season.pct === null || s.season.g === null) continue
			// Drop rate is mostly zeros, which makes everyone with no drops a "best in the league".
			if (s.k === "drop") continue
			all.push({ player: p, stat: s, info, pct: s.season.pct, g: s.season.g })
		}
	}
	const best = all.filter((x) => x.pct >= hi).sort((a, b) => b.g - a.g || a.player.name.localeCompare(b.player.name))
	const worst = all.filter((x) => x.pct <= lo).sort((a, b) => a.g - b.g || a.player.name.localeCompare(b.player.name))
	return { best: best.slice(0, top), worst: worst.slice(0, top) }
}

/** A short line for a standout: "88th percentile among receivers and tight ends". */
export function standoutLine(data: PlayersData, x: Standout): string {
	return `${x.info.label} ${formatStat(x.player.group, x.stat.k, x.stat.season?.v)}: ${ordinal(Math.round(x.pct))} percentile among ${GROUP_LABEL[x.player.group].peers}.`
}

/** The share of the team's snaps, as "78%". */
export function snapText(v: number | null | undefined): string {
	return v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`
}

/** A change in snap share worth saying out loud: his role grew or shrank by at least this much between earlier and form. */
export const ROLE_MOVE = 0.15

export function roleMove(p: PlayerRow): "up" | "down" | null {
	const { form, earlier } = p.snaps
	if (form === null || earlier === null) return null
	if (form - earlier >= ROLE_MOVE) return "up"
	if (earlier - form >= ROLE_MOVE) return "down"
	return null
}

/** Players whose playing time changed a lot, which is often the first sign that something else is about to. */
export function roleMovers(data: PlayersData): PlayerRow[] {
	return data.players
		.filter((p) => roleMove(p) !== null && (p.snaps.season ?? 0) >= 0.1)
		.sort((a, b) => Math.abs((b.snaps.form ?? 0) - (b.snaps.earlier ?? 0)) - Math.abs((a.snaps.form ?? 0) - (a.snaps.earlier ?? 0)))
}
