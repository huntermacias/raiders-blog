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
