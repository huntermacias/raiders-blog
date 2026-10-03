import type { GetServerSideProps } from "next"
import { groq } from "next-sanity"

import { readClient as client } from "../lib/sanity.client"

const SITE_URL = "https://www.raidersrundown.com"

type Item = {
	title: string
	slug: { current: string }
	description?: string | null
	_createdAt: string
	_updatedAt: string
	categories?: string[] | null
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

function item(kind: "post" | "games", i: Item) {
	const link = `${SITE_URL}/${kind}/${i.slug.current}`
	return `    <item>
      <title>${esc(i.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(i._createdAt).toUTCString()}</pubDate>
      ${i.description ? `<description>${esc(i.description)}</description>` : ""}
${(i.categories ?? []).map((c) => `      <category>${esc(c)}</category>`).join("\n")}
    </item>`
}

// No UI: getServerSideProps writes the feed directly (same pattern as
// sitemap.xml, which works on this Next version).
function Feed() {
	return null
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
	const q = groq`{
		"posts": *[_type == 'post' && !(_id in path('drafts.**'))] | order(_createdAt desc)[0...30]{
			title, slug, description, _createdAt, _updatedAt, "categories": categories[]->title
		},
		"games": *[_type == 'gameReport' && !(_id in path('drafts.**'))] | order(_createdAt desc)[0...30]{
			title, slug, description, _createdAt, _updatedAt, "categories": categories[]->title
		}
	}`
	const { posts, games }: { posts: Item[]; games: Item[] } = await client.fetch(q)

	const all = [
		...(posts ?? []).map((p) => ({ kind: "post" as const, p })),
		...(games ?? []).map((g) => ({ kind: "games" as const, p: g })),
	]
		.sort((a, b) => new Date(b.p._createdAt).getTime() - new Date(a.p._createdAt).getTime())
		.slice(0, 40)

	const last = all[0] ? new Date(all[0].p._updatedAt).toUTCString() : new Date().toUTCString()

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Raiders Rundown</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Las Vegas Raiders news, game recaps, power rankings and predictions graded in public.</description>
    <language>en-us</language>
    <lastBuildDate>${last}</lastBuildDate>
${all.map((x) => item(x.kind, x.p)).join("\n")}
  </channel>
</rss>`

	res.setHeader("Content-Type", "application/rss+xml; charset=utf-8")
	res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400")
	res.write(xml)
	res.end()

	return { props: {} }
}

export default Feed
