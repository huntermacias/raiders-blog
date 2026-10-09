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

describe("header navigation", () => {
	const header = read("components/Header.tsx")
	const footer = read("components/Footer.tsx")

	it("keeps the main bar short and puts the quieter pages under More", () => {
		const main = header.slice(header.indexOf("const mainLinks"), header.indexOf("const moreLinks"))
		const more = header.slice(header.indexOf("const moreLinks"), header.indexOf("function NavLink"))
		expect((main.match(/href:/g) ?? []).length).toBeLessThanOrEqual(6)
		for (const href of ["/live", "/community", "https://huntermacias.com"]) {
			expect(more).toContain(href)
			expect(main).not.toContain(href)
		}
	})

	it("builds the Lab menu from the list of Lab tools, so a new tool shows up without editing the header", () => {
		expect(header).toContain('from "@/lib/lab/tools"')
		expect(header).toMatch(/labHref=|labelHref=/)
		expect(header).toMatch(/LAB_TOOLS\.map/)
	})

	it("lets the phone menu scroll, so the last links are never cut off on a short screen", () => {
		const sheet = header.slice(header.indexOf("<SheetContent"), header.indexOf(">", header.indexOf("<SheetContent")) + 1)
		expect(sheet).toMatch(/overflow-y-auto/)
		expect(sheet).toMatch(/safe-area-inset-bottom/)
	})

	it("still lists the live and discussion pages in the footer", () => {
		expect(footer).toContain('href="/live"')
		expect(footer).toContain('href="/community"')
	})
})
