import { getGames, getUnits } from "./data"

/**
 * The Raiders' record over their first `n` games, or null when it cannot be told (a tie, or no record for that many games).
 *
 * The replay log (season.json) is rebuilt once a week, but the grades and scouting numbers are rebuilt through the week as soon as a
 * game's plays are in, so for a while after a game the numbers cover one more game than the log. The grades file carries the Raiders'
 * record for exactly the games it counts, so it fills in until the log catches up.
 */
export function raidersStart(n: number): { wins: number; losses: number } | null {
	const games = getGames().slice(0, n)
	if (games.length === n && games.every((g) => g.result !== "T")) {
		return { wins: games.filter((g) => g.result === "W").length, losses: games.filter((g) => g.result === "L").length }
	}
	const lv = getUnits().teams.LV
	if (lv && lv.g === n && lv.t === 0) return { wins: lv.w, losses: lv.l }
	return null
}
