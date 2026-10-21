import seasonJson from "@/data/lab/season.json"
import scoutingJson from "@/data/lab/scouting.json"
import historyJson from "@/data/lab/history.json"
import unitsJson from "@/data/lab/units.json"
import trailJson from "@/data/lab/trail.json"
import type { LabGame, LabSeason } from "./types"
import type { ScoutingData } from "./scouting"
import type { HistoryData, TrailData } from "./history"
import type { UnitsData } from "./unitsKit"
import { type PlayersData, STAT } from "./playersKit"

const season = seasonJson as unknown as LabSeason
const scouting = scoutingJson as unknown as ScoutingData
const history = historyJson as unknown as HistoryData
const units = unitsJson as unknown as UnitsData
// The method switch (labMethod.ts) picks the players file at build time; v1 is the default and the only one in the bundle unless it is set.
/* eslint-disable @typescript-eslint/no-require-imports */
const rawPlayers = (process.env.NEXT_PUBLIC_LAB_METHOD === "v2" ? require("../../data/lab/v2/players.json") : require("../../data/lab/players.json")) as PlayersData
// The builder writes the stats v2 adds into the v1 file as well, and v1's catalog has no entry for them: v1 keeps the stats it describes, so a run on
// v1 (a local `next dev` without the flag) shows exactly what it always has instead of failing on a stat it cannot name.
const players: PlayersData = process.env.NEXT_PUBLIC_LAB_METHOD === "v2" ? rawPlayers : { ...rawPlayers, players: rawPlayers.players.map((p) => (p.stats.every((s) => STAT[p.group]?.[s.k]) ? p : { ...p, stats: p.stats.filter((s) => STAT[p.group]?.[s.k]) })) }

export function getPlayers(): PlayersData {
	return players
}

export function getUnits(): UnitsData {
	return units
}

export function getHistory(): HistoryData {
	return history
}

/** Each team's stats and ranks after every game it has played this season (scripts/lab/build_trail.py). */
export function getTrail(): TrailData {
	return trailJson as unknown as TrailData
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
