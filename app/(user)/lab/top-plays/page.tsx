import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import TopPlays from "@/components/lab/TopPlays"
import { labColorVars } from "@/lib/lab/colors"
import { getGames, getSeason } from "@/lib/lab/data"
import { playWord, seasonTopPlays, swingText, whenText } from "@/lib/lab/topPlays"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/top-plays`

function stampOf() {
	return Date.parse(getSeason().generatedAt) || 0
}

export function generateMetadata(): Metadata {
	const season = getSeason()
	const best = seasonTopPlays(getGames(), season.team, 1)[0]
	const title = `The biggest Raiders plays of ${season.season} | Raiders Rundown`
	const description = best
		? `Every Raiders snap this season, ranked by how far it moved the chance to win. The biggest so far: ${playWord(best).toLowerCase()} against the ${best.oppName}, ${swingText(best)} for the ${best.swing >= 0 ? "Raiders" : best.oppName}.`
		: `Every Raiders snap this season, ranked by how far it moved the chance to win.`
	const card = `${SITE_URL}/api/og?type=lab&slug=season&view=play&rank=1&v=${stampOf()}`
	return {
		title,
		description,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title, description, url: PAGE_URL, siteName: "Raiders Rundown", images: [{ url: card, width: 1200, height: 630, alt: "The biggest Raiders play of the season" }] },
		twitter: { card: "summary_large_image", title, description, images: [card] },
		other: { "og:image": card },
	}
}

export default function TopPlaysPage() {
	const season = getSeason()
	const games = getGames()
	const plays = seasonTopPlays(games, season.team, 10)
	const latest = games[games.length - 1]
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={labColorVars(latest?.opp ?? "")}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {season.season} season
					</p>
					<h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">The biggest plays of the season</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft">
						Every snap is worth some win probability. These are the ten that moved the Raiders&rsquo; chance to win the furthest so far, whichever way, across {games.length} games.
						{plays[0] ? ` Number one: ${playWord(plays[0]).toLowerCase()}, ${whenText(plays[0])}.` : ""}
					</p>
				</div>
			</section>
			<section className="container py-10 sm:py-14" aria-labelledby="season-plays">
				<h2 id="season-plays" className="sr-only">
					Top ten plays
				</h2>
				<TopPlays plays={plays} scope="season" stamp={stampOf()} linkGames />
			</section>
			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; The Lab
					</Link>
					<Credit>Win probability added is the nflverse model&rsquo;s. </Credit>
				</div>
			</section>
		</div>
	)
}
