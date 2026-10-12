import type { Metadata } from "next"
import { notFound } from "next/navigation"

import BoardPage from "@/components/lab/players/BoardPage"
import { GROUP_META, GROUP_ORDER, boardFor, boards, groupOf } from "@/lib/lab/playersKit"

export const dynamicParams = false

export function generateStaticParams() {
	return GROUP_ORDER.flatMap((group) => boards(group).map((b) => ({ group, stat: b.path })))
}

const SITE_URL = "https://www.raidersrundown.com"

export async function generateMetadata(props: { params: Promise<{ group: string; stat: string }> }): Promise<Metadata> {
	const { group, stat } = await props.params
	const g = groupOf(group)
	const b = g ? boardFor(g, stat) : null
	if (!g || !b) return { title: "Players | Raiders Rundown" }
	const meta = GROUP_META[g]
	const title = `${b.label}: NFL ${meta.title.toLowerCase()} ranked | Raiders Rundown`
	const description = b.kind === "stat" ? `${meta.title} ranked by ${b.label.toLowerCase()} against the league, with the typical value, how sure each number is and the box score beside it.` : `${b.label} for every NFL ${meta.single.toLowerCase()}, beside the advanced numbers that put them in context.`
	const url = `${SITE_URL}/lab/players/leaders/${g}/${stat}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "website", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
}

export default async function StatLeaders(props: { params: Promise<{ group: string; stat: string }> }) {
	const { group, stat } = await props.params
	const g = groupOf(group)
	const b = g ? boardFor(g, stat) : null
	if (!g || !b) notFound()
	return <BoardPage group={g} board={b} />
}
