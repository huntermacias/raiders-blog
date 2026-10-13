// Fetches a post from X's public syndication endpoint (the same one X's own
// embed widget uses) so the site can draw the card itself instead of loading
// X's iframe: no third-party script, no white-corner flash, same look in light
// and dark, and the text is in the page HTML for search engines.
//
// Everything here is plain data in, plain data out so it can be tested. If X
// changes the endpoint or a tweet is gone, `fetchTweet` returns null and the
// page falls back to X's own widget (see components/embeds/Embed.tsx).

const SYNDICATION = "https://cdn.syndication.twimg.com/tweet-result"

export type Indices = [number, number]

export interface TweetMedia {
	type: "photo" | "video" | "animated_gif"
	media_url_https: string
	original_info?: { width: number; height: number }
	video_info?: {
		aspect_ratio?: [number, number]
		variants: { content_type: string; bitrate?: number; url: string }[]
	}
}

interface BaseTweet {
	id_str: string
	text: string
	created_at: string
	display_text_range?: Indices
	user: {
		name: string
		screen_name: string
		profile_image_url_https: string
		is_blue_verified?: boolean
		verified?: boolean
	}
	entities?: {
		hashtags?: { text: string; indices: Indices }[]
		user_mentions?: { screen_name: string; indices: Indices }[]
		urls?: { display_url: string; expanded_url: string; indices: Indices }[]
		symbols?: { text: string; indices: Indices }[]
		media?: { display_url: string; expanded_url: string; indices: Indices }[]
	}
	mediaDetails?: TweetMedia[]
	favorite_count?: number
}

export interface Tweet extends BaseTweet {
	conversation_count?: number
	quoted_tweet?: BaseTweet
}

export type TweetSegment =
	| { kind: "text"; text: string }
	| { kind: "link"; text: string; href: string }

export function isXUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname
		return host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")
	} catch {
		return false
	}
}

export function tweetIdFromUrl(url: string): string | null {
	try {
		const u = new URL(url)
		const m = u.pathname.match(/\/status(?:es)?\/(\d{5,40})/)
		return m ? m[1] : null
	} catch {
		return null
	}
}

// The endpoint wants a token derived from the id. Same formula X's widget uses.
export function tweetToken(id: string): string {
	return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, "")
}

export async function fetchTweet(id: string): Promise<Tweet | null> {
	if (!/^\d{5,40}$/.test(id)) return null
	const url = new URL(SYNDICATION)
	url.searchParams.set("id", id)
	url.searchParams.set("lang", "en")
	url.searchParams.set("token", tweetToken(id))
	try {
		const res = await fetch(url.toString(), {
			// Counts drift, text rarely does: a few hours is fresh enough and
			// keeps pages from hitting X on every request.
			next: { revalidate: 60 * 60 * 6 },
			signal: AbortSignal.timeout(4000),
		})
		if (!res.ok) return null
		const data = await res.json()
		if (!data || data.__typename === "TweetTombstone" || !data.user || typeof data.text !== "string") return null
		return data as Tweet
	} catch {
		return null
	}
}

const ENTITY_MAP: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITY_MAP[m] ?? m)

// Splits the tweet into plain text and links (@mentions, #tags, $cashtags,
// urls). Indices count code points, so we index into Array.from(text).
// Media links (the trailing t.co for an attached picture) are dropped, and a
// leading run of @replies is skipped because the card shows who it replies to.
export function tweetSegments(t: BaseTweet): TweetSegment[] {
	const chars = Array.from(t.text)
	const range: Indices = t.display_text_range ?? [0, chars.length]
	type Ent = { start: number; end: number; href?: string; text?: string; drop?: boolean }
	const ents: Ent[] = []
	const e = t.entities ?? {}
	for (const h of e.hashtags ?? []) ents.push({ start: h.indices[0], end: h.indices[1], href: `https://x.com/hashtag/${h.text}` })
	for (const m of e.user_mentions ?? []) ents.push({ start: m.indices[0], end: m.indices[1], href: `https://x.com/${m.screen_name}` })
	for (const s of e.symbols ?? []) ents.push({ start: s.indices[0], end: s.indices[1], href: `https://x.com/search?q=%24${s.text}` })
	for (const u of e.urls ?? []) ents.push({ start: u.indices[0], end: u.indices[1], href: u.expanded_url, text: u.display_url })
	for (const m of e.media ?? []) ents.push({ start: m.indices[0], end: m.indices[1], drop: true })
	ents.sort((a, b) => a.start - b.start)

	const out: TweetSegment[] = []
	const pushText = (from: number, to: number) => {
		if (to <= from) return
		const s = decode(chars.slice(from, to).join(""))
		if (s) out.push({ kind: "text", text: s })
	}
	let cursor = range[0]
	for (const en of ents) {
		if (en.end <= range[0] || en.start >= range[1] || en.start < cursor) continue
		pushText(cursor, en.start)
		if (!en.drop) {
			const label = en.text ?? chars.slice(en.start, en.end).join("")
			out.push({ kind: "link", text: decode(label), href: en.href as string })
		}
		cursor = en.end
	}
	pushText(cursor, range[1])
	// Trim whitespace left behind by a dropped trailing link.
	const last = out[out.length - 1]
	if (last?.kind === "text") last.text = last.text.replace(/\s+$/, "")
	return out.filter((s) => s.kind !== "text" || s.text.length > 0)
}

