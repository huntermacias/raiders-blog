import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import ScoutReport from "@/components/lab/ScoutReport"
import { labColorVars } from "@/lib/lab/colors"
import { getScouting, getSeason } from "@/lib/lab/data"
import { scoutLine } from "@/lib/lab/scouting"
import { TEAMS } from "@/lib/nfl"

const SITE_URL = "https://www.raidersrundown.com"

// One page per opponent, built from the JSON in the repo. Anything else is a 404.
export const dynamicParams = false

const opponents = () => TEAMS.filter((t) => t.abbr !== "LV" && getScouting().teams[t.abbr])

export function generateStaticParams() {
	return opponents().map((t) => ({ abbr: t.abbr.toLowerCase() }))
}

function teamFor(abbr: string) {
	return opponents().find((t) => t.abbr.toLowerCase() === abbr.toLowerCase())
}

export function generateMetadata({ params }: { params: { abbr: string } }): Metadata {
	const t = teamFor(params.abbr)
	if (!t) return { title: "The Lab | Raiders Rundown" }
	const season = getSeason()
	const title = `Raiders vs ${t.nick}: scouting report | Raiders Rundown`
	const description = `${scoutLine(t.abbr, t.nick)} How the Raiders match up with the ${t.name} on offense and defense, from ${season.season} play-by-play.`
	const url = `${SITE_URL}/lab/scouting/${t.abbr.toLowerCase()}`
	const card = `${SITE_URL}/api/og?type=scout&opp=${t.abbr}&v=${Date.parse(getScouting().generatedAt) || 0}`
	return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: { type: "article", title, description, url, siteName: "Raiders Rundown", images: [{ url: card, width: 1200, height: 630, alt: `Scouting report: Raiders vs ${t.nick}` }] },
		twitter: { card: "summary_large_image", title, description, images: [card] },
		other: { "og:image": card },
	}
}

export default function ScoutPage({ params }: { params: { abbr: string } }) {
	const t = teamFor(params.abbr)
	if (!t) notFound()
	const data = getScouting()
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={labColorVars(t.abbr)}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot;{" "}
						<Link href="/lab/scouting" className="hover:text-lab-ink">
							Scouting
						</Link>
					</p>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Raiders vs {t.nick}: the scouting report</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft">{scoutLine(t.abbr, t.nick)}</p>
				</div>
			</section>
			<section className="container py-10 sm:py-14">
				<ScoutReport abbr={t.abbr} stamp={Date.parse(data.generatedAt) || 0} />
			</section>
			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab/scouting" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; All teams
					</Link>
					<Credit>Ranks use the {data.season} regular season so far. </Credit>
				</div>
			</section>
		</div>
	)
}
