// The players section of a game report: who played best on each side, with the numbers the box score leaves out. The lines come from the
// Lab's game file (play-by-play); the names, positions and headshots come from the Player Lab roster, matched on the league's player id.
// Pure: the roster is passed in.

import type { BoxDefender, BoxPasser, BoxReceiver, BoxRusher, GameBox } from "../lab/types"
import { signed, percent } from "./metrics"

export type RosterEntry = { name: string; pos: string; slug: string; team: string; espn?: number; shot?: string }
export type Roster = Map<string, RosterEntry>

export type Chip = { label: string; value: string; tone?: "good" | "bad" }

export type Performer = {
	side: "me" | "opp"
	kind: "pass" | "rush" | "rec" | "def"
	id: string
	name: string
	pos: string
	/** The Player Lab page, when he has one. */
	slug: string | null
	espn?: number
	shot?: string
	/** The line a box score would print. */
	line: string
	chips: Chip[]
	/** Points of expected value he added, or the equivalent for a defender; used to order and to pick the standout. */
	impact: number
}

const fixed = (v: number | null, d = 1): string => (v == null ? "—" : v.toFixed(d))
const tone = (v: number | null, good: number, bad: number): "good" | "bad" | undefined => (v == null ? undefined : v >= good ? "good" : v <= bad ? "bad" : undefined)

/** "K.Cousins" is all the play-by-play has; the roster knows the rest. */
function identify(id: string, short: string, roster: Roster, fallbackPos: string): Pick<Performer, "name" | "pos" | "slug" | "espn" | "shot"> {
	const hit = roster.get(id)
	return hit ? { name: hit.name, pos: hit.pos, slug: hit.slug, espn: hit.espn, shot: hit.shot } : { name: short, pos: fallbackPos, slug: null }
}

function passer(p: BoxPasser, side: Performer["side"], roster: Roster): Performer {
	const line = [`${p.cmp}/${p.att}`, `${p.yds} YDS`, p.td ? `${p.td} TD` : "", p.int ? `${p.int} INT` : "", p.sacks ? `${p.sacks} sacked` : ""].filter(Boolean).join(", ")
	return {
		side, kind: "pass", id: p.id, ...identify(p.id, p.name, roster, "QB"), line,
		chips: [
			{ label: "EPA per dropback", value: p.epa == null ? "—" : signed(p.epa), tone: tone(p.epa, 0.15, -0.1) },
			{ label: "Success", value: p.success == null ? "—" : percent(p.success), tone: tone(p.success, 0.5, 0.4) },
			{ label: "CPOE", value: p.cpoe == null ? "—" : `${p.cpoe > 0 ? "+" : p.cpoe < 0 ? "−" : ""}${Math.abs(p.cpoe).toFixed(1)}`, tone: tone(p.cpoe, 3, -3) },
			{ label: "Avg. depth", value: p.adot == null ? "—" : `${fixed(p.adot)} yds` },
		],
		impact: (p.epa ?? 0) * p.dropbacks,
	}
}

function rusher(p: BoxRusher, side: Performer["side"], roster: Roster): Performer {
	const line = [`${p.car} CAR`, `${p.yds} YDS`, p.td ? `${p.td} TD` : "", `long ${p.long}`].filter(Boolean).join(", ")
	return {
		side, kind: "rush", id: p.id, ...identify(p.id, p.name, roster, "RB"), line,
		chips: [
			{ label: "EPA per carry", value: p.epa == null ? "—" : signed(p.epa), tone: tone(p.epa, 0.05, -0.2) },
			{ label: "Success", value: p.success == null ? "—" : percent(p.success), tone: tone(p.success, 0.5, 0.35) },
			{ label: "Runs of 10+", value: String(p.explosive) },
			{ label: "Per carry", value: `${(p.yds / Math.max(1, p.car)).toFixed(1)} yds` },
		],
		impact: (p.epa ?? 0) * p.car,
	}
}

