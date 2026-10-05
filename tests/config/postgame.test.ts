import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

describe("the postgame pipeline", () => {
	const code = ["lib/postgame/draft.ts", "lib/postgame/run.ts", "scripts/postgame/run.ts"].map(read).join("\n")

	it("only ever creates drafts and patches the body: it never publishes, replaces or deletes", () => {
		expect(code).not.toMatch(/createOrReplace|["']delete["']|\bdelete:|publish\(|\bpublish:/)
		expect(code).toMatch(/createIfNotExists/)
		expect(read("lib/postgame/draft.ts")).toMatch(/_id: `drafts\./)
	})

	it("only touches the blocks it owns", () => {
		expect(read("lib/postgame/draft.ts")).toMatch(/KEY_PREFIX = "pg-"/)
		expect(read("lib/postgame/run.ts")).toMatch(/mergeBody/)
	})

	it("posts nothing to social media and keeps secrets out of the code", () => {
		expect(code).not.toMatch(/twitter\.com|api\.x\.com|facebook|instagram/i)
		expect(code).not.toMatch(/sk[A-Za-z0-9]{30,}/)
		expect(read("scripts/postgame/run.ts")).toMatch(/process\.env\.SANITY_WRITE_TOKEN/)
	})

	describe("postgame.yml", () => {
		const yml = read(".github/workflows/postgame.yml")
		it("runs on a schedule and by hand, with read-only access to the repo", () => {
			expect(yml).toMatch(/cron:/)
			expect(yml).toMatch(/workflow_dispatch/)
			expect(yml).toMatch(/contents: read/)
		})
		it("uses the secrets and does nothing, with a warning, when they are missing", () => {
			expect(yml).toMatch(/secrets\.SANITY_WRITE_TOKEN/)
			expect(yml).toMatch(/secrets\.NOTIFY_WEBHOOK_URL/)
			expect(yml).toMatch(/::warning::/)
			expect(yml).not.toMatch(/exit 1/)
		})
		it("never runs two at once", () => {
			expect(yml).toMatch(/concurrency:/)
		})
	})

	describe("lab-data.yml", () => {
		const yml = read(".github/workflows/lab-data.yml")
		it("tests the scripts before it builds anything, then builds all the data", () => {
			const at = (s: string) => yml.indexOf(s)
			expect(at("pytest")).toBeGreaterThan(-1)
			for (const s of ["build_lab_data.py --season", "build_fourth_down.py --season", "build_scouting.py --season"]) {
				expect(at(s)).toBeGreaterThan(at("pytest"))
			}
		})
		it("draws the clips with ffmpeg and commits them with the data in one push", () => {
			expect(yml).toMatch(/apt-get install .*ffmpeg/)
			expect(yml).toMatch(/scripts\/clips\/render\.tsx/)
			expect(yml).toMatch(/git add -A data\/lab public\/lab\/clips/)
			expect(yml.match(/git push/g)).toHaveLength(1)
		})
		it("adds the Lab's pieces to drafts only when the Sanity secret exists", () => {
			expect(yml).toMatch(/postgame\.cjs enrich/)
			expect(yml).toMatch(/SANITY_WRITE_TOKEN != ''/)
		})
		it("runs one refresh at a time", () => {
			expect(yml).toMatch(/concurrency:/)
		})
	})
})
