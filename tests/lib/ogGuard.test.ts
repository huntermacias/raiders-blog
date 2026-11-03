import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { HUMAN_COOKIE, OG_TYPES, checkCompare, checkLab, checkOg, humanCookieOk, humanCookieValue, isAutomatedClient, isBrowserImpostor, isLinkPreviewBot } from "../../lib/og/guard"

const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
const PREVIEW = [
	"Twitterbot/1.0",
	"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
	"Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
	"Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
	"LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
	"WhatsApp/2.23.20.0 A",
	"TelegramBot (like TwitterBot)",
	"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
	"Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
	"Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
	"Bluesky Cardyb/1.1",
	"Mastodon/4.2 (http.rb/5.1.1; +https://mastodon.social/)",
	"Go-http-client/2.0",
	"okhttp/4.12.0",
]
const BAD = [
	"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
	"Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
	"Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
	"Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
	"Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
	"python-requests/2.31.0",
	"curl/8.4.0",
	"Scrapy/2.11.0 (+https://scrapy.org)",
	"",
]

describe("isAutomatedClient", () => {
	it.each(BAD)("refuses %j", (ua) => expect(isAutomatedClient(ua)).toBe(true))
	it("refuses a missing user agent", () => expect(isAutomatedClient(null)).toBe(true))
	it.each([BROWSER, ...PREVIEW])("lets %j through", (ua) => expect(isAutomatedClient(ua)).toBe(false))
})

describe("checkOg", () => {
	it("serves a real card to a browser and to link-preview bots", () => {
		for (const ua of [BROWSER, ...PREVIEW]) expect(checkOg("?type=compare&a=x&b=y&f=h2h&size=wide&v=1", ua)).toEqual({ action: "allow" })
	})

	it("knows every card type the route can draw", () => {
		for (const t of OG_TYPES) expect(checkOg(`?type=${t}`, BROWSER)).toEqual({ action: "allow" })
		// The `type` the route reads from the address: `type === "x"` in og.tsx (not `spec.type`, which is the kind of picture drawn) and `q.type === "x"` in insightSpecs.
		const src = read("pages/api/og.tsx") + read("lib/og/insightSpecs.ts")
		const found = Array.from(src.matchAll(/(?<![.\w])type === "([a-z]+)"/g)).concat(Array.from(src.matchAll(/\bq\.type === "([a-z]+)"/g)))
		const asked = Array.from(new Set(found.map((m) => m[1])))
		expect(asked.length).toBeGreaterThan(15)
		for (const t of asked) expect(OG_TYPES as readonly string[], `type "${t}" is drawn by /api/og but missing from OG_TYPES`).toContain(t)
	})

	it("sends a type that cannot be a card to the default picture without a function call", () => {
		expect(checkOg("?type=nope", BROWSER)).toEqual({ action: "default-image" })
		expect(checkOg("", BROWSER)).toEqual({ action: "default-image" })
		expect(checkOg("?type=__proto__", BROWSER)).toEqual({ action: "default-image" })
	})

	it("keeps the debug view reachable from a browser", () => {
		expect(checkOg("?debug=1&type=nope", BROWSER)).toEqual({ action: "allow" })
	})

	it("refuses scrapers and over-long queries", () => {
		expect(checkOg("?type=player&slug=x", BAD[0])).toMatchObject({ action: "deny", status: 403 })
		expect(checkOg(`?type=player&slug=${"a".repeat(2000)}`, BROWSER)).toMatchObject({ action: "deny", status: 414 })
	})
})

