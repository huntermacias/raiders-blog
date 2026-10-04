import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

function sources(dir: string): string[] {
	const out: string[] = []
	for (const name of readdirSync(resolve(root, dir))) {
		const rel = join(dir, name)
		const st = statSync(resolve(root, rel))
		if (st.isDirectory()) out.push(...sources(rel))
		else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel)
	}
	return out
}

describe("header branding", () => {
	const header = read("components/Header.tsx")

	it("leads with the fan credential and the receipts, not a founding year", () => {
		expect(header).toContain("Lifelong Raider")
		expect(header).toContain("Every pick graded in public")
		expect(header).not.toMatch(/since 20\d\d/i)
	})

	it("uses the top strip to send people to the league", () => {
		expect(header).toMatch(/<Link href="\/league"[^>]*>\s*Beat the Blogger/)
	})

	it("hosts its own logo instead of hotlinking one", () => {
		expect(header).toContain('src="/logo-rr.png"')
		expect(existsSync(resolve(root, "public/logo-rr.png"))).toBe(true)
	})
})

describe("no hotlinked brand images", () => {
	// A third-party image host (Pinterest, imgur) can remove or change the file at any time.
	it.each(["app", "components", "pages", "lib"])("%s/ has no pinimg or imgur URLs", (dir) => {
		const offenders = sources(dir).filter((f) => /i\.pinimg\.com|i\.imgur\.com/.test(read(f)))
		expect(offenders).toEqual([])
	})
})
