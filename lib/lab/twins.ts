// "Season twins" for the page: the Raiders' closest team-seasons, worked out once at build from the same tables
// "Will it last?" uses. The matching itself is in twinsKit.ts.

import { getGames, getHistory, getScouting } from "./data"
import { buildTables, MAX_GAMES, MIN_GAMES } from "./history"
import { type Backtest, type TwinMode, type TwinsResult, TWIN_MODES, backtest, findTwins } from "./twinsKit"

export type TwinsView = {
	season: number
	n: number
	first: number
	last: number
	/** The Raiders' record through n games, when none was a tie. */
	start: { wins: number; losses: number } | null
	modes: Record<TwinMode, { result: TwinsResult; test: Backtest | null } | null>
	/** Changes when the data does. */
	stamp: number
}

/** Everything the page needs, or null when the Raiders have not played enough games (or have played too many). */
export function getTwinsView(): TwinsView | null {
	const history = getHistory()
	const scouting = getScouting()
	const lv = scouting.teams.LV
	if (!lv || lv.g < MIN_GAMES || lv.g > MAX_GAMES) return null
	const built = buildTables(history, lv.g, scouting)
	if (!built) return null
	const modes = {} as TwinsView["modes"]
	for (const m of TWIN_MODES) {
		const result = findTwins(built.meta, built.tables, m.id)
		modes[m.id] = result ? { result, test: backtest(built.meta, built.tables, m.id) } : null
	}
	if (!modes.all) return null
	const games = getGames().slice(0, lv.g)
	const start = games.length === lv.g && games.every((g) => g.result !== "T") ? { wins: games.filter((g) => g.result === "W").length, losses: games.filter((g) => g.result === "L").length } : null
	return { season: scouting.season, n: lv.g, first: history.first, last: history.last, start, modes, stamp: Date.parse(scouting.generatedAt) || 0 }
}
