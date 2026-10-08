import type { Metadata } from "next"

import ShareLanding from "@/components/lab/ShareLanding"
import { getUnits } from "@/lib/lab/data"
import { VIEW_NAMES, VIEW_SECTION, matchupQuery, readMatchupQuery } from "@/lib/lab/matchupShare"
import { hasUnits, namesFor } from "@/lib/lab/units"
import { canonicalPair, matchupPath } from "@/lib/lab/unitsKit"

// Where a shared link to one part of a matchup lands. The link preview (the card for the part that was shared) is
// read from this page's HTML, and a reader is sent straight on to the matchup, scrolled to that part. It reads the
// query, so it is built per request; it is kept out of search results because the real page is the matchup itself.

const SITE_URL = "https://www.raidersrundown.com"

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const q = readMatchupQuery({ a: one(sp.a), b: one(sp.b), view: one(sp.view) })
	if (!q || !hasUnits(q.a) || !hasUnits(q.b)) return null
	const [a, b] = canonicalPair(q.a, q.b)
	const names = namesFor(a, b)
	const stamp = Date.parse(getUnits().generatedAt) || 0
	return { a, b, view: q.view, names, stamp, title: `${VIEW_NAMES[q.view]}: ${names[a]} vs ${names[b]}` }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const found = await resolve(props)
	const card = found ? `${SITE_URL}/api/og?type=matchup&${matchupQuery(found.a, found.b, found.view)}&size=wide&v=${found.stamp}` : `${SITE_URL}/og-default-v2.png`
	const title = found ? `${found.title} | Raiders Rundown` : "Matchups | Raiders Rundown"
	const description = "How two teams stack up, position group by position group, with the coaches and who is missing."
	return {
		title,
		description,
		robots: { index: false, follow: true },
		alternates: { canonical: found ? `${SITE_URL}${matchupPath(found.a, found.b)}` : `${SITE_URL}/lab/matchups` },
		openGraph: { type: "website", title, description, url: `${SITE_URL}${found ? matchupPath(found.a, found.b) : "/lab/matchups"}`, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title, description, images: [card] },
	}
}

export default async function MatchupShareLanding(props: Props) {
	const found = await resolve(props)
	const href = found ? `${matchupPath(found.a, found.b)}#${VIEW_SECTION[found.view]}` : "/lab/matchups"
	const image = found ? `/api/og?type=matchup&${matchupQuery(found.a, found.b, found.view)}&size=wide&v=${found.stamp}` : null
	return <ShareLanding crumb="Matchups" title={found ? found.title : "Matchups"} image={image} alt={found ? `${found.title}, as a share card` : ""} href={href} button={found ? "Open the full matchup" : "See this week's matchups"} />
}
