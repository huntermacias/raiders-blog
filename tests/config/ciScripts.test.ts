// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")
const IGNORE = resolve(root, "scripts/ci/vercel-ignore.sh")
const PUSH = resolve(root, "scripts/ci/push-data.sh")

function git(cwd: string, args: string[], env: Record<string, string> = {}) {
	return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...env } }).trim()
}

function commit(cwd: string, files: Record<string, string>, message: string, who = "Hunter", when = "2026-10-20T08:00:00Z") {
	for (const [name, body] of Object.entries(files)) {
		mkdirSync(join(cwd, name, ".."), { recursive: true })
		writeFileSync(join(cwd, name), body)
	}
	git(cwd, ["add", "-A"])
	const env = { GIT_AUTHOR_NAME: who, GIT_AUTHOR_EMAIL: `${who}@x.dev`, GIT_COMMITTER_NAME: who, GIT_COMMITTER_EMAIL: `${who}@x.dev`, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }
	git(cwd, ["commit", "-q", "-m", message], env)
	return git(cwd, ["rev-parse", "HEAD"])
}

function repo() {
	const dir = mkdtempSync(join(tmpdir(), "ci-"))
	git(dir, ["init", "-q", "-b", "main"])
	return dir
}

function ignore(cwd: string, env: Record<string, string>) {
	const r = spawnSync("bash", [IGNORE], { cwd, encoding: "utf8", env: { ...process.env, HOME: cwd, GIT_CONFIG_GLOBAL: "/dev/null", ...env } })
	return { code: r.status, out: r.stdout }
}

describe("tests in CI", () => {
	it("the Vercel build is just next build, and GitHub runs the suite", () => {
		expect(JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts.build).toBe("next build")
		const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8")
		expect(ci).toMatch(/pull_request:/)
		expect(ci).toMatch(/branches: \[main\]/)
		expect(ci).toMatch(/run: yarn test/)
	})
})

