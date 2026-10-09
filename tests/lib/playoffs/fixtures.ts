// Small leagues and game builders for the playoff tests. Team ids say where a team lives: A1 to A4 are the AFC "A"
// division, B, C and D likewise; N1 to N4 are a single NFC division.

import { type Season, buildSeason } from "@/lib/playoffs/season"
import type { Game, League, Predictions, Team } from "@/lib/playoffs/types"

const t = (id: string, conference: "AFC" | "NFC", division: string): Team => ({ id, name: id, conference, division })

export const MINI: League = {
	teams: [
		...["A", "B", "C", "D"].flatMap((d) => [1, 2, 3, 4].map((n) => t(`${d}${n}`, "AFC", `AFC ${d}`))),
		...[1, 2, 3, 4].map((n) => t(`N${n}`, "NFC", "NFC N")),
	],
	wildCards: 3,
	byes: 1,
}

/** Four teams, two divisions, one wild card: small enough to play a full round robin by hand. */
export const TINY: League = {
	teams: [t("X1", "AFC", "AFC X"), t("X2", "AFC", "AFC X"), t("Y1", "AFC", "AFC Y"), t("Y2", "AFC", "AFC Y")],
	wildCards: 1,
	byes: 1,
}

let seq = 0

export function played(home: string, away: string, hs: number, as: number, week = 1): Game {
	seq++
	return {
		id: `g${String(seq).padStart(4, "0")}_${away}_${home}`,
		week,
		homeTeam: home,
		awayTeam: away,
		homeScore: hs,
		awayScore: as,
		status: "final",
		winner: hs === as ? null : hs > as ? home : away,
		tie: hs === as,
		spread: null,
	}
}

/** The winner beat the loser, 24-17, at the winner's home unless told otherwise. */
export function beat(winner: string, loser: string, week = 1, winnerHome = true): Game {
	return winnerHome ? played(winner, loser, 24, 17, week) : played(loser, winner, 17, 24, week)
}

export function tied(a: string, b: string, week = 1, score = 20): Game {
	return played(a, b, score, score, week)
}

export function scheduled(home: string, away: string, week = 10): Game {
	seq++
	return { id: `g${String(seq).padStart(4, "0")}_${away}_${home}`, week, homeTeam: home, awayTeam: away, homeScore: null, awayScore: null, status: "scheduled", winner: null, tie: false, spread: null }
}

export function seasonOf(games: Game[], league: League = MINI, predictions: Predictions = {}): Season {
	return buildSeason(league, games, predictions)
}
