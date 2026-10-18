import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import FlagCard from "@/components/lab/flags/FlagCard"
import FlagShare from "@/components/lab/flags/FlagShare"
import FlagsMethod from "@/components/lab/flags/FlagsMethod"
import { MixTable } from "@/components/lab/flags/SituationTables"
import MoreFromLab from "@/components/lab/MoreFromLab"
import { TeamLogo } from "@/components/lab/players/Media"
import TrackView from "@/components/lab/players/TrackView"
import { flagsStamp, getFlagFiles, getRoster, penaltyPages, rosterFor } from "@/lib/lab/flagsData"
import { FLAGS_PATH, SITUATIONS_PATH, costliest, penaltyHref, playerFlagsHref, playerRows, teamFlagsHref, teamRows } from "@/lib/lab/flagsKit"
import { dimension, situationMix, typeRows } from "@/lib/lab/flagsSituations"
import { teamName } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"
import { TEAMS } from "@/lib/nfl"

const SITE_URL = "https://www.raidersrundown.com"

// One page per penalty name that has a flag in any season, built from the JSON in the repo. Anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
	return Object.keys(penaltyPages()).map((slug) => ({ slug }))
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
	const { slug } = await props.params
	const type = penaltyPages()[slug]
	if (!type) return { title: "The Lab | Raiders Rundown" }
	const file = getFlagFiles().find((f) => f.flags.some((x) => x.ty === type))
	const row = file ? typeRows(file.flags).find((r) => r.type === type) : undefined
	const title = `${type} in the NFL: how often, how much it costs and who commits it | Raiders Rundown`
	const description = file && row ? `${row.flags} accepted ${type.toLowerCase()} penalties through week ${file.week} of ${file.season}: ${row.avg.toFixed(1)} points lost each, ${row.avgYards.toFixed(1)} yards, ${row.costly} that cost like a turnover. By down, by score, and which teams and players.` : `Every accepted ${type.toLowerCase()} penalty and what it cost.`
	const url = `${SITE_URL}${penaltyHref(type)}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "website", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
}

export default async function PenaltyPage(props: { params: Promise<{ slug: string }> }) {
	const { slug } = await props.params
	const type = penaltyPages()[slug]
	if (!type) notFound()
	const files = getFlagFiles()
	const seasons = files.map((f) => ({ file: f, flags: f.flags.filter((x) => x.ty === type) })).filter((s) => s.flags.length)
	const cur = seasons[0]
	if (!cur) notFound()
	const roster = getRoster().byId
	const stamp = flagsStamp()
	const row = typeRows(cur.file.flags).find((r) => r.type === type)!
	const leagueRows = situationMix(cur.flags, dimension("down")!, null)
	const scoreRows = situationMix(cur.flags, dimension("score")!, null)
	const teams = teamRows(cur.flags, TEAMS.map((t) => t.abbr)).filter((r) => r.flags).slice(0, 6)
	const players = playerRows(cur.flags, roster).slice(0, 6)
	const worst = costliest(cur.flags, 4)
	const names = rosterFor(worst, roster)
	const url = `${SITE_URL}${penaltyHref(type)}`
	const ld = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
			{ "@type": "ListItem", position: 2, name: "Flags", item: `${SITE_URL}${FLAGS_PATH}` },
			{ "@type": "ListItem", position: 3, name: type, item: url },
		],
	}
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href={FLAGS_PATH} className="hover:text-lab-ink">
							Flags
						</Link>{" "}
						&rsaquo; <span className="text-lab-soft">{type}</span>
					</nav>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{type}</h1>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">
						{row.flags} accepted {type.toLowerCase()} flags in {cur.file.season} through week {cur.file.week}. Each one cost its team {row.avg.toFixed(1)} points on average and {row.avgYards.toFixed(1)} yards, and {row.costly} of them cost like a turnover.
					</p>
					<TrackView event="flags_penalty_view" props={{ penalty: slug }} />
				</div>
			</section>
			<section className="container py-8 sm:py-10" aria-label={`${type} flags`}>
				<div className="flex flex-wrap items-center justify-between gap-4">
					<dl className="m-0 grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4">
						{[
							["Flags", String(row.flags), `${row.share ? `${(row.share * 100).toFixed(0)}% of all flags` : ""}`],
							["Points lost each", row.avg.toFixed(1), `${row.cost.toFixed(0)} in all`],
							["Yards each", row.avgYards.toFixed(1), `${row.yards} in all`],
							["Cost like a turnover", String(row.costly), `${Math.round(row.costlyShare * 100)}% of them`],
						].map(([k, v, s]) => (
							<div key={k} className="rounded-xl border border-lab-line bg-lab-surface px-3.5 py-3">
								<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{k}</dt>
								<dd className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums">{v}</dd>
								<dd className="m-0 mt-0.5 text-xs text-lab-muted">{s}</dd>
							</div>
						))}
					</dl>
					<FlagShare view={{ kind: "penalty", ty: slug, season: cur.file.season }} name={type} file={`flags-${slug}`} stamp={stamp} text={`${type} in the NFL, ${cur.file.season}: ${row.flags} flags, ${row.avg.toFixed(1)} points lost each.`} alt={`${type} penalties: how often and what they cost`} />
				</div>

				{seasons.length > 1 ? (
					<p className="m-0 mt-3 text-sm text-lab-soft">
						{seasons.slice(1).map((s) => {
							const r = typeRows(s.file.flags).find((x) => x.type === type)
							return r ? `${s.file.season}: ${r.flags} flags, ${r.avg.toFixed(1)} points each. ` : ""
						})}
					</p>
				) : null}

				<h2 className="mt-10 font-serif text-2xl font-bold tracking-tight">On which down</h2>
				<div className="mt-3">
					<MixTable rows={leagueRows} caption={`${type} by down`} showIndex={false} />
				</div>
				<h2 className="mt-10 font-serif text-2xl font-bold tracking-tight">What was the score</h2>
				<div className="mt-3">
					<MixTable rows={scoreRows} caption={`${type} by score`} showIndex={false} />
				</div>

				<div className="mt-10 grid gap-8 md:grid-cols-2">
					<div>
						<h2 className="font-serif text-2xl font-bold tracking-tight">Teams with the most</h2>
						<ul className="m-0 mt-3 list-none divide-y divide-lab-line p-0 text-sm">
							{teams.map((r) => (
								<li key={r.team} className="flex items-center justify-between gap-3 py-2">
									<Link href={teamFlagsHref(r.team)} className="inline-flex items-center gap-2 font-semibold text-lab-ink hover:underline">
										<TeamLogo team={r.team} size={20} />
										{teamName(r.team)}
									</Link>
									<span className="font-mono tabular-nums text-lab-soft">
										{r.flags} · {r.cost.toFixed(1)} pts
									</span>
								</li>
							))}
						</ul>
					</div>
					<div>
						<h2 className="font-serif text-2xl font-bold tracking-tight">Players with the most</h2>
						<ul className="m-0 mt-3 list-none divide-y divide-lab-line p-0 text-sm">
							{players.map((r) => (
								<li key={r.key} className="flex items-center justify-between gap-3 py-2">
									{r.slug ? (
										<Link href={playerFlagsHref(r.slug)} className="font-semibold text-lab-ink hover:underline">
											{r.label} <span className="font-normal text-lab-muted">{r.team}</span>
										</Link>
									) : (
										<span className="font-semibold">{r.label}</span>
									)}
									<span className="font-mono tabular-nums text-lab-soft">
										{r.flags} · {r.cost.toFixed(1)} pts
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>

				<h2 className="mt-10 font-serif text-2xl font-bold tracking-tight">The costliest ones</h2>
				<ul className="m-0 mt-3 grid list-none gap-3 p-0 md:grid-cols-2">
					{worst.map((f) => (
						<FlagCard key={f.id} f={f} players={names} showTeam per={cur.file.turnoverCost} share={{ season: cur.file.season, stamp }} />
					))}
				</ul>
				<p className="mt-6 text-sm font-semibold">
					<Link href={SITUATIONS_PATH} className="text-lab-ink underline underline-offset-4">
						Every penalty by situation
					</Link>
				</p>
				<FlagsMethod per={cur.file.turnoverCost} />
			</section>
			<section className="border-t border-lab-line">
				<div className="container py-8">
					<Credit>Rosters also from nflverse. </Credit>
				</div>
			</section>
			<MoreFromLab current={FLAGS_PATH} weeks={labWeeks()} />
		</div>
	)
}
