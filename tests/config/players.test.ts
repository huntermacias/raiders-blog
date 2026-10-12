import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Reads sources, so it runs in the plain node environment.
const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("the player movers page", () => {
	const page = read("app/(user)/lab/players/page.tsx")

	it("is a Lab tool, listed on the hub, in the strip and in the sitemap", () => {
		expect(read("lib/lab/tools.ts")).toContain('href: "/lab/players"')
		expect(read("pages/sitemap.xml.tsx")).toContain("/lab/players")
	})

	it("is built from the JSON in the repo, so it stays static", () => {
		expect(page).toContain("getPlayers()")
		expect(page).not.toMatch(/export const revalidate/)
		expect(page).not.toMatch(/force-dynamic/)
	})

	it("says when the numbers changed, credits nflverse and Pro Football Reference's charting", () => {
		expect(page).toContain('<UpdatedStamp at={data.generatedAt} kind="grades"')
		expect(page).toContain("UnitsCredit")
		expect(read("components/lab/UnitsCredit.tsx")).toMatch(/Pro Football Reference/)
		expect(read("scripts/lab/build_players.py")).toMatch(/CC BY 4\.0/)
	})

	it("tells the reader that a small sample is a reason to watch, not a verdict", () => {
		expect(page).toMatch(/Small samples move fast/)
	})

	it("has no dark-only colors, so it works in both Lab themes", () => {
		for (const f of ["components/lab/PlayerMovers.tsx", "components/lab/PlayerRoster.tsx", "components/lab/WeekBars.tsx", "app/(user)/lab/players/page.tsx"]) {
			const src = read(f)
			expect(src, f).not.toMatch(/\b(text|bg|border|divide|outline|accent)-white\b/)
			expect(src, f).not.toMatch(/bg-\[#0/)
			expect(src, f).not.toMatch(/rgba\(255,\s*255,\s*255/)
			// Good and bad colors come in a light and a dark shade.
			if (/emerald-/.test(src)) expect(src, f).toMatch(/dark:text-emerald/)
			if (/rose-/.test(src)) expect(src, f).toMatch(/dark:text-rose/)
		}
	})
})

describe("the player movers script", () => {
	const py = read("scripts/lab/build_players.py")

	it("has tests that run before it does in the refresh job", () => {
		expect(existsSync(join(root, "scripts/lab/test_build_players.py"))).toBe(true)
		const wf = read(".github/workflows/units.yml")
		expect(wf.indexOf("test_build_players.py")).toBeGreaterThan(-1)
		expect(wf.indexOf("test_build_players.py")).toBeLessThan(wf.indexOf("build_players.py --season"))
	})

	it("counts a game only once its last play is in, and keeps PFR rates to games PFR has posted", () => {
		expect(py).toContain("END GAME")
		expect(py).toContain("pfr_ok")
	})

	it("writes the file only when the numbers changed", () => {
		expect(py).toContain("data unchanged")
	})

	it("keeps the stats the script grades in step with the labels the page shows", async () => {
		const { STAT, HEADLINE } = await import("../../lib/lab/playersKit")
		for (const [group, stats] of Object.entries(STAT)) {
			const block = py.slice(py.indexOf(`"${group}": {`), py.indexOf("},", py.indexOf(`"${group}": {`)))
			for (const key of Object.keys(stats)) expect(block, `${group}.${key}`).toContain(`"${key}"`)
		}
		const headline = /HEADLINE = \{([^}]+)\}/.exec(py)![1]
		for (const [g, k] of Object.entries(HEADLINE)) expect(headline).toContain(`"${g}": "${k}"`)
	})
})
