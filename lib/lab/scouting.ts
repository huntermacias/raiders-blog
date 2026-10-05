// Scouting reports: how every team has played so far this season, and where the Raiders match up
// against the next opponent. The numbers come from scripts/lab/build_scouting.py (nflverse
// play-by-play, CC BY 4.0). Rank 1 is always the best in the league at that thing, so for a
// defense rank 1 means it allows the least.

import { getScouting } from "./data"

export type Metric = { v: number; rank: number } | null
export type Side = Record<string, Metric>
export type TeamScout = { g: number; off: Side; def: Side }

export type ScoutingData = {
	season: number
	generatedAt: string
	source: string
	league: { off: Record<string, number>; def: Record<string, number> }
	teams: Record<string, TeamScout>
}

export const TEAM = "LV"

/** The measures that get ranked and compared, in the order they appear. */
export const KEYS = ["epa", "epaPass", "epaRush", "success", "explosive", "third", "redZone", "sackRate", "turnovers", "points"] as const
export type Key = (typeof KEYS)[number]

type Fmt = "epa" | "pct" | "pts" | "per"

const LABELS: Record<Key | "pass", { off: string; def: string; fmt: Fmt }> = {
	epa: { off: "Points added per play", def: "Points allowed per play", fmt: "epa" },
	epaPass: { off: "Passing, per play", def: "Pass defense, per play", fmt: "epa" },
	epaRush: { off: "Running, per play", def: "Run defense, per play", fmt: "epa" },
	success: { off: "Plays that keep the drive on track", def: "Plays stopped short", fmt: "pct" },
	explosive: { off: "Big plays", def: "Big plays allowed", fmt: "pct" },
	third: { off: "Third-down conversions", def: "Third-down stops", fmt: "pct" },
	redZone: { off: "Red zone touchdowns", def: "Red zone touchdowns allowed", fmt: "pct" },
	sackRate: { off: "Protecting the quarterback", def: "Sacks", fmt: "pct" },
	turnovers: { off: "Taking care of the ball", def: "Takeaways", fmt: "per" },
	points: { off: "Points scored", def: "Points allowed", fmt: "pts" },
	pass: { off: "Pass rate", def: "Pass rate faced", fmt: "pct" },
}

