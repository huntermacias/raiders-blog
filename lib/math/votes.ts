// Reader votes on the games where my board and the math pick different teams: "who do you trust?".
// Pure helpers shared by the vote route, the page and the tests.

import { TEAMS } from "../nfl"

export type Side = "blogger" | "math"
export type Tally = { blogger: number; math: number }

/** `w5-NE-LV`: week, away, home. Matches SlateGame.key. */
const KEY_RE = /^w(\d{1,2})-([A-Z]{2,3})-([A-Z]{2,3})$/

export type VoteTarget = { week: number; away: string; home: string }

export function parseVoteKey(key: unknown): VoteTarget | null {
	if (typeof key !== "string") return null
	const m = KEY_RE.exec(key)
	if (!m) return null
	const week = Number(m[1])
	const [away, home] = [m[2], m[3]]
	if (week < 1 || week > 18 || away === home) return null
	const known = new Set(TEAMS.map((t) => t.abbr))
	if (!known.has(away) || !known.has(home)) return null
	return { week, away, home }
}

/** Hyphens only: a dot in a Sanity id makes the document private, and these tallies are public to read. */
export function voteDocId(season: number, t: VoteTarget): string {
	return `mathvote-${season}-w${t.week}-${t.away}-${t.home}`
}

export const voteKey = (t: VoteTarget) => `w${t.week}-${t.away}-${t.home}`

export type VoteRow = { week?: number; away?: string; home?: string; blogger?: number; math?: number }

/** Tallies keyed by game key, from the rows the page reads. Junk rows are skipped. */
export function tallyMap(rows: VoteRow[] | null | undefined): Record<string, Tally> {
	const out: Record<string, Tally> = {}
	for (const r of rows ?? []) {
		const t = parseVoteKey(`w${r.week}-${r.away}-${r.home}`)
		if (!t) continue
		out[voteKey(t)] = { blogger: Math.max(0, Math.floor(Number(r.blogger) || 0)), math: Math.max(0, Math.floor(Number(r.math) || 0)) }
	}
	return out
}

/** Share of the votes that went to `side`, as a whole percent, or null with no votes. */
export function sharePct(t: Tally | undefined, side: Side): number | null {
	if (!t) return null
	const total = t.blogger + t.math
	return total === 0 ? null : Math.round((t[side] / total) * 100)
}
