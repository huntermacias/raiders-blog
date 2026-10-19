// Loads the Rooting Guide for the homepage's Lab band. It reads only files in the repo, so it cannot slow the page down on the network,
// and it never throws: if the data is missing or the season is over, the band simply shows its tools without the odds panel.

import { getGames, getSchedule } from "./playoffs/data"
import { getRooting } from "./rooting/data"
import { settledGames } from "./rooting/live"
import { buildView } from "./rooting/view"
import { DEFAULT_TEAM } from "./rooting/share"
import { type RootingSnapshot, chooseView, rootingSnapshot } from "./homeLab"

export function loadRootingSnapshot(): RootingSnapshot | null {
	try {
		const data = getRooting()
		if (!data) return null
		const schedule = getGames()
		const season = getSchedule().season
		const settled = settledGames(data, schedule, [])
		const view = chooseView((goal) => buildView({ data, schedule, query: { team: DEFAULT_TEAM, goal, week: null, scope: "week" }, settled, season, now: Date.now() }))
		if (view.empty === "season-over") return null
		return rootingSnapshot(view)
	} catch (err) {
		console.log("homepage lab band failed", err)
		return null
	}
}
