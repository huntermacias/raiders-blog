import type { Drive, DrivePlay } from "./types"

export type Outcome =
	| "gain"
	| "loss"
	| "incomplete"
	| "touchdown"
	| "punt"
	| "fieldgoal-good"
	| "fieldgoal-miss"
	| "penalty"
	| "turnover"
	| "kneel"

export type Frame = {
	n: number
	down: number | null
	ytg: number
	/** Line of scrimmage, 0 to 100 from the offense's own goal line. */
	from: number
	/** Where the ball ends, 0 to 100. Kicks land where the text says. */
	to: number
	/** First-down marker, null on 4th-and-goal style plays beyond the end zone. */
	firstDownAt: number | null
	outcome: Outcome
	/** The kind of play in the log: run, pass, punt, field_goal, ... */
	type: string
	/** True when the ball travels through the air (pass, punt, field goal). */
	arc: boolean
	downLabel: string
	text: string
	yards: number
	/** Third of the field the play went to (offense's left, middle, right), or null when the log has none. */
	lane: "L" | "M" | "R" | null
	/** Run gap: E end, T tackle, G guard. */
	gap: "E" | "T" | "G" | null
	/** Yard line where a pass was caught (or picked off), from the air yards. */
	catchAt: number | null
	/** Yard line an incomplete pass was thrown to. */
	incompleteTo: number | null
	/** Across the field, as a fraction of width from the middle (negative = offense's left = up on screen):
	 *  where the ball is snapped, where the throw arrives, and where the play ends. */
	y0: number
	yc: number
	y1: number
	/** Yards the pass traveled in the air, and yards gained after the catch (null when the log has none). */
	ay: number | null
	yac: number | null
	/** The play earned a first down (not counting a touchdown). */
	firstDown: boolean
	/** A pass play that ended in a sack. */
	sack: boolean
	/** Expected points added and win probability added (a fraction), when the log has them. */
	epa: number | null
	wpa: number | null
	shotgun: boolean
	noHuddle: boolean
	/** Chance the play was a pass before the snap, 0 to 1. */
	xpass: number | null
	/** A deep pass, per the log. */
	deep: boolean
	/** Quarter (5 is overtime), printed clock, seconds elapsed and the Raiders' win probability just before the snap. */
	q?: number
	clk?: string
	el?: number
	w0?: number
	/** Kicks: the length the log gives for a field goal, and how a miss missed. */
	kickYards?: number
	miss?: "left" | "right" | "short" | "blocked"
	/** The miss hit an upright. */
	upright?: boolean
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"]

export function downLabel(dn: number | null, ytg: number, from: number): string {
	if (!dn) return ""
	const goal = from + ytg >= 100
	return `${ORDINAL[dn] ?? `${dn}th`} & ${goal ? "Goal" : ytg}`
}

function clamp(n: number, lo = 0, hi = 100) {
	return Math.min(hi, Math.max(lo, n))
}

function classify(p: DrivePlay): Outcome {
	const t = p.text
	if (p.type === "no_play") return "penalty"
	if (p.type === "punt") return "punt"
	if (p.type === "field_goal") return /is good/i.test(t) ? "fieldgoal-good" : "fieldgoal-miss"
	if (p.type === "qb_kneel" || p.type === "qb_spike") return "kneel"
	if (p.td) return "touchdown"
	if (/INTERCEPTED|FUMBLES/i.test(t)) return "turnover"
	if (/incomplete/i.test(t)) return "incomplete"
	return p.yds < 0 ? "loss" : "gain"
}

/** How far a punt travelled, from "punts 37 yards". Falls back to 40. */
function puntDistance(text: string): number {
	const m = /punts (\d+) yards?/i.exec(text)
	return m ? Number(m[1]) : 40
}

/** The ball is spotted between the hashes, wherever the last play ended. */
export const HASH = 0.11
/** Just inside the sideline, for plays that went out of bounds. */
export const SIDELINE = 0.455

const clampTo = (n: number, lim: number) => Math.min(lim, Math.max(-lim, n))
const sign = (lane: "L" | "M" | "R") => (lane === "L" ? -1 : lane === "R" ? 1 : 0)

/** How far from the middle a run goes: wider for an end run, tighter for a guard gap. */
export function runOffset(lane: "L" | "M" | "R", gap: "E" | "T" | "G" | null): number {
	if (lane === "M") return 0
	const mag = gap === "G" ? 0.1 : gap === "T" ? 0.17 : gap === "E" ? 0.27 : 0.2
	return sign(lane) * mag
}

export function passOffset(lane: "L" | "M" | "R"): number {
	return sign(lane) * 0.28
}

/** Field goal length, and how a miss missed, from the log text. */
function kickFacts(p: DrivePlay, outcome: Outcome): { kickYards?: number; miss?: "left" | "right" | "short" | "blocked"; upright?: boolean } {
	if (outcome !== "fieldgoal-good" && outcome !== "fieldgoal-miss") return {}
	const m = /(\d+) yard field goal/i.exec(p.text)
	const out: { kickYards?: number; miss?: "left" | "right" | "short" | "blocked"; upright?: boolean } = m ? { kickYards: Number(m[1]) } : {}
	if (outcome === "fieldgoal-miss") {
		const t = p.text
		out.miss = /blocked/i.test(t) ? "blocked" : /short/i.test(t) ? "short" : /right/i.test(t) ? "right" : "left"
		if (/upright|post/i.test(t)) out.upright = true
	}
	return out
}

const OUT_OF_BOUNDS = /\b(?:ob|out of bounds)\b/i

export function framesForDrive(drive: Drive): Frame[] {
	// Where the ball is spotted for the next snap.
	let carry = 0
	return drive.plays.map((p) => {
		const outcome = classify(p)
		let to: number
		if (outcome === "touchdown") to = 100
		else if (outcome === "fieldgoal-good") to = 100
		else if (outcome === "fieldgoal-miss") to = clamp(p.x + 17)
		else if (outcome === "punt") to = clamp(p.x + puntDistance(p.text))
		else if (outcome === "incomplete") to = p.x
		else if (p.xe != null) to = clamp(p.xe)
		else to = clamp(p.x + p.yds)
		const fd = p.x + p.ytg
		const lane = p.loc ?? null
		const gap = p.gap ?? null
		const isPass = p.type === "pass"
		const hasAir = isPass && p.ay != null
		const catchAt = hasAir && outcome !== "incomplete" ? clamp(p.x + (p.ay as number)) : null
		const incompleteTo = hasAir && outcome === "incomplete" ? clamp(p.x + Math.max(3, p.ay as number)) : null

		const y0 = clampTo(carry, HASH)
		let yc = y0
		let y1 = y0
		if (p.type === "run" && lane) {
			y1 = runOffset(lane, gap)
			yc = y1
		} else if (isPass && lane) {
			yc = passOffset(lane)
			y1 = yc
		} else if (outcome === "punt" || outcome === "fieldgoal-good" || outcome === "fieldgoal-miss") {
			yc = 0
			y1 = 0
		}
		if (lane && lane !== "M" && OUT_OF_BOUNDS.test(p.text) && outcome !== "incomplete") y1 = sign(lane) * SIDELINE
		// After an incompletion or a penalty the ball goes back where it was.
		carry = outcome === "incomplete" || outcome === "penalty" ? y0 : y1

		return {
			n: p.n,
			down: p.dn,
			ytg: p.ytg,
			from: clamp(p.x),
			to,
			firstDownAt: fd >= 100 ? null : fd,
			outcome,
			type: p.type,
			arc: outcome === "punt" || outcome === "fieldgoal-good" || outcome === "fieldgoal-miss" || outcome === "incomplete" || catchAt != null,
			downLabel: downLabel(p.dn, p.ytg, p.x),
			text: p.text,
			yards: p.yds,
			lane,
			gap,
			catchAt,
			incompleteTo,
			y0,
			yc,
			y1,
			ay: p.ay ?? null,
			yac: p.yac ?? null,
			firstDown: p.fd && outcome !== "touchdown",
			sack: isPass && /\bsacked\b/i.test(p.text),
			epa: p.epa ?? null,
			wpa: p.wpa ?? null,
			shotgun: p.sg === 1,
			noHuddle: p.nh === 1,
			xpass: p.xp ?? null,
			deep: p.pl === "D",
			q: p.q,
			clk: p.clk,
			el: p.el,
			w0: p.w0,
			...kickFacts(p, outcome),
		}
	})
}

const RESULT_LABELS: Record<string, string> = {
	touchdown: "Touchdown",
	"field goal": "Field goal",
	punt: "Punt",
	turnover: "Turnover",
	"end of half": "End of half",
	"missed field goal": "Missed field goal",
	"turnover on downs": "Turnover on downs",
	safety: "Safety",
	"opp touchdown": "Opponent touchdown",
}

export function resultLabel(result: string): string {
	return RESULT_LABELS[result.trim().toLowerCase()] ?? result
}

export type ResultTone = "score" | "stop" | "neutral"

/** Whether a drive result is good for the offense, bad, or neither. */
export function resultTone(result: string): ResultTone {
	const r = result.trim().toLowerCase()
	if (r === "touchdown" || r === "field goal") return "score"
	if (r === "end of half") return "neutral"
	return "stop"
}

/** Short description of a yard-line position for the field labels, e.g. "own 25". */
export function yardLineName(x: number): string {
	const v = Math.round(x)
	if (v === 50) return "50"
	return v < 50 ? `own ${v}` : `opp ${100 - v}`
}

const LANE_WORD = { L: "left", M: "middle", R: "right" } as const
const GAP_WORD = { E: "end", T: "tackle", G: "guard" } as const

/** One short label for what kind of play it was, e.g. "Run left end" or "Pass right". */
export function playKind(f: Frame): string {
	switch (f.outcome) {
		case "punt":
			return "Punt"
		case "fieldgoal-good":
		case "fieldgoal-miss":
			return "Field goal"
		case "kneel":
			return "Kneel"
		case "penalty":
			return "Penalty"
		default:
	}
	if (f.sack) return "Sack"
	if (f.type === "run") {
		if (!f.lane) return "Run"
		if (f.lane === "M") return "Run up the middle"
		return f.gap ? `Run ${LANE_WORD[f.lane]} ${GAP_WORD[f.gap]}` : `Run ${LANE_WORD[f.lane]}`
	}
	if (f.type === "pass") {
		const where = f.lane ? ` ${LANE_WORD[f.lane]}` : ""
		const deep = f.deep ? "deep " : ""
		return f.outcome === "incomplete" ? `Incomplete ${deep}pass${where}` : f.deep ? `Deep pass${where}` : `Pass${where}`
	}
	return "Play"
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : "0")

/** Short facts about a play, for chips under the field. */
export function playFacts(f: Frame): string[] {
	const out: string[] = [f.downLabel || "Kick", `${yardLineName(f.from)} \u2192 ${yardLineName(f.to)}`]
	if (f.outcome === "gain" || f.outcome === "loss" || f.outcome === "touchdown" || f.sack) out.push(`${signed(f.yards)} yds`)
	if (f.type === "pass" && f.ay != null && f.outcome !== "incomplete" && !f.sack) out.push(`${f.ay} air yds`)
	if (f.yac != null && f.outcome !== "incomplete" && f.type === "pass") out.push(`${f.yac} after catch`)
	if (f.outcome === "touchdown") out.push("Touchdown")
	else if (f.firstDown) out.push("First down")
	if (f.outcome === "turnover") out.push("Turnover")
	return out
}

export const fmtEpa = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n).toFixed(2)}`
export const fmtWpa = (n: number) => {
	const pts = n * 100
	return `${pts > 0 ? "+" : pts < 0 ? "\u2212" : ""}${Math.abs(pts).toFixed(1)}%`
}

/** What the log says about how the play was set up and valued, for the detail panel. */
export function playAnalytics(f: Frame): { label: string; value: string }[] {
	const out: { label: string; value: string }[] = []
	if (f.epa != null) out.push({ label: "Expected points added", value: fmtEpa(f.epa) })
	if (f.wpa != null) out.push({ label: "Win probability", value: fmtWpa(f.wpa) })
	if (f.xpass != null) out.push({ label: "Pass odds before the snap", value: `${Math.round(f.xpass * 100)}%` })
	const setup = [f.shotgun ? "Shotgun" : f.type === "run" || f.type === "pass" ? "Under center" : "", f.noHuddle ? "No huddle" : ""].filter(Boolean)
	if (setup.length) out.push({ label: "Setup", value: setup.join(", ") })
	return out
}

/** R run, P pass, K kick, X anything else (penalty, kneel). */
export function kindLetter(f: Frame): "R" | "P" | "K" | "X" {
	if (f.outcome === "punt" || f.outcome === "fieldgoal-good" || f.outcome === "fieldgoal-miss") return "K"
	if (f.outcome === "penalty" || f.outcome === "kneel") return "X"
	if (f.type === "run") return "R"
	if (f.type === "pass") return "P"
	return "X"
}

export type PlayFilter = { kind: "all" | "run" | "pass" | "kick"; down: 0 | 1 | 2 | 3 | 4 }
export const NO_FILTER: PlayFilter = { kind: "all", down: 0 }

export function isFiltering(flt: PlayFilter): boolean {
	return flt.kind !== "all" || flt.down !== 0
}

/** Whether a play passes the filter. Every play passes when nothing is selected. */
export function matchesFilter(f: Frame, flt: PlayFilter): boolean {
	if (flt.kind === "run" && kindLetter(f) !== "R") return false
	if (flt.kind === "pass" && kindLetter(f) !== "P") return false
	if (flt.kind === "kick" && kindLetter(f) !== "K") return false
	if (flt.down !== 0 && f.down !== flt.down) return false
	return true
}

export type DriveStats = {
	plays: number
	runs: { n: number; yds: number }
	passes: { att: number; comp: number; yds: number }
	sacks: number
	firstDowns: number
	thirdDowns: { att: number; conv: number }
	fourthDowns: { att: number; conv: number }
	/** Total expected points added by the drive's plays (null when the log has none). */
	epa: number | null
	/** Plays with positive EPA out of plays with a value. */
	success: { good: number; of: number }
	/** Win probability added over the drive, a fraction. */
	wpa: number | null
	/** Runs of 10 or more yards and passes of 20 or more. */
	explosive: number
}

/** Totals for a drive, from its plays. Penalties and kicks count as plays but not as runs or passes. */
export function driveStats(frames: Frame[]): DriveStats {
	const s: DriveStats = {
		plays: frames.length,
		runs: { n: 0, yds: 0 },
		passes: { att: 0, comp: 0, yds: 0 },
		sacks: 0,
		firstDowns: 0,
		thirdDowns: { att: 0, conv: 0 },
		fourthDowns: { att: 0, conv: 0 },
		epa: null,
		success: { good: 0, of: 0 },
		wpa: null,
		explosive: 0,
	}
	for (const f of frames) {
		if (f.epa != null) s.epa = (s.epa ?? 0) + f.epa
		if (f.wpa != null) s.wpa = (s.wpa ?? 0) + f.wpa
		if (f.epa != null && (f.type === "run" || f.type === "pass") && f.outcome !== "penalty") {
			s.success.of++
			if (f.epa > 0) s.success.good++
		}
		const scrimmage = (f.type === "run" || f.type === "pass") && f.outcome !== "penalty"
		if (f.outcome === "penalty") continue
		if (f.firstDown) s.firstDowns++
		if (!scrimmage) continue
		if (f.type === "run") {
			s.runs.n++
			s.runs.yds += f.yards
			if (f.yards >= 10) s.explosive++
		} else if (f.sack) {
			s.sacks++
			s.passes.yds += f.yards
		} else {
			s.passes.att++
			s.passes.yds += f.yards
			if (f.yards >= 20) s.explosive++
			if (f.outcome !== "incomplete" && !/INTERCEPTED/i.test(f.text)) s.passes.comp++
		}
		const converted = f.firstDown || f.outcome === "touchdown"
		if (f.down === 3) {
			s.thirdDowns.att++
			if (converted) s.thirdDowns.conv++
		}
		if (f.down === 4) {
			s.fourthDowns.att++
			if (converted) s.fourthDowns.conv++
		}
	}
	return s
}
