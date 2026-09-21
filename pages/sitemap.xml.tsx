import type { GetServerSideProps } from "next"
import { groq } from "next-sanity"

import { client } from "../lib/sanity.client"

const SITE_URL = "https://www.raidersrundown.com"

type Entry = { slug: { current: string }; _updatedAt: string }

function url(loc: string, lastmod?: string, priority = "0.7", changefreq = "weekly") {
	return `  <url>
    <loc>${loc}</loc>
    ${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ""}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
}

function generateSiteMap(posts: Entry[], games: Entry[], liveEvents: Entry[]) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${url(`${SITE_URL}/`, undefined, "1.0", "daily")}
${url(`${SITE_URL}/games`, undefined, "0.9", "daily")}
${url(`${SITE_URL}/live`, undefined, "0.8", "daily")}
${url(`${SITE_URL}/community`, undefined, "0.6", "daily")}
${games.map((g) => url(`${SITE_URL}/games/${g.slug.current}`, g._updatedAt, "0.8")).join("\n")}
${posts.map((p) => url(`${SITE_URL}/post/${p.slug.current}`, p._updatedAt, "0.6")).join("\n")}
${liveEvents.map((e) => url(`${SITE_URL}/live/${e.slug.current}`, e._updatedAt, "0.5")).join("\n")}
</urlset>`
}

// This page has no UI -- getServerSideProps writes the XML response
// directly and short-circuits rendering, following Next.js's documented
// pages-router sitemap pattern (works on any Next version, unlike the
// app-router `sitemap.ts` file convention which needs 13.3+).
function SiteMap() {
	return null
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
	const query = groq`{
		"posts": *[_type=='post' && !(_id in path('drafts.**'))]{slug,_updatedAt},
		"games": *[_type=='gameReport' && !(_id in path('drafts.**'))]{slug,_updatedAt},
		"liveEvents": *[_type=='liveEvent' && status == 'final' && !(_id in path('drafts.**'))]{slug,_updatedAt}
	}`
	const { posts, games, liveEvents } = await client.fetch(query)

	res.setHeader("Content-Type", "text/xml")
	res.write(generateSiteMap(posts ?? [], games ?? [], liveEvents ?? []))
	res.end()

	return { props: {} }
}

export default SiteMap
