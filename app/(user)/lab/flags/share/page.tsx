import type { Metadata } from "next"

import ShareLanding from "@/components/lab/ShareLanding"
import { flagSeason, flagsStamp, getFlagFiles, getRoster, penaltyPages, playerIdOf } from "@/lib/lab/flagsData"
import { FLAGS_PATH } from "@/lib/lab/flagsKit"
import { FLAGS_SHARE_PATH, type FlagsView, flagsHref, flagsQuery, one, readFlagsView } from "@/lib/lab/flagsShare"
import { dimension } from "@/lib/lab/flagsSituations"
import { teamName } from "@/lib/lab/playerView"
import { TEAMS } from "@/lib/nfl"

// Where a shared penalty-flags link lands. The link preview (the card that was shared) is read from this page's HTML, and a reader is sent straight on to the
// interactive page for the same thing. It reads the query, so it is built per request, and it is kept out of search results: the real pages are under /lab/flags.

const SITE_URL = "https://www.raidersrundown.com"
const DESCRIPTION = "Every accepted NFL penalty with who committed it, the down and distance, the score and what it cost: the flags that cost a team as much as a turnover."

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

type Found = { view: FlagsView; title: string; alt: string; href: string }

/** Reads the request and checks the view against the data: a card for a flag, team, player or penalty that is not on file is not offered. */
async function resolve(props: Props): Promise<Found | null> {
	const sp = (await props.searchParams) ?? {}
	const view = readFlagsView({ kind: one(sp.kind), season: one(sp.season), id: one(sp.id), team: one(sp.team), a: one(sp.a), b: one(sp.b), slug: one(sp.slug), board: one(sp.board), ty: one(sp.ty), dim: one(sp.dim) })
	if (!view) return null
	const file = flagSeason(view.season ?? 0) ?? getFlagFiles()[0]
	if (!file) return null
	const known = (t?: string) => !!t && TEAMS.some((x) => x.abbr === t)
	switch (view.kind) {
		case "flag": {
			const f = file.flags.find((x) => x.id === view.id) ?? getFlagFiles().flatMap((x) => x.flags).find((x) => x.id === view.id)
			if (!f) return null
			return { view, title: `${teamName(f.t)}: ${f.ty}, week ${f.w}`, alt: `The ${teamName(f.t)} ${f.ty.toLowerCase()} in week ${f.w} and what it cost`, href: flagsHref(view, { team: f.t }) }
		}
		case "team":
			if (!known(view.team)) return null
			return { view, title: `${teamName(view.team!)} penalties`, alt: `${teamName(view.team!)} penalties and what they cost`, href: flagsHref(view) }
		case "player": {
			const id = playerIdOf(view.slug ?? "")
			const p = id ? getRoster().byId[id] : undefined
			if (!p) return null
			return { view, title: `${p.n}'s flags`, alt: `${p.n}'s penalties and what they cost`, href: flagsHref(view) }
		}
		case "compare":
			if (!known(view.a) || !known(view.b)) return null
			return { view, title: `${teamName(view.a!)} vs ${teamName(view.b!)}: whose penalties cost more`, alt: `${teamName(view.a!)} and ${teamName(view.b!)} penalties side by side`, href: flagsHref(view) }
		case "board":
			return { view, title: { latest: "Latest costly flags", worst: "The costliest flags", players: "Costliest flaggers", teams: "Costliest flags by team", types: "The costliest penalties" }[view.board!], alt: "A leaderboard of NFL penalty flags", href: flagsHref(view) }
		case "penalty": {
			const type = penaltyPages()[view.ty ?? ""]
			if (!type) return null
			return { view, title: `${type}: how often and what it costs`, alt: `${type} penalties and what they cost`, href: flagsHref(view) }
		}
		case "situation": {
			if (view.team && !known(view.team)) return null
			const d = dimension(view.dim)!
			return { view, title: `${view.team ? `${teamName(view.team)} penalties` : "NFL penalties"} by ${d.label.toLowerCase()}`, alt: d.question, href: flagsHref(view) }
		}
	}
}

export async function generateMetadata(props: Props): Promise<Metadata> {
	const found = await resolve(props)
	const card = found ? `${SITE_URL}/api/og?type=flags&${flagsQuery(found.view, { size: "wide" })}&v=${flagsStamp()}` : `${SITE_URL}/og-default-v2.png`
	const title = found ? `${found.title} | Flags | Raiders Rundown` : "Penalty flags | Raiders Rundown"
	return {
		title,
		description: DESCRIPTION,
		robots: { index: false, follow: true },
		alternates: { canonical: `${SITE_URL}${FLAGS_PATH}` },
		openGraph: { type: "website", title, description: DESCRIPTION, url: `${SITE_URL}${FLAGS_SHARE_PATH}`, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [card] },
	}
}

export default async function FlagsShareLanding(props: Props) {
	const found = await resolve(props)
	return <ShareLanding crumb="Flags" title={found?.title ?? "Penalty flags"} image={found ? `/api/og?type=flags&${flagsQuery(found.view, { size: "wide" })}&v=${flagsStamp()}` : null} alt={found?.alt ?? ""} href={found?.href ?? FLAGS_PATH} button="Open the interactive page" />
}
