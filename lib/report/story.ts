// The story parts of a game report that are worked out rather than typed: the real final score, the contents list of the recap,
// the turning points, the drives. Pure functions over the Studio document and the Lab's game file, so they can be tested.

import { teamByAbbr } from "../nfl"
import type { Drive, KeyPlay, LabGame } from "../lab/types"
import { clockAt, swingPoints } from "../lab/wp"

// ------------------------------------------------------------------------------------------------------------ the score

export type FinalScore = { raiders: number; opponent: number; source: "lab" | "espn" | "studio"; /** The Studio fields disagree with the real score (they are usually typed the wrong way round). */ studioWrong: boolean }

/**
 * The final score, from the most reliable place that has it: the Lab's play-by-play, then the line score ESPN sent, then what was
 * typed in Studio. The Studio fields are the last choice because a score typed backwards makes a loss read as a win on every page.
 */
export function finalScore(studio: { raiders: number; opponent: number }, lab?: Pick<LabGame, "score"> | null, quarters?: { raiders: number; opponent: number }[] | null): FinalScore {
	let real: { raiders: number; opponent: number; source: "lab" | "espn" } | null = null
	if (lab) real = { raiders: lab.score[0], opponent: lab.score[1], source: "lab" }
	else if (quarters && quarters.length >= 4) {
		real = { raiders: quarters.reduce((a, q) => a + q.raiders, 0), opponent: quarters.reduce((a, q) => a + q.opponent, 0), source: "espn" }
	}
	if (!real) return { raiders: studio.raiders, opponent: studio.opponent, source: "studio", studioWrong: false }
	return { raiders: real.raiders, opponent: real.opponent, source: real.source, studioWrong: real.raiders !== studio.raiders || real.opponent !== studio.opponent }
}

// ------------------------------------------------------------------------------------------------------- the recap's text

type Span = { _type?: string; text?: string }
type TextBlock = { _type?: string; style?: string; children?: Span[]; _key?: string }

export function blockText(b: unknown): string {
	const block = b as TextBlock
	if (!block || block._type !== "block" || !Array.isArray(block.children)) return ""
	return block.children.map((c) => (typeof c?.text === "string" ? c.text : "")).join("")
}

/** A heading's anchor: lower case words joined with dashes, short enough to read in an address. */
export function headingId(text: string): string {
	const words = text
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(" ")
		.filter(Boolean)
	return words.slice(0, 8).join("-") || "section"
}

export type Heading = { id: string; key: string | null; text: string; level: 2 | 3 }

/** The recap's headings with anchors that are unique on the page. */
export function headings(body: unknown): Heading[] {
	if (!Array.isArray(body)) return []
	const seen = new Map<string, number>()
	const out: Heading[] = []
	for (const b of body) {
		const style = (b as TextBlock)?.style
		if (style !== "h2" && style !== "h3") continue
		const text = blockText(b).trim()
		if (!text) continue
		const base = headingId(text)
		const n = (seen.get(base) ?? 0) + 1
		seen.set(base, n)
		out.push({ id: n === 1 ? base : `${base}-${n}`, key: (b as TextBlock)._key ?? null, text, level: style === "h2" ? 2 : 3 })
	}
	return out
}

const DATELINE = /^week\s+\d+\s+(game\s+)?(report|recap)\b/i
const SCORELINE = /^[A-Za-z.' ]+\s\d{1,2},\s+[A-Za-z.' ]+\s\d{1,2}$/

/**
 * The recap without the lines at the top that only repeat the page's own header (a dateline like "Week 7 Game Report | October 25 |
 * Allegiant Stadium", the score as a sentence, empty paragraphs). Only the very top is trimmed; the writing is never touched.
 */
export function trimLead<T>(body: T[] | undefined | null): T[] {
	if (!Array.isArray(body)) return []
	let i = 0
	while (i < body.length) {
		const b = body[i] as TextBlock
		const style = b?._type === "block" ? b.style ?? "normal" : ""
		if (b?._type !== "block" || style !== "normal") break
		const t = blockText(b).trim()
		if (t === "" || DATELINE.test(t) || SCORELINE.test(t)) i++
		else break
	}
	return body.slice(i)
}

// ------------------------------------------------------------------------------------------------------ turning points

export type TurningPoint = {
	/** Seconds elapsed, for ordering. */
	el: number
	q: string
	clock: string
	kind: KeyPlay["kind"]
	team: string | null
	text: string
	/** Change in the Raiders' win probability, percentage points. */
	swing: number | null
	/** [Raiders, opponent] after the play. */
	score: [number, number]
	wpAfter: number | null
}

