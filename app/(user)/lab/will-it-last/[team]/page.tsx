import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import WillItLastPage, { willItLastMetadata } from "@/components/lab/WillItLastPage"
import { teamAbbrs } from "@/lib/lab/history"

// "Will the <team>' start last?" for every NFL team, at /lab/will-it-last/<abbreviation>. Static, like the Raiders' page; anything
// that is not a team is a 404, and the Raiders' own address stays the one at /lab/will-it-last.

export const dynamicParams = false

export function generateStaticParams() {
	return teamAbbrs().map((a) => ({ team: a.toLowerCase() }))
}

const abbrOf = (slug: string): string | null => {
	const a = slug.toUpperCase()
	return teamAbbrs().includes(a) ? a : null
}

export async function generateMetadata(props: { params: Promise<{ team: string }> }): Promise<Metadata> {
	const { team } = await props.params
	const a = abbrOf(team)
	return a ? willItLastMetadata(a) : {}
}

export default async function TeamPage(props: { params: Promise<{ team: string }> }) {
	const { team } = await props.params
	const a = abbrOf(team)
	if (!a) notFound()
	if (a === "LV") permanentRedirect("/lab/will-it-last")
	return <WillItLastPage team={a} />
}
