import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

function sources(dir: string): string[] {
	const out: string[] = []
	for (const name of readdirSync(resolve(root, dir))) {
		const rel = join(dir, name)
		if (statSync(resolve(root, rel)).isDirectory()) out.push(...sources(rel))
		else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel)
	}
	return out
}

describe("link prefetching", () => {
	it("the shared link component defaults prefetch to false", () => {
		expect(read("components/SiteLink.tsx")).toMatch(/prefetch\s*=\s*false/)
	})

	// Prefetching a force-dynamic route runs it on the server. Importing
	// next/link directly brings the default (prefetch every link in view) back.
	it.each(["app", "components", "pages"])("%s/ imports the shared link, never next/link directly", (dir) => {
		const offenders = sources(dir).filter((f) => f !== join("components", "SiteLink.tsx") && /from\s+["']next\/link["']/.test(read(f)))
		expect(offenders).toEqual([])
	})
})

describe("detail pages", () => {
	// On Next 13.2.1, revalidate + generateStaticParams makes the server throw
	// "invariant: Expected pageData to be a string for app data request" when a
	// client navigation or prefetch (an RSC request) reaches a post that was
	// not pre-rendered at build, i.e. anything published after the last deploy.
	// Render these on request until Next is upgraded.
	it.each(["app/(user)/post/[slug]/page.tsx", "app/(user)/games/[slug]/page.tsx"])("%s renders on request, not through ISR", (file) => {
		const src = read(file)
		expect(src).toMatch(/export const dynamic = "force-dynamic"/)
		expect(src).not.toMatch(/export const revalidate/)
		expect(src).not.toMatch(/export (async )?function generateStaticParams/)
	})
})
