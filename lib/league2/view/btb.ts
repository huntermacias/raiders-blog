// What the Beat the Blogger page shows, computed from plain data. No I/O, so every rule here has a unit test.
//
// Rules the page follows (also published on the page):
//  - The blogger's pick and the community's picks stay hidden until a game locks.
//  - Everything about a player (history, streaks, rivalry) is derived from graded games only.

import {
	CLASSIC_TIEBREAKS,
	CLASSIC_V1,
	type PlayerInfo,
	type Rivalry,
	type Row,
	type StandingGrade,
	aroundPlayer,
	buildRivalry,
	buildRows,
	lockAtMs,
	rankChanges,
	scoreScoreline,
	vs,
	type VsResult,
} from "../domain"
import type { CompetitionData, EventView } from "../services/read"

export type CardStatus = "open" | "locked" | "final" | "void"

export type PickCard = {
	eventId: string
	week: number
	awayTeam: string
	homeTeam: string
	kickoff: string
	lockAt: string
	status: CardStatus
	myPick: { away: number; home: number } | null
	myPoints: number | null
	/** Only after the game locks. */
	blogger: { away: number; home: number } | null
	bloggerPoints: number | null
	result: { away: number; home: number } | null
	vs: VsResult | null
	/** Only after the game locks. */
	community: { entries: number; awayShare: number | null } | null
}

export type NextAction =
	| { kind: "join"; title: string; detail: string }
	| { kind: "pick"; title: string; detail: string; eventId: string; lockAt: string }
	| { kind: "all_set"; title: string; detail: string; lockAt: string }
	| { kind: "waiting"; title: string; detail: string }

export type MyLine = {
	playerId: string
	handle: string
	rank: number
	of: number
	points: number
	games: number
	correct: number
	exact: number
	avgMarginError: number | null
	/** Positive means moved up since the last graded week. */
	movement: number | null
	rivalry: Rivalry
	/** Points ahead of (+) or behind (-) the blogger across the games the player entered. */
	delta: number
}

export type BoardRow = Row & { delta: number; isMe: boolean }

export type HomeView = {
	season: number
	now: string
	nextAction: NextAction
	slate: PickCard[]
	/** Locked but not graded yet. */
	locked: PickCard[]
	recent: { week: number; cards: PickCard[]; entrants: number; beat: number } | null
	me: MyLine | null
	board: { top: BoardRow[]; around: BoardRow[]; total: number; blogger: { points: number; games: number }; aheadOfBlogger: number; shareAhead: number | null }
	players: number
	/** The player a ?challenge= link names, with their line against the blogger. */
	challenger: (BoardRow & { rivalry: Rivalry }) | null
}

const bloggerPointsFor = (e: EventView): number | null => (e.blogger && e.result ? scoreScoreline(CLASSIC_V1, e.blogger, e.result).points : null)

export function cardStatus(e: EventView, nowMs: number): CardStatus {
	if (e.state === "cancelled") return "void"
	if (e.state === "final" && e.result) return "final"
	return nowMs < lockAtMs({ kickoff: e.kickoff, lockAt: e.lockAt }) && (e.state === "scheduled" || e.state === "postponed") ? "open" : "locked"
}

function card(e: EventView, data: CompetitionData, me: string | null, gradeBy: Record<string, StandingGrade>, nowMs: number): PickCard {
	const status = cardStatus(e, nowMs)
	const mine = data.mine.find((m) => m.eventId === e.id)
	const g = gradeBy[e.id]
	const reveal = status !== "open"
	const bp = bloggerPointsFor(e)
	const t = data.tallies[e.id]
	const myPick = mine ? (mine.payload as { away: number; home: number }) : null
	return {
		eventId: e.id,
		week: e.week,
		awayTeam: e.awayTeam,
		homeTeam: e.homeTeam,
		kickoff: e.kickoff,
		lockAt: e.lockAt ?? e.kickoff,
		status,
		myPick: me ? myPick : null,
		myPoints: g && !g.voided ? g.points : null,
		blogger: reveal ? e.blogger : null,
		bloggerPoints: reveal ? bp : null,
		result: e.result,
		vs: g && !g.voided && bp !== null ? vs(g.points, bp) : null,
		community: reveal && t ? { entries: t.entries, awayShare: t.awayWins + t.homeWins > 0 ? t.awayWins / (t.awayWins + t.homeWins) : null } : null,
	}
}

