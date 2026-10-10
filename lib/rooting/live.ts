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