describe("vercel.json", () => {
	it("points the ignore step at the script", () => {
		expect(JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")).ignoreCommand).toBe("bash scripts/ci/vercel-ignore.sh")
	})
})

describe("scripts/ci/vercel-ignore.sh", () => {
	const setup = () => {
		const dir = repo()
		const deployed = commit(dir, { "app/page.tsx": "a", "README.md": "r" }, "first")
		return { dir, deployed }
	}
	const prod = (deployed: string, head: string, extra: Record<string, string> = {}) => ({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", VERCEL_GIT_PREVIOUS_SHA: deployed, VERCEL_GIT_COMMIT_SHA: head, ...extra })

	it("skips a production push that only touches notes, docs, tests, scripts or CI", () => {
		const { dir, deployed } = setup()
		const head = commit(dir, { "notes/a.md": "x", "docs/b.md": "y", "tests/c.test.ts": "z", "scripts/lab/d.py": "w", ".github/workflows/e.yml": "v", "CHANGES.md": "u" }, "notes")
		const r = ignore(dir, prod(deployed, head))
		expect(r.code).toBe(0)
		expect(r.out).toMatch(/skipping/)
	})

	it("builds when a site file is in the push, even among a dozen notes", () => {
		const { dir, deployed } = setup()
		commit(dir, { "app/page.tsx": "b" }, "code")
		const head = commit(dir, { "notes/a.md": "x" }, "notes")
		expect(ignore(dir, prod(deployed, head)).code).toBe(1)
	})

	it("builds for data, public files, config and package changes", () => {
		for (const file of ["data/lab/units.json", "public/lab/clips/x.mp4", "next.config.js", "package.json", "lib/a.ts", "components/b.tsx", "pages/api/og.tsx", "middleware.ts", "vercel.json"]) {
			const { dir, deployed } = setup()
			const head = commit(dir, { [file]: "n" }, "change")
			expect(ignore(dir, prod(deployed, head)).code, file).toBe(1)
		}
	})

	it("compares the whole push with the last deployed commit, not just its newest commit", () => {
		const { dir, deployed } = setup()
		commit(dir, { "lib/a.ts": "1" }, "code first")
		const head = commit(dir, { "notes/n.md": "2" }, "then notes")
		expect(ignore(dir, prod(deployed, head)).code).toBe(1)
	})

	it("builds when it cannot tell: no previous deploy known, or its commit is missing", () => {
		const { dir } = setup()
		const head = commit(dir, { "notes/a.md": "x" }, "notes")
		// No previous SHA: falls back to the parent commit, which exists, so this one is a plain notes push.
		expect(ignore(dir, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: head }).code).toBe(0)
		// A previous SHA that is not in the clone.
		expect(ignore(dir, prod("0".repeat(40), head)).code).toBe(1)
		// A first commit has no parent at all.
		const lone = repo()
		const only = commit(lone, { "notes/a.md": "x" }, "only")
		expect(ignore(lone, { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: only }).code).toBe(1)
	})

	it("skips a preview unless the message asks for one or the project opts in", () => {
		const { dir, deployed } = setup()
		const head = commit(dir, { "app/page.tsx": "c" }, "wip")
		const preview = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/x", VERCEL_GIT_PREVIOUS_SHA: deployed, VERCEL_GIT_COMMIT_SHA: head }
		expect(ignore(dir, { ...preview, VERCEL_GIT_COMMIT_MESSAGE: "wip" }).code).toBe(0)
		expect(ignore(dir, { ...preview, VERCEL_GIT_COMMIT_MESSAGE: "wip [preview]" }).code).toBe(1)
		expect(ignore(dir, { ...preview, VERCEL_GIT_COMMIT_MESSAGE: "wip", VERCEL_BUILD_PREVIEWS: "1" }).code).toBe(1)
	})
})

describe("scripts/ci/push-data.sh hold", () => {
	// A bare "origin" with a bot data commit at a given time, and a clone with a fresh bot commit on top, as the data jobs leave it.
	function jobs(lastBotCommit: string | null) {
		const origin = mkdtempSync(join(tmpdir(), "origin-"))
		git(origin, ["init", "-q", "--bare", "-b", "main"])
		const seed = repo()
		git(seed, ["remote", "add", "origin", origin])
		commit(seed, { "app/page.tsx": "a" }, "site", "Hunter", "2026-10-19T00:00:00Z")
		if (lastBotCommit) commit(seed, { "data/lab/units.json": "1" }, "data: refresh", "github-actions[bot]", lastBotCommit)
		git(seed, ["push", "-q", "origin", "main"])
		const work = mkdtempSync(join(tmpdir(), "work-"))
		execFileSync("git", ["clone", "-q", `file://${origin}`, work], { env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } })
		const head = commit(work, { "data/lab/units.json": "2" }, "data: refresh", "github-actions[bot]")
		return { origin, work, head }
	}
	const run = (work: string, env: Record<string, string | undefined> = {}) => {
		const now = Math.floor(Date.parse("2026-10-20T08:00:00Z") / 1000)
		// date is faked through a tiny wrapper so "now" is fixed.
		const bin = mkdtempSync(join(tmpdir(), "bin-"))
		writeFileSync(join(bin, "date"), `#!/bin/sh\nif [ "$1" = "+%s" ]; then echo ${now}; else /bin/date "$@"; fi\n`, { mode: 0o755 })
		const r = spawnSync("bash", [PUSH, "data/lab/units.json"], { cwd: work, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: work, GITHUB_EVENT_NAME: "schedule", DATA_COMMIT_MIN_MINUTES: undefined, GIT_CONFIG_GLOBAL: "/dev/null", GITHUB_REF_NAME: "main", ...env } })
		return { code: r.status, out: r.stdout + r.stderr }
	}
	const remoteHead = (origin: string) => git(origin, ["rev-parse", "main"])

	it("holds a data commit when the bot pushed one an hour ago, and drops it from the job's checkout", () => {
		const { origin, work } = jobs("2026-10-20T07:00:00Z")
		const before = remoteHead(origin)
		const r = run(work)
		expect(r.code).toBe(0)
		expect(r.out).toMatch(/Not pushing/)
		expect(remoteHead(origin)).toBe(before)
		expect(git(work, ["rev-parse", "HEAD"])).toBe(before)
	})

	it("pushes once the hold has passed, or when nothing from the bot is on main", () => {
		for (const last of ["2026-10-20T04:00:00Z", null]) {
			const { origin, work, head } = jobs(last)
			expect(run(work).code).toBe(0)
			expect(remoteHead(origin)).toBe(head)
		}
	})

	it("never holds a run started by hand, and the hold can be switched off", () => {
		for (const env of [{ GITHUB_EVENT_NAME: "workflow_dispatch" }, { DATA_COMMIT_MIN_MINUTES: "0" }] as Record<string, string>[]) {
			const { origin, work, head } = jobs("2026-10-20T07:30:00Z")
			expect(run(work, env).code).toBe(0)
			expect(remoteHead(origin)).toBe(head)
		}
	})

	it("honours a different hold", () => {
		const { origin, work, head } = jobs("2026-10-20T07:00:00Z")
		expect(run(work, { DATA_COMMIT_MIN_MINUTES: "30" }).code).toBe(0)
		expect(remoteHead(origin)).toBe(head)
	})
})

describe("the weekly Lab refresh", () => {
	it("is never held back, because it only runs twice a week and a dropped commit means no page for the new game", () => {
		const wf = readFileSync(resolve(root, ".github/workflows/lab-data.yml"), "utf8")
		const step = wf.slice(wf.indexOf("name: Commit if changed"))
		expect(step).toMatch(/DATA_COMMIT_MIN_MINUTES: "0"/)
		expect(step).toMatch(/bash scripts\/ci\/push-data\.sh data\/lab public\/lab\/clips/)
	})
})
