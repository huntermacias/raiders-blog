// What the homepage's live strip should say, decided from the week's scoreboard and the clock.
// Pure: no React, no fetch. The strip is for the Raiders' game only, and it only exists around a
// game: a quiet kickoff note in the hours before, the score while it is on, and the final for a
// day afterwards. Any other time the homepage shows nothing extra.

import { teamInfo } from "./nfl"
import { clockText, kickoffLabel, periodName, pct } from "./live/format"
import { currentHomeWp } from "./live/series"
import type { LiveGameInfo } from "./live/types"

const RAIDERS = "LV"
const HOUR = 3600_000

/** How long before kickoff the note appears. */
export const SOON_MS = 3 * HOUR
/** How long after kickoff a finished game stays up (a game runs about 3.5 hours). */
export const FINAL_MS = 20 * HOUR

export type StripModel = {
	kind: "live" | "soon" | "final"
	gameId: string
	href: string
	/** The Raiders first, whoever was home. */
	raiders: { abbr: string; nick: string; score: number }
	opp: { abbr: string; nick: string; score: number }
	/** "Q3 4:12", "Halftime", "Final", "Final/OT", or the kickoff time. */
	status: string
	/** Home or away, for "at"/"vs". */
	atHome: boolean
	/** The Raiders' chance to win, 0..1, once the game is on. Null before kickoff. */
	wp: number | null
	wpText: string | null
	ahead: "raiders" | "opp" | "tied"
	cta: string
	/** One sentence for screen readers. */
	label: string
}

function side(t: LiveGameInfo["home"]) {
	return { abbr: t.abbr, nick: teamInfo(t.name).nick, score: t.score }
}

function statusFor(g: LiveGameInfo): string {
	if (g.state === "post") return g.period > 4 ? "Final/OT" : "Final"
	if (g.state === "pre") return kickoffLabel(g.kickoff)
	const clock = clockText(g.clockSeconds)
	if (g.period === 2 && g.clockSeconds === 0) return "Halftime"
	if (/half/i.test(g.shortDetail) || /half/i.test(g.detail)) return "Halftime"
	return [periodName(g.period), clock].filter(Boolean).join(" ")
}

/** A win probability for a headline: a model is never sure enough to print 0% or 100%. */
export function wpLabel(p: number): string {
	if (p < 0.01) return "<1%"
	if (p > 0.99) return ">99%"
	return pct(p)
}

/** The Raiders' game on this week's board, if there is one. */
export function raidersGame(games: LiveGameInfo[]): LiveGameInfo | null {
	return games.find((g) => g.home.abbr === RAIDERS || g.away.abbr === RAIDERS) ?? null
}

/** The strip's content for `now` (ms since the epoch), or null when it should not show. */
export function stripFor(games: LiveGameInfo[] | null | undefined, now: number): StripModel | null {
	const g = raidersGame(games ?? [])
	if (!g) return null

	const kickoff = g.kickoff ? new Date(g.kickoff).getTime() : NaN
	const sinceKickoff = now - kickoff
	let kind: StripModel["kind"]
	if (g.state === "in") kind = "live"
	else if (g.state === "pre") {
		// A kickoff that is a few minutes late still reads as "soon"; one that never starts in 6 hours is not news.
		if (Number.isNaN(kickoff) || kickoff - now > SOON_MS || sinceKickoff > 6 * HOUR) return null
		kind = "soon"
	} else {
		if (Number.isNaN(kickoff) || sinceKickoff > FINAL_MS) return null
		kind = "final"
	}

	const atHome = g.home.abbr === RAIDERS
	const mine = side(atHome ? g.home : g.away)
	const opp = side(atHome ? g.away : g.home)
	const homeWp = currentHomeWp(g)
	const wp = kind === "soon" ? null : atHome ? homeWp : 1 - homeWp
	const ahead = mine.score === opp.score ? "tied" : mine.score > opp.score ? "raiders" : "opp"
	const status = statusFor(g)
	const href = `/live?game=${g.id}`

	const cta = kind === "live" ? "Follow live" : kind === "final" ? "Relive the game" : "Game center"
	const label =
		kind === "soon"
			? `Raiders ${atHome ? "vs." : "at"} ${opp.nick}, kickoff ${status}.`
			: kind === "final"
				? `${status}: Raiders ${mine.score}, ${opp.nick} ${opp.score}.`
				: `Live, ${status}: Raiders ${mine.score}, ${opp.nick} ${opp.score}.`

	return { kind, gameId: g.id, href, raiders: mine, opp, status, atHome, wp, wpText: wp == null ? null : wpLabel(wp), ahead, cta, label }
}

/** Milliseconds until the strip should ask for fresh scores again, or null to stop. */
export function stripDelay(games: LiveGameInfo[] | null | undefined, now: number): number | null {
	const m = stripFor(games, now)
	if (!m) {
		// Not showing: a Raiders game that hasn't entered its window yet is worth checking back on.
		const g = raidersGame(games ?? [])
		const kickoff = g?.kickoff ? new Date(g.kickoff).getTime() : NaN
		return g?.state === "pre" && !Number.isNaN(kickoff) && kickoff > now ? Math.min(Math.max(kickoff - SOON_MS - now, 60_000), 15 * 60_000) : null
	}
	if (m.kind === "live") return 20_000
	if (m.kind === "soon") return 45_000
	return null
}
