import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { getFlagFiles } from "../../lib/lab/flagsData"

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("the penalty flags refresh", () => {
	const wf = read(".github/workflows/flags.yml")

	it("runs often through the game days, on a schedule that can be started by hand too, off the minute the grades refresh runs", () => {
		const crons = (wf.match(/- cron: "[^"]+"/g) ?? []).map((m) => m.slice(8, -1))
		expect(crons).toHaveLength(2)
		expect(crons.some((c) => /\*\/2 \* \* 0-3$/.test(c))).toBe(true)
		expect(crons.some((c) => / 4-6$/.test(c))).toBe(true)
		expect(wf).toContain("workflow_dispatch:")
		const units = read(".github/workflows/units.yml")
		expect(crons[0].split(" ")[0]).not.toBe((units.match(/- cron: "(\d+) \*\/2/) ?? [])[1])
	})

	it("shares the Lab data lock, so two jobs never edit the same files at once", () => {
		expect(wf).toMatch(/group: lab-data\s*\n\s*cancel-in-progress: false/)
	})

	it("tests the script, builds only the season's flags file and commits only it, pushing through the retry script", () => {
		expect(wf).toContain("pytest scripts/lab/test_build_flags.py")
		expect(wf).toMatch(/build_flags\.py --season "\$SEASON" --out "data\/lab\/flags-\$SEASON\.json" --players data\/lab\/players\.json/)
		expect(wf).toMatch(/git add "data\/lab\/flags-\$SEASON\.json"/)
		expect(wf).not.toMatch(/git add (-A|\.)/)
		expect(wf).toContain("git diff --cached --quiet")
		expect(wf).toMatch(/bash scripts\/ci\/push-data\.sh "data\/lab\/flags-\$SEASON\.json"/)
		expect(wf).not.toMatch(/git push/)
	})

	it("reads a file for the season the workflow builds", () => {
		const season = (wf.match(/LAB_SEASON \|\| '(\d+)'/) ?? [])[1]
		expect(getFlagFiles().map((f) => String(f.season))).toContain(season)
	})
})

describe("the flags pages", () => {
	it("are in the Lab's tool list and the sitemap, with a page for the hub, each team and each player", () => {
		expect(read("lib/lab/tools.ts")).toContain('href: "/lab/flags"')
		const sitemap = read("pages/sitemap.xml.tsx")
		expect(sitemap).toMatch(/FLAGS_PATH/)
		expect(sitemap).toMatch(/teamFlagsHref/)
		expect(sitemap).toMatch(/playerFlagsHref/)
		for (const f of ["app/(user)/lab/flags/page.tsx", "app/(user)/lab/flags/team/[abbr]/page.tsx", "app/(user)/lab/flags/player/[slug]/page.tsx"]) expect(existsSync(join(root, f)), f).toBe(true)
	})

	it("are built from the JSON in the repo, with no page outside it", () => {
		for (const f of ["app/(user)/lab/flags/team/[abbr]/page.tsx", "app/(user)/lab/flags/player/[slug]/page.tsx"]) expect(read(f)).toContain("export const dynamicParams = false")
	})

	it("keep the pure kit free of imports, so the browser components and the server share it", () => {
		expect(read("lib/lab/flagsKit.ts")).not.toMatch(/^import /m)
	})

	it("credit nflverse and explain the method on every page", () => {
		for (const f of ["app/(user)/lab/flags/page.tsx", "app/(user)/lab/flags/team/[abbr]/page.tsx", "app/(user)/lab/flags/player/[slug]/page.tsx"]) {
			const src = read(f)
			expect(src, f).toMatch(/FlagsMethod/)
			expect(src, f).toMatch(/Credit/)
		}
		expect(read("scripts/lab/build_flags.py")).toMatch(/CC BY 4\.0/)
	})
})
