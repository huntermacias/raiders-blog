// Builds data/lab/rooting.json for the Sunday Rooting Guide from the schedule file (bundled with esbuild, run under Node):
//
//   npx esbuild scripts/rooting/build.ts --bundle --platform=node --format=cjs --alias:@=. --outfile=/tmp/rooting.cjs
//   node /tmp/rooting.cjs [--schedule data/lab/schedule.json] [--out data/lab/rooting.json] [--force]
//
// The simulation is the slow part (a minute or two), so it only runs when the results have changed: the file records a key made
// from the model version, the settings and every final score, and an unchanged key means there is nothing to do. The run is
// deterministic, so the same schedule always gives the same file.

import { existsSync, readFileSync, writeFileSync } from "node:fs"

import { type RawSchedule, scheduleGames } from "../../lib/playoffs/schedule"
import { buildRooting } from "../../lib/rooting/build"
import { ROOTING_SIMS, TIE_SIMS, resultsKey } from "../../lib/rooting/engine"
import type { RootingData } from "../../lib/rooting/types"

function arg(name: string, fallback: string): string {
	const i = process.argv.indexOf(`--${name}`)
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const schedulePath = arg("schedule", "data/lab/schedule.json")
const outPath = arg("out", "data/lab/rooting.json")
const force = process.argv.includes("--force")

const raw = JSON.parse(readFileSync(schedulePath, "utf8")) as RawSchedule
const games = scheduleGames(raw)
const key = resultsKey(games, { sims: ROOTING_SIMS, tieSims: TIE_SIMS })

let previous: RootingData | null = null
if (existsSync(outPath)) {
	try {
		previous = JSON.parse(readFileSync(outPath, "utf8")) as RootingData
	} catch {
		previous = null
	}
}

if (!force && previous && previous.resultsKey === key && previous.season === raw.season) {
	console.log(`rooting guide unchanged (${key})`)
} else {
	const started = Date.now()
	const data = buildRooting(games, {
		season: raw.season,
		generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
		source: "Elo ratings from this season's final scores (the Playoff Machine's model), simulated with the Playoff Machine's engine and tiebreakers. Calculations by Raiders Rundown.",
		previous: previous && previous.season === raw.season ? previous : null,
		log: (line) => console.log(line),
	})
	writeFileSync(outPath, JSON.stringify(data) + "\n")
	const kb = Math.round(readFileSync(outPath).length / 1024)
	console.log(`wrote ${outPath}: ${data.games.length} open games, ${data.sims || "exact"} simulated seasons, ${Object.keys(data.ties).length} tie runs, ${data.completed.length} completed, ${data.history.length} snapshots, ${kb} KB, ${Math.round((Date.now() - started) / 1000)} s`)
}
