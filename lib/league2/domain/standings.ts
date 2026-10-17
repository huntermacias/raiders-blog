// Standings and tiebreakers built from grade rows.
//
// One engine for every leaderboard: season, week, and each mode. Only the tiebreak spec changes. The Classic spec
// reproduces lib/league.ts `buildStandings` exactly (tests compare them on the same data).
//
// Pure: no I/O.

import type { Grade } from "./grading"

export type TiebreakKey = "points" | "correct" | "avgMarginError" | "lastSubmittedAt" | "joinedAt" | "handle"

export type TiebreakSpec = {
	/** Sort order, best first. The last keys should make the order total. */
	order: readonly TiebreakKey[]
	/** Rows equal on all of these share a rank (1, 2, 2, 4). */
	shareRank: readonly TiebreakKey[]
}

/** Points, correct winners, lower average margin error, earlier join, handle; first three share a rank. */
export const CLASSIC_TIEBREAKS: TiebreakSpec = {
	order: ["points", "correct", "avgMarginError", "joinedAt", "handle"],
	shareRank: ["points", "correct", "avgMarginError"],
}

/** Public modes: points, correct picks, then whoever finished entering earlier, then join date, handle. */
export const PUBLIC_TIEBREAKS: TiebreakSpec = {
	order: ["points", "correct", "lastSubmittedAt", "joinedAt", "handle"],
	shareRank: ["points", "correct", "lastSubmittedAt"],
}

export type PlayerInfo = { id: string; handle: string; joinedAt: string }

export type StandingGrade = Pick<Grade, "playerId" | "eventId" | "points" | "voided" | "detail"> & {
	/** Week the event belongs to (used for weekly boards). */
	week: number
	/** When the player last submitted this entry (ISO). Optional; used by the public tiebreak. */
	submittedAt?: string
}

export type Row = {
	rank: number
	playerId: string
	handle: string
	points: number
	games: number
	correct: number
	exact: number
	avgMarginError: number | null
	lastSubmittedAt: string
	joinedAt: string
}

export type StandingsScope = { week?: number; eventIds?: readonly string[] }

const cmp = (a: number | string, b: number | string) => (a < b ? -1 : a > b ? 1 : 0)

function compareBy(key: TiebreakKey, a: Row, b: Row): number {
	switch (key) {
		case "points":
			return b.points - a.points
		case "correct":
			return b.correct - a.correct
		case "avgMarginError":
			return (a.avgMarginError ?? Infinity) - (b.avgMarginError ?? Infinity)
		case "lastSubmittedAt":
			return cmp(a.lastSubmittedAt, b.lastSubmittedAt)
		case "joinedAt":
			return cmp(a.joinedAt, b.joinedAt)
		case "handle":
			return cmp(a.handle.toLowerCase(), b.handle.toLowerCase())
	}
}

function keyOf(key: TiebreakKey, r: Row): string {
	switch (key) {
		case "avgMarginError":
			return r.avgMarginError === null ? "n" : r.avgMarginError.toFixed(6)
		case "points":
			return String(r.points)
		case "correct":
			return String(r.correct)
		case "lastSubmittedAt":
			return r.lastSubmittedAt
		case "joinedAt":
			return r.joinedAt
		case "handle":
			return r.handle.toLowerCase()
	}
}

/**
 * Standings from grades. Voided grades are ignored. Players with no counted grade in scope are left out. If a player
 * has more than one grade for an event (they should not: pass `currentGrades`), the last one wins and nothing is
 * counted twice.
 */
export function buildRows(grades: readonly StandingGrade[], players: readonly PlayerInfo[], spec: TiebreakSpec, scope: StandingsScope = {}): Row[] {
	const allowed: Record<string, true> | null = scope.eventIds
		? scope.eventIds.reduce<Record<string, true>>((m, id) => {
				m[id] = true
				return m
			}, {})
		: null
	const byPlayer: Record<string, Record<string, StandingGrade>> = {}
	grades.forEach((g) => {
		if (g.voided) return
		if (scope.week !== undefined && g.week !== scope.week) return
		if (allowed && !allowed[g.eventId]) return
		const m = byPlayer[g.playerId] || (byPlayer[g.playerId] = {})
		m[g.eventId] = g
	})

	const rows: Row[] = []
	players.forEach((p) => {
		const m = byPlayer[p.id]
		if (!m) return
		const list = Object.keys(m).map((k) => m[k])
		if (list.length === 0) return
		let points = 0
		let correct = 0
		let exact = 0
		let errSum = 0
		let errN = 0
		let last = ""
		list.forEach((g) => {
			points += g.points
			if (g.detail.correct) correct++
			if (g.detail.exact) exact++
			if (g.detail.marginError !== null) {
				errSum += g.detail.marginError
				errN++
			}
			if (g.submittedAt && g.submittedAt > last) last = g.submittedAt
		})
		rows.push({
			rank: 0,
			playerId: p.id,
			handle: p.handle,
			points,
			games: list.length,
			correct,
			exact,
			avgMarginError: errN > 0 ? errSum / errN : null,
			lastSubmittedAt: last,
			joinedAt: p.joinedAt,
		})
	})

	rows.sort((a, b) => {
		for (let i = 0; i < spec.order.length; i++) {
			const d = compareBy(spec.order[i], a, b)
			if (d !== 0) return d
		}
		return 0
	})

	let prev = ""
	let prevRank = 0
	rows.forEach((r, i) => {
		const k = spec.shareRank.map((s) => keyOf(s, r)).join("|")
		r.rank = k === prev ? prevRank : i + 1
		prev = k
		prevRank = r.rank
	})
	return rows
}

/** Where a player stands, with the rows around them, so a small or large board can both show "you are here". */
export function aroundPlayer(rows: readonly Row[], playerId: string, radius = 2): { row: Row | null; neighbours: Row[]; of: number } {
	const i = rows.findIndex((r) => r.playerId === playerId)
	if (i < 0) return { row: null, neighbours: [], of: rows.length }
	return { row: rows[i], neighbours: rows.slice(Math.max(0, i - radius), Math.min(rows.length, i + radius + 1)), of: rows.length }
}

/**
 * Weekly champions. A player needs at least `minShare` of the week's slate entered, so one lucky pick cannot win the
 * week. Ranks are computed among eligible players only. Returns every player tied for first.
 */
export function weeklyChampions(rows: readonly Row[], slateSize: number, minShare = 0.8): Row[] {
	const need = Math.max(1, Math.ceil(slateSize * minShare))
	const eligible = rows.filter((r) => r.games >= need)
	if (eligible.length === 0) return []
	const best = eligible.reduce((m, r) => Math.max(m, r.points), -Infinity)
	return eligible.filter((r) => r.points === best)
}

/** Change in rank between two boards for the players on the newer one. Positive means moved up. */
export function rankChanges(before: readonly Row[], after: readonly Row[]): Record<string, number | null> {
	const prev: Record<string, number> = {}
	before.forEach((r) => {
		prev[r.playerId] = r.rank
	})
	const out: Record<string, number | null> = {}
	after.forEach((r) => {
		out[r.playerId] = prev[r.playerId] === undefined ? null : prev[r.playerId] - r.rank
	})
	return out
}
