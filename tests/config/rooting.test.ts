import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { LAB_TOOLS } from "../../lib/lab/tools"

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")
/** The code without its // comment lines, so a comment saying "no Math.random" is not mistaken for using it. */
const code = (f: string) => read(f).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
const list = (dir: string) => readdirSync(join(root, dir)).map((f) => `${dir}/${f}`)

const LIB = list("lib/rooting")
const UI = list("components/rooting")
const PAGE = "app/(user)/lab/rooting-guide/page.tsx"

describe("the Sunday Rooting Guide", () => {
	it("is a Lab tool, in the hub, the sitemap and the Playoff Machine's links", () => {
		const tool = LAB_TOOLS.find((t) => t.id === "rooting-guide")
		expect(tool?.href).toBe("/lab/rooting-guide")
		expect(tool?.isNew).toBe(true)
		expect(read("pages/sitemap.xml.tsx")).toContain("/lab/rooting-guide")
		expect(read("pages/sitemap.xml.tsx")).toMatch(/lab\/rooting-guide\?team=/)
		expect(read("app/(user)/lab/playoff-machine/page.tsx")).toContain('href="/lab/rooting-guide"')
	})

	it("does not duplicate the Playoff Machine's simulation, seeding or tiebreakers", () => {
		const own = LIB.map((f) => [f, code(f)] as const)
		for (const [f, src] of own) {
			expect(src, f).not.toMatch(/function\s+(seedConference|seedDivision|breakTie|breakTies|rankTeams|buildSeason|simulateSeason|ratingsFor|homeChance|uniform)\b/)
			expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date\(\)/)
			expect(src, f).not.toMatch(/from "node:|from "fs"/)
		}
		const engine = read("lib/rooting/engine.ts")
		for (const name of ["buildSeason", "seedConference", "ratingsFor", "homeChance", "uniform"]) expect(engine).toContain(name)
		expect(engine).toMatch(/from "\.\.\/playoffs\/odds"/)
		expect(engine).toMatch(/from "\.\.\/playoffs\/standings"/)
	})

	it("is built from a stored file, so a page view never runs a simulation", () => {
		const page = read(PAGE)
		expect(page).toContain("getRooting")
		expect(page).not.toMatch(/simulateConditional|simulateTie|simulateBaseline|simulateOdds|buildRooting|oddsRun/)
		expect(page).not.toMatch(/readClient|sanity/i)
		expect(page).toMatch(/className="lab /)
		expect(page).toMatch(/nflverse/)
		expect(page).toMatch(/CC BY 4\.0/)
		for (const f of UI) expect(read(f), f).not.toMatch(/simulate|buildRooting|oddsRun/)
		// One import of the data file, and it is validated.
		expect(read("lib/rooting/data.ts")).toContain("isRootingData")
		const importers = [...LIB, ...UI, PAGE].filter((f) => /from "@\/data\/lab\/rooting\.json"/.test(code(f)))
		expect(importers).toEqual(["lib/rooting/data.ts"])
	})

	it("polls nothing: the page reads ESPN's scoreboard once on the server with a short timeout, and no component fetches", () => {
		for (const f of UI) expect(read(f), f).not.toMatch(/\bfetch\(|setInterval|EventSource|useSWR/)
		const page = read(PAGE)
		expect(page).toContain("getScoreboard")
		expect(page).toMatch(/1500/)
		expect(page).not.toMatch(/setInterval|revalidate\s*=/)
	})

	it("uses the shared link and the Lab's colours, not next/link or dark-only values", () => {
		for (const f of [PAGE, ...UI]) {
			const src = read(f)
			expect(src, f).not.toMatch(/from "next\/link"/)
			expect(src, f).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
			expect(src, f).not.toMatch(/bg-\[#0/)
			expect(src, f).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/)
		}
	})

	it("gives the page server-rendered metadata with a card, and keeps variants on one canonical address", () => {
		const page = read(PAGE)
		expect(page).toMatch(/export async function generateMetadata/)
		expect(page).toMatch(/alternates: \{ canonical/)
		expect(page).toMatch(/type=rooting/)
		expect(page).toMatch(/summary_large_image/)
		expect(page).toMatch(/application\/ld\+json/)
	})

	it("serves the card through /api/og with the same caching as the other generated cards", () => {
		const og = read("pages/api/og.tsx")
		expect(og).toMatch(/type=rooting/)
		expect(og.match(/"rooting"/g)?.length).toBeGreaterThanOrEqual(2)
		expect(read("lib/og/insightSpecs.ts")).toMatch(/q\.type === "rooting"/)
		expect(read("lib/og/cards.tsx")).toMatch(/renderRootingCard/)
	})

	it("reports the six things asked for to analytics, and nothing per tap", () => {
		const events = read("lib/rooting/events.ts")
		for (const name of ["rooting_team_selected", "rooting_goal_changed", "rooting_game_expanded", "rooting_share_opened", "rooting_link_copied", "rooting_playoff_machine_click"]) expect(events).toContain(name)
		expect(read("lib/analytics.ts")).toMatch(/export function trackRooting/)
		expect(read("components/lab/ShareCard.tsx")).toMatch(/utm_campaign=\$\{campaign\}/)
		expect(read("lib/rooting/share.ts")).toContain('"rooting_guide"')
	})

	it("is rebuilt by a workflow when final scores change, and again with the weekly Lab refresh", () => {
		expect(existsSync(join(root, ".github/workflows/rooting.yml"))).toBe(true)
		const wf = read(".github/workflows/rooting.yml")
		expect(wf).toMatch(/schedule:/)
		expect(wf).toMatch(/workflow_dispatch/)
		expect(wf).toMatch(/group: lab-data/)
		expect(wf).toMatch(/contents: write/)
		expect(wf).toContain("scripts/lab/build_schedule.py")
		expect(wf).toContain("scripts/rooting/build.ts")
		expect(wf).toContain("git add data/lab/schedule.json data/lab/rooting.json")
		expect(wf).toMatch(/git pull --rebase/)
		const weekly = read(".github/workflows/lab-data.yml")
		expect(weekly).toContain("scripts/rooting/build.ts")
		expect(weekly.indexOf("build_schedule.py")).toBeLessThan(weekly.indexOf("scripts/rooting/build.ts"))
	})

	it("skips the build when no result has changed", () => {
		const script = read("scripts/rooting/build.ts")
		expect(script).toMatch(/resultsKey/)
		expect(script).toMatch(/unchanged/)
		expect(script).toMatch(/--force/)
	})
})