const fmtIn = (ms: number) => {
	const m = Math.max(1, Math.round(ms / 60000))
	if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`
	const h = Math.round(m / 60)
	if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`
	const d = Math.round(h / 24)
	return `${d} days`
}

export function buildHome(data: CompetitionData, season: number, me: { id: string } | null, nowMs: number, opts: { challengerHandle?: string } = {}): HomeView {
	const active = data.players.filter((p) => !p.disabled)
	const info: PlayerInfo[] = active.map((p) => ({ id: p.id, handle: p.handle, joinedAt: p.joinedAt }))
	const evById: Record<string, EventView> = {}
	data.events.forEach((e) => (evById[e.id] = e))
	const bpBy: Record<string, number> = {}
	data.events.forEach((e) => {
		const b = bloggerPointsFor(e)
		if (b !== null && e.state === "final") bpBy[e.id] = b
	})

	const rows = buildRows(data.grades, info, CLASSIC_TIEBREAKS)
	const delta: Record<string, number> = {}
	data.grades.forEach((g) => {
		if (g.voided || bpBy[g.eventId] === undefined) return
		delta[g.playerId] = (delta[g.playerId] || 0) + g.points - bpBy[g.eventId]
	})
	const board = (r: Row): BoardRow => ({ ...r, delta: delta[r.playerId] || 0, isMe: me !== null && r.playerId === me.id })

	// The last week with graded games, and the board as it stood before it.
	const gradedWeeks = Array.from(new Set(data.events.filter((e) => e.state === "final" && e.result).map((e) => e.week))).sort((a, b) => a - b)
	const latest = gradedWeeks.length > 0 ? gradedWeeks[gradedWeeks.length - 1] : null
	const before = latest === null ? [] : buildRows(data.grades.filter((g) => g.week !== latest), info, CLASSIC_TIEBREAKS)
	const move = rankChanges(before, rows)

	const myGradeBy: Record<string, StandingGrade> = {}
	if (me) data.grades.forEach((g) => g.playerId === me.id && (myGradeBy[g.eventId] = g))

	const sorted = data.events.slice().sort((a, b) => a.kickoff.localeCompare(b.kickoff))
	const open = sorted.filter((e) => cardStatus(e, nowMs) === "open")
	const slate = open.map((e) => card(e, data, me?.id ?? null, myGradeBy, nowMs))
	// Games that locked but are not graded yet stay visible, so "where is my pick" always has an answer.
	const inPlay = sorted.filter((e) => cardStatus(e, nowMs) === "locked").map((e) => card(e, data, me?.id ?? null, myGradeBy, nowMs))

	let recent: HomeView["recent"] = null
	if (latest !== null) {
		const cards = sorted.filter((e) => e.week === latest && cardStatus(e, nowMs) === "final").map((e) => card(e, data, me?.id ?? null, myGradeBy, nowMs))
		const ids = cards.map((c) => c.eventId)
		const perPlayer: Record<string, number> = {}
		data.grades.forEach((g) => {
			if (ids.indexOf(g.eventId) >= 0 && !g.voided) perPlayer[g.playerId] = (perPlayer[g.playerId] || 0) + g.points
		})
		const blogTotal = ids.reduce((s, id) => s + (bpBy[id] || 0), 0)
		const entrants = Object.keys(perPlayer).filter((id) => active.some((p) => p.id === id))
		recent = { week: latest, cards, entrants: entrants.length, beat: entrants.filter((id) => perPlayer[id] > blogTotal).length }
	}

	let mine: MyLine | null = null
	if (me) {
		const row = rows.find((r) => r.playerId === me.id)
		const player = active.find((p) => p.id === me.id)
		if (player) {
			const rg = data.grades
				.filter((g) => g.playerId === me.id && !g.voided && bpBy[g.eventId] !== undefined)
				.map((g) => ({ eventId: g.eventId, season, week: g.week, kickoff: evById[g.eventId].kickoff, playerPoints: g.points, bloggerPoints: bpBy[g.eventId], marginError: g.detail.marginError }))
			mine = {
				playerId: me.id,
				handle: player.handle,
				rank: row ? row.rank : 0,
				of: rows.length,
				points: row ? row.points : 0,
				games: row ? row.games : 0,
				correct: row ? row.correct : 0,
				exact: row ? row.exact : 0,
				avgMarginError: row ? row.avgMarginError : null,
				movement: row ? (move[me.id] ?? null) : null,
				rivalry: buildRivalry(rg),
				delta: delta[me.id] || 0,
			}
		}
	}

	const top = rows.slice(0, 10).map(board)
	const around = me ? aroundPlayer(rows, me.id, 2).neighbours.map(board) : []
	const blogger = data.events.reduce((a, e) => (bpBy[e.id] !== undefined ? { points: a.points + bpBy[e.id], games: a.games + 1 } : a), { points: 0, games: 0 })
	const ahead = rows.filter((r) => (delta[r.playerId] || 0) > 0).length

	return {
		season,
		now: new Date(nowMs).toISOString(),
		nextAction: nextAction(me !== null && mine !== null, slate, inPlay, nowMs),
		slate,
		locked: inPlay,
		recent,
		me: mine,
		board: { top, around, total: rows.length, blogger, aheadOfBlogger: ahead, shareAhead: rows.length > 0 ? ahead / rows.length : null },
		players: active.length,
		challenger: challengerOf(opts.challengerHandle, rows, board, data, bpBy, evById, season),
	}
}

