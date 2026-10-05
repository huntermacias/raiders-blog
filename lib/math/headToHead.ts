// The slim per-team record the Compare tool needs, and the head-to-head arithmetic. Pure.

import { normalCdf } from "../live/winprob"
import { teamByAbbr } from "../nfl"
import type { TeamDetail, TeamUpcoming } from "./report"
import { ELO_PER_POINT, MARGIN_SD, winChance } from "./season"

export type CompareTeam = {
	abbr: string
	name: string
	nick: string
	color: string
	blogger: number
	math: number
	rating: number
	record: { w: number; l: number; t: number }
	playoffs: number | null
	division: number | null
	projWins: number | null
	sosRank: number | null
	/** Box-score view, when there is one. */
	yardageMargin: number | null
	margin: number | null
	turnoverMargin: number | null
	/** Games still to play, so a scheduled meeting can be found. */
	upcoming: TeamUpcoming[]
}

export function toCompareTeam(t: TeamDetail): CompareTeam {
	const info = teamByAbbr(t.abbr)
	return {
		abbr: t.abbr,
		name: info.name,
		nick: info.nick,
		color: info.color,
		blogger: t.blogger,
		math: t.math,
		rating: t.rating,
		record: t.record,
		playoffs: t.odds?.playoffs ?? null,
		division: t.odds?.division ?? null,
		projWins: t.odds?.projWins ?? null,
		sosRank: t.odds?.sosRank ?? null,
		yardageMargin: t.under?.yardageMargin ?? null,
		margin: t.under?.margin ?? null,
		turnoverMargin: t.under?.turnoverMargin ?? null,
		upcoming: t.upcoming,
	}
}

export type HeadToHead = {
	/** Chance `a` beats `b` on a neutral field. */
	neutral: number
	/** Expected margin for `a` on a neutral field, in points. */
	margin: number
	/** Chance `a` wins at a's home and at b's. */
	atA: number
	atB: number
	/** The next scheduled meeting from `a`'s side, if any. */
	meeting: { week: number; aHome: boolean; chance: number } | null
	/** Who is ahead on my board and on the math, by abbreviation (null: same team can't happen). */
	bloggerPick: string
	mathPick: string
}

export function headToHead(a: CompareTeam, b: CompareTeam): HeadToHead {
	const diff = a.rating - b.rating
	const next = a.upcoming.find((g) => g.opp === b.abbr) ?? null
	return {
		neutral: normalCdf(diff / ELO_PER_POINT / MARGIN_SD),
		margin: diff / ELO_PER_POINT,
		atA: winChance(a.rating, b.rating),
		atB: 1 - winChance(b.rating, a.rating),
		meeting: next ? { week: next.week, aHome: next.home, chance: next.chance } : null,
		bloggerPick: a.blogger <= b.blogger ? a.abbr : b.abbr,
		mathPick: a.rating >= b.rating ? a.abbr : b.abbr,
	}
}
