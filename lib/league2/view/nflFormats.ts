// Confidence picks and the upset challenge as their pages need them. Pure, like the winners view.
//
// Both sit on top of the winners view (same games, same boards, same weekly champions) and add what is theirs:
// ranks and the points they earned for confidence, the frozen underdog line and the call allowance for upsets.

import { type UpsetPolicy, DEFAULT_MAX_UPSETS, UPSET_V1, maxConfidencePoints, upsetTier, upsetValue } from "../domain"
import { duration } from "../format"
import type { CompetitionData, EventView } from "../services/read"
import { type NflBoardRow, type NflGame, type NflNext, type NflWeekView, type TeamChip, buildNflWeek } from "./nfl"

// --- confidence ------------------------------------------------------------------------------------------------------

export type ConfidenceGame = NflGame & {
	rank: number | null
	/** Points this pick earned once graded: its rank when right, 0 when wrong. Null before that. */
	earned: number | null
}

export type ConfidenceView = Omit<NflWeekView, "games" | "summary"> & {
	games: ConfidenceGame[]
	/** Ranks run 1..gameCount. */
	gameCount: number
	summary: NflWeekView["summary"] & { ranked: number; maxPossible: number; bestStillAlive: number }
}

export function buildConfidenceWeek(data: CompetitionData, season: number, me: { id: string } | null, nowMs: number, wanted: number | null): ConfidenceView | null {
	const base = buildNflWeek(data, season, me, nowMs, wanted)
	if (!base) return null
	const rankOf: Record<string, number> = {}
	data.mine.forEach((m) => {
		const r = (m.payload as { rank?: unknown } | null)?.rank
		if (typeof r === "number") rankOf[m.eventId] = r
	})
	const pts: Record<string, number> = {}
	if (me) data.grades.forEach((g) => g.playerId === me.id && !g.voided && (pts[g.eventId] = g.points))
	const gameCount = data.events.filter((e) => e.week === base.week).length

	const games: ConfidenceGame[] = base.games.map((g) => ({
		...g,
		rank: g.pick ? (rankOf[g.eventId] ?? null) : null,
		earned: g.outcome === "correct" ? (pts[g.eventId] ?? rankOf[g.eventId] ?? 0) : g.outcome === "wrong" ? 0 : null,
	}))
	const earned = games.reduce((n, g) => n + (g.earned ?? 0), 0)
	// What is still on the table: ranks of picks not yet decided, plus nothing for those already lost.
	const alive = games.filter((g) => g.rank !== null && (g.outcome === "pending" || g.status === "open" || g.status === "locked")).reduce((n, g) => n + (g.rank ?? 0), 0)
	const summary = { ...base.summary, points: earned, ranked: games.filter((g) => g.rank !== null).length, maxPossible: maxConfidencePoints(gameCount), bestStillAlive: earned + alive }

	const open = games.filter((g) => g.status === "open")
	const unranked = open.filter((g) => g.rank === null)
	let next: NflNext
	if (!me) next = { kind: "signin", title: "Rank your picks", detail: "Free. Pick every winner, then give your surest pick the biggest number." }
	else if (open.length === 0) next = { kind: "waiting", title: games.some((g) => g.status === "locked") ? "This week's ranks are locked" : "This week is in the books", detail: games.some((g) => g.status === "locked") ? "Points post here as each game ends." : "Next week's games open for ranking soon." }
	else if (unranked.length > 0) {
		const soon = unranked.slice().sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt))[0]
		next = { kind: "pick", title: `${unranked.length} game${unranked.length === 1 ? "" : "s"} still need${unranked.length === 1 ? "s" : ""} a pick and a rank`, detail: `First lock in ${duration(Date.parse(soon.lockAt) - nowMs)}.`, remaining: unranked.length }
	} else {
		const soon = open.slice().sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt))[0]
		next = { kind: "all_set", title: "Your slate is ranked", detail: `Swap ranks or change a pick until its kickoff. First lock in ${duration(Date.parse(soon.lockAt) - nowMs)}.` }
	}
	return { ...base, games, gameCount, summary, next }
}

// --- upsets ----------------------------------------------------------------------------------------------------------

export type UpsetOutcome = "hit" | "miss" | "pending" | "void"

export type UpsetLineInfo = {
	underdog: "away" | "home"
	favouriteWinChance: number
	/** Points a hit is worth. */
	value: number
	tier: number
	label: string
}

export type UpsetGame = {
	eventId: string
	week: number
	kickoff: string
	lockAt: string
	away: TeamChip
	home: TeamChip
	status: NflGame["status"]
	msToLock: number | null
	line: UpsetLineInfo | null
	called: boolean
	/** Only for a game I called. */
	outcome: UpsetOutcome | null
	result: NflGame["result"]
	/** How many players called this game's upset. Shown once the game locks. */
	callers: number | null
	upsetHappened: boolean | null
}

export type UpsetOfTheWeek = { eventId: string; underdog: TeamChip; favourite: TeamChip; score: { away: number; home: number }; favouriteWinChance: number; value: number; callers: number; awayIsUnderdog: boolean }

export type UpsetView = Omit<NflWeekView, "games" | "summary"> & {
	games: UpsetGame[]
	calls: { used: number; max: number; left: number }
	summary: { called: number; hits: number; misses: number; pending: number; points: number; final: number }
	upsetOfWeek: UpsetOfTheWeek | null
	/** The scoring rules the points above come from, for the page's explanation. */
	rules: UpsetPolicy["rules"]
}