/** The plays that moved the Raiders' win probability the most, in the order they happened. */
export function turningPoints(game: Pick<LabGame, "keyPlays">, count = 5): TurningPoint[] {
	const rated = game.keyPlays.map((p) => ({ p, s: swingPoints(p) })).filter((x): x is { p: KeyPlay; s: number } => x.s != null)
	rated.sort((a, b) => Math.abs(b.s) - Math.abs(a.s))
	return rated
		.slice(0, count)
		.map(({ p, s }) => {
			const c = clockAt(p.el)
			return { el: p.el, q: c.q, clock: p.clock || c.clock, kind: p.kind, team: p.team, text: p.text, swing: s, score: p.score, wpAfter: p.wpAfter }
		})
		.sort((a, b) => a.el - b.el)
}

// ------------------------------------------------------------------------------------------------------------- drives

export type DriveBar = {
	n: number
	mine: boolean
	q: number
	clock: string
	result: string
	plays: number
	yards: number
	top: string | null
	/** Where it started, as a number of yards from its own goal line. */
	start: number
	scored: boolean
}

const SCORED = new Set(["touchdown", "field goal"])

export function driveBars(drives: Drive[], team: string): DriveBar[] {
	return drives.map((d) => ({
		n: d.n,
		mine: d.team === team,
		q: d.q,
		clock: d.clock,
		result: d.result,
		plays: d.plays.length,
		yards: d.yards,
		top: d.top,
		start: d.start,
		scored: SCORED.has(d.result.trim().toLowerCase()),
	}))
}

export type DriveSummary = { drives: number; points: number; scoringDrives: number; yards: number; plays: number }

/** Totals for one side's drives. Points count touchdowns as 7 and field goals as 3, which is what a drive was worth when it ended. */
export function driveSummary(bars: DriveBar[], mine: boolean): DriveSummary {
	const own = bars.filter((b) => b.mine === mine)
	return {
		drives: own.length,
		points: own.reduce((a, b) => a + (b.result.trim().toLowerCase() === "touchdown" ? 7 : b.result.trim().toLowerCase() === "field goal" ? 3 : 0), 0),
		scoringDrives: own.filter((b) => b.scored).length,
		yards: own.reduce((a, b) => a + b.yards, 0),
		plays: own.reduce((a, b) => a + b.plays, 0),
	}
}

// ------------------------------------------------------------------------------------------------------------ the script

/** [Raiders, opponent] when the half ended. */
export function scoreAtHalf(game: Pick<LabGame, "scores">): [number, number] {
	let me = 0
	let opp = 0
	for (const [el, a, b] of game.scores) {
		if (el > 1800) break
		me = a
		opp = b
	}
	return [me, opp]
}

/** How the game went in one line: who led at the half and by how much. Null when the score log does not reach halftime. */
export function halftimeLine(game: Pick<LabGame, "scores" | "oppName" | "score">): string | null {
	let me = 0
	let opp = 0
	for (const [el, a, b] of game.scores) {
		if (el > 1800) break
		me = a
		opp = b
	}
	if (me === 0 && opp === 0 && game.scores.every((s) => s[0] > 1800)) return null
	if (me === opp) return `Tied ${me}–${opp} at the half`
	return me > opp ? `Raiders led ${me}–${opp} at the half` : `${game.oppName} led ${opp}–${me} at the half`
}

export type QuarterCell = { label: string; me: number; opp: number }

/** Points each team scored in each quarter (overtime as one column), from the running score log. */
export function quarterLine(game: Pick<LabGame, "scores" | "score">): QuarterCell[] {
	const at = (t: number): [number, number] => {
		let me = 0
		let opp = 0
		for (const [el, a, b] of game.scores) {
			if (el > t) break
			me = a
			opp = b
		}
		return [me, opp]
	}
	const cuts = [900, 1800, 2700, 3600]
	const out: QuarterCell[] = []
	let prev: [number, number] = [0, 0]
	cuts.forEach((t, i) => {
		// The score at the very end of regulation is the last entry at or before 3600; extra time is whatever is added after it.
		const now = i === 3 ? at(3600) : at(t)
		out.push({ label: `Q${i + 1}`, me: now[0] - prev[0], opp: now[1] - prev[1] })
		prev = now
	})
	const extra: [number, number] = [game.score[0] - prev[0], game.score[1] - prev[1]]
	if (extra[0] > 0 || extra[1] > 0) out.push({ label: "OT", me: extra[0], opp: extra[1] })
	return out
}

export function teamNick(abbr: string): string {
	return teamByAbbr(abbr).nick
}
