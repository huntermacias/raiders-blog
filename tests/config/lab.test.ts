import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

describe("the Lab section", () => {
	it("is in the site navigation, footer and sitemap", () => {
		expect(read("components/Header.tsx")).toMatch(/href:\s*"\/lab"/)
		expect(read("components/Footer.tsx")).toMatch(/href="\/lab"/)
		const sitemap = read("pages/sitemap.xml.tsx")
		expect(sitemap).toContain("/lab`")
		expect(sitemap).toMatch(/getGames\(\)/)
	})

	// Game pages are built once at deploy time from the JSON in the repo. They must stay
	// static: no revalidate (the ISR bug on Next 13.2.1 hit pages like that), and unknown
	// slugs must 404 rather than render.
	it("builds each game page ahead of time and 404s everything else", () => {
		const page = read("app/(user)/lab/[slug]/page.tsx")
		expect(page).toMatch(/export function generateStaticParams/)
		expect(page).toMatch(/export const dynamicParams = false/)
		expect(page).not.toMatch(/export const revalidate/)
		expect(page).not.toMatch(/force-dynamic/)
	})

	it("credits nflverse and its license wherever the data is shown", () => {
		for (const f of ["app/(user)/lab/page.tsx", "app/(user)/lab/[slug]/page.tsx"]) {
			const src = read(f)
			expect(src).toMatch(/nflverse/)
			expect(src).toMatch(/CC BY 4\.0/)
		}
	})

	it("never shows tracking data from the NFL Big Data Bowl, which may not be published", () => {
		const files = ["lib/lab/types.ts", "lib/lab/data.ts", "scripts/lab/build_lab_data.py"]
		for (const f of files) expect(read(f)).not.toMatch(/big.?data.?bowl|tracking/i)
	})

	it("is refreshed every week by a scheduled job that tests the script first", () => {
		const wf = ".github/workflows/lab-data.yml"
		expect(existsSync(resolve(root, wf))).toBe(true)
		const yml = read(wf)
		expect(yml).toMatch(/cron:/)
		expect(yml).toMatch(/workflow_dispatch/)
		expect(yml).toMatch(/build_lab_data\.py/)
		expect(yml.indexOf("pytest")).toBeGreaterThan(-1)
		expect(yml.indexOf("pytest")).toBeLessThan(yml.indexOf("build_lab_data.py --season"))
	})

	// The Lab has to work in light and dark. Colors come from the .lab custom properties
	// (styles/globals.css) and Tailwind's lab-* colors, never from hardcoded dark-only values.
	describe("light and dark themes", () => {
		const files = ["components/lab/WinProbabilityReplay.tsx", "components/lab/DriveReplay.tsx", "components/lab/DriveBits.tsx", "components/lab/DriveMap.tsx", "components/lab/FieldTurf.tsx", "components/lab/FieldHud.tsx", "components/lab/PlayFx.tsx", "components/lab/Football.tsx", "components/lab/Sparkline.tsx", "components/lab/Tip.tsx", "app/(user)/lab/page.tsx", "app/(user)/lab/[slug]/page.tsx"]

		it.each(files)("%s has no dark-only colors", (f) => {
			const src = read(f)
			expect(src).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
			expect(src).not.toMatch(/\b(text|bg|border|divide)-white\//)
			expect(src).not.toMatch(/bg-\[#0/)
			expect(src).not.toMatch(/rgba\(255,\s*255,\s*255/)
			expect(src).not.toMatch(/["'`]#fff["'`]/)
		})

		it("defines both themes, and a per-game opponent color", () => {
			const css = read("styles/globals.css")
			expect(css).toMatch(/\.lab\s*\{/)
			expect(css).toMatch(/\.dark \.lab\s*\{/)
			expect(css).toMatch(/--lab-opp-light/)
			expect(css).toMatch(/--lab-opp-dark/)
			expect(read("tailwind.config.js")).toMatch(/lab:\s*\{/)
		})

		it("defines the turf colors in both themes, matching the ones the tests check", async () => {
			const css = read("styles/globals.css")
			const { FIELD } = await import("../../lib/lab/colors")
			const light = css.slice(css.indexOf(".lab {"), css.indexOf(".dark .lab {"))
			const dark = css.slice(css.indexOf(".dark .lab {"))
			for (const block of [light, dark]) for (const t of ["--lab-field:", "--lab-field-band:", "--lab-field-line:", "--lab-field-num:", "--lab-field-glow:", "--lab-field-shade:", "--lab-casing:"]) expect(block).toContain(t)
			expect(light).toContain(`--lab-field: ${FIELD.light}`)
			expect(dark).toContain(`--lab-field: ${FIELD.dark}`)
		})

		it.each(["app/(user)/lab/page.tsx", "app/(user)/lab/[slug]/page.tsx"])("%s sets the lab theme and the opponent's colors", (f) => {
			const src = read(f)
			expect(src).toMatch(/className="lab /)
			expect(src).toMatch(/labColorVars\(/)
		})
	})
	describe("season twins", () => {
		const page = "app/(user)/lab/season-twins/page.tsx"

		it("is a static page built from the JSON in the repo, with the lab theme, the data credit and no dark-only colors", () => {
			const src = read(page)
			expect(src).not.toMatch(/export const revalidate/)
			expect(src).not.toMatch(/force-dynamic/)
			expect(src).not.toMatch(/readClient|sanity/i)
			expect(src).toMatch(/className="lab /)
			expect(src).toMatch(/Credit/)
			expect(src).toMatch(/History covers every regular season/)
			for (const f of [page, "components/lab/SeasonTwins.tsx"]) {
				const code = read(f)
				expect(code).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
				expect(code).not.toMatch(/bg-\[#0/)
				expect(code).not.toMatch(/rgba\(255,\s*255,\s*255/)
				expect(code).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/)
			}
		})

		it("is in the sitemap and linked from the Lab", () => {
			expect(read("pages/sitemap.xml.tsx")).toContain("/lab/season-twins")
			expect(read("app/(user)/lab/page.tsx")).toContain("/lab/season-twins")
		})

		it("keeps the matching in code that does not import the data files, so the browser can run it", () => {
			const kit = read("lib/lab/twinsKit.ts")
			expect(kit).toMatch(/from "\.\/historyKit"/)
			expect(kit).not.toMatch(/from "\.\/(data|history)"/)
			expect(kit).not.toMatch(/tracking/i)
			const comp = read("components/lab/SeasonTwins.tsx")
			expect(comp).not.toMatch(/lib\/lab\/(data|history|twins)"/)
		})
	})
	describe("position-group matchups", () => {
		const pages = ["app/(user)/lab/teams/page.tsx", "app/(user)/lab/matchups/page.tsx", "app/(user)/lab/matchup/[pair]/page.tsx"]
		const parts = [...pages, "components/lab/MatchupReport.tsx", "components/lab/TeamBoard.tsx", "components/lab/UnitBits.tsx", "components/lab/UnitsCredit.tsx", "lib/lab/unitsTheme.ts"]

		it.each(pages)("%s is built from the JSON in the repo, with the lab theme and no revalidate", (f) => {
			const src = read(f)
			expect(src).not.toMatch(/export const revalidate/)
			expect(src).not.toMatch(/force-dynamic/)
			expect(src).not.toMatch(/readClient|sanity/i)
			expect(src).toMatch(/lab-opp|theme\.className/)
		})

		it("credits nflverse, FTN and Pro Football Reference wherever the numbers are shown", () => {
			expect(read("components/lab/UnitsCredit.tsx")).toMatch(/FTN charting, Pro Football Reference advanced stats/)
			for (const f of pages) expect(read(f)).toMatch(/UnitsCredit/)
			expect(read("app/(user)/lab/scouting/[abbr]/page.tsx")).toMatch(/UnitsCredit/)
			expect(read("scripts/lab/build_units.py")).toMatch(/CC BY 4\.0/)
		})

		it.each(parts)("%s has no dark-only colors", (f) => {
			const code = read(f)
			expect(code).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
			expect(code).not.toMatch(/bg-\[#0/)
			expect(code).not.toMatch(/rgba\(255,\s*255,\s*255/)
			expect(code).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/)
		})

		it("keeps the matchup logic in code that does not import the data files, so the browser can run it", () => {
			const kit = read("lib/lab/unitsKit.ts")
			expect(kit).not.toMatch(/^import /m)
			expect(read("components/lab/TeamBoard.tsx")).not.toMatch(/lib\/lab\/(data|units)"/)
		})

		it("never shows tracking data from the NFL Big Data Bowl", () => {
			for (const f of ["lib/lab/unitsKit.ts", "lib/lab/units.ts", "scripts/lab/build_units.py"]) expect(read(f)).not.toMatch(/big.?data.?bowl|tracking/i)
		})

		it("is rebuilt by the weekly job, after its script is tested", () => {
			const yml = read(".github/workflows/lab-data.yml")
			expect(yml).toMatch(/build_units\.py --season/)
			expect(yml.indexOf("pytest")).toBeLessThan(yml.indexOf("build_units.py --season"))
		})

		it("is in the sitemap and linked from the Lab", () => {
			const sitemap = read("pages/sitemap.xml.tsx")
			expect(sitemap).toContain("/lab/teams")
			expect(sitemap).toContain("/lab/matchups")
			expect(sitemap).toMatch(/matchupPath/)
			const hub = read("app/(user)/lab/page.tsx")
			expect(hub).toContain("/lab/teams")
			expect(hub).toContain("/lab/matchups")
		})
	})
	describe("will it last", () => {
		const page = "app/(user)/lab/will-it-last/page.tsx"

		it("is a static page built from the JSON in the repo, with no revalidate", () => {
			expect(read(page)).not.toMatch(/export const revalidate/)
			expect(read(page)).not.toMatch(/force-dynamic/)
			expect(read(page)).not.toMatch(/readClient|sanity/i)
		})

		it("credits nflverse and its license, names the history years, and has no dark-only colors", () => {
			expect(read(page)).toMatch(/Credit/)
			expect(read(page)).toMatch(/History covers every regular season/)
			for (const f of [page, "components/lab/WillItLast.tsx", "components/lab/WillItLastParts.tsx"]) {
				const src = read(f)
				expect(src).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
				expect(src).not.toMatch(/bg-\[#0/)
				expect(src).not.toMatch(/rgba\(255,\s*255,\s*255/)
				expect(src).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/)
			}
		})

		it("sets the lab theme, and is in the sitemap and linked from the Lab", () => {
			expect(read(page)).toMatch(/className="lab /)
			expect(read("pages/sitemap.xml.tsx")).toContain("/lab/will-it-last")
			expect(read("app/(user)/lab/page.tsx")).toContain("/lab/will-it-last")
		})

		it("keeps the chart's team names and filters in code that does not import the data files", () => {
			const kit = read("lib/lab/historyKit.ts")
			expect(kit).toMatch(/TEAM_NAMES/)
			expect(kit).toMatch(/export function analyze/)
			expect(read("components/lab/WillItLast.tsx")).toMatch(/from "@\/lib\/lab\/historyKit"/)
		})

		it("keeps the history script's wording clear of the tracking data that may not be published", () => {
			for (const f of ["lib/lab/history.ts", "lib/lab/historyKit.ts", "scripts/lab/build_history.py"]) expect(read(f)).not.toMatch(/big.?data.?bowl|tracking/i)
		})

		it("is covered by the weekly workflow's script tests, and the history file does not need a weekly rebuild", () => {
			const yml = read(".github/workflows/lab-data.yml")
			expect(yml).toMatch(/pytest scripts\/lab/)
			expect(yml).not.toMatch(/build_history\.py/)
		})
	})

	describe("the top plays and scouting pages", () => {
		it("builds the game and opponent pages ahead of time, with no revalidate", () => {
			const scout = read("app/(user)/lab/scouting/[abbr]/page.tsx")
			expect(scout).toMatch(/export function generateStaticParams/)
			expect(scout).toMatch(/export const dynamicParams = false/)
			for (const f of ["app/(user)/lab/top-plays/page.tsx", "app/(user)/lab/scouting/[abbr]/page.tsx"]) {
				expect(read(f)).not.toMatch(/export const revalidate/)
				expect(read(f)).not.toMatch(/force-dynamic/)
			}
		})

		it("reads the next opponent from the schedule on request, like /schedule", () => {
			const hub = read("app/(user)/lab/scouting/page.tsx")
			expect(hub).toMatch(/export const dynamic = "force-dynamic"/)
			expect(hub).not.toMatch(/export const revalidate/)
		})

		it("credits nflverse and its license, and has no dark-only colors", () => {
			const pages = ["app/(user)/lab/top-plays/page.tsx", "app/(user)/lab/scouting/page.tsx", "app/(user)/lab/scouting/[abbr]/page.tsx"]
			const credit = read("components/lab/Credit.tsx")
			expect(credit).toMatch(/nflverse/)
			expect(credit).toMatch(/CC BY 4\.0/)
			for (const f of [...pages, "components/lab/Credit.tsx", "components/lab/TopPlays.tsx", "components/lab/ScoutReport.tsx", "components/lab/CardFigure.tsx", "components/lab/ShareCard.tsx", "components/lab/ShareRedirect.tsx"]) {
				const src = read(f)
				expect(src).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
				expect(src).not.toMatch(/bg-\[#0/)
				expect(src).not.toMatch(/rgba\(255,\s*255,\s*255/)
			}
			for (const f of pages.filter((p) => !p.includes("scouting"))) expect(read(f)).toMatch(/Credit/)
		})

		it("is in the sitemap and linked from the Lab", () => {
			const sitemap = read("pages/sitemap.xml.tsx")
			for (const p of ["/lab/top-plays", "/lab/scouting"]) expect(sitemap).toContain(p)
			const hub = read("app/(user)/lab/page.tsx")
			for (const p of ["/lab/top-plays", "/lab/scouting"]) expect(hub).toContain(p)
			expect(sitemap).not.toContain("fourth-down")
			expect(hub).not.toContain("fourth-down")
		})
	})

	describe("playoff machine", () => {
		const page = "app/(user)/lab/playoff-machine/page.tsx"
		const ui = ["PlayoffMachine", "GameCard", "StandingsTable", "BracketView", "RaidersOutlook"].map((n) => `components/playoffs/${n}.tsx`)

		it("is a static page: the schedule comes from the JSON in the repo and the picks live in the browser", () => {
			const src = read(page)
			expect(src).not.toMatch(/export const revalidate/)
			expect(src).not.toMatch(/force-dynamic/)
			expect(src).not.toMatch(/readClient|sanity/i)
			expect(src).toMatch(/className="lab /)
			expect(src).toMatch(/NFL Playoff Machine/)
			expect(src).toMatch(/nflverse/)
			expect(src).toMatch(/CC BY 4\.0/)
		})

		it("has no dark-only colors", () => {
			for (const f of [page, ...ui, "components/playoffs/usePlayoffScenario.ts"]) {
				const src = read(f)
				expect(src, f).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
				expect(src, f).not.toMatch(/bg-\[#0/)
				expect(src, f).not.toMatch(/rgba\(255,\s*255,\s*255/)
				expect(src, f).not.toMatch(/["'`]#[0-9a-fA-F]{3,8}["'`]/)
			}
		})

		it("is in the sitemap and linked from the Lab", () => {
			expect(read("pages/sitemap.xml.tsx")).toContain("/lab/playoff-machine")
			expect(read("app/(user)/lab/page.tsx")).toContain("/lab/playoff-machine")
		})

		it("keeps the engine free of the data file, the clock and Math.random, so it can run thousands of times anywhere", () => {
			const engine = ["bracket", "clinching", "picks", "season", "simulator", "standings", "tiebreakers", "share", "summary", "schedule"]
			for (const n of engine) {
				// Comments may mention these by name; only code counts.
				const src = read(`lib/playoffs/${n}.ts`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
				expect(src, n).not.toMatch(/data\/lab\/schedule/)
				expect(src, n).not.toMatch(/Date\.now|new Date\(\)/)
				expect(src, n).not.toMatch(/Math\.random/)
			}
			expect(read("lib/playoffs/data.ts")).toMatch(/data\/lab\/schedule\.json/)
		})

		it("builds the schedule from nflverse, under its license", () => {
			expect(read("scripts/lab/build_schedule.py")).toMatch(/CC BY 4\.0/)
		})
	})
})
