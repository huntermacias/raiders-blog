// The score of a game report as it really was. Studio's score fields are typed by hand and a loss typed the wrong way round reads as a win on
// every page that shows it, so wherever the Lab has the game its play-by-play score is used instead. Server side (it reads the Lab's file).

import { labGameFor } from "../lab/match"
import { type FinalScore, finalScore } from "./story"

export function realScore(report: { opponent?: string | null; gameDate?: string | null; raidersScore: number; opponentScore: number }): FinalScore {
	return finalScore({ raiders: report.raidersScore, opponent: report.opponentScore }, labGameFor(report))
}
