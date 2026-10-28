// @vitest-environment node
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { config, middleware } from "../../middleware"

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"
const req = (path: string, ua: string | null, cookie?: string) =>
	new NextRequest(`https://www.raidersrundown.com${path}`, { headers: { ...(ua === null ? {} : { "user-agent": ua }), ...(cookie ? { cookie } : {}) } })
const HUMAN = `rr_h=${Math.floor(Date.now() / 86_400_000)}`

describe("middleware", () => {
	it("is limited to the card route and the comparison page", () => {
		expect(config.matcher).toEqual(["/api/og", "/lab/players/compare"])
	})

	it("lets a reader's card and comparison through", () => {
		for (const path of ["/api/og?type=player&slug=brock-bowers", "/lab/players/compare?a=x&b=y", "/lab/players/compare"]) {
			const res = middleware(req(path, BROWSER, HUMAN))
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

	it("answers a comparison with no proof of JavaScript from the edge: a small page that sets the cookie, never cached, never indexed", async () => {
		const res = middleware(req("/lab/players/compare?a=brock-bowers&b=trey-mcbride&r=form", BROWSER))
		expect(res.status).toBe(200)
		expect(res.headers.get("x-middleware-next")).toBeNull()
		expect(res.headers.get("content-type")).toMatch(/text\/html/)
		expect(res.headers.get("cache-control")).toBe("private, no-store")
		expect(res.headers.get("x-robots-tag")).toMatch(/noindex/)
		const html = await res.text()
		expect(html).toContain("rr_h=")
		expect(html).toContain("location.replace")
		expect(html.length).toBeLessThan(3500)
		// The card for this very comparison is in the tags, so a client that unfurls the link without being recognised still gets the picture.
		expect(html).toContain("/api/og?type=compare&amp;a=brock-bowers&amp;b=trey-mcbride&amp;r=form&amp;size=wide")
	})

	it("sends a link-preview bot to the small page that carries the comparison's own tags, with the query kept", () => {
		const res = middleware(req("/lab/players/compare?a=brock-bowers&b=trey-mcbride&y=2025", "Twitterbot/1.0"))
		expect(res.headers.get("x-middleware-rewrite")).toBe("https://www.raidersrundown.com/lab/players/compare/preview?a=brock-bowers&b=trey-mcbride&y=2025")
	})

	it("treats the old cookie of someone who has not been back in a month as no cookie", async () => {
		const stale = `rr_h=${Math.floor(Date.now() / 86_400_000) - 30}`
		expect((await middleware(req("/lab/players/compare?a=x&b=y", BROWSER, stale)).text()).includes("Loading the comparison")).toBe(true)
	})

	it("refuses Meta's AI search crawler on a comparison", () => {
		expect(middleware(req("/lab/players/compare?a=x&b=y", "meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)")).status).toBe(403)
	})
})
