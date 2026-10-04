import type { KeyKind, KeyPlay, WpPoint } from "./types"

export const REGULATION = 3600

/** Last second on the chart: the end of regulation, or of overtime. */
export function maxTime(series: WpPoint[]): number {
	return series.length ? Math.max(REGULATION, series[series.length - 1][0]) : REGULATION
}

/**
 * Quarter label and the game clock for a number of elapsed seconds. Exactly 3600 is the end
 * of the fourth quarter unless the game goes to overtime, which the caller says with `overtime`.
 */
export function clockAt(el: number, opts: { overtime?: boolean } = {}): { q: string; clock: string } {
	const overtime = opts.overtime ?? true
	const t = Math.max(0, Math.round(el))
	let q: string
	let left: number
	if (t >= REGULATION && !overtime) {
		q = "Q4"
		left = 0
	} else if (t >= REGULATION) {
		const ot = t - REGULATION
		let period = Math.floor(ot / 600)
		let within = ot - period * 600
		if (period > 0 && within === 0) {
			// The very end of an overtime period belongs to that period, not the next.
			period -= 1
			within = 600
		}
		q = period === 0 ? "OT" : `OT${period + 1}`
		left = 600 - within
	} else {
		const idx = Math.min(3, Math.floor(t / 900))
		q = `Q${idx + 1}`
		left = 900 - (t - idx * 900)
	}
	const m = Math.floor(left / 60)
	const s = Math.max(0, left % 60)
	return { q, clock: `${m}:${String(s).padStart(2, "0")}` }
}

/** Win probability at a moment, interpolated between plays. */
export function wpAt(series: WpPoint[], t: number): number {
	if (!series.length) return 0.5
	if (t <= series[0][0]) return series[0][1]
	for (let i = 1; i < series.length; i++) {
		const [t1, p1] = series[i]
		if (t <= t1) {
			const [t0, p0] = series[i - 1]
			if (t1 === t0) return p1
			return p0 + ((p1 - p0) * (t - t0)) / (t1 - t0)
		}
	}
	return series[series.length - 1][1]
}

const SCORING: KeyKind[] = ["TD", "FG", "SAF", "2PT"]

/** [Raiders, opponent] score at a moment, from the score log (extra points included). */
export function scoreAt(scores: [number, number, number][], t: number): [number, number] {
	let score: [number, number] = [0, 0]
	for (const [el, a, b] of scores) {
		if (el > t) break
		score = [a, b]
	}
	return score
}

/** Latest key play at or before t, or undefined before the first. */
export function playAt(plays: KeyPlay[], t: number): KeyPlay | undefined {
	let found: KeyPlay | undefined
	for (const p of plays) {
		if (p.el > t) break
		found = p
	}
	return found
}

/** Change in the Raiders' win probability on a play, in percentage points. */
export function swingPoints(p: Pick<KeyPlay, "wpBefore" | "wpAfter">): number | null {
	if (p.wpBefore == null || p.wpAfter == null) return null
	return Math.round((p.wpAfter - p.wpBefore) * 100)
}

export function formatSwing(points: number | null): string {
	if (points == null) return ""
	if (points === 0) return "0 pts"
	return `${points > 0 ? "+" : "−"}${Math.abs(points)} pts`
}

/** The play that moved the game the most, for the page headline. */
export function biggestSwing(plays: KeyPlay[]): KeyPlay | undefined {
	let best: KeyPlay | undefined
	let bestAbs = -1
	for (const p of plays) {
		const s = swingPoints(p)
		if (s != null && Math.abs(s) > bestAbs) {
			best = p
			bestAbs = Math.abs(s)
		}
	}
	return best
}

const KIND_LABELS: Record<KeyKind, string> = {
	TD: "Touchdown",
	FG: "Field goal",
	SAF: "Safety",
	"2PT": "Two-point conversion",
	INT: "Interception",
	FUM: "Fumble lost",
	BIG: "Big swing",
}

export function kindLabel(kind: KeyKind): string {
	return KIND_LABELS[kind]
}

/** One-letter tag drawn on the chart marker, so shape and letter carry the type. */
export function kindTag(kind: KeyKind): string {
	switch (kind) {
		case "TD":
			return "TD"
		case "FG":
			return "FG"
		case "SAF":
			return "S"
		case "2PT":
			return "2"
		case "INT":
		case "FUM":
			return "TO"
		default:
			return "!"
	}
}

/** Percent for display, whole numbers. */
export function pct(p: number): string {
	return `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`
}

export type GameStory = {
	/** The Raiders' lowest win probability of the game, and when. */
	low: { p: number; el: number }
	/** Their highest, and when. */
	high: { p: number; el: number }
	/** Times the lead changed hands, counting only scoring plays. */
	leadChanges: number
	/** Biggest points deficit the Raiders faced, 0 if they never trailed. */
	maxDeficit: number
	/** Biggest points lead they held. */
	maxLead: number
	swing: KeyPlay | undefined
}

/** Headline numbers for a game, from its win probability series and scoring plays. */
export function gameStory(series: WpPoint[], plays: KeyPlay[]): GameStory {
	let low = { p: 1, el: 0 }
	let high = { p: 0, el: 0 }
	for (const [el, p] of series) {
		if (p < low.p) low = { p, el }
		if (p > high.p) high = { p, el }
	}
	let leader = 0
	let leadChanges = 0
	let maxDeficit = 0
	let maxLead = 0
	for (const k of plays) {
		if (!SCORING.includes(k.kind)) continue
		const diff = k.score[0] - k.score[1]
		const side = Math.sign(diff)
		if (side !== 0 && leader !== 0 && side !== leader) leadChanges++
		if (side !== 0) leader = side
		maxDeficit = Math.max(maxDeficit, -diff)
		maxLead = Math.max(maxLead, diff)
	}
	return { low, high, leadChanges, maxDeficit, maxLead, swing: biggestSwing(plays) }
}
