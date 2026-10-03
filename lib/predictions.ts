// Pure grading + summary logic for the prediction scoreboard. No React, no
// Sanity client -- everything here is a plain function of the documents, so the
// numbers on the page can always be re-derived from what's entered in Studio.

import { RAIDERS } from "./nfl"

export const SEASON = 2026
export const SEASON_GAMES = 17

export type Side = "away" | "home"

export type GamePrediction = {
	_id: string
	week: number
	awayTeam: string
	homeTeam: string
	kickoff: string
	predictedAwayScore: number
	predictedHomeScore: number
	writeup?: string | null
	actualAwayScore?: number | null
	actualHomeScore?: number | null
	readerVotesAway?: number | null
	readerVotesHome?: number | null
	report?: { slug: string; title: string } | null
}

export type PickResult = "hit" | "miss" | "push" | "pending"

export type Grade = {
	final: boolean
	result: PickResult
	/** |predicted margin - actual margin| in points, or null until final. */
	marginError: number | null
	/** Did the reader majority pick the actual winner? */
	readers: "hit" | "miss" | "none" | "pending"
}

export function isFinal(p: GamePrediction): boolean {
	return typeof p.actualAwayScore === "number" && typeof p.actualHomeScore === "number"
}

export function involvesRaiders(p: GamePrediction): boolean {
	return p.awayTeam === RAIDERS || p.homeTeam === RAIDERS
}

export function predictedWinner(p: GamePrediction): Side {
	return p.predictedHomeScore > p.predictedAwayScore ? "home" : "away"
}

function actualWinner(p: GamePrediction): Side | "tie" | null {
	if (!isFinal(p)) return null
	const a = p.actualAwayScore as number
	const h = p.actualHomeScore as number
	if (a === h) return "tie"
	return h > a ? "home" : "away"
}

export function readerLean(p: GamePrediction): Side | null {
	const a = p.readerVotesAway ?? 0
	const h = p.readerVotesHome ?? 0
	if (a === h) return null
	return h > a ? "home" : "away"
}

export function gradeGame(p: GamePrediction): Grade {
	if (!isFinal(p)) return { final: false, result: "pending", marginError: null, readers: "pending" }

	const winner = actualWinner(p)
	const predictedMargin = p.predictedHomeScore - p.predictedAwayScore
	const actualMargin = (p.actualHomeScore as number) - (p.actualAwayScore as number)
	const marginError = Math.abs(predictedMargin - actualMargin)

	let result: PickResult
	if (winner === "tie") result = "push"
	else result = predictedWinner(p) === winner ? "hit" : "miss"

	let readers: Grade["readers"] = "none"
	const lean = readerLean(p)
	if (lean && winner !== "tie") readers = lean === winner ? "hit" : "miss"

	return { final: true, result, marginError, readers }
}

export type RecentPick = { id: string; week: number; opponentLabel: string; result: PickResult }

export type Summary = {
	hits: number
	misses: number
	pushes: number
	graded: number
	/** 0..1, or null when nothing is graded yet. */
	accuracy: number | null
	streak: { kind: "hit" | "miss" | null; length: number }
	avgMarginError: number | null
	raiders: { hits: number; misses: number }
	/** Reader majority record, plus my record on those very same games. */
	readers: { hits: number; misses: number; meHits: number; meMisses: number }
	/** Oldest -> newest, last 12 graded picks. */
	recent: RecentPick[]
	throughWeek: number | null
}

