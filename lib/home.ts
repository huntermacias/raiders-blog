// Pure helpers for the homepage. No React, no Sanity client: everything is a
// plain function of the documents, so the page can always be re-derived from
// what is entered in Studio.

import { teamInfo } from "./nfl"
import type { ScheduleRow } from "./schedule"
import { nextGame } from "./schedule"
import type { LiveGameInfo } from "./live/types"

/** How long after kickoff a game still counts as "live" before we call it over. */
export const GAME_WINDOW_MS = 4 * 3600 * 1000

/**
 * How long after kickoff the top of the page is still about the game that was just played. Three days takes a Sunday game through
 * Tuesday night: the day or two when people want the score, the recap and what it did to the playoff race. After that the page is
 * about the next one.
 */
export const FINAL_WINDOW_MS = 72 * 3600 * 1000

export type HubState =
	| { kind: "live"; game: ScheduleRow }
	/** The game just ended: `game` is the finished one and `next` is what comes after it (null when nothing is left). */
	| { kind: "final"; game: ScheduleRow; next: ScheduleRow | null }
	| { kind: "next"; game: ScheduleRow }
	| { kind: "idle" }

function kickoffMs(r: ScheduleRow): number | null {
	if (!r.kickoff) return null
	const t = new Date(r.kickoff).getTime()
	return Number.isNaN(t) ? null : t
}

/** The scoreboard's Raiders game, if this week's board has one. */
function espnRaidersGame(board: LiveGameInfo[] | null | undefined): LiveGameInfo | null {
	return (board ?? []).find((g) => g.home.abbr === "LV" || g.away.abbr === "LV") ?? null
}

/**
 * What the top of the homepage should be about right now: a game that is
 * being played, a game that finished in the last three days, the next game on
 * the schedule, or nothing (offseason, or a schedule that has not been entered).
 *
 * `board` is ESPN's scoreboard when the page has it. ESPN knows whether the Raiders are playing, so it
 * decides "Game on" for its game: live while ESPN says in progress, never live once it says final or has
 * not started. Without a board (or for a game ESPN doesn't list) the kickoff time in Studio decides.
 */
export function hubState(rows: ScheduleRow[], nowMs: number, board?: LiveGameInfo[] | null): HubState {
	const espn = espnRaidersGame(board)
	const espnOpp = espn ? (espn.home.abbr === "LV" ? espn.away.abbr : espn.home.abbr) : null
	const isEspnGame = (r: ScheduleRow) => espnOpp != null && teamInfo(r.opponent).abbr === espnOpp

	const live = rows.find((r) => {
		if (r.bye || !r.opponent) return false
		if (espn && isEspnGame(r)) return espn.state === "in"
		if (r.outcome) return false
		const t = kickoffMs(r)
		return t !== null && t <= nowMs && nowMs < t + GAME_WINDOW_MS
	})
	if (live) return { kind: "live", game: live }

	// A game with a final score that kicked off in the last three days is still the story.
	const justPlayed = rows
		.filter((r) => !r.bye && r.outcome && kickoffMs(r) !== null)
		.sort((a, b) => (kickoffMs(b) as number) - (kickoffMs(a) as number))[0]
	if (justPlayed) {
		const t = kickoffMs(justPlayed) as number
		if (nowMs >= t && nowMs - t < FINAL_WINDOW_MS) {
			const rest = rows.filter((r) => r !== justPlayed && !(espn?.state === "post" && isEspnGame(r)))
			return { kind: "final", game: justPlayed, next: nextGame(rest, nowMs) }
		}
	}

	// A game ESPN has finished must not come back as "next", even if the score isn't in Studio yet.
	const upcoming = espn?.state === "post" ? rows.filter((r) => !isEspnGame(r)) : rows
	const next = nextGame(upcoming, nowMs)
	if (next) return { kind: "next", game: next }

	return { kind: "idle" }
}

/** Finished games, oldest first. */
export function playedGames(rows: ScheduleRow[]): ScheduleRow[] {
	return rows.filter((r) => !r.bye && r.outcome).sort((a, b) => a.week - b.week)
}

/** Whole minutes for a word count, never less than one. */
export function minutesFromWords(words: number, wordsPerMinute = 225): number {
	return Math.max(1, Math.round((Number.isFinite(words) ? words : 0) / wordsPerMinute))
}

/** Whole minutes to read a Portable Text body, never less than one. */
export function readingMinutes(body: unknown, wordsPerMinute = 225): number {
	if (!Array.isArray(body)) return 1
	let words = 0
	for (const block of body) {
		const children = (block as { children?: { text?: string }[] })?.children
		if (!Array.isArray(children)) continue
		for (const c of children) {
			if (typeof c?.text === "string") words += c.text.trim().split(/\s+/).filter(Boolean).length
		}
	}
	return minutesFromWords(words, wordsPerMinute)
}

/**
 * Splits a countdown into the parts the clock shows. Negative or zero input
 * means kickoff has passed.
 */
export function countdownParts(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
	const total = Math.max(0, Math.floor(ms / 1000))
	return {
		days: Math.floor(total / 86400),
		hours: Math.floor((total % 86400) / 3600),
		minutes: Math.floor((total % 3600) / 60),
		seconds: total % 60,
	}
}

/** How far off the pick's margin was, in points: the predicted margin against the final one. Null until the game has a score. */
export function pickMarginError(row: ScheduleRow): number | null {
	if (!row.pick || !row.outcome) return null
	return Math.abs(row.pick.raiders - row.pick.opponent - (row.outcome.raiders - row.outcome.opponent))
}
