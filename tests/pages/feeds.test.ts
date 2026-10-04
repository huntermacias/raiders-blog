import { existsSync } from "node:fs"
import { join } from "node:path"
import type { GetServerSidePropsContext } from "next"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ readClient: { fetch: vi.fn() }, client: {} }))

import { readClient } from "../../lib/sanity.client"
import { getServerSideProps as rss } from "../../pages/rss.xml"
import { getServerSideProps as sitemap } from "../../pages/sitemap.xml"
import { mockRes } from "../helpers/http"

const fetchDoc = readClient.fetch as unknown as ReturnType<typeof vi.fn>

async function run(gssp: typeof rss) {
	const res = mockRes()
	await gssp({ res } as unknown as GetServerSidePropsContext)
	return { res, xml: String(res.rawBody) }
}

beforeEach(() => fetchDoc.mockReset())

describe("rss.xml", () => {
	const post = (n: number, extra: object = {}) => ({
		title: `Post ${n}`,
		slug: { current: `post-${n}` },
		description: `About ${n}`,
		_createdAt: `2026-09-0${n}T12:00:00Z`,
		_updatedAt: `2026-09-0${n}T13:00:00Z`,
		categories: ["Previews"],
		...extra,
	})

	it("serves RSS with the right headers", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: [post(1)], games: [] })
		const { res, xml } = await run(rss)
		expect(res.headers["Content-Type"]).toContain("application/rss+xml")
		expect(res.headers["Cache-Control"]).toContain("s-maxage")
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
		expect(xml).toContain('<rss version="2.0"')
		expect(xml).toContain("https://www.raidersrundown.com/rss.xml")
	})

	it("links posts under /post and game reports under /games, newest first", async () => {
		fetchDoc.mockResolvedValueOnce({
			posts: [post(1)],
			games: [post(3, { slug: { current: "week-3" }, title: "Recap" })],
		})
		const { xml } = await run(rss)
		expect(xml).toContain("<link>https://www.raidersrundown.com/post/post-1</link>")
		expect(xml).toContain("<link>https://www.raidersrundown.com/games/week-3</link>")
		expect(xml.indexOf("Recap")).toBeLessThan(xml.indexOf("Post 1"))
	})

	it("escapes XML in titles, descriptions and categories", async () => {
		fetchDoc.mockResolvedValueOnce({
			posts: [post(1, { title: `Raiders <b> & "Chiefs" it's`, description: "a & b < c", categories: ["R&D"] })],
			games: [],
		})
		const { xml } = await run(rss)
		expect(xml).toContain("Raiders &lt;b&gt; &amp; &quot;Chiefs&quot; it&apos;s")
		expect(xml).toContain("<description>a &amp; b &lt; c</description>")
		expect(xml).toContain("<category>R&amp;D</category>")
		expect(xml).not.toContain("<b>")
	})

	it("caps the feed at 40 items", async () => {
		const many = Array.from({ length: 30 }, (_, i) => post(1, { slug: { current: `p-${i}` } }))
		const manyGames = Array.from({ length: 30 }, (_, i) => post(2, { slug: { current: `g-${i}` } }))
		fetchDoc.mockResolvedValueOnce({ posts: many, games: manyGames })
		const { xml } = await run(rss)
		expect(xml.match(/<item>/g)).toHaveLength(40)
	})

	it("omits the description tag when there isn't one", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: [post(1, { description: null })], games: [] })
		const { xml } = await run(rss)
		expect(xml).not.toContain("<description>About")
		expect(xml.match(/<description>/g)).toHaveLength(1) // channel only
	})

	it("still produces a valid empty feed", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: null, games: null })
		const { xml } = await run(rss)
		expect(xml).toContain("<channel>")
		expect(xml).not.toContain("<item>")
	})

	it("uses a pubDate in RFC 822 form", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: [post(1)], games: [] })
		const { xml } = await run(rss)
		expect(xml).toMatch(/<pubDate>\w{3}, \d{2} \w{3} 2026 \d\d:\d\d:\d\d GMT<\/pubDate>/)
	})
})

describe("sitemap.xml", () => {
	const entry = (slug: string) => ({ slug: { current: slug }, _updatedAt: "2026-09-10T00:00:00Z" })

	it("serves XML with the right headers", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: [], games: [], liveEvents: [] })
		const { res, xml } = await run(sitemap)
		expect(res.headers["Content-Type"]).toContain("application/xml")
		expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
	})

	it("lists the home page and every top-level section", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: [], games: [], liveEvents: [] })
		const { xml } = await run(sitemap)
		const locs = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map((m) => m[1])
		for (const path of ["", "games", "predictions", "league", "rankings", "schedule", "live", "community"]) {
			expect(locs).toContain(`https://www.raidersrundown.com/${path}`)
		}
	})

	it("includes posts, game reports and finished live events under the right prefixes", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: [entry("a-post")], games: [entry("a-game")], liveEvents: [entry("a-live")] })
		const { xml } = await run(sitemap)
		expect(xml).toContain("<loc>https://www.raidersrundown.com/post/a-post</loc>")
		expect(xml).toContain("<loc>https://www.raidersrundown.com/games/a-game</loc>")
		expect(xml).toContain("<loc>https://www.raidersrundown.com/live/a-live</loc>")
		expect(xml).toContain("<lastmod>2026-09-10T00:00:00.000Z</lastmod>")
	})

	it("only asks for published content, and only finished live events", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: [], games: [], liveEvents: [] })
		await run(sitemap)
		const query = String(fetchDoc.mock.calls[0][0])
		expect(query).toContain("drafts.**")
		expect(query).toContain("status == 'final'")
	})

	it("tolerates null lists", async () => {
		fetchDoc.mockResolvedValueOnce({ posts: null, games: null, liveEvents: null })
		const { xml } = await run(sitemap)
		expect(xml).toContain("</urlset>")
	})

	// Every static URL we hand to crawlers has to be a page that exists.
	it.each(["games", "predictions", "league", "rankings", "schedule", "live", "community"])("has a real page behind /%s", (section) => {
		expect(existsSync(join(process.cwd(), "app", "(user)", section, "page.tsx"))).toBe(true)
	})
})
