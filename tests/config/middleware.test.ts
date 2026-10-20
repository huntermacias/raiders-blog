// @vitest-environment node
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { config, middleware } from "../../middleware"

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"
const req = (path: string, ua: string | null) =>
	new NextRequest(`https://www.raidersrundown.com${path}`, { headers: ua === null ? {} : { "user-agent": ua } })

describe("middleware", () => {
	it("is limited to the card route and the comparison page", () => {
		expect(config.matcher).toEqual(["/api/og", "/lab/players/compare"])
	})

	it("lets a reader's card and comparison through", () => {
		for (const path of ["/api/og?type=player&slug=brock-bowers", "/lab/players/compare?a=x&b=y", "/lab/players/compare"]) {
			const res = middleware(req(path, BROWSER))
			expect(res.status).toBe(200)
			expect(res.headers.get("x-middleware-next")).toBe("1")
		}
	})

	it("refuses a scraper on a card or a configured comparison, with a plain answer and no caching", async () => {
		for (const path of ["/api/og?type=player&slug=brock-bowers", "/lab/players/compare?a=x&b=y"]) {
			const res = middleware(req(path, "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)"))
			expect(res.status).toBe(403)
			expect(res.headers.get("cache-control")).toBe("no-store")
			expect(await res.text()).toMatch(/not allowed/)
		}
	})

	it("answers a card nobody could have linked to with the default picture, from the CDN", () => {
		const res = middleware(req("/api/og?type=whatever", BROWSER))
		expect(res.headers.get("x-middleware-rewrite")).toBe("https://www.raidersrundown.com/og-default-v2.png")
		expect(res.headers.get("cache-control")).toMatch(/s-maxage=3600/)
	})

	it("leaves the bare comparison page to scrapers (robots.txt and the sitemap already point there)", () => {
		expect(middleware(req("/lab/players/compare", "Mozilla/5.0 (compatible; Bytespider)")).status).toBe(200)
	})
})
