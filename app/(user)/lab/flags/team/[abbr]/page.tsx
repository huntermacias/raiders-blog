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
import { labColorVars } from "@/lib/lab/colors"
import { flagsOfTeam, flagsStamp, getFlagFiles, rosterFor } from "@/lib/lab/flagsData"
import { FLAGS_PATH, rankOf, teamFlagsHref, teamRows, totals } from "@/lib/lab/flagsKit"
import { cardStyle } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"
import { TEAMS } from "@/lib/nfl"

const SITE_URL = "https://www.raidersrundown.com"

// One page per team, built from the JSON in the repo. Anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
	return TEAMS.map((t) => ({ abbr: t.abbr.toLowerCase() }))
}

const teamFor = (abbr: string) => TEAMS.find((t) => t.abbr.toLowerCase() === abbr.toLowerCase())

export async function generateMetadata(props: { params: Promise<{ abbr: string }> }): Promise<Metadata> {
	const { abbr } = await props.params
	const t = teamFor(abbr)
	if (!t) return { title: "The Lab | Raiders Rundown" }
	const file = getFlagFiles()[0]
	const mine = file ? flagsOfTeam(file, t.abbr) : []
	const sum = totals(mine)
	const title = `${t.nick} penalties: the flags that cost like a turnover | Raiders Rundown`
	const description = file
		? `${t.name}: ${sum.flags} accepted penalties through week ${file.week} of ${file.season}, ${sum.costly} that cost like a turnover. Who committed each one, the down and distance, and what it cost.`
		: `Every accepted ${t.name} penalty, who committed it, the down and distance and what it cost.`
	const url = `${SITE_URL}${teamFlagsHref(t.abbr)}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "website", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
}

export default async function TeamFlagsPage(props: { params: Promise<{ abbr: string }> }) {
	const { abbr } = await props.params
	const t = teamFor(abbr)
	if (!t) notFound()
	const files = getFlagFiles()
	const all = TEAMS.map((x) => x.abbr)
	const seasons = files.map((f) => {
		const rows = teamRows(f.flags, all)
		return { season: f.season, week: f.week, turnoverCost: f.turnoverCost, flags: flagsOfTeam(f, t.abbr), rank: { rank: rankOf(rows, t.abbr), of: rows.length } }
	})
	const roster = rosterFor(seasons.flatMap((s) => s.flags))
	const url = `${SITE_URL}${teamFlagsHref(t.abbr)}`
	const ld = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
			{ "@type": "ListItem", position: 2, name: "Flags", item: `${SITE_URL}${FLAGS_PATH}` },
			{ "@type": "ListItem", position: 3, name: t.name, item: url },
		],
	}
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={{ ...labColorVars(t.abbr), ...cardStyle(t.abbr) }}>
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href={FLAGS_PATH} className="hover:text-lab-ink">
							Flags
						</Link>{" "}
						&rsaquo; <span className="text-lab-soft">{t.nick}</span>
					</nav>
					<div className="mt-3 flex items-center gap-3">
						<TeamLogo team={t.abbr} size={44} />
						<h1 className="m-0 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{t.nick} penalties</h1>
					</div>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">
						Every accepted {t.name} flag: who got it, the down and distance, and what it did. The ones that gave a team a free first down, cancelled a takeaway or a touchdown, or cost as much as a turnover are marked.
					</p>
					<TrackView event="flags_team_view" props={{ team: t.abbr }} />
					{files[0] ? <UpdatedStamp at={files[0].generatedAt} kind="grades" what="Flags updated" className="mt-4" /> : null}
				</div>
			</section>
			<section className="container py-8 sm:py-10" aria-label={`${t.nick} flags`}>
				{seasons.some((s) => s.flags.length) ? (
					<FlagsExplorer seasons={seasons} players={roster} subject={{ kind: "team", name: t.nick, id: t.abbr }} stamp={flagsStamp()} />
				) : (
					<p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">No flags on file for the {t.nick} yet.</p>
				)}
				<FlagsMethod per={files[0]?.turnoverCost} />
			</section>
			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href={FLAGS_PATH} className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; Every team&apos;s flags
					</Link>
					<Credit>Rosters also from nflverse. </Credit>
				</div>
			</section>
			<MoreFromLab current={FLAGS_PATH} weeks={labWeeks()} />
		</div>
	)
}
