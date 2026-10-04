// Pure helpers for the homepage. No React, no Sanity client: everything is a
// plain function of the documents, so the page can always be re-derived from
// what is entered in Studio.

import type { ScheduleRow } from "./schedule"
import { nextGame } from "./schedule"

/** How long after kickoff a game still counts as "live" before we call it over. */
export const GAME_WINDOW_MS = 4 * 3600 * 1000

export type HubState =
	| { kind: "live"; game: ScheduleRow }
	| { kind: "next"; game: ScheduleRow }
	| { kind: "idle" }

function kickoffMs(r: ScheduleRow): number | null {
	if (!r.kickoff) return null
	const t = new Date(r.kickoff).getTime()
	return Number.isNaN(t) ? null : t
}

/**
 * What the top of the homepage should be about right now: a game that is
 * being played, the next game on the schedule, or nothing (offseason, or a
 * schedule that has not been entered).
 */
export function hubState(rows: ScheduleRow[], nowMs: number): HubState {
	const live = rows.find((r) => {
		if (r.bye || r.outcome || !r.opponent) return false
		const t = kickoffMs(r)
		return t !== null && t <= nowMs && nowMs < t + GAME_WINDOW_MS
	})
	if (live) return { kind: "live", game: live }

	const next = nextGame(rows, nowMs)
	if (next) return { kind: "next", game: next }

	return { kind: "idle" }
}

/** Finished games, oldest first. */
export function playedGames(rows: ScheduleRow[]): ScheduleRow[] {
	return rows.filter((r) => !r.bye && r.outcome).sort((a, b) => a.week - b.week)
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
	return Math.max(1, Math.round(words / wordsPerMinute))
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
