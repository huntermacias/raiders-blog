import seasonJson from "@/data/lab/season.json"
import scoutingJson from "@/data/lab/scouting.json"
import historyJson from "@/data/lab/history.json"
import unitsJson from "@/data/lab/units.json"
import type { LabGame, LabSeason } from "./types"
import type { ScoutingData } from "./scouting"
import type { HistoryData } from "./history"
import type { UnitsData } from "./unitsKit"

const season = seasonJson as unknown as LabSeason
const scouting = scoutingJson as unknown as ScoutingData
const history = historyJson as unknown as HistoryData
const units = unitsJson as unknown as UnitsData

export function getUnits(): UnitsData {
	return units
}

export function getHistory(): HistoryData {
	return history
}

export function getScouting(): ScoutingData {
	return scouting
}

export function getSeason(): LabSeason {
	return season
}

/** URL slug for a game, e.g. "week-3". One Raiders game per week, so the week is unique. */
export function gameSlug(game: Pick<LabGame, "week">): string {
	return `week-${game.week}`
}

export function getGames(): LabGame[] {
	return season.games.slice().sort((a, b) => a.week - b.week)
}

export function getGameBySlug(slug: string): LabGame | undefined {
	return getGames().find((g) => gameSlug(g) === slug)
}

export function neighbours(slug: string): { prev?: LabGame; next?: LabGame } {
	const games = getGames()
	const i = games.findIndex((g) => gameSlug(g) === slug)
	if (i < 0) return {}
	return { prev: games[i - 1], next: games[i + 1] }
}