function challengerOf(handle: string | undefined, rows: Row[], board: (r: Row) => BoardRow, data: CompetitionData, bpBy: Record<string, number>, evById: Record<string, EventView>, season: number): HomeView["challenger"] {
	if (!handle) return null
	const row = rows.find((r) => r.handle.toLowerCase() === handle.toLowerCase())
	if (!row) return null
	const rg = data.grades
		.filter((g) => g.playerId === row.playerId && !g.voided && bpBy[g.eventId] !== undefined)
		.map((g) => ({ eventId: g.eventId, season, week: g.week, kickoff: evById[g.eventId].kickoff, playerPoints: g.points, bloggerPoints: bpBy[g.eventId], marginError: g.detail.marginError }))
	return { ...board(row), rivalry: buildRivalry(rg) }
}

function nextAction(signedIn: boolean, slate: PickCard[], inPlay: PickCard[], nowMs: number): NextAction {
	if (!signedIn) return { kind: "join", title: slate.length > 0 ? "Make your picks" : "Join the league", detail: "Pick the exact score of each Raiders game before kickoff. Free." }
	if (slate.length === 0) return inPlay.length > 0 ? { kind: "waiting", title: "Your pick is locked in", detail: "Results appear here as soon as the game is final." } : { kind: "waiting", title: "No game to pick right now", detail: "The next Raiders game opens for picks as soon as it is on the schedule." }
	const missing = slate.find((c) => c.myPick === null)
	if (missing) {
		const ms = Date.parse(missing.lockAt) - nowMs
		return { kind: "pick", title: `Pick ${missing.awayTeam.split(" ").pop()} at ${missing.homeTeam.split(" ").pop()}`, detail: `Locks in ${fmtIn(ms)}.`, eventId: missing.eventId, lockAt: missing.lockAt }
	}
	const soonest = slate.slice().sort((a, b) => a.lockAt.localeCompare(b.lockAt))[0]
	return { kind: "all_set", title: "Your picks are in", detail: `You can change them until ${fmtIn(Date.parse(soonest.lockAt) - nowMs)} from now.`, lockAt: soonest.lockAt }
}

