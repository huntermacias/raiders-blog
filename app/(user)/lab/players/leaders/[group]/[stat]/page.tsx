import type { Metadata } from "next"
import { notFound } from "next/navigation"

import BoardPage from "@/components/lab/players/BoardPage"
import { getPlayers } from "@/lib/lab/data"
import V2Board from "@/components/lab/v2/V2Board"
import { isV2Site } from "@/lib/lab/labMethod"
import { GROUP_META, GROUP_ORDER, boardFor, boards, groupOf, statInfo } from "@/lib/lab/playersKit"
import { CONTRIBUTION, PROJECTION, VIEW_PATH, type ViewId, hasContributionBoard, hasProjectionBoard } from "@/lib/lab/v2/kit"
import { isV2 } from "@/lib/lab/v2/types"

export const dynamicParams = false

/** The two v2 views that are not a stat: only on a v2 build, only for jobs that have them. The stat paths are untouched. */
function extraViews(group: (typeof GROUP_ORDER)[number]): Exclude<ViewId, "season">[] {
	if (!isV2Site()) return []
	const data = getPlayers()
	if (!isV2(data)) return []
	return ([hasContributionBoard(data, group) ? "contribution" : null, hasProjectionBoard(data, group) ? "projection" : null] as const).filter((v): v is Exclude<ViewId, "season"> => v !== null)
}

const viewOf = (group: (typeof GROUP_ORDER)[number], stat: string) => extraViews(group).find((v) => VIEW_PATH[v] === stat) ?? null

export function generateStaticParams() {
	return GROUP_ORDER.flatMap((group) => [...boards(group).map((b) => ({ group, stat: b.path })), ...extraViews(group).map((v) => ({ group, stat: VIEW_PATH[v] }))])
}

const SITE_URL = "https://www.raidersrundown.com"

export async function generateMetadata(props: { params: Promise<{ group: string; stat: string }> }): Promise<Metadata> {
	const { group, stat } = await props.params
	const g = groupOf(group)
	const view = g ? viewOf(g, stat) : null
	if (g && view) {
		const label = view === "projection" ? PROJECTION : CONTRIBUTION
		const url = `${SITE_URL}/lab/players/leaders/${g}/${stat}`
		const title = `${GROUP_META[g].title}: ${label.toLowerCase()} | Raiders Rundown`
		const description = view === "projection" ? `NFL ${GROUP_META[g].peers} ranked by projected level, with a range for each. Not who is playing best: earlier seasons count too.` : `NFL ${GROUP_META[g].peers} ranked by the points they have added so far, including players with too few plays for a card.`
		return { title, description, alternates: { canonical: url }, openGraph: { type: "website", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
	}
	const b = g ? boardFor(g, stat) : null
	if (!g || !b) return { title: "Players | Raiders Rundown" }
	const meta = GROUP_META[g]
	const title = `${b.label}: NFL ${meta.title.toLowerCase()} ranked | Raiders Rundown`
	const description = b.kind === "stat" ? `${meta.title} ranked by ${b.label.toLowerCase()} against the league, with the typical value, how sure each number is and the box score beside it.` : `${b.label} for every NFL ${meta.single.toLowerCase()}, beside the advanced numbers that put them in context.`
	const url = `${SITE_URL}/lab/players/leaders/${g}/${stat}`
	// The share image carries the leaders' photos; the stamp changes with each data build, so a shared link picks up new numbers.
	const card = b.kind === "stat" && statInfo(g, b.key)?.unit ? `${SITE_URL}/og-default-v2.png` : `${SITE_URL}/api/og?type=playerboard&group=${g}&stat=${stat}&v=${Date.parse(getPlayers().generatedAt) || 0}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "website", title, description, url, siteName: "Raiders Rundown", images: [{ url: card, width: 1200, height: 630, alt: `${b.label}: the five leaders among NFL ${meta.peers}` }] }, twitter: { card: "summary_large_image", title, description, images: [card] } }
}

export default async function StatLeaders(props: { params: Promise<{ group: string; stat: string }> }) {
	const { group, stat } = await props.params
	const g = groupOf(group)
	const view = g ? viewOf(g, stat) : null
	if (g && view) return <V2Board group={g} view={view} />
	const b = g ? boardFor(g, stat) : null
	if (!g || !b) notFound()
	return <BoardPage group={g} board={b} />
}
