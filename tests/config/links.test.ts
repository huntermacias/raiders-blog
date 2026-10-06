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
	// Posts and game reports are served through ISR. The old force-dynamic setup worked around a Next 13.2.1 bug
	// ("Expected pageData to be a string for app data request"), which Next 15 does not have. These guards keep
	// the pages cacheable: a no-store fetch (the default on `readClient`, and on ESPN reads) makes a page dynamic.
	it.each(["app/(user)/post/[slug]/page.tsx", "app/(user)/games/[slug]/page.tsx"])("%s is served through ISR", (file) => {
		const src = read(file)
		expect(src).toMatch(/export const revalidate = \d+/)
		expect(src).not.toMatch(/force-dynamic/)
		// Empty on purpose: it prerenders nothing at build, but without it Next 15 treats a dynamic-segment page as
		// fully dynamic and never caches it (verified: x-nextjs-cache MISS then HIT with it, no-store without).
		expect(src).toMatch(/export async function generateStaticParams\(\)\s*\{\s*return \[\]\s*\}/)
	})

	it.each(["app/(user)/post/[slug]/page.tsx", "app/(user)/games/[slug]/page.tsx"])("%s reads Sanity through the cacheable client", (file) => {
		const src = read(file)
		expect(src).toMatch(/isrFetch\(/)
		expect(src).not.toMatch(/readClient/)
		expect(src).not.toMatch(/\bclient\.fetch\(/)
	})

	it("the cacheable client does not send no-store", () => {
		const src = read("lib/sanity.client.ts")
		expect(src).toMatch(/export const isrFetch/)
		expect(src).toMatch(/next:\s*\{\s*revalidate:\s*ISR_REVALIDATE_SECONDS/)
	})

	it("the ESPN box score read for a game report is cacheable, the live feed still is not", () => {
		const src = read("lib/live/service.ts")
		expect(src).toMatch(/revalidateSeconds \? \{ next: \{ revalidate: revalidateSeconds \} \} : \{ cache: "no-store"/)
		expect(src).toMatch(/getJson\(`\$\{BASE\}\/summary\?event=\$\{id\}`, 4000, REPORT_REVALIDATE_SECONDS\)/)
	})
})