export type BoardView = { weeks: number[]; week: number | null; rows: BoardRow[]; total: number; page: number; pages: number; blogger: { points: number; games: number } }
export const BOARD_PAGE = 50

/** The full leaderboard, for the whole season or one week. */
export function buildBoard(data: CompetitionData, me: { id: string } | null, opts: { week?: number | null; page?: number }): BoardView {
	const info: PlayerInfo[] = data.players.filter((p) => !p.disabled).map((p) => ({ id: p.id, handle: p.handle, joinedAt: p.joinedAt }))
	const bpBy: Record<string, number> = {}
	data.events.forEach((e) => {
		const b = bloggerPointsFor(e)
		if (b !== null && e.state === "final") bpBy[e.id] = b
	})
	const weeks = Array.from(new Set(data.events.filter((e) => e.state === "final" && e.result).map((e) => e.week))).sort((a, b) => a - b)
	const week = opts.week !== null && opts.week !== undefined && weeks.indexOf(opts.week) >= 0 ? opts.week : null
	const rows = buildRows(data.grades, info, CLASSIC_TIEBREAKS, week === null ? {} : { week })
	const evWeek: Record<string, number> = {}
	data.events.forEach((e) => (evWeek[e.id] = e.week))
	const delta: Record<string, number> = {}
	data.grades.forEach((g) => {
		if (g.voided || bpBy[g.eventId] === undefined || (week !== null && evWeek[g.eventId] !== week)) return
		delta[g.playerId] = (delta[g.playerId] || 0) + g.points - bpBy[g.eventId]
	})
	const pages = Math.max(1, Math.ceil(rows.length / BOARD_PAGE))
	const page = Math.min(pages, Math.max(1, Math.floor(opts.page ?? 1)))
	const slice = rows.slice((page - 1) * BOARD_PAGE, page * BOARD_PAGE).map((r) => ({ ...r, delta: delta[r.playerId] || 0, isMe: me !== null && r.playerId === me.id }))
	const blogger = data.events.reduce((a, e) => (bpBy[e.id] !== undefined && (week === null || e.week === week) ? { points: a.points + bpBy[e.id], games: a.games + 1 } : a), { points: 0, games: 0 })
	return { weeks, week, rows: slice, total: rows.length, page, pages, blogger }
}

export type ProfileView = {
	handle: string
	playerId: string
	joinedAt: string
	me: MyLine
	/** Locked and finished games the player entered, newest first. Open games are never shown. */
	history: PickCard[]
	bloggerGames: number
	/** What the player lets others see. Set by the loader, which reads it from the player's row. */
	privacy: { profile: boolean; history: boolean }
	favoriteTeam: string | null
}

/**
 * A public player page. `data` must have been loaded for this player (`mine` is their entries). Only games that have
 * locked appear, so nobody can read a pick before kickoff.
 */
export function buildProfile(data: CompetitionData, handle: string, season: number, nowMs: number): ProfileView | null {
	const p = data.players.find((x) => x.handle.toLowerCase() === handle.toLowerCase() && !x.disabled)
	if (!p) return null
	const view = buildHome(data, season, { id: p.id }, nowMs)
	if (!view.me) return null
	const gradeBy: Record<string, StandingGrade> = {}
	data.grades.forEach((g) => g.playerId === p.id && (gradeBy[g.eventId] = g))
	const entered = new Set(data.mine.map((m) => m.eventId))
	const history = data.events
		.slice()
		.sort((a, b) => b.kickoff.localeCompare(a.kickoff))
		.filter((e) => entered.has(e.id) && cardStatus(e, nowMs) !== "open")
		.map((e) => card(e, data, p.id, gradeBy, nowMs))
	return { handle: p.handle, playerId: p.id, joinedAt: p.joinedAt, me: view.me, history, bloggerGames: view.board.blogger.games, privacy: { profile: true, history: true }, favoriteTeam: null }
}
