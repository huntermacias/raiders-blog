import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import Embed from "@/components/embeds/Embed"
import TweetCard from "@/components/embeds/TweetCard"
import VideoEmbed from "@/components/VideoEmbed"
import {
	bigAvatar,
	fetchTweet,
	formatCount,
	formatTweetTime,
	isXUrl,
	tweetIdFromUrl,
	tweetSegments,
	tweetToken,
	type Tweet,
} from "@/lib/xTweet"

// A made-up post, shaped like what X's syndication endpoint returns.
const tweet: Tweet = {
	id_str: "1234567890123456789",
	created_at: "2026-10-12T12:42:00.000Z",
	text: "Fewest points by a 5-0 team \u{1F3C8} since 2010 &amp; counting @Vikings #SKOL https://t.co/abc https://t.co/pic",
	display_text_range: [0, 87],
	user: {
		name: "Example Sports",
		screen_name: "examplesports",
		profile_image_url_https: "https://pbs.twimg.com/profile_images/1/abc_normal.jpg",
		is_blue_verified: true,
	},
	entities: {
		hashtags: [{ text: "SKOL", indices: [65, 70] }],
		user_mentions: [{ screen_name: "Vikings", indices: [56, 64] }],
		urls: [{ display_url: "example.com/story", expanded_url: "https://example.com/story", indices: [71, 87] }],
		media: [{ display_url: "pic.x.com/pic", expanded_url: "https://x.com/examplesports/status/1/photo/1", indices: [88, 104] }],
	},
	mediaDetails: [
		{
			type: "photo",
			media_url_https: "https://pbs.twimg.com/media/abc.jpg",
			original_info: { width: 1200, height: 800 },
		},
	],
	favorite_count: 4123,
	conversation_count: 52,
}

afterEach(() => vi.unstubAllGlobals())

