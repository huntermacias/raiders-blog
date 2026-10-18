import type { GetServerSideProps } from "next"
import { groq } from "next-sanity"

import { readClient as client } from "../lib/sanity.client"
import { gameSlug, getGames, getPlayers, getUnits } from "../lib/lab/data"
import { GROUP_ORDER, boards, profileSlugs } from "../lib/lab/playersKit"
import { getFlagFiles, getRoster } from "../lib/lab/flagsData"
import { FLAGS_PATH, playerFlagsHref, teamFlagsHref } from "../lib/lab/flagsKit"
import { SIT_BOARDS, sitBoardHref } from "../lib/lab/situationsKit"
import { matchupPath } from "../lib/lab/unitsKit"
import { TEAMS } from "../lib/nfl"

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

/** The Raiders against every team, and every game on the coming slate. */
function matchupPaths(): string[] {
	const data = getUnits()
	const paths = new Set<string>()
	for (const abbr of Object.keys(data.teams)) if (abbr !== "LV") paths.add(matchupPath("LV", abbr))
	for (const g of data.slate?.games ?? []) paths.add(matchupPath(g.away, g.home))
	return Array.from(paths).sort()
}

/** Every player's page and every leaderboard, from the same data the pages are built from. */
function playerPaths(): string[] {
	const data = getPlayers()
	const groups = GROUP_ORDER.filter((g) => data.players.some((p) => p.group === g))
	return [...groups.flatMap((g) => boards(g).map((b) => `/lab/players/leaders/${g}/${b.path}`)), ...SIT_BOARDS.map((b) => sitBoardHref(b.slug)), ...profileSlugs(data).map((s) => `/lab/players/${s}`)]
}

/** The flags hub, every team's page and the page of each player flagged in the newest season on file. */
function flagPaths(): string[] {
	const newest = getFlagFiles()[0]
	const ids = new Set((newest?.flags ?? []).map((f) => f.pid).filter((x): x is string => !!x))
	const roster = getRoster().byId
	const players = Array.from(ids).filter((id) => roster[id]).map((id) => playerFlagsHref(roster[id].s)).sort()
	return [FLAGS_PATH, ...TEAMS.map((t) => teamFlagsHref(t.abbr)), ...players]
}

function generateSiteMap(posts: Entry[], games: Entry[], liveEvents: Entry[]) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${url(`${SITE_URL}/`, undefined, "1.0", "daily")}
${url(`${SITE_URL}/games`, undefined, "0.9", "daily")}
${url(`${SITE_URL}/predictions`, undefined, "0.9", "daily")}
${url(`${SITE_URL}/league`, undefined, "0.8", "daily")}
${url(`${SITE_URL}/rankings`, undefined, "0.9", "weekly")}
${url(`${SITE_URL}/rankings/math`, undefined, "0.7", "weekly")}
${url(`${SITE_URL}/schedule`, undefined, "0.8", "weekly")}
${url(`${SITE_URL}/live`, undefined, "0.8", "daily")}
${url(`${SITE_URL}/community`, undefined, "0.6", "daily")}
${url(`${SITE_URL}/lab`, undefined, "0.8", "weekly")}
${getGames().map((g) => url(`${SITE_URL}/lab/${gameSlug(g)}`, undefined, "0.7", "monthly")).join("\n")}
${url(`${SITE_URL}/lab/top-plays`, undefined, "0.7", "weekly")}
${url(`${SITE_URL}/lab/scouting`, undefined, "0.7", "weekly")}
${url(`${SITE_URL}/lab/will-it-last`, undefined, "0.7", "weekly")}
${TEAMS.filter((t) => t.abbr !== "LV").map((t) => url(`${SITE_URL}/lab/will-it-last/${t.abbr.toLowerCase()}`, undefined, "0.5", "weekly")).join("\n")}
${url(`${SITE_URL}/lab/season-twins`, undefined, "0.7", "weekly")}
${url(`${SITE_URL}/lab/players`, undefined, "0.8", "daily")}
${url(`${SITE_URL}/lab/players/compare`, undefined, "0.5", "weekly")}
${url(`${SITE_URL}/lab/players/value`, undefined, "0.6", "weekly")}
${playerPaths().map((p) => url(`${SITE_URL}${p}`, undefined, "0.5", "weekly")).join("\n")}
${flagPaths().map((p, i) => url(`${SITE_URL}${p}`, undefined, i === 0 ? "0.8" : "0.5", "weekly")).join("\n")}
${url(`${SITE_URL}/lab/teams`, undefined, "0.7", "weekly")}
${url(`${SITE_URL}/lab/matchups`, undefined, "0.7", "weekly")}
${url(`${SITE_URL}/lab/playoff-machine`, undefined, "0.8", "weekly")}
${url(`${SITE_URL}/lab/rooting-guide`, undefined, "0.8", "weekly")}
${TEAMS.filter((t) => t.abbr !== "LV").map((t) => url(`${SITE_URL}/lab/rooting-guide?team=${t.abbr}`, undefined, "0.5", "weekly")).join("\n")}
${matchupPaths().map((p) => url(`${SITE_URL}${p}`, undefined, "0.5", "weekly")).join("\n")}
${TEAMS.filter((t) => t.abbr !== "LV").map((t) => url(`${SITE_URL}/lab/scouting/${t.abbr.toLowerCase()}`, undefined, "0.5", "weekly")).join("\n")}
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

	res.setHeader("Content-Type", "application/xml; charset=utf-8")
	// Crawlers re-fetch this often; let the CDN absorb repeat hits while still
	// picking up new posts within the hour.
	res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
	res.write(generateSiteMap(posts ?? [], games ?? [], liveEvents ?? []))
	res.end()

	return { props: {} }
}

export default SiteMap