describe("checkCompare", () => {
	it("leaves the bare page and tracking-tagged links alone, for anyone", () => {
		for (const ua of [BROWSER, BAD[0], ""]) {
			expect(checkCompare("", ua)).toEqual({ action: "allow" })
			expect(checkCompare("?utm_source=x&utm_medium=social&v=123", ua)).toEqual({ action: "allow" })
		}
	})

	const search = "?a=brock-bowers&b=trey-mcbride&r=form&m=epaTgt,croe"
	const NOW = Date.UTC(2026, 9, 28, 12)

	it("refuses scrapers and over-long addresses before anything else", () => {
		for (const ua of BAD) expect(checkCompare(search, ua, humanCookieValue(NOW), NOW)).toMatchObject({ action: "deny", status: 403 })
		expect(checkCompare(`?a=${"b".repeat(2000)}`, BROWSER, humanCookieValue(NOW), NOW)).toMatchObject({ action: "deny", status: 414 })
	})

	it("renders a configured comparison in full only for a client that has shown it runs JavaScript", () => {
		expect(checkCompare(search, BROWSER, humanCookieValue(NOW), NOW)).toEqual({ action: "allow" })
		for (const missing of [undefined, null, "", "0", "abc", "99999999", humanCookieValue(NOW - 30 * 86_400_000)]) expect(checkCompare(search, BROWSER, missing, NOW)).toEqual({ action: "proof" })
		// Search engines and the like are not link-preview bots, so they are asked for proof like anyone else (they are told not to come by robots.txt too).
		expect(checkCompare(search, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", undefined, NOW)).toEqual({ action: "proof" })
	})

	it("gives a link-preview bot the small page with the share tags, cookie or not", () => {
		for (const ua of ["Twitterbot/1.0", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "LinkedInBot/1.0", "WhatsApp/2.23.20.0 A", "TelegramBot (like TwitterBot)", "Facebot", "Bluesky Cardyb/1.1"]) {
			expect(isLinkPreviewBot(ua), ua).toBe(true)
			expect(checkCompare(search, ua, undefined, NOW), ua).toEqual({ action: "preview" })
		}
		expect(isLinkPreviewBot(BROWSER)).toBe(false)
		expect(isLinkPreviewBot(null)).toBe(false)
	})

	it("refuses Meta's AI and ads crawlers, and keeps Facebook's link preview", () => {
		for (const ua of ["meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-externalads/1.1", "meta-externalagent/1.1", "meta-externalfetcher/1.1"]) {
			expect(isAutomatedClient(ua), ua).toBe(true)
			expect(checkCompare(search, ua, undefined, NOW), ua).toMatchObject({ action: "deny", status: 403 })
		}
		expect(isAutomatedClient("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(false)
	})

	it("does not treat Next's own client-navigation parameter as a configuration", () => {
		expect(checkCompare("?_rsc=abc12", BROWSER, undefined, NOW)).toEqual({ action: "allow" })
		expect(checkCompare("?_rsc=abc12&a=x", BROWSER, undefined, NOW)).toEqual({ action: "proof" })
	})

	it("accepts a cookie from the last week and a day ahead, and nothing else", () => {
		const day = (n: number) => String(Math.floor(NOW / 86_400_000) + n)
		for (const n of [1, 0, -1, -7]) expect(humanCookieOk(day(n), NOW), String(n)).toBe(true)
		for (const n of [2, -8, -400]) expect(humanCookieOk(day(n), NOW), String(n)).toBe(false)
		expect(HUMAN_COOKIE).toBe("rr_h")
	})
})

describe("what ships alongside the guard", () => {
	it("runs the middleware on the card route and the Player Lab only", () => {
		const src = read("middleware.ts")
		expect(src).toMatch(/matcher:\s*\["\/api\/og",\s*"\/lab",\s*"\/lab\/:path\*"\]/)
	})

	it("robots.txt keeps link-preview bots, and the bare comparison page, open", () => {
		const robots = read("public/robots.txt")
		const groups = robots.split(/\n\s*\n/)
		const star = groups.find((g) => /^User-agent: \*$/m.test(g))!
		expect(star).toContain("Disallow: /lab/players/compare?")
		expect(star).not.toMatch(/Disallow: \/lab\/players\/compare$/m)
		expect(star).toContain("Disallow: /studio")
		const previews = groups.find((g) => /User-agent: Twitterbot/.test(g))!
		for (const bot of ["facebookexternalhit", "Slackbot", "Discordbot", "LinkedInBot"]) expect(previews).toContain(`User-agent: ${bot}`)
		expect(previews).not.toContain("Disallow: /lab")
		// A crawler obeys only the one group that names it, so the preview group repeats the general group's other rules.
		for (const rule of star.split("\n").filter((l) => l.startsWith("Disallow:") && !l.includes("/lab/players/compare"))) expect(previews, rule).toContain(rule)
		expect(robots).toContain("Sitemap: https://www.raidersrundown.com/sitemap.xml")
	})

	it("robots.txt turns away Meta's AI, ads and fetch crawlers, which are not link previews", () => {
		const groups = read("public/robots.txt").split(/\n\s*\n/)
		for (const bot of ["Meta-ExternalAgent", "Meta-WebIndexer", "Meta-ExternalAds", "Meta-ExternalFetcher"]) {
			const g = groups.find((x) => new RegExp(`^User-agent: ${bot}$`, "m").test(x))
			expect(g, bot).toBeTruthy()
			expect(g).toMatch(/^Disallow: \/$/m)
		}
		// The trailing-slash spelling of the comparison address is covered too.
		expect(groups.find((g) => /^User-agent: \*$/m.test(g))).toContain("Disallow: /lab/players/compare/?")
	})

	it("the comparison page is cached by the CDN only", () => {
		const cfg = require("../../next.config.js")
		return cfg.headers().then((rules: { source: string; headers: { key: string; value: string }[] }[]) => {
			const r = rules.find((x) => x.source === "/lab/players/compare")!
			expect(r.headers.map((h) => h.key)).toEqual(["Vercel-CDN-Cache-Control"])
		})
	})
})

describe("checkLab / isBrowserImpostor", () => {
	const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
	const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1"

	it("calls a Chrome or Firefox user agent without Sec-Fetch-Mode an impostor, and nothing else", () => {
		expect(isBrowserImpostor(CHROME, null)).toBe(true)
		expect(isBrowserImpostor(CHROME, "navigate")).toBe(false)
		expect(isBrowserImpostor(BROWSER, null)).toBe(false) // Safari: older versions never send it
		expect(isBrowserImpostor(IOS_CHROME, null)).toBe(false) // WebKit under the hood
		expect(isBrowserImpostor("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/126.0.0.0", null)).toBe(false)
		expect(isBrowserImpostor("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2) Chrome/126.0.0.0", null)).toBe(false)
	})

	it("allows readers, search engines and previews, and refuses scripts and unattended browsers", () => {
		expect(checkLab(CHROME, "navigate").action).toBe("allow")
		expect(checkLab(BROWSER, null).action).toBe("allow")
		expect(checkLab("Twitterbot/1.0", null).action).toBe("allow")
		expect(checkLab("Mozilla/5.0 (compatible; bingbot/2.0)", null).action).toBe("allow")
		expect(checkLab(CHROME.replace("Chrome/", "HeadlessChrome/"), "navigate").action).toBe("deny")
		expect(checkLab("Playwright/1.45", "navigate").action).toBe("deny")
		expect(checkLab(CHROME, undefined).action).toBe("deny")
		expect(checkLab("", "navigate").action).toBe("deny")
		expect(checkLab("curl/8.4", null).action).toBe("deny")
	})
})

describe("robots.txt: SEO crawlers and AI search", () => {
	const groups = () => read("public/robots.txt").split(/\n\s*\n/)

	it("turns away SEO-tool and data-broker crawlers from the whole site", () => {
		for (const bot of ["SemrushBot", "AhrefsBot", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "Exabot", "Google-Extended", "anthropic-ai"]) {
			const g = groups().find((x) => new RegExp(`^User-agent: ${bot}$`, "m").test(x))
			expect(g, bot).toBeTruthy()
			expect(g).toMatch(/^Disallow: \/$/m)
		}
	})

	it("lets AI search crawlers read the writing but not the Player Lab", () => {
		const g = groups().find((x) => /^User-agent: OAI-SearchBot$/m.test(x))!
		expect(g).toContain("User-agent: Claude-SearchBot")
		expect(g).toContain("Disallow: /lab/")
		expect(g).toMatch(/^Allow: \/$/m)
	})

	it("asks Bing to slow down and repeats the general rules for it", () => {
		const g = groups().find((x) => /^User-agent: bingbot$/m.test(x))!
		expect(g).toContain("Crawl-delay: 5")
		expect(g).toContain("Disallow: /studio")
		expect(g).toContain("Disallow: /lab/players/compare?")
	})
})

