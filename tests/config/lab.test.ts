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
		const files = ["components/lab/WinProbabilityReplay.tsx", "components/lab/DriveReplay.tsx", "components/lab/Sparkline.tsx", "components/lab/Tip.tsx", "app/(user)/lab/page.tsx", "app/(user)/lab/[slug]/page.tsx"]

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

		it.each(["app/(user)/lab/page.tsx", "app/(user)/lab/[slug]/page.tsx"])("%s sets the lab theme and the opponent's colors", (f) => {
			const src = read(f)
			expect(src).toMatch(/className="lab /)
			expect(src).toMatch(/labColorVars\(/)
		})
	})
})
