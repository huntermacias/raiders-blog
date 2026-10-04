// Joins a Game Report from Sanity to the Lab's replay of the same game, so a recap can show its
// win probability with nothing entered by hand. The match is the opponent plus the date: a division
// rival is played twice, so the opponent alone is not enough.

import { TEAMS } from "@/lib/nfl"

import { getGames } from "./data"
import type { LabGame } from "./types"

const DAY = 86_400_000
/** How far apart, in days, a report's game date and the Lab's date may be. Covers time zones and late kickoffs. */
const WINDOW_DAYS = 3

/** The team's abbreviation from however the opponent was typed in Studio: full name, nickname or abbreviation. */
export function opponentAbbr(name?: string | null): string | null {
	const n = (name ?? "").trim().toLowerCase()
	if (!n) return null
	const t = TEAMS.find((x) => x.name.toLowerCase() === n || x.nick.toLowerCase() === n || x.abbr.toLowerCase() === n)
	if (t) return t.abbr
	// "New Orleans" or "Saints" typed as part of something longer
	const loose = TEAMS.find((x) => n.includes(x.nick.toLowerCase()) || n.includes(x.name.toLowerCase()))
	return loose?.abbr ?? null
}

export function labGameFor(report: { opponent?: string | null; gameDate?: string | null }, games: LabGame[] = getGames()): LabGame | null {
	const abbr = opponentAbbr(report.opponent)
	if (!abbr) return null
	const candidates = games.filter((g) => g.opp === abbr)
	if (candidates.length === 0) return null

	const when = report.gameDate ? new Date(report.gameDate).getTime() : NaN
	if (Number.isNaN(when)) return candidates.length === 1 ? candidates[0] : null

	let best: LabGame | null = null
	let bestGap = Infinity
	for (const g of candidates) {
		const gap = Math.abs(new Date(`${g.date}T12:00:00Z`).getTime() - when)
		if (gap < bestGap) {
			best = g
			bestGap = gap
		}
	}
	return best && bestGap <= WINDOW_DAYS * DAY ? best : null
}