function receiver(p: BoxReceiver, side: Performer["side"], roster: Roster): Performer {
	const line = [`${p.rec} REC`, `${p.yds} YDS`, p.td ? `${p.td} TD` : "", `${p.tgt} TGT`].filter(Boolean).join(", ")
	return {
		side, kind: "rec", id: p.id, ...identify(p.id, p.name, roster, "WR"), line,
		chips: [
			{ label: "EPA per target", value: p.epa == null ? "—" : signed(p.epa), tone: tone(p.epa, 0.2, -0.15) },
			{ label: "Catch rate", value: percent(p.rec / Math.max(1, p.tgt)) },
			{ label: "Air yards", value: String(p.air) },
			{ label: "After catch", value: `${p.yac} yds` },
		],
		impact: (p.epa ?? 0) * p.tgt,
	}
}

function defender(p: BoxDefender, side: Performer["side"], roster: Roster): Performer {
	const line = [`${p.tkl} TOT`, p.sack ? `${p.sack} ${p.sack === 1 ? "SACK" : "SACKS"}` : "", p.tfl ? `${p.tfl} TFL` : "", p.int ? `${p.int} INT` : "", p.pd ? `${p.pd} PD` : "", p.ff ? `${p.ff} FF` : ""].filter(Boolean).join(", ")
	const chips: Chip[] = [{ label: "Tackles", value: String(p.tkl) }]
	if (p.sack) chips.push({ label: "Sacks", value: String(p.sack), tone: "good" })
	if (p.hit) chips.push({ label: "QB hits", value: String(p.hit) })
	if (p.tfl) chips.push({ label: "For loss", value: String(p.tfl), tone: "good" })
	if (p.pd) chips.push({ label: "Passes defended", value: String(p.pd) })
	if (p.int) chips.push({ label: "Interceptions", value: String(p.int), tone: "good" })
	if (p.ff) chips.push({ label: "Forced fumbles", value: String(p.ff), tone: "good" })
	return {
		side, kind: "def", id: p.id, ...identify(p.id, p.name, roster, "DEF"), line, chips: chips.slice(0, 4),
		// About what each kind of play is worth to a defense, in points.
		impact: p.tkl * 0.12 + p.sack * 1.0 + p.hit * 0.25 + p.tfl * 0.5 + p.pd * 0.3 + p.int * 2.5 + p.ff * 1.0,
	}
}

/** One side's players worth a card: the quarterback, the lead runner, the top two receivers and the two busiest defenders. */
export function sidePerformers(box: GameBox["players"]["me"], side: Performer["side"], roster: Roster): Performer[] {
	const out: Performer[] = []
	const qb = box.pass.find((p) => p.dropbacks >= 10)
	if (qb) out.push(passer(qb, side, roster))
	const rb = box.rush.find((p) => p.car >= 4 && roster.get(p.id)?.pos !== "QB") ?? box.rush.find((p) => p.car >= 4)
	if (rb) out.push(rusher(rb, side, roster))
	for (const r of box.rec.filter((x) => x.tgt >= 3).slice(0, 2)) out.push(receiver(r, side, roster))
	for (const d of box.def.filter((x) => x.tkl + x.sack + x.int + x.pd > 0).slice(0, 2)) out.push(defender(d, side, roster))
	return out
}

export type Standout = { performer: Performer; why: string }

/** The player who added the most, whichever team: a one-line reason in plain words. */
export function standout(all: Performer[]): Standout | null {
	if (!all.length) return null
	const best = all.reduce((a, b) => (b.impact > a.impact ? b : a))
	if (best.impact <= 0) return null
	const why =
		best.kind === "pass" ? "Added the most expected points of anyone on the field."
		: best.kind === "rush" ? "Made the most of his carries of anyone on the field."
		: best.kind === "rec" ? "Added the most expected points as a target."
		: "Made the most plays on defense."
	return { performer: best, why }
}

export function buildRoster(rows: { id: string; name: string; pos: string; slug: string; team: string; espn?: number; shot?: string }[]): Roster {
	return new Map(rows.map((r) => [r.id, { name: r.name, pos: r.pos, slug: r.slug, team: r.team, espn: r.espn, shot: r.shot }]))
}
