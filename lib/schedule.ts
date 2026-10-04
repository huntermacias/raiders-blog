// Joins the entered Raiders schedule with the weekly predictions so the
// schedule page can show picks, results and links without any extra data
// entry. Pure functions of the documents; no React, no Sanity client.

import { RAIDERS } from "./nfl"
import { type GamePrediction, type Grade, type PickResult, gradeGame, involvesRaiders, isFinal } from "./predictions"

export type ScheduleGame = {
	_key?: string
	week: number
	bye?: boolean | null
	opponent?: string | null
	homeAway?: "home" | "away" | null
	kickoff?: string | null
	network?: string | null
}

export type GameOutcome = { raiders: number; opponent: number; result: "W" | "L" | "T" }

export type PickView = {
	id: string
	/** Raiders' predicted score first, opponent second. */
	raiders: number
	opponent: number
	result: PickResult
}

export type ScheduleRow = ScheduleGame & {
	pick: PickView | null
	outcome: GameOutcome | null
	preview?: { slug: string; title: string } | null
	report?: { slug: string; title: string } | null
}

function opponentOf(p: GamePrediction): string {
	return p.awayTeam === RAIDERS ? p.homeTeam : p.awayTeam
}

export function joinSchedule(games: ScheduleGame[], picks: GamePrediction[]): ScheduleRow[] {
	const raiderPicks = picks.filter(involvesRaiders)

	return games
		.slice()
		.sort((a, b) => a.week - b.week)
		.map((g) => {
			if (g.bye) return { ...g, pick: null, outcome: null }

			const p = raiderPicks.find((x) => x.week === g.week && (!g.opponent || opponentOf(x) === g.opponent))
			if (!p) return { ...g, pick: null, outcome: null }

			const raidersAway = p.awayTeam === RAIDERS
			const grade: Grade = gradeGame(p)

			const pick: PickView = {
				id: p._id,
				raiders: raidersAway ? p.predictedAwayScore : p.predictedHomeScore,
				opponent: raidersAway ? p.predictedHomeScore : p.predictedAwayScore,
				result: grade.result,
			}

			let outcome: GameOutcome | null = null
			if (isFinal(p)) {
				const r = (raidersAway ? p.actualAwayScore : p.actualHomeScore) as number
				const o = (raidersAway ? p.actualHomeScore : p.actualAwayScore) as number
				outcome = { raiders: r, opponent: o, result: r > o ? "W" : r < o ? "L" : "T" }
			}

			return { ...g, pick, outcome, preview: p.preview ?? null, report: p.report ?? null }
		})
}

export function scheduleRecord(rows: ScheduleRow[]): { w: number; l: number; t: number } {
	let w = 0
	let l = 0
	let t = 0
	for (const r of rows) {
		if (!r.outcome) continue
		if (r.outcome.result === "W") w++
		else if (r.outcome.result === "L") l++
		else t++
	}
	return { w, l, t }
}

/** First game that has not finished and whose kickoff is still ahead (or unknown). */
export function nextGame(rows: ScheduleRow[], nowMs: number): ScheduleRow | null {
	for (const r of rows) {
		if (r.bye || r.outcome || !r.opponent) continue
		if (r.kickoff && new Date(r.kickoff).getTime() <= nowMs - 4 * 3600 * 1000) continue
		return r
	}
	return null
}

export function recordText(rec: { w: number; l: number; t: number }): string {
	return `${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ""}`
}
