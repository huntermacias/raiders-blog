// The public NFL game-winner league as the page needs it. Pure: give it what loadCompetition read and the clock.
//
// What a viewer may see: their own picks always; the crowd's split and everyone's results only once a game has locked.

import { type Row, PUBLIC_TIEBREAKS, buildRows, weeklyChampions } from "../domain"
import { teamInfo } from "../../nfl"
import { duration } from "../format"
import type { CompetitionData, EventView } from "../services/read"

export type TeamChip = { name: string; nick: string; abbr: string; color: string }
export type Outcome = "correct" | "wrong" | "push" | "void" | "missed" | "pending"

export type NflGame = {
	eventId: string
	week: number
	kickoff: string
	lockAt: string
	away: TeamChip
	home: TeamChip
	status: "open" | "locked" | "final" | "cancelled"
	msToLock: number | null
	pick: "away" | "home" | null
	result: { away: number; home: number; winner: "away" | "home" | "tie" } | null
	outcome: Outcome | null
	/** Share of entrants, only after the game locks. */
	crowd: { away: number; home: number; total: number } | null
}

export type NflBoardRow = Row & { isMe: boolean }
export type NflNext =
	| { kind: "signin"; title: string; detail: string }
	| { kind: "pick"; title: string; detail: string; remaining: number }
	| { kind: "all_set"; title: string; detail: string }
	| { kind: "waiting"; title: string; detail: string }

export type NflWeekView = {
	season: number
	week: number
	weeks: number[]
	now: string
	games: NflGame[]
	summary: { total: number; picked: number; openUnpicked: number; final: number; correct: number; pushes: number; points: number }
	next: NflNext
	weekBoard: { rows: NflBoardRow[]; total: number; me: NflBoardRow | null }
	seasonBoard: { rows: NflBoardRow[]; total: number; me: NflBoardRow | null; players: number }
	champions: { week: number; handles: string[]; points: number }[]
}

export const chip = (name: string): TeamChip => {
	const t = teamInfo(name)
	return { name: t.name, nick: t.nick, abbr: t.abbr, color: t.color }
}

export const lockMs = (e: EventView) => Date.parse(e.lockAt ?? e.kickoff)
export const done = (e: EventView) => e.state === "final" || e.state === "cancelled"

export function statusOf(e: EventView, nowMs: number): NflGame["status"] {
	if (e.state === "cancelled") return "cancelled"
	if (e.state === "final" && e.result) return "final"
	return nowMs < lockMs(e) && (e.state === "scheduled" || e.state === "postponed") ? "open" : "locked"
}

/** The week to show first: the earliest week that still has a game open or unfinished, else the latest week there is. */
export function defaultWeek(events: readonly EventView[], nowMs: number): number | null {
	if (events.length === 0) return null
	const live = events.filter((e) => !done(e) || nowMs - Date.parse(e.kickoff) < 18 * 3_600_000)
	const weeks = (live.length > 0 ? live : events).map((e) => e.week)
	return live.length > 0 ? Math.min(...weeks) : Math.max(...weeks)
}

export const topWithMe = (rows: NflBoardRow[], limit: number): NflBoardRow[] => {
	const head = rows.slice(0, limit)
	const me = rows.find((r) => r.isMe)
	return me && head.indexOf(me) < 0 ? head.concat(me) : head
}

export type NflWeekOptions = {
	/** Entries a champion needs are 80% of this many games. Defaults to the week's decided games; the upset challenge passes 1. */
	championSlate?: number
	/** A week is not crowned when the best score is below this. */
	minChampionPoints?: number
}

