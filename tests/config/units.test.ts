import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("the team grades refresh", () => {
	const wf = read(".github/workflows/units.yml")

	it("runs often through the game days, on a schedule that can be started by hand too", () => {
		const crons = [...wf.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1])
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

	it("tests the scripts, builds only the grades and scouting, and commits only those two files", () => {
		expect(wf).toContain("pytest scripts/lab/test_build_units.py")
		expect(wf).toContain("scripts/lab/build_units.py")
		expect(wf).toContain("scripts/lab/build_scouting.py")
		expect(wf).toMatch(/git add data\/lab\/units\.json data\/lab\/scouting\.json\n/)
		expect(wf).not.toMatch(/git add (-A|\.)/)
		expect(wf).toContain("git diff --cached --quiet")
	})

	it("retries the push after a rebase, because the other data bots commit to the same branch", () => {
		expect(wf).toMatch(/git pull --rebase origin/)
		expect(wf).toMatch(/for i in 1 2 3/)
		expect(read(".github/workflows/lab-data.yml")).toMatch(/git pull --rebase origin/)
	})

	it("counts a game only once its plays are in", () => {
		const py = read("scripts/lab/build_units.py")
		expect(py).toMatch(/play/i)
		expect(read("scripts/lab/test_build_units.py")).toContain("test_a_game_counts_only_once_its_plays_are_in")
	})
})