describe("X post helpers", () => {
	it("reads the post id from x.com and twitter.com links, with or without tracking", () => {
		expect(tweetIdFromUrl("https://x.com/PFF/status/2109625692698915213?s=20")).toBe("2109625692698915213")
		expect(tweetIdFromUrl("https://twitter.com/a/status/1234567890123")).toBe("1234567890123")
		expect(tweetIdFromUrl("https://x.com/PFF")).toBeNull()
		expect(tweetIdFromUrl("not a url")).toBeNull()
	})

	it("only treats X hosts as X links", () => {
		expect(isXUrl("https://x.com/a/status/1")).toBe(true)
		expect(isXUrl("https://mobile.twitter.com/a/status/1")).toBe(true)
		expect(isXUrl("https://notx.com/a/status/1")).toBe(false)
		expect(isXUrl("https://youtu.be/abc")).toBe(false)
	})

	it("builds the endpoint token the same way X's widget does", () => {
		expect(tweetToken("2109625692698915213")).toMatch(/^[0-9a-z]+$/)
		expect(tweetToken("1")).toBe(((1 / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""))
	})

	it("splits text into plain runs and links, drops the picture link and keeps emoji intact", () => {
		const segs = tweetSegments(tweet)
		const links = segs.filter((s) => s.kind === "link")
		expect(links.map((l) => l.text)).toEqual(["@Vikings", "#SKOL", "example.com/story"])
		expect(links[0]).toMatchObject({ href: "https://x.com/Vikings" })
		expect(links[2]).toMatchObject({ href: "https://example.com/story" })
		const joined = segs.map((s) => s.text).join("")
		expect(joined).toContain("\u{1F3C8} since 2010 & counting")
		expect(joined).not.toContain("pic")
		expect(joined.endsWith(" ")).toBe(false)
	})

	it("formats counts and times", () => {
		expect(formatCount(0)).toBe("0")
		expect(formatCount(999)).toBe("999")
		expect(formatCount(4123)).toBe("4.1K")
		expect(formatCount(12500)).toBe("13K")
		expect(formatCount(2_000_000)).toBe("2M")
		expect(formatTweetTime("2026-10-12T12:42:00.000Z")).toEqual({ time: "5:42 AM", date: "Oct 12, 2026" })
		expect(formatTweetTime("garbage")).toEqual({ time: "", date: "" })
	})

	it("asks for the sharper avatar", () => {
		expect(bigAvatar("https://pbs.twimg.com/profile_images/1/abc_normal.jpg")).toBe(
			"https://pbs.twimg.com/profile_images/1/abc_400x400.jpg",
		)
	})
})

describe("fetchTweet", () => {
	const mockFetch = (res: Partial<Response> | Error) =>
		vi.stubGlobal("fetch", vi.fn(async () => {
			if (res instanceof Error) throw res
			return res as Response
		}))

	it("returns the post when X answers", async () => {
		mockFetch({ ok: true, json: async () => ({ ...tweet, __typename: "Tweet" }) })
		expect((await fetchTweet("1234567890123456789"))?.user.screen_name).toBe("examplesports")
	})

	it("returns null for a missing post, a tombstone, bad json, a network error or a bad id", async () => {
		mockFetch({ ok: false, status: 404 })
		expect(await fetchTweet("1234567890123456789")).toBeNull()
		mockFetch({ ok: true, json: async () => ({ __typename: "TweetTombstone" }) })
		expect(await fetchTweet("1234567890123456789")).toBeNull()
		mockFetch({ ok: true, json: async () => ({}) })
		expect(await fetchTweet("1234567890123456789")).toBeNull()
		mockFetch(new Error("timeout"))
		expect(await fetchTweet("1234567890123456789")).toBeNull()
		expect(await fetchTweet("abc")).toBeNull()
	})
})

describe("TweetCard", () => {
	it("draws the author, verified mark, linked text, photo, counts and the link back to X", () => {
		const html = renderToStaticMarkup(<TweetCard tweet={tweet} caption="Via X" />)
		expect(html).toContain("Example Sports")
		expect(html).toContain("@examplesports")
		expect(html).toContain('aria-label="Verified account"')
		expect(html).toContain('href="https://x.com/Vikings"')
		expect(html).toContain("abc_400x400.jpg")
		expect(html).toContain("format=jpg")
		expect(html).toContain("4.1K")
		expect(html).toContain("5:42 AM")
		expect(html).toContain("https://x.com/examplesports/status/1234567890123456789")
		expect(html).toContain("Via X")
		// follows the site theme, never a hard-coded white card
		expect(html).toContain("bg-card")
		expect(html).not.toContain("platform.twitter.com")
	})

	it("shows a quoted post and hides the reply count when there are none", () => {
		const html = renderToStaticMarkup(
			<TweetCard
				tweet={{
					...tweet,
					conversation_count: 0,
					mediaDetails: [],
					quoted_tweet: { ...tweet, id_str: "999999999999", text: "The original take", entities: {}, display_text_range: [0, 17] },
				}}
			/>,
		)
		expect(html).toContain("The original take")
		expect(html).toContain("status/999999999999")
		expect(html).not.toContain('title="Replies"')
	})

	it("plays video posts with the native player", () => {
		const html = renderToStaticMarkup(
			<TweetCard
				tweet={{
					...tweet,
					mediaDetails: [
						{
							type: "video",
							media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/p.jpg",
							original_info: { width: 1280, height: 720 },
							video_info: {
								variants: [
									{ content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/hi.mp4" },
									{ content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/mid.mp4" },
									{ content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
								],
							},
						},
					],
				}}
			/>,
		)
		expect(html).toContain("<video")
		expect(html).toContain("mid.mp4")
		expect(html).toContain("controls")
	})
})

describe("Embed", () => {
	it("falls back to X's own widget when the post can't be fetched", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 }) as Response))
		const el: any = await Embed({ url: "https://x.com/a/status/1234567890123456789" })
		expect(el.type).toBe(VideoEmbed)
	})

	it("uses the card when it can, and sends non-X links to the video component", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => tweet }) as Response))
		const card: any = await Embed({ url: "https://x.com/a/status/1234567890123456789?s=20" })
		expect(card.type).toBe(TweetCard)
		const yt: any = await Embed({ url: "https://youtu.be/abc123" })
		expect(yt.type).toBe(VideoEmbed)
		expect(await Embed({ url: "" })).toBeNull()
	})
})