export function buildNflWeek(data: CompetitionData, season: number, me: { id: string } | null, nowMs: number, wanted: number | null, opts: NflWeekOptions = {}): NflWeekView | null {
	const weeks = Array.from(new Set(data.events.map((e) => e.week))).sort((a, b) => a - b)
	const week = wanted !== null && weeks.indexOf(wanted) >= 0 ? wanted : defaultWeek(data.events, nowMs)
	if (week === null) return null

	const myPick: Record<string, "away" | "home"> = {}
	data.mine.forEach((m) => {
		const p = (m.payload as { pick?: string } | null)?.pick
		if (p === "away" || p === "home") myPick[m.eventId] = p
	})
	const myGrade: Record<string, { voided: boolean; correct: boolean }> = {}
	if (me) data.grades.forEach((g) => g.playerId === me.id && (myGrade[g.eventId] = { voided: g.voided, correct: g.detail.correct }))

	const games: NflGame[] = data.events
		.filter((e) => e.week === week)
		.map((e) => {
			const status = statusOf(e, nowMs)
			const winner = e.result ? (e.result.away === e.result.home ? "tie" : e.result.home > e.result.away ? "home" : "away") : null
			const pick = myPick[e.id] ?? null
			const g = myGrade[e.id]
			let outcome: Outcome | null = null
			if (me && status !== "open") {
				if (status === "cancelled") outcome = pick ? "void" : null
				else if (!pick) outcome = "missed"
				else if (status === "locked") outcome = "pending"
				else if (g) outcome = g.voided ? (winner === "tie" ? "push" : "void") : g.correct ? "correct" : "wrong"
				else outcome = "pending"
			}
			const t = data.tallies[e.id]
			const crowd = status !== "open" && t && t.entries > 0 ? { away: t.awayWins, home: t.homeWins, total: t.entries } : null
			return {
				eventId: e.id,
				week: e.week,
				kickoff: e.kickoff,
				lockAt: new Date(lockMs(e)).toISOString(),
				away: chip(e.awayTeam),
				home: chip(e.homeTeam),
				status,
				msToLock: status === "open" ? lockMs(e) - nowMs : null,
				pick,
				result: e.result && winner ? { away: e.result.away, home: e.result.home, winner } : null,
				outcome,
				crowd,
			}
		})

	const open = games.filter((g) => g.status === "open")
	const openUnpicked = open.filter((g) => g.pick === null)
	const mineGraded = games.filter((g) => g.outcome === "correct" || g.outcome === "wrong")
	const summary = {
		total: games.filter((g) => g.status !== "cancelled").length,
		picked: games.filter((g) => g.pick !== null).length,
		openUnpicked: openUnpicked.length,
		final: games.filter((g) => g.status === "final").length,
		correct: games.filter((g) => g.outcome === "correct").length,
		pushes: games.filter((g) => g.outcome === "push").length,
		points: mineGraded.filter((g) => g.outcome === "correct").length,
	}

	let next: NflNext
	if (!me) next = { kind: "signin", title: "Make your picks", detail: "Free. Pick a winner for every game, change your mind until each kickoff." }
	else if (open.length === 0) next = { kind: "waiting", title: games.some((g) => g.status === "locked") ? "This week's picks are locked" : "This week is in the books", detail: games.some((g) => g.status === "locked") ? "Results post here as each game ends." : "Next week's games open for picks soon." }
	else if (openUnpicked.length > 0) {
		const soon = openUnpicked.slice().sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt))[0]
		next = { kind: "pick", title: `${openUnpicked.length} game${openUnpicked.length === 1 ? "" : "s"} still need${openUnpicked.length === 1 ? "s" : ""} a pick`, detail: `First lock in ${duration(Date.parse(soon.lockAt) - nowMs)}.`, remaining: openUnpicked.length }
	} else {
		const soon = open.slice().sort((a, b) => Date.parse(a.lockAt) - Date.parse(b.lockAt))[0]
		next = { kind: "all_set", title: "Your picks are in", detail: `You can change any of them until its kickoff. First lock in ${duration(Date.parse(soon.lockAt) - nowMs)}.` }
	}

	const info = data.players.filter((p) => !p.disabled).map((p) => ({ id: p.id, handle: p.handle, joinedAt: p.joinedAt }))
	const mark = (rows: Row[]): NflBoardRow[] => rows.map((r) => ({ ...r, isMe: me !== null && r.playerId === me.id }))
	const weekRows = mark(buildRows(data.grades, info, PUBLIC_TIEBREAKS, { week }))
	const seasonRows = mark(buildRows(data.grades, info, PUBLIC_TIEBREAKS))

	// Champions of the last few completed weeks.
	const champions: NflWeekView["champions"] = []
	weeks
		.slice()
		.reverse()
		.forEach((w) => {
			if (champions.length >= 3 || w > week) return
			const evs = data.events.filter((e) => e.week === w)
			if (evs.length === 0 || !evs.every(done)) return
			const slate = opts.championSlate ?? evs.filter((e) => e.state === "final" && e.result && e.result.away !== e.result.home).length
			if (slate === 0) return
			const top = weeklyChampions(buildRows(data.grades, info, PUBLIC_TIEBREAKS, { week: w }), slate)
			if (top.length > 0 && top[0].points >= (opts.minChampionPoints ?? 0)) champions.push({ week: w, handles: top.map((r) => r.handle), points: top[0].points })
		})

	return {
		season,
		week,
		weeks,
		now: new Date(nowMs).toISOString(),
		games,
		summary,
		next,
		weekBoard: { rows: topWithMe(weekRows, 10), total: weekRows.length, me: weekRows.find((r) => r.isMe) ?? null },
		seasonBoard: { rows: topWithMe(seasonRows, 10), total: seasonRows.length, me: seasonRows.find((r) => r.isMe) ?? null, players: info.length },
		champions,
	}
}
