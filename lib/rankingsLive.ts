// Live scores for the Power Rankings page. The page already knows every team; this adds "and here is the game they are playing right now" from
// the scoreboard the Live page uses. Pure: no React, no fetch, so it is easy to test with plain objects.

import { teamByAbbr, teamInfo } from "./nfl"
import { statusFor } from "./liveStrip"
import type { LiveGameInfo } from "./live/types"

const HOUR = 3600_000
/** A finished game stays on its teams' rows this long after kickoff (Thursday night through the following Tuesday). */
export const FINAL_KEEP_MS = 90 * HOUR
/** A game that has not started shows its kickoff this far ahead. */
export const SOON_KEEP_MS = 7 * 24 * HOUR
/** How often to ask for fresh scores while a game is on. */
export const LIVE_POLL_MS = 20_000

export type TeamGame = {
	gameId: string
	state: "pre" | "in" | "post"
	/** True when this team is the home team. */
	atHome: boolean
	me: { abbr: string; score: number }
	opp: { abbr: string; score: number; name: string }
	/** "Q3 4:12", "Halftime", "Final", "Final/OT", or the kickoff time ("Sun 1:25 PM"). */
	status: string
	/** How this team is doing: winning/losing/tied while it is on, won/lost/tie after it, null before. */
	outcome: "winning" | "losing" | "tied" | "won" | "lost" | "tie" | null
	href: string
}

function outcomeOf(state: TeamGame["state"], mine: number, theirs: number): TeamGame["outcome"] {
	if (state === "pre") return null
	if (mine === theirs) return state === "in" ? "tied" : "tie"
	if (state === "in") return mine > theirs ? "winning" : "losing"
	return mine > theirs ? "won" : "lost"
}

/** Every team on this week's scoreboard, by site abbreviation, with the game it is in. Games too old or too far off to matter are left out. */
export function gamesByTeam(games: LiveGameInfo[] | null | undefined, now: number): Record<string, TeamGame> {
	const out: Record<string, TeamGame> = {}
	for (const g of games ?? []) {
		const kickoff = g.kickoff ? Date.parse(g.kickoff) : NaN
		if (g.state === "post" && !Number.isNaN(kickoff) && now - kickoff > FINAL_KEEP_MS) continue
		if (g.state === "pre" && !Number.isNaN(kickoff) && kickoff - now > SOON_KEEP_MS) continue
		const status = statusFor(g)
		for (const home of [true, false]) {
			const me = home ? g.home : g.away
			const opp = home ? g.away : g.home
			out[me.abbr] = {
				gameId: g.id,
				state: g.state,
				atHome: home,
				me: { abbr: me.abbr, score: me.score },
				opp: { abbr: opp.abbr, score: opp.score, name: opp.name },
				status,
				outcome: outcomeOf(g.state, me.score, opp.score),
				href: `/live?game=${encodeURIComponent(g.id)}`,
			}
		}
	}
	return out
}

/** How many games are being played right now. */
export const liveCount = (games: LiveGameInfo[] | null | undefined): number => (games ?? []).filter((g) => g.state === "in").length

/** Milliseconds until the page should ask for scores again, or null to stop. Quick while a game is on, a check as kickoff nears, nothing otherwise. */
export function pollDelay(games: LiveGameInfo[] | null | undefined, now: number): number | null {
	if (liveCount(games) > 0) return LIVE_POLL_MS
	let soonest = Infinity
	for (const g of games ?? []) {
		if (g.state !== "pre") continue
		const k = g.kickoff ? Date.parse(g.kickoff) : NaN
		if (!Number.isNaN(k) && k > now - 30 * 60_000 && k < soonest) soonest = k
	}
	if (soonest === Infinity) return null
	// Within the hour before kickoff, check every minute; farther out, wake up about an hour ahead (never more than 15 minutes from now).
	const untilHour = soonest - HOUR - now
	return untilHour > 0 ? Math.min(untilHour, 15 * 60_000) : 60_000
}

// ---- sharing ---------------------------------------------------------------------------------------------------------------------------

/** A number that changes every minute, so a link posted after the score moved is a new address and X fetches its card again. */
export const minuteStamp = (now: number = Date.now()): number => Math.floor(now / 60_000)

export const gamePagePath = (gameId: string, stamp?: number): string => `/live?game=${encodeURIComponent(gameId)}${stamp ? `&v=${stamp}` : ""}`
export const gameCardPath = (gameId: string, stamp?: number): string => `/api/og?type=live&game=${encodeURIComponent(gameId)}${stamp ? `&v=${stamp}` : ""}`

export const noText = (rank: number | null | undefined): string => (rank ? `No. ${rank} ` : "")

/**
 * The words of a post about one game: "Q3 4:12: No. 2 Bills 21, No. 5 Chiefs 17." The leader goes first; ranks come from the page's
 * board (null when the opponent isn't on it). `ranks` maps a site abbreviation to its rank.
 */
export function gameShareText(g: TeamGame, ranks: Record<string, number | undefined>): string {
	const mine = { nick: teamByAbbr(g.me.abbr).nick, score: g.me.score, rank: ranks[g.me.abbr] }
	const theirs = { nick: teamByAbbr(g.opp.abbr).nick, score: g.opp.score, rank: ranks[g.opp.abbr] }
	if (g.state === "pre") {
		const [a, h] = g.atHome ? [theirs, mine] : [mine, theirs]
		return `${noText(a.rank)}${a.nick} at ${noText(h.rank)}${h.nick}, ${g.status}. Power rankings and live scores:`
	}
	const [lead, trail] = mine.score >= theirs.score ? [mine, theirs] : [theirs, mine]
	const score = `${noText(lead.rank)}${lead.nick} ${lead.score}, ${noText(trail.rank)}${trail.nick} ${trail.score}`
	return g.state === "post" ? `Final: ${score}.` : `${g.status}: ${score}.`
}

/** The site abbreviation for a team name from the rankings board. */
export const abbrOf = (team: string): string => teamInfo(team).abbr

const keep = (g: LiveGameInfo, now: number): boolean => {
	const kickoff = g.kickoff ? Date.parse(g.kickoff) : NaN
	if (g.state === "post") return Number.isNaN(kickoff) || now - kickoff <= FINAL_KEEP_MS
	if (g.state === "pre") return Number.isNaN(kickoff) || kickoff - now <= SOON_KEEP_MS
	return true
}

/** The week's games in the order the scores strip shows them: live first, then finished (latest first), then coming up (soonest first). */
export function stripGames(games: LiveGameInfo[] | null | undefined, now: number): LiveGameInfo[] {
	const time = (g: LiveGameInfo) => (g.kickoff ? Date.parse(g.kickoff) : 0) || 0
	const rank = (g: LiveGameInfo) => (g.state === "in" ? 0 : g.state === "post" ? 1 : 2)
	return (games ?? [])
		.filter((g) => keep(g, now))
		.sort((a, b) => rank(a) - rank(b) || (a.state === "post" ? time(b) - time(a) : time(a) - time(b)))
}