const TIER_LABEL = ["Underdog", "Big upset", "Huge upset"]
export const tierLabel = (tier: number) => TIER_LABEL[Math.min(Math.max(tier, 1), TIER_LABEL.length) - 1]

function upsetPolicy(data: CompetitionData): UpsetPolicy {
	return { ...UPSET_V1, rules: data.upsetRules ?? UPSET_V1.rules }
}

export function lineInfo(policy: UpsetPolicy, line: { underdog: "away" | "home"; favouriteWinChance: number }): UpsetLineInfo {
	const tier = upsetTier(policy, line.favouriteWinChance)
	return { underdog: line.underdog, favouriteWinChance: line.favouriteWinChance, value: upsetValue(policy, line.favouriteWinChance), tier, label: tierLabel(tier) }
}

export function buildUpsetWeek(data: CompetitionData, season: number, me: { id: string } | null, nowMs: number, wanted: number | null): UpsetView | null {
	// One call is enough to be in the running for the week's title, but a title needs a point on the board.
	const base = buildNflWeek(data, season, me, nowMs, wanted, { championSlate: 1, minChampionPoints: 1 })
	if (!base) return null
	const policy = upsetPolicy(data)
	const max = data.maxUpsets ?? DEFAULT_MAX_UPSETS
	const events: Record<string, EventView> = {}
	data.events.forEach((e) => (events[e.id] = e))
	const myCall: Record<string, true> = {}
	data.mine.forEach((m) => {
		const p = (m.payload as { pick?: string } | null)?.pick
		if (p === "away" || p === "home") myCall[m.eventId] = true
	})
	const grade: Record<string, { voided: boolean; correct: boolean; points: number }> = {}
	if (me) data.grades.forEach((g) => g.playerId === me.id && (grade[g.eventId] = { voided: g.voided, correct: g.detail.correct, points: g.points }))

	const games: UpsetGame[] = base.games.map((g) => {
		const ln = data.lines?.[g.eventId]
		const line = ln ? lineInfo(policy, ln) : null
		const called = Boolean(myCall[g.eventId]) && line !== null
		let outcome: UpsetOutcome | null = null
		if (called) {
			const gr = grade[g.eventId]
			if (g.status === "cancelled") outcome = "void"
			else if (g.status !== "final") outcome = "pending"
			else if (gr) outcome = gr.voided ? "void" : gr.correct ? "hit" : "miss"
			else outcome = "pending"
		}
		const t = data.tallies[g.eventId]
		const callers = g.status !== "open" && line && t ? (line.underdog === "away" ? t.awayWins : t.homeWins) : g.status !== "open" && line ? 0 : null
		const upsetHappened = g.result && line ? g.result.winner === line.underdog : null
		return { eventId: g.eventId, week: g.week, kickoff: g.kickoff, lockAt: g.lockAt, away: g.away, home: g.home, status: g.status, msToLock: g.msToLock, line, called, outcome, result: g.result, callers, upsetHappened }
	})

	const used = games.filter((g) => g.called).length
	// The cap counts calls across the whole week, including games already locked.
	const calls = { used, max, left: Math.max(0, max - used) }
	const hits = games.filter((g) => g.outcome === "hit")
	const summary = {
		called: used,
		hits: hits.length,
		misses: games.filter((g) => g.outcome === "miss").length,
		pending: games.filter((g) => g.outcome === "pending").length,
		points: hits.reduce((n, g) => n + (grade[g.eventId]?.points ?? g.line?.value ?? 0), 0),
		final: games.filter((g) => g.status === "final").length,
	}

	const offered = games.filter((g) => g.line !== null)
	const open = games.filter((g) => g.status === "open" && g.line !== null)
	let next: NflNext
	if (!me) next = { kind: "signin", title: "Call the upsets", detail: `Free. Pick up to ${max} underdogs a week to win. Bigger underdogs pay more.` }
	else if (offered.length === 0) next = { kind: "waiting", title: "This week's underdogs are not posted yet", detail: "Lines post when the week opens. Check back soon." }
	else if (open.length === 0) next = { kind: "waiting", title: games.some((g) => g.status === "locked") ? "This week's calls are locked" : "This week is in the books", detail: games.some((g) => g.status === "locked") ? "Points post here as each game ends." : "Next week's underdogs post when it opens." }
	else if (calls.left > 0) {
		const soon = open.slice().sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt))[0]
		next = { kind: "pick", title: `${calls.left} upset call${calls.left === 1 ? "" : "s"} left`, detail: `You have used ${used} of ${max}. First lock in ${duration(Date.parse(soon.lockAt) - nowMs)}.`, remaining: calls.left }
	} else next = { kind: "all_set", title: "All your calls are in", detail: `You can take a call back before kickoff to use it elsewhere.` }

	// The week's best upset: a final game the underdog won, biggest favourite first.
	let upsetOfWeek: UpsetOfTheWeek | null = null
	games.forEach((g) => {
		if (!g.line || !g.result || g.upsetHappened !== true) return
		if (upsetOfWeek && upsetOfWeek.favouriteWinChance >= g.line.favouriteWinChance) return
		const awayUnder = g.line.underdog === "away"
		upsetOfWeek = { eventId: g.eventId, underdog: awayUnder ? g.away : g.home, favourite: awayUnder ? g.home : g.away, score: { away: g.result.away, home: g.result.home }, favouriteWinChance: g.line.favouriteWinChance, value: g.line.value, callers: g.callers ?? 0, awayIsUnderdog: awayUnder }
	})

	return { ...base, games, calls, summary, next, upsetOfWeek, rules: policy.rules }
}

export type { NflBoardRow }
