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
	/** True when the ball travels through the air (pass, punt, field goal). */
	arc: boolean
	downLabel: string
	text: string
	yards: number
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

export function framesForDrive(drive: Drive): Frame[] {
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
		return {
			n: p.n,
			down: p.dn,
			ytg: p.ytg,
			from: clamp(p.x),
			to,
			firstDownAt: fd >= 100 ? null : fd,
			outcome,
			arc: outcome === "punt" || outcome === "fieldgoal-good" || outcome === "fieldgoal-miss" || (p.type === "pass" && outcome !== "incomplete" && p.yds >= 8),
			downLabel: downLabel(p.dn, p.ytg, p.x),
			text: p.text,
			yards: p.yds,
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