export function summarize(picks: GamePrediction[]): Summary {
	const graded = picks
		.filter(isFinal)
		.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())

	let hits = 0
	let misses = 0
	let pushes = 0
	let marginTotal = 0
	let marginCount = 0
	const raiders = { hits: 0, misses: 0 }
	const readers = { hits: 0, misses: 0, meHits: 0, meMisses: 0 }
	const recentAll: RecentPick[] = []

	for (const p of graded) {
		const g = gradeGame(p)
		if (g.result === "hit") hits++
		else if (g.result === "miss") misses++
		else if (g.result === "push") pushes++

		if (g.marginError !== null) {
			marginTotal += g.marginError
			marginCount++
		}
		if (involvesRaiders(p)) {
			if (g.result === "hit") raiders.hits++
			if (g.result === "miss") raiders.misses++
		}
		if (g.readers === "hit") readers.hits++
		if (g.readers === "miss") readers.misses++
		if (g.readers === "hit" || g.readers === "miss") {
			if (g.result === "hit") readers.meHits++
			if (g.result === "miss") readers.meMisses++
		}

		const opp = p.awayTeam === RAIDERS ? p.homeTeam : p.homeTeam === RAIDERS ? p.awayTeam : `${p.awayTeam} @ ${p.homeTeam}`
		recentAll.push({ id: p._id, week: p.week, opponentLabel: opp, result: g.result })
	}

	// Streak: walk back from the most recent graded pick, ignoring pushes.
	let streakKind: "hit" | "miss" | null = null
	let streakLen = 0
	for (let i = recentAll.length - 1; i >= 0; i--) {
		const r = recentAll[i].result
		if (r === "push") continue
		if (streakKind === null) {
			streakKind = r === "hit" ? "hit" : "miss"
			streakLen = 1
		} else if ((r === "hit") === (streakKind === "hit")) {
			streakLen++
		} else break
	}

	const decided = hits + misses
	return {
		hits,
		misses,
		pushes,
		graded: graded.length,
		accuracy: decided > 0 ? hits / decided : null,
		streak: { kind: streakKind, length: streakLen },
		avgMarginError: marginCount > 0 ? marginTotal / marginCount : null,
		raiders,
		readers,
		recent: recentAll.slice(-12),
		throughWeek: graded.length ? Math.max(...graded.map((p) => p.week)) : null,
	}
}

/* ------------------------------------------------------------------ */
/* Season-long (all 32 teams) win-total predictions                    */
/* ------------------------------------------------------------------ */

export type SeasonTeamRow = {
	_key?: string
	team: string
	predictedWins?: number | null
	playoffs?: boolean | null
	divisionWinner?: boolean | null
	note?: string | null
	wins?: number | null
	losses?: number | null
	ties?: number | null
}

export type SeasonDoc = {
	_id: string
	season: number
	throughWeek?: number | null
	isFinal?: boolean | null
	teams?: SeasonTeamRow[] | null
}

export type SeasonStatus = "none" | "alive" | "over" | "under" | "hit" | "close" | "miss"

export type Standing = {
	status: SeasonStatus
	label: string
	detail: string
	wins: number
	losses: number
	ties: number
	played: number
	remaining: number
	predictedWins: number | null
	predictedLosses: number | null
}

export function seasonStanding(row: SeasonTeamRow, seasonIsFinal = false): Standing {
	const wins = row.wins ?? 0
	const losses = row.losses ?? 0
	const ties = row.ties ?? 0
	const played = wins + losses + ties
	const remaining = Math.max(0, SEASON_GAMES - played)
	const pw = typeof row.predictedWins === "number" ? row.predictedWins : null
	const base = {
		wins,
		losses,
		ties,
		played,
		remaining,
		predictedWins: pw,
		predictedLosses: pw === null ? null : SEASON_GAMES - pw,
	}

	if (pw === null) return { ...base, status: "none", label: "No pick", detail: "No prediction entered yet" }

	if (seasonIsFinal || remaining === 0) {
		const diff = Math.abs(wins - pw)
		if (diff === 0) return { ...base, status: "hit", label: "Nailed it", detail: `Predicted ${pw} wins, finished with ${wins}` }
		if (diff === 1) return { ...base, status: "close", label: "Off by one", detail: `Predicted ${pw} wins, finished with ${wins}` }
		return { ...base, status: "miss", label: "Missed", detail: `Predicted ${pw} wins, finished with ${wins}` }
	}

	if (wins > pw) {
		const over = wins - pw
		return { ...base, status: "over", label: "Too many wins", detail: `${over} win${over === 1 ? "" : "s"} past the pick` }
	}
	if (losses + ties > SEASON_GAMES - pw) {
		const over = losses + ties - (SEASON_GAMES - pw)
		return { ...base, status: "under", label: "Too many losses", detail: `${over} loss${over === 1 ? "" : "es"} past the pick` }
	}

	const needed = pw - wins
	let detail: string
	if (needed === 0) detail = `Can't win another game (${remaining} to play)`
	else if (needed === remaining) detail = `Must win out (${remaining} to play)`
	else detail = `Needs ${needed} of ${remaining} remaining`
	return { ...base, status: "alive", label: "Still alive", detail }
}

export function seasonSummary(rows: SeasonTeamRow[], seasonIsFinal = false) {
	const counts: Record<SeasonStatus, number> = { none: 0, alive: 0, over: 0, under: 0, hit: 0, close: 0, miss: 0 }
	for (const r of rows) counts[seasonStanding(r, seasonIsFinal).status]++
	return counts
}
