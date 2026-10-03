// Pure logic for the power-rankings page. A week's document is just an ordered
// list of teams; everything else (rank, movement, history) is derived here so
// the numbers can always be re-derived from what was entered in Studio.

import { RAIDERS } from "./nfl"

export type RankedTeamDoc = { _key?: string; team: string; note?: string | null }

export type RankingsDoc = {
	_id: string
	season: number
	week: number
	headline?: string | null
	post?: { slug: string; title: string } | null
	teams?: RankedTeamDoc[] | null
}

export type RankRow = {
	team: string
	rank: number
	note?: string | null
	/** Rank in the previous week's rankings, or null if the team is new to the list. */
	prevRank: number | null
	/** Positive = moved up. 0 = unchanged. null = no previous week to compare to. */
	change: number | null
	/** Rank in every week up to and including this one (oldest first); null where a week had no entry. */
	history: (number | null)[]
}

export type RankingsWeek = {
	week: number
	headline?: string | null
	post?: { slug: string; title: string } | null
	rows: RankRow[]
}

/**
 * Build one board per week, oldest to newest. `docs` may arrive in any order
 * and may contain several documents for the same week (a re-do); the one that
 * sorts last in the input wins, so pass them oldest-edited first if that
 * matters. Weeks are compared in order of `week` number.
 */
export function buildBoards(docs: RankingsDoc[]): RankingsWeek[] {
	const byWeek = new Map<number, RankingsDoc>()
	for (const d of docs) {
		if (d.teams && d.teams.length > 0) byWeek.set(d.week, d)
	}
	const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b)

	const rankOf = new Map<number, Map<string, number>>()
	for (const w of weeks) {
		const m = new Map<string, number>()
		;(byWeek.get(w)?.teams ?? []).forEach((t, i) => {
			if (t.team && !m.has(t.team)) m.set(t.team, i + 1)
		})
		rankOf.set(w, m)
	}

	return weeks.map((w, wi) => {
		const doc = byWeek.get(w) as RankingsDoc
		const prev = wi > 0 ? rankOf.get(weeks[wi - 1]) : undefined
		const rows: RankRow[] = []
		const seen = new Set<string>()
		;(doc.teams ?? []).forEach((t) => {
			if (!t.team || seen.has(t.team)) return
			seen.add(t.team)
			const rank = rows.length + 1
			const prevRank = prev?.get(t.team) ?? null
			rows.push({
				team: t.team,
				rank,
				note: t.note,
				prevRank,
				change: prev ? (prevRank === null ? null : prevRank - rank) : null,
				history: weeks.slice(0, wi + 1).map((hw) => rankOf.get(hw)?.get(t.team) ?? null),
			})
		})
		return { week: w, headline: doc.headline, post: doc.post, rows }
	})
}

export type Mover = { team: string; rank: number; change: number }

/** Biggest risers (positive change) and fallers (negative), largest first. Ties keep list order. */
export function biggestMovers(rows: RankRow[], count = 3): { risers: Mover[]; fallers: Mover[] } {
	const moved = rows.filter((r): r is RankRow & { change: number } => typeof r.change === "number" && r.change !== 0)
	const risers = moved
		.filter((r) => r.change > 0)
		.sort((a, b) => b.change - a.change || a.rank - b.rank)
		.slice(0, count)
		.map((r) => ({ team: r.team, rank: r.rank, change: r.change }))
	const fallers = moved
		.filter((r) => r.change < 0)
		.sort((a, b) => a.change - b.change || a.rank - b.rank)
		.slice(0, count)
		.map((r) => ({ team: r.team, rank: r.rank, change: r.change }))
	return { risers, fallers }
}

export function raidersRow(rows: RankRow[]): RankRow | null {
	return rows.find((r) => r.team === RAIDERS) ?? null
}

/** "up 3", "down 2", "no change", or "" when there is nothing to compare to. */
export function movementWords(change: number | null): string {
	if (change === null) return ""
	if (change === 0) return "no change"
	return change > 0 ? `up ${change}` : `down ${Math.abs(change)}`
}

/** "No. 1", "No. 12" -- the ordinal style used in headlines on the site. */
export function noLabel(rank: number): string {
	return `No. ${rank}`
}
