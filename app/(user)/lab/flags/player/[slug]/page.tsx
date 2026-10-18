import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import FlagsExplorer from "@/components/lab/flags/FlagsExplorer"
import FlagsMethod from "@/components/lab/flags/FlagsMethod"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import { TeamLogo } from "@/components/lab/players/Media"
import TrackView from "@/components/lab/players/TrackView"
import { getPlayers } from "@/lib/lab/data"
import { flagsOfPlayer, getFlagFiles, getRoster, playerIdOf } from "@/lib/lab/flagsData"
import { FLAGS_PATH, playerFlagsHref, playerRows, teamFlagsHref, totals } from "@/lib/lab/flagsKit"
import { cardStyle, profileHref, teamName } from "@/lib/lab/playerView"
import { profileSlugs } from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"

const SITE_URL = "https://www.raidersrundown.com"

// One page per player who has been flagged in a season on file. Anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
	return Object.keys(getRoster().bySlug).map((slug) => ({ slug }))
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
	const { slug } = await props.params
	const id = playerIdOf(slug)
	const p = id ? getRoster().byId[id] : undefined
	if (!id || !p) return { title: "The Lab | Raiders Rundown" }
	const file = getFlagFiles()[0]
	const sum = totals(file ? flagsOfPlayer(file, id) : [])
	const title = `${p.n} penalties: every flag, down and distance | Raiders Rundown`
	const description = file
		? `${p.n} (${teamName(p.t)}${p.p ? `, ${p.p}` : ""}) has ${sum.flags} accepted penalties in ${file.season}, ${sum.costly} that cost like a turnover. Each flag with the opponent, down and distance, and what it cost.`
		: `Every accepted penalty on ${p.n}.`
	const url = `${SITE_URL}${playerFlagsHref(slug)}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "profile", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
}

export default async function PlayerFlagsPage(props: { params: Promise<{ slug: string }> }) {
	const { slug } = await props.params
	const id = playerIdOf(slug)
	const p = id ? getRoster().byId[id] : undefined
	if (!id || !p) notFound()
	const files = getFlagFiles()
	const seasons = files.map((f) => {
		const rows = playerRows(f.flags, getRoster().byId)
		const at = rows.findIndex((r) => r.key === id)
		return { season: f.season, week: f.week, turnoverCost: f.turnoverCost, flags: flagsOfPlayer(f, id), rank: at < 0 || at >= 25 ? null : { rank: at + 1, of: rows.length } }
	})
	const withFlags = seasons.filter((s) => s.flags.length)
	const hasProfile = new Set(profileSlugs(getPlayers())).has(slug)
	const quarterback = seasons.some((s) => s.flags.some((f) => f.ck === "qb"))
	const url = `${SITE_URL}${playerFlagsHref(slug)}`
	const ld = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
			{ "@type": "ListItem", position: 2, name: "Flags", item: `${SITE_URL}${FLAGS_PATH}` },
			{ "@type": "ListItem", position: 3, name: p.n, item: url },
		],
	}
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={cardStyle(p.t)}>
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href={FLAGS_PATH} className="hover:text-lab-ink">
							Flags
						</Link>{" "}
						&rsaquo;{" "}
						<Link href={teamFlagsHref(p.t)} className="hover:text-lab-ink">
							{p.t}
						</Link>
					</nav>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{p.n}: every flag</h1>
					<p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-lab-soft">
						<span className="inline-flex items-center gap-1.5 font-semibold text-lab-ink">
							<TeamLogo team={p.t} size={20} />
							{teamName(p.t)}
						</span>
						{p.p ? <span>{p.p}</span> : null}
						{hasProfile ? (
							<Link href={profileHref(slug)} className="font-semibold text-lab-ink underline underline-offset-4">
								Player profile
							</Link>
						) : null}
					</p>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">
						Each accepted penalty against {p.n}: the opponent, the down and distance, what it did and what it cost{quarterback ? ", with the delay-of-game flags that go to the quarterback" : ""}.
					</p>
					<TrackView event="flags_player_view" props={{ player: slug }} />
					{files[0] ? <UpdatedStamp at={files[0].generatedAt} kind="grades" what="Flags updated" className="mt-4" /> : null}
				</div>
			</section>
			<section className="container py-8 sm:py-10" aria-label={`${p.n} flags`}>
				<FlagsExplorer seasons={withFlags} players={{ [id]: p }} subject={{ kind: "player", name: p.n }} />
				<FlagsMethod per={files[0]?.turnoverCost} />
			</section>
			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href={teamFlagsHref(p.t)} className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; All {teamName(p.t)} flags
					</Link>
					<Credit>Rosters also from nflverse. </Credit>
				</div>
			</section>
			<MoreFromLab current={FLAGS_PATH} weeks={labWeeks()} />
		</div>
	)
}
