import type { Metadata } from "next"

import { TRACKING } from "@/lib/og/guard"
import { buildComparison, configQuery, nameOf, readConfig } from "@/lib/lab/compareKit"
import { getPlayers } from "@/lib/lab/data"
import { getPlayerHistory } from "@/lib/lab/playerHistoryData"

// The tags of /lab/players/compare, shared by the page and by the small page a link-preview bot is given (see lib/og/guard.ts), so a shared comparison
// unfurls into the same title, description and card whichever of them answers.

const SITE_URL = "https://www.raidersrundown.com"

export type CompareSearch = { a?: string; b?: string; r?: string; m?: string; g?: string; y?: string; ya?: string; yb?: string }

const stampOf = (generatedAt: string) => {
	const t = Date.parse(generatedAt)
	return Number.isFinite(t) ? t : 0
}

export function compareMetadata(q: CompareSearch): Metadata {
	const data = getPlayers()
	const cfg = readConfig(q)
	const c = cfg.a && cfg.b ? buildComparison(data, cfg, getPlayerHistory()) : null
	const base = `${SITE_URL}/lab/players/compare`
	const title = c
		? c.cross
			? `${nameOf(c, "a")} vs ${nameOf(c, "b")}: ${c.cross.tags.a} vs ${c.cross.tags.b} ${c.cross.topic} compared | Raiders Rundown`
			: `${nameOf(c, "a")} vs ${nameOf(c, "b")}: stats compared in context | Raiders Rundown`
		: "Compare any two NFL players in context | Raiders Rundown"
	const description = c
		? c.cross
			? `${c.headline} Only stats both positions are measured on the same way, ranked on one scale, with each player's rank at his own position. From the Raiders Rundown Player Lab.`
			: `${c.headline} Percentiles, who leads each stat and what it means, from the Raiders Rundown Player Lab.`
		: "Two players, side by side on the stats that matter: same position, or across positions on the stats they share (WR and TE, running backs and receivers, edge and interior rushers, corners and safeties). See who is clearly ahead and who is too close to call."
	// The picture is the comparison's own graphic, so a link posted to X or anywhere else unfurls into these two players, this range and these stats.
	const image = c ? `${SITE_URL}/api/og?type=compare&${configQuery({ ...cfg, a: c.a.slug, b: c.b.slug })}&size=wide&v=${stampOf(data.generatedAt)}` : `${SITE_URL}/og-default-v2.png`
	const alt = c ? `${nameOf(c, "a")} against ${nameOf(c, "b")}: ${c.headline}` : "Raiders Rundown Player Lab: compare two players"
	return {
		title,
		description,
		alternates: { canonical: base },
		// An address with players or options in it is a tool, not a page worth indexing, and the links on it lead only to more of the same. The bare page is the one that ranks.
		robots: Object.keys(q).some((k) => !TRACKING.test(k)) ? { index: false, follow: false } : undefined,
		openGraph: { type: "website", title, description, url: base, siteName: "Raiders Rundown", images: [{ url: image, width: 1200, height: 630, alt }] },
		twitter: { card: "summary_large_image", title, description, images: [{ url: image, alt }] },
	}
}
