// Reads the schedule file (data/lab/schedule.json) into the engine's Game shape. No JSON import here, so tests and the
// browser can feed in any schedule.

import type { Game } from "./types"

export type RawScheduleGame = {
	id: string
	week: number
	away: string
	home: string
	date?: string
	time?: string | null
	awayScore?: number
	homeScore?: number
	spread?: number | null
}

export type RawSchedule = {
	season: number
	generatedAt: string
	source: string
	played: number
	throughWeek: number
	games: RawScheduleGame[]
}

export function scheduleGames(raw: RawSchedule): Game[] {
	return raw.games.map((g) => {
		const final = typeof g.homeScore === "number" && typeof g.awayScore === "number"
		const tie = final && g.homeScore === g.awayScore
		return {
			id: g.id,
			week: g.week,
			homeTeam: g.home,
			awayTeam: g.away,
			homeScore: final ? (g.homeScore as number) : null,
			awayScore: final ? (g.awayScore as number) : null,
			status: final ? "final" : "scheduled",
			winner: final && !tie ? ((g.homeScore as number) > (g.awayScore as number) ? g.home : g.away) : null,
			tie,
			date: g.date,
			time: g.time ?? null,
			spread: g.spread ?? null,
		}
	})
}
