import type { Metadata } from "next"

import ShareLanding from "@/components/lab/ShareLanding"
import { getUnits } from "@/lib/lab/data"
import { SLATE_PATH } from "@/lib/lab/matchupShare"

// Where a shared link to the week's matchups lands: the card in the link preview, then on to the page.
// Kept out of search results because the real page is /lab/matchups.

const SITE_URL = "https://www.raidersrundown.com"
const DESCRIPTION = "Every game on the slate, broken down by position group: where each team has the edge."

function info() {
	const data = getUnits()
	const stamp = Date.parse(data.generatedAt) || 0
	return { week: data.slate?.week ?? null, stamp, card: data.slate ? `/api/og?type=slate&size=wide&v=${stamp}` : null }
}

export function generateMetadata(): Metadata {
	const { week, card } = info()
	const title = `${week ? `Week ${week} matchups` : "Matchups"} on paper | Raiders Rundown`
	const image = card ? `${SITE_URL}${card}` : `${SITE_URL}/og-default-v2.png`
	return {
		title,
		description: DESCRIPTION,
		robots: { index: false, follow: true },
		alternates: { canonical: `${SITE_URL}${SLATE_PATH}` },
		openGraph: { type: "website", title, description: DESCRIPTION, url: `${SITE_URL}${SLATE_PATH}`, siteName: "Raiders Rundown", images: [image] },
		twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [image] },
	}
}

export default function SlateShareLanding() {
	const { week, card } = info()
	return <ShareLanding crumb="Matchups" title={week ? `Week ${week} matchups` : "Matchups"} image={card} alt="This week's games, with how each team's position groups line up" href={SLATE_PATH} button="See every matchup" />
}
