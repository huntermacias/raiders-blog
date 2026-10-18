import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Reads the page sources, so this runs in the plain node environment (not jsdom, which has no node:path on some installs).
describe("the Lab pages that carry a stamp", () => {
	const root = join(__dirname, "..", "..")
	const read = (f: string) => readFileSync(join(root, "app/(user)/lab", f), "utf8")
	// Each page, the data file its numbers come from, and the kind of refresh that file has.
	const PAGES: [string, string, string][] = [
		["teams/page.tsx", "data.generatedAt", "grades"],
		["matchups/page.tsx", "data.generatedAt", "grades"],
		["matchup/[pair]/page.tsx", "data.generatedAt", "grades"],
		["scouting/page.tsx", "data.generatedAt", "grades"],
		["scouting/[abbr]/page.tsx", "data.generatedAt", "grades"],
		// One page for every team, shared by the Raiders' route and the other 31 (will-it-last/[team]).
		["../../../components/lab/WillItLastPage.tsx", "scouting.generatedAt", "grades"],
		["season-twins/page.tsx", "scouting.generatedAt", "grades"],
		["players/page.tsx", "data.generatedAt", "grades"],
		["playoff-machine/page.tsx", "schedule.generatedAt", "results"],
		["rooting-guide/page.tsx", "data.generatedAt", "odds"],
		["top-plays/page.tsx", "season.generatedAt", "replays"],
	]

	it.each(PAGES)("%s shows when its data was updated", (file, at, kind) => {
		expect(read(file)).toContain(`<UpdatedStamp at={${at}} kind="${kind}"`)
	})

	it("no longer says the data is refreshed only on Mondays", () => {
		for (const [file] of PAGES) expect(read(file), file).not.toMatch(/Monday data refresh|weekly data refresh|updated every Monday/)
		expect(read("page.tsx")).not.toMatch(/updated every Monday/)
	})
})