export function labelFor(key: Key | "pass", side: "off" | "def"): string {
	return LABELS[key][side]
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

export function formatValue(key: Key | "pass", v: number): string {
	switch (LABELS[key].fmt) {
		case "epa":
			return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`
		case "pct":
			return `${(v * 100).toFixed(key === "sackRate" ? 1 : 0)}%`
		case "pts":
			return v.toFixed(1)
		case "per":
			return `${v.toFixed(1)} a game`
	}
}

export function teamScout(abbr: string): TeamScout | null {
	return getScouting().teams[abbr] ?? null
}

export function sampleNote(g: number): string {
	if (g <= 0) return "No games yet."
	if (g < 4) return `Only ${g} game${g === 1 ? "" : "s"} so far, so treat this as a first look.`
	if (g < 8) return `${g} games in. Samples are still small, so a rank can move a lot in a week.`
	return `${g} games of play-by-play.`
}

export type Matchup = {
	key: Key
	/** "ours": the Raiders have the ball. "theirs": the opponent has it. */
	unit: "ours" | "theirs"
	label: string
	ours: { v: number; rank: number }
	theirs: { v: number; rank: number }
	/** Positive when the matchup favors the Raiders: the other side's rank minus ours. */
	edge: number
	text: string
}

function sentence(unit: "ours" | "theirs", opp: string, mine: { rank: number }, other: { rank: number }): string {
	// Our own unit first, then the one it faces. `opp` is the team's nickname: "Chiefs".
	if (unit === "ours") return `Our offense ranks ${ordinal(mine.rank)}. The ${opp} defense ranks ${ordinal(other.rank)}.`
	return `The ${opp} offense ranks ${ordinal(other.rank)}. Our defense ranks ${ordinal(mine.rank)}.`
}

/**
 * Every offense-versus-defense pairing between the Raiders and an opponent, most lopsided first.
 * An edge of +10 means the other team ranks 10 places worse at its side of that matchup than we do.
 */
export function matchups(oppAbbr: string, opp: string = oppAbbr): Matchup[] {
	const lv = teamScout(TEAM)
	const them = teamScout(oppAbbr)
	if (!lv || !them) return []
	const out: Matchup[] = []
	for (const key of KEYS) {
		const ourOff = lv.off[key]
		const theirDef = them.def[key]
		if (ourOff && theirDef) {
			out.push({
				key,
				unit: "ours",
				label: LABELS[key].off,
				ours: ourOff,
				theirs: theirDef,
				edge: theirDef.rank - ourOff.rank,
				text: sentence("ours", opp, ourOff, theirDef),
			})
		}
		const theirOff = them.off[key]
		const ourDef = lv.def[key]
		if (theirOff && ourDef) {
			out.push({
				key,
				unit: "theirs",
				label: LABELS[key].def,
				ours: ourDef,
				theirs: theirOff,
				edge: theirOff.rank - ourDef.rank,
				text: sentence("theirs", opp, ourDef, theirOff),
			})
		}
	}
	return out.sort((a, b) => b.edge - a.edge)
}

export type Watch = { kind: "edge" | "danger"; headline: string; detail: string }

/** Three things to watch: our best matchup, their best matchup against us, and one more. */
export function watchList(oppAbbr: string, opp: string = oppAbbr): Watch[] {
	const all = matchups(oppAbbr, opp)
	if (all.length < 2) return []
	// Only pairings where someone is actually good count as a headline: a rank-25 offense meeting a
	// rank-25 defense is not news. The Raiders' side must be a real strength for an edge, and the
	// opponent's side a real strength for a danger.
	const strong = (m: Matchup, side: "ours" | "theirs") => (side === "ours" ? m.ours.rank : m.theirs.rank) <= 16
	const edges = all.filter((m) => m.edge >= 8 && strong(m, "ours"))
	const dangers = all.filter((m) => m.edge <= -8 && strong(m, "theirs")).reverse()
	const out: Watch[] = []
	const used = new Set<Matchup>()
	const push = (m: Matchup | undefined) => {
		if (!m || used.has(m)) return
		used.add(m)
		out.push({
			kind: m.edge > 0 ? "edge" : "danger",
			headline: `${m.edge > 0 ? "Raiders edge" : "Watch out"}: ${m.label.toLowerCase()}`,
			detail: m.text,
		})
	}
	push(edges[0])
	push(dangers[0])
	push(edges[1] ?? dangers[1])
	return out
}

/** The one line a card or preview leads with. */
export function scoutLine(oppAbbr: string, opp: string = oppAbbr): string {
	const w = watchList(oppAbbr, opp)
	if (!w.length) return `How the Raiders match up with ${opp}, from this season's play-by-play.`
	return w[0].detail
}

/** Where a team's offense and defense stand overall, by points added per play. */
export function overall(abbr: string): { off: number | null; def: number | null; g: number } | null {
	const t = teamScout(abbr)
	if (!t) return null
	return { off: t.off.epa?.rank ?? null, def: t.def.epa?.rank ?? null, g: t.g }
}

/** Team strengths and weaknesses: the three ranks furthest from the middle on each side. */
export function standouts(abbr: string, side: "off" | "def"): { strengths: Array<{ key: Key; v: number; rank: number }>; weaknesses: Array<{ key: Key; v: number; rank: number }> } {
	const t = teamScout(abbr)
	if (!t) return { strengths: [], weaknesses: [] }
	const rows = KEYS.flatMap((key) => {
		const m = t[side][key]
		return m ? [{ key, v: m.v, rank: m.rank }] : []
	}).sort((a, b) => a.rank - b.rank)
	return { strengths: rows.slice(0, 3), weaknesses: rows.slice(-3).reverse() }
}
