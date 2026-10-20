// Cheap checks that run in front of the two expensive endpoints, before any serverless function starts:
//   /api/og                  a share card is drawn (satori + resvg) on a miss, about a second of compute
//   /lab/players/compare     a server render per distinct query string, and every player page links to hundreds of them
// Both are open to everyone, link-preview bots and search engines included. What is refused is traffic that is plainly not a reader or a
// preview: AI training crawlers, SEO scrapers and bare HTTP libraries, plus card requests that cannot be a card at all. A client can lie about
// its user agent, so this is a first line, not a wall; a per-address rate limit in the Vercel firewall is the wall.
// Pure functions, no Node APIs: this file runs on the Edge.

/** Every `type` /api/og knows. A request for anything else can only produce the default picture, so it never needs to reach the function. */
export const OG_TYPES = [
	"post", "game", "pick", "rankings", "league", "nflleague", "live", "math", "lab", "scoreboard",
	"scout", "last", "twins", "hub", "playoffs", "rooting", "matchup", "slate", "board", "flags", "player", "playerboard", "compare",
] as const

const OG_TYPE_SET: ReadonlySet<string> = new Set(OG_TYPES)

/** The longest query string any real card link carries is a few hundred characters (a compare card with a long metric list). */
export const MAX_OG_QUERY = 1500

// Crawlers that collect pages for model training or for SEO tools. None of them sends readers or link previews.
const SCRAPERS =
	/GPTBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|Bytespider|Amazonbot|Meta-ExternalAgent|meta-externalfetcher|PerplexityBot|Diffbot|ImagesiftBot|Omgili|Timpibot|SemrushBot|AhrefsBot|MJ12bot|DotBot|PetalBot|BLEXBot|DataForSeoBot|Barkrowler|serpstatbot|SeekportBot|ZoominfoBot|MauiBot|AspiegelBot|Scrapy|Screaming Frog|Cohere-ai|FriendlyCrawler|img2dataset|Webzio|Brightbot/i

// Command-line tools and scripting libraries announce themselves with their own name; browsers and preview bots do not. (Libraries that some chat apps use
// to fetch previews, such as OkHttp or Go's client, are deliberately not here.)
const CLIENTS = /^(python-requests|python-urllib|Python\/|aiohttp|httpx|curl\/|Wget|libwww-perl|PostmanRuntime|HTTPie)/i

export function isAutomatedClient(userAgent: string | null | undefined): boolean {
	const ua = (userAgent ?? "").trim()
	if (ua === "") return true
	return SCRAPERS.test(ua) || CLIENTS.test(ua)
}

export type Verdict = { action: "allow" } | { action: "deny"; status: 403 | 414; reason: string } | { action: "default-image" }

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

// Parameters that only say where a click came from, not what to compare.
const TRACKING = /^(utm_[a-z]+|v|fbclid|gclid|ref)$/i

/** /lab/players/compare: the bare page and its tracking-tagged links are open; a configured comparison is a tool, not a document, and is refused to scrapers. */
export function checkCompare(search: string, userAgent: string | null | undefined): Verdict {
	const q = params(search)
	let configured = false
	q.forEach((_, key) => {
		if (!TRACKING.test(key)) configured = true
	})
	if (!configured) return { action: "allow" }
	if (search.length > MAX_OG_QUERY) return { action: "deny", status: 414, reason: "query too long" }
	if (isAutomatedClient(userAgent)) return { action: "deny", status: 403, reason: "automated client" }
	return { action: "allow" }
}
