import type { Metadata } from "next"
import { notFound } from "next/navigation"

import BoardPage from "@/components/lab/players/BoardPage"
import { getPlayers } from "@/lib/lab/data"
import { GROUP_META, GROUP_ORDER, HEADLINE, boardFor, groupOf, statInfo } from "@/lib/lab/playersKit"

export const dynamicParams = false

export function generateStaticParams() {
	return GROUP_ORDER.map((group) => ({ group }))
}

const SITE_URL = "https://www.raidersrundown.com"

export async function generateMetadata(props: { params: Promise<{ group: string }> }): Promise<Metadata> {
	const { group } = await props.params
	const g = groupOf(group)
	if (!g) return { title: "Players | Raiders Rundown" }
	const info = statInfo(g, HEADLINE[g])!
	const card = info.unit ? `${SITE_URL}/og-default-v2.png` : `${SITE_URL}/api/og?type=playerboard&group=${g}&stat=${info.path}&v=${Date.parse(getPlayers().generatedAt) || 0}`
	const title = `NFL ${GROUP_META[g].title.toLowerCase()} ranked by ${info.label} | Raiders Rundown`
	const description = `Every qualifying NFL ${GROUP_META[g].single.toLowerCase()} ranked on ${info.label}, with the league's typical value, how sure each number is, and the box score beside it.`
	// The headline board's own page is the canonical one, so the two never compete.
	const canonical = `${SITE_URL}/lab/players/leaders/${g}/${info.path}`
	return { title, description, alternates: { canonical }, openGraph: { type: "website", title, description, url: canonical, siteName: "Raiders Rundown", images: [card] }, twitter: { card: "summary_large_image", title, description, images: [card] } }
}

export default async function GroupLeaders(props: { params: Promise<{ group: string }> }) {
	const { group } = await props.params
	const g = groupOf(group)
	if (!g) notFound()
	const board = boardFor(g, statInfo(g, HEADLINE[g])!.path)
	if (!board) notFound()
	return <BoardPage group={g} board={board} />
}
