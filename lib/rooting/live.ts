// Games that have finished since the guide was last worked out. The guide's numbers are rebuilt when final scores reach the schedule
// file; between a game ending and that rebuild it would still be offered as something to root for. So the page takes it off the
// list as soon as the schedule file or ESPN's scoreboard (the feed the rest of the site already uses) says it is over, and says
// the numbers will catch up. Pure: the page hands in what it has read.

import type { Game } from "../playoffs/types"
import type { RootingData } from "./types"

export type Settled = { gameId: string; away: string; home: string; awayScore: number; homeScore: number; source: "schedule" | "espn" }

/** The slice of ESPN's scoreboard this needs. `state` is "post" once a game is over. */
export type BoardGame = { state: string; home: { abbr: string; score: number }; away: { abbr: string; score: number } }

export function settledGames(data: RootingData, schedule: readonly Game[], board: readonly BoardGame[] = []): Settled[] {
	const open = new Map(data.games.map((g) => [g.id, g]))
	const byPair = new Map(data.games.map((g) => [`${g.home}|${g.away}`, g]))
	const out = new Map<string, Settled>()
	for (const g of schedule) {
		if (g.status === "final" && g.homeScore !== null && g.awayScore !== null && open.has(g.id)) {
			out.set(g.id, { gameId: g.id, away: g.awayTeam, home: g.homeTeam, awayScore: g.awayScore, homeScore: g.homeScore, source: "schedule" })
		}
	}
	for (const e of board) {
		if (e.state !== "post") continue
		const g = byPair.get(`${e.home.abbr}|${e.away.abbr}`)
		if (g && !out.has(g.id)) out.set(g.id, { gameId: g.id, away: g.away, home: g.home, awayScore: e.away.score, homeScore: e.home.score, source: "espn" })
	}
	return Array.from(out.values()).sort((a, b) => (a.gameId < b.gameId ? -1 : 1))
}

/** A game that kicked off this long ago is over, whatever the files say. */
export const OVER_AFTER_MS = 4.5 * 3_600_000

/** Eastern kickoff as a UTC timestamp. Eastern is UTC-4 until early November and UTC-5 after, so the date picks the offset. */
export function kickoffEt(date: string | null | undefined, time: string | null | undefined): number | null {
	const d = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
	if (!d) return null
	const t = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null
	const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])]
	const guess = Date.UTC(y, mo - 1, da, t ? Number(t[1]) : 13, t ? Number(t[2]) : 0)
	return guess + (isEasternDaylight(y, mo, da) ? 4 : 5) * 3_600_000
}

/** US daylight time runs from the second Sunday in March to the first Sunday in November. */
function isEasternDaylight(y: number, m: number, d: number): boolean {
	const nthSunday = (month: number, n: number) => {
		const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay()
		return 1 + ((7 - first) % 7) + (n - 1) * 7
	}
	if (m < 3 || m > 11) return false
	if (m === 3) return d >= nthSunday(3, 2)
	if (m === 11) return d < nthSunday(11, 1)
	return true
}

/**
 * Games the guide still lists as open that kicked off long enough ago to be over, and that no source has a final score for yet.
 * These are the sign the data is behind: the numbers cannot reflect a result nobody has recorded.
 */
export function overdueGames(data: RootingData, settled: readonly Settled[], now: number): string[] {
	const done = new Set(settled.map((s) => s.gameId))
	const out: string[] = []
	for (const g of data.games) {
		if (done.has(g.id)) continue
		const start = kickoffEt(g.date, g.time)
		if (start !== null && now > start + OVER_AFTER_MS) out.push(g.id)
	}
	return out
}