export function formatCount(n: number | undefined): string {
	if (!n || n < 0) return "0"
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
	if (n >= 10_000) return `${Math.round(n / 1000)}K`
	if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`
	return String(n)
}

// "5:42 AM" and "Oct 12, 2026" in Pacific time (a Raiders audience reads this
// at game time, and a fixed zone keeps server and browser output identical).
export function formatTweetTime(iso: string): { time: string; date: string } {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return { time: "", date: "" }
	const tz = "America/Los_Angeles"
	return {
		time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }),
		date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz }),
	}
}

// X serves a 48px avatar by default; the _400x400 variant stays sharp on retina.
export function bigAvatar(url: string): string {
	return url.replace(/_normal(\.\w+)$/, "_400x400$1")
}

// Every mp4 X offers, in the order to try them: the second-best first (what X's own widget plays: sharp,
// much lighter than the top bitrate), then the best, then the rest.
export function mp4Sources(m: TweetMedia): string[] {
	const sorted = (m.video_info?.variants ?? [])
		.filter((v) => v.content_type === "video/mp4")
		.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
		.map((v) => v.url)
	if (sorted.length < 2) return sorted
	return [sorted[1], sorted[0], ...sorted.slice(2)]
}

export function mediaUrl(m: TweetMedia, size: "medium" | "large" = "large"): string {
	if (!/^https?:/.test(m.media_url_https)) return m.media_url_https
	try {
		const u = new URL(m.media_url_https)
		const ext = u.pathname.split(".").pop()
		if (!ext) return m.media_url_https
		u.pathname = u.pathname.replace(`.${ext}`, "")
		u.searchParams.set("format", ext)
		u.searchParams.set("name", size)
		return u.toString()
	} catch {
		return m.media_url_https
	}
}

export const tweetUrl = (t: BaseTweet) => `https://x.com/${t.user.screen_name}/status/${t.id_str}`

// The page that plays one video inside its own sandboxed frame. The meta tag stops the frame from
// sending the site's address with the video request (X's video host refuses requests that carry one),
// and the frame tells the page if the file can't be loaded. Only X's own video hosts are allowed.
const VIDEO_HOST = /^https:\/\/video\.twimg\.com\/[^\s"'<>\\]+$/
const POSTER_HOST = /^https:\/\/pbs\.twimg\.com\/[^\s"'<>\\]+$/

export function videoFrameDoc(src: string, poster: string, gif = false): string {
	if (!VIDEO_HOST.test(src)) return ""
	const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
	const posterAttr = POSTER_HOST.test(poster) ? ` poster="${esc(poster)}"` : ""
	const mode = gif ? "autoplay loop muted" : "controls autoplay"
	return (
		`<!doctype html><meta name="referrer" content="no-referrer">` +
		`<style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;display:block}</style>` +
		`<video src="${esc(src)}"${posterAttr} ${mode} playsinline` +
		` onerror='parent.postMessage({xv:"error"},"*")'></video>`
	)
}

// X's own embedded player for one post, for when the video file can't be played directly.
export function xPlayerUrl(id: string): string {
	const u = new URL("https://platform.twitter.com/embed/Tweet.html")
	u.searchParams.set("id", id)
	u.searchParams.set("lang", "en")
	u.searchParams.set("theme", "dark")
	u.searchParams.set("dnt", "true")
	u.searchParams.set("hideThread", "true")
	u.searchParams.set("width", "550px")
	return u.toString()
}
