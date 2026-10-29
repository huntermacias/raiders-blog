// Cheap checks that run in front of the two expensive endpoints, before any serverless function starts:
//   /api/og                  a share card is drawn (satori + resvg) on a miss, about a second of compute
//   /lab/players/compare     a server render per distinct query string, and every player page links to hundreds of them
// Both are open to everyone, link-preview bots and search engines included. What is refused is traffic that is plainly not a reader or a
// preview: AI training crawlers, SEO scrapers and bare HTTP libraries, plus card requests that cannot be a card at all. A client can lie about
// its user agent, so this is a first line, not a wall; a per-address rate limit in the Vercel firewall is the wall.
//
// A comparison with players in the address is rendered in full only for a client that has run this site's JavaScript once (it leaves the `rr_h`
// cookie). Everyone else gets a stub: link-preview bots a tiny page with the comparison's own title, description and card (so a shared link still
// unfurls), anything else a one-kilobyte page, made here at the edge with no function behind it, that sets the cookie and reloads. Crawlers that
// do not run JavaScript, which in practice is all of the ones that walk comparison after comparison, never reach the page that costs money.
// Pure functions, no Node APIs: this file runs on the Edge.

/** Every `type` /api/og knows. A request for anything else can only produce the default picture, so it never needs to reach the function. */
export const OG_TYPES = [
	"post", "game", "pick", "rankings", "league", "nflleague", "live", "math", "lab", "scoreboard",
	"scout", "last", "twins", "hub", "playoffs", "rooting", "matchup", "slate", "board", "flags", "player", "playerboard", "compare", "report", "home",
] as const

const OG_TYPE_SET: ReadonlySet<string> = new Set(OG_TYPES)

/** The longest query string any real card link carries is a few hundred characters (a compare card with a long metric list). */
export const MAX_OG_QUERY = 1500

// Crawlers that collect pages for model training or for SEO tools. None of them sends readers or link previews.
const SCRAPERS =
	/GPTBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|Bytespider|Amazonbot|Meta-ExternalAgent|meta-externalfetcher|meta-webindexer|meta-externalads|PerplexityBot|Diffbot|ImagesiftBot|Omgili|Timpibot|SemrushBot|AhrefsBot|MJ12bot|DotBot|PetalBot|BLEXBot|DataForSeoBot|Barkrowler|serpstatbot|SeekportBot|ZoominfoBot|MauiBot|AspiegelBot|Scrapy|Screaming Frog|Cohere-ai|FriendlyCrawler|img2dataset|Webzio|Brightbot/i

// Command-line tools and scripting libraries announce themselves with their own name; browsers and preview bots do not. (Libraries that some chat apps use
// to fetch previews, such as OkHttp or Go's client, are deliberately not here.)
const CLIENTS = /^(python-requests|python-urllib|Python\/|aiohttp|httpx|curl\/|Wget|libwww-perl|PostmanRuntime|HTTPie)/i

export function isAutomatedClient(userAgent: string | null | undefined): boolean {
	const ua = (userAgent ?? "").trim()
	if (ua === "") return true
	return SCRAPERS.test(ua) || CLIENTS.test(ua)
}

/** `preview`: answer with the small page that carries the share tags. `proof`: answer with the page that sets the cookie and reloads. */
export type Verdict = { action: "allow" } | { action: "deny"; status: 403 | 414; reason: string } | { action: "default-image" } | { action: "preview" } | { action: "proof" }

/** The query string of a URL, without the leading "?", read the same way the router would. */
function params(search: string): URLSearchParams {
	return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
}

/** /api/og: who may ask for a card, and whether what they ask for can be one. */
export function checkOg(search: string, userAgent: string | null | undefined): Verdict {
	if (isAutomatedClient(userAgent)) return { action: "deny", status: 403, reason: "automated client" }
	if (search.length > MAX_OG_QUERY) return { action: "deny", status: 414, reason: "query too long" }
	const q = params(search)
	if (q.get("debug") === "1") return { action: "allow" }
	const type = q.get("type") ?? ""
	if (!OG_TYPE_SET.has(type)) return { action: "default-image" }
	return { action: "allow" }
}

// Parameters that only say where a click came from (or that Next adds to a client-side navigation), not what to compare.
export const TRACKING = /^(utm_[a-z]+|v|fbclid|gclid|ref|_rsc)$/i

/** The cookie a browser leaves once it has run this site's JavaScript: the number of the day (since 1970, UTC) it was set. */
export const HUMAN_COOKIE = "rr_h"
export const HUMAN_COOKIE_DAYS = 7
const DAY_MS = 86_400_000

/** The value a browser writes: today's day number. */
export const humanCookieValue = (now: number = Date.now()): string => String(Math.floor(now / DAY_MS))

/** A cookie written in the last week (a day ahead is allowed for clocks that disagree). It says "this client ran JavaScript", not who it is. */
export function humanCookieOk(value: string | null | undefined, now: number = Date.now()): boolean {
	if (!value || !/^\d{1,6}$/.test(value)) return false
	const day = Number(value)
	const today = Math.floor(now / DAY_MS)
	return day <= today + 1 && day >= today - HUMAN_COOKIE_DAYS
}

// The programs that fetch a page only to draw a link preview. They read the tags in the head and never run the page.
const PREVIEW_BOTS =
	/facebookexternalhit|Facebot|Twitterbot|Slackbot|Slack-ImgProxy|Discordbot|LinkedInBot|WhatsApp|TelegramBot|Pinterestbot|redditbot|SkypeUriPreview|Mastodon|Bluesky Cardyb|Applebot|iMessage|vkShare|Embedly/i

export const isLinkPreviewBot = (userAgent: string | null | undefined): boolean => PREVIEW_BOTS.test(userAgent ?? "")

/**
 * /lab/players/compare: the bare page and its tracking-tagged links are open to everyone. A configured comparison is a tool, not a document: scrapers are
 * refused, a link-preview bot gets the share tags in a small page, and a client with no proof of JavaScript gets the page that asks for it.
 */
export function checkCompare(search: string, userAgent: string | null | undefined, humanCookie?: string | null, now: number = Date.now()): Verdict {
	const q = params(search)
	let configured = false
	q.forEach((_, key) => {
		if (!TRACKING.test(key)) configured = true
	})
	if (!configured) return { action: "allow" }
	if (search.length > MAX_OG_QUERY) return { action: "deny", status: 414, reason: "query too long" }
	if (isAutomatedClient(userAgent)) return { action: "deny", status: 403, reason: "automated client" }
	if (isLinkPreviewBot(userAgent)) return { action: "preview" }
	if (humanCookieOk(humanCookie, now)) return { action: "allow" }
	return { action: "proof" }
}
