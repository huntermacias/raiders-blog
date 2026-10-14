// The Lab hub's numbers, bound to the data in the repo. All the logic is in hubKit.ts; this file only loads the files and hands them over.
// It reads only files in the repo (no network), and every part is optional: a missing file leaves that card out instead of breaking the page.

import { loadRootingSnapshot } from "../homeLab.server"
import { getGames, getPlayers, getSeason, getUnits } from "./data"
import { type HubInput, type Drop, type Pulse, type Take, buildDrops, buildPulse, buildTakes, toolTeasers } from "./hubKit"
import { raidersGame } from "./units"
import { seasonTopPlays } from "./topPlays"
import { getTwinsView } from "./twins"

export type HubView = { input: HubInput; drops: Drop[]; pulse: Pulse; takes: Take[]; teasers: Record<string, string> }

function safe<T>(fn: () => T): T | null {
	try {
		return fn()
	} catch {
		return null
	}
}

export function getHub(): HubView {
	const players = getPlayers()
	const units = getUnits()
	const season = getSeason()
	const game = safe(() => raidersGame())
	const rooting = safe(() => loadRootingSnapshot())
	const play = safe(() => seasonTopPlays(getGames(), season.team, 1)[0]) ?? null
	const twins = safe(() => getTwinsView())
	const input: HubInput = {
		players,
		units,
		odds: rooting
			? {
					nick: rooting.nick,
					goalPhrase: rooting.goalPhrase,
					goal: rooting.goal,
					week: rooting.week,
					status: rooting.status,
					pct: rooting.pct,
					baseline: rooting.baseline,
					change: rooting.change,
					best: rooting.best,
					href: rooting.href,
					updatedAt: rooting.updatedAt,
			  }
			: null,
		play,
		twin: twins ? { result: twins.modes.all!.result, season: twins.season } : null,
		next: game ? { opp: game.home === season.team ? game.away : game.home, venue: game.home === season.team ? "vs" : "at", spread: game.spread } : null,
		stamp: Math.max(Date.parse(players.generatedAt) || 0, Date.parse(units.generatedAt) || 0, Date.parse(season.generatedAt) || 0, Date.parse(rooting?.updatedAt ?? "") || 0),
	}
	const drops = buildDrops(input)
	return { input, drops, pulse: buildPulse(input, drops), takes: buildTakes(players), teasers: toolTeasers(input, drops) }
}
