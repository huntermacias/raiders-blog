// The Raiders' next game, for the "Get ready" section on /live. Pure: it takes the schedule and the live board as arguments.
//
// schedule.json is refreshed by a bot and can lag a few hours (or until Tuesday) behind a final, so a game with no score is not
// necessarily one that hasn't been played. A game counts as played when the schedule has a score for it, when the live board shows it
// started or finished, or when its kickoff was long enough ago that it must be over. Whichever says so first wins.

import type { Game } from "@/lib/playoffs/types"
import type { LiveGameInfo } from "./types"

export const TEAM = "LV"

/** A game that kicked off this long ago is over, whatever the files say. */
const OVER_AFTER_MS = 4.5 * 3_600_000

export type NextUp = {
	week: number
	opp: string
	home: boolean
	/** "2026-10-25" and "16:25", Eastern time as the schedule lists them. */
	date: string | null
	time: string | null
	/** Points the home team is favored by, when the schedule has a line. */
	spread: number | null
}

/** Eastern kickoff as a UTC timestamp. Eastern is UTC-4 until early November and UTC-5 after, so the date picks the offset. */
export function kickoffMs(date: string, time: string | null): number | null {
	const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
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
	const start = nthSunday(3, 2)
	const end = nthSunday(11, 1)
	if (m < 3 || m > 11) return false
	if (m === 3) return d >= start
	if (m === 11) return d < end
	return true
}

function boardSaysStarted(g: Game, board: LiveGameInfo[] | null): boolean {
	if (!board) return false
	const live = board.find((b) => {
		const pair = (b.home.abbr === g.homeTeam && b.away.abbr === g.awayTeam)
		if (!pair) return false
		// The board holds one week, but a rematch in a later week must not be mistaken for this game.
		const start = g.date ? kickoffMs(g.date, g.time ?? null) : null
		const at = b.kickoff ? Date.parse(b.kickoff) : NaN
		return start === null || Number.isNaN(at) || Math.abs(at - start) < 36 * 3_600_000
	})
	return Boolean(live && live.state !== "pre")
}

export function nextRaidersGame(games: Game[], board: LiveGameInfo[] | null, now: number): NextUp | null {
	const mine = games
		.filter((g) => g.homeTeam === TEAM || g.awayTeam === TEAM)
		.slice()
		.sort((a, b) => a.week - b.week)
	for (const g of mine) {
		if (g.status === "final") continue
		if (boardSaysStarted(g, board)) continue
		const start = g.date ? kickoffMs(g.date, g.time ?? null) : null
		if (start !== null && start + OVER_AFTER_MS < now) continue
		const home = g.homeTeam === TEAM
		return { week: g.week, opp: home ? g.awayTeam : g.homeTeam, home, date: g.date ?? null, time: g.time ?? null, spread: g.spread ?? null }
	}
	return null
}

/** "Rams favored by 7" / "Raiders favored by 3" from the home team's spread, or null with no line. */
export function lineText(n: NextUp, oppNick: string): string | null {
	if (n.spread === null || n.spread === undefined) return null
	if (n.spread === 0) return "Pick 'em"
	const homeFav = n.spread > 0
	const raidersFav = n.home ? homeFav : !homeFav
	return `${raidersFav ? "Raiders" : oppNick} favored by ${Math.abs(n.spread)}`
}
