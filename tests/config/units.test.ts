import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("the team grades refresh", () => {
	const wf = read(".github/workflows/units.yml")

	it("runs often through the game days, on a schedule that can be started by hand too", () => {
		const crons = (wf.match(/- cron: "[^"]+"/g) ?? []).map((m) => m.slice(8, -1))
		expect(crons).toHaveLength(2)
		// Sunday to Wednesday every two hours, and a few times a day from Thursday to Saturday.
		expect(crons.some((c) => /\*\/2 \* \* 0-3$/.test(c))).toBe(true)
		expect(crons.some((c) => / 4-6$/.test(c))).toBe(true)
		expect(wf).toContain("workflow_dispatch:")
	})

	it("shares the Lab data lock, so two jobs never edit the same files at once", () => {
		for (const f of [".github/workflows/units.yml", ".github/workflows/lab-data.yml", ".github/workflows/injuries.yml", ".github/workflows/rooting.yml"]) {
			expect(read(f), f).toMatch(/group: lab-data\s*\n\s*cancel-in-progress: false/)
		}
	})

	it("tests the scripts, builds only the grades, scouting and player profiles, and commits only those four files", () => {
		expect(wf).toContain("pytest scripts/lab/test_build_units.py")
		expect(wf).toContain("scripts/lab/build_units.py")
		expect(wf).toContain("scripts/lab/build_scouting.py")
		expect(wf).toContain("scripts/lab/test_build_players.py")
		expect(wf).toContain("scripts/lab/build_players.py")
		expect(wf).toMatch(/git add data\/lab\/units\.json data\/lab\/scouting\.json data\/lab\/players\.json data\/lab\/player-logs\.json data\/lab\/player-situations\.json\n/)
		expect(wf).not.toMatch(/git add (-A|\.)/)
		expect(wf).toContain("git diff --cached --quiet")
	})

	it("pushes through the retry script, because the other data bots commit to the same branch", () => {
		expect(wf).toMatch(/bash scripts\/ci\/push-data\.sh data\/lab\/units\.json /)
		expect(wf).not.toMatch(/git push/)
		expect(read(".github/workflows/lab-data.yml")).toMatch(/bash scripts\/ci\/push-data\.sh /)
		const script = read("scripts/ci/push-data.sh")
		expect(script).toMatch(/for i in 1 2 3/)
		expect(script).toMatch(/git reset --quiet --hard/)
	})

	it("counts a game only once its plays are in", () => {
		const py = read("scripts/lab/build_units.py")
		expect(py).toMatch(/play/i)
		expect(read("scripts/lab/test_build_units.py")).toContain("test_a_game_counts_only_once_its_plays_are_in")
	})
})

describe("the workflows that install the site's packages", () => {
	// The runner's own Yarn is version 1, which refuses a project that pins Yarn 4. setup-node's yarn cache runs `yarn` itself, so Corepack
	// has to be on before it.
	for (const f of ["lab-data", "rooting"]) {
		it(`${f}.yml enables Corepack before setup-node caches Yarn`, () => {
			const wf = read(`.github/workflows/${f}.yml`)
			expect(read("package.json")).toContain('"packageManager": "yarn@')
			const enable = wf.indexOf("run: corepack enable")
			const setup = wf.indexOf("actions/setup-node@v4")
			expect(enable).toBeGreaterThan(-1)
			expect(setup).toBeGreaterThan(-1)
			expect(enable).toBeLessThan(setup)
			expect(wf).toContain("cache: yarn")
		})
	}
})

describe("the clip drawing step in lab-data.yml", () => {
	// resvg and satori are left out of the bundle, so Node finds them by looking upward from the bundle's folder. In /tmp that never reaches
	// the repo's node_modules ("Cannot find module '@resvg/resvg-js'").
	it("writes the bundle inside the repo, next to the packages it leaves out", () => {
		const wf = read(".github/workflows/lab-data.yml")
		expect(wf).toMatch(/--external:@resvg\/resvg-js/)
		expect(wf).toContain("--outfile=node_modules/.cache/render-clips.cjs")
		expect(wf).toContain("node node_modules/.cache/render-clips.cjs")
		expect(wf).not.toContain("/tmp/render-clips.cjs")
	})
})

describe("the clip renderer's frame list", () => {
	// ffmpeg's concat demuxer reads a relative path from the folder the list file is in. A path that already includes that folder
	// (which is what a relative --out gives, as in the workflow) fails with "Impossible to open .../.tmp-week-5-landscape/public/lab/clips/...".
	it("names each frame by its file name alone", () => {
		const src = read("scripts/clips/render.tsx")
		expect(src).toMatch(/list\.push\(`file '\$\{base\}'`/)
		expect(src).not.toMatch(/list\.push\(`file '\$\{name\}'`/)
	})
})
