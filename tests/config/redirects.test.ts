import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const config = require("../../next.config.js") as { redirects?: () => Promise<{ source: string; destination: string; permanent: boolean }[]> }

describe("next.config redirects", () => {
	it("sends the old Week 3 power rankings URL to /post/week-3-power-rankings permanently", async () => {
		const redirects = await config.redirects!()
		const r = redirects.find((x) => x.source.endsWith("raiders-crack-the-top-five-and-chicago-blows-up-the-top-10"))
		expect(r).toEqual({
			source: "/post/nfl-power-rankings-after-week-3-raiders-crack-the-top-five-and-chicago-blows-up-the-top-10",
			destination: "/post/week-3-power-rankings",
			permanent: true,
		})
	})

	it("never redirects a path to itself (a loop would take the page down)", async () => {
		for (const r of await config.redirects!()) expect(r.destination).not.toBe(r.source)
	})

	it("has no duplicate sources and every rule is permanent with a leading slash", async () => {
		const redirects = await config.redirects!()
		expect(new Set(redirects.map((r) => r.source)).size).toBe(redirects.length)
		for (const r of redirects) {
			expect(r.source.startsWith("/")).toBe(true)
			expect(r.destination.startsWith("/")).toBe(true)
			expect(r.permanent).toBe(true)
		}
	})
})
