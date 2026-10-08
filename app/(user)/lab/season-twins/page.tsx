import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import SeasonTwins from "@/components/lab/SeasonTwins"
import { getScouting } from "@/lib/lab/data"
import { MAX_GAMES, MIN_GAMES } from "@/lib/lab/history"
import { getTwinsView } from "@/lib/lab/twins"

// Built from the JSON in the repo, so it is static: it changes when the Monday data refresh is deployed.

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/season-twins`
const TITLE = "Season twins: which past teams looked most like the Raiders | Raiders Rundown"
const DESCRIPTION = "The NFL teams since 1999 whose first games looked the most like the Raiders' this season, laid over the Raiders stat by stat, and how their seasons ended."

export function generateMetadata(): Metadata {
	const stamp = Date.parse(getScouting().generatedAt) || 0
	const card = getTwinsView() ? `${SITE_URL}/api/og?type=twins&v=${stamp}` : `${SITE_URL}/og-default-v2.png`
	return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title: "Season twins | Raiders Rundown", description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title: "Season twins | Raiders Rundown", description: DESCRIPTION, images: [card] },
	}
}

export default function SeasonTwinsPage() {
	const view = getTwinsView()
	const scouting = getScouting()
	const games = scouting.teams.LV?.g ?? 0
	const top = view?.modes.all?.result.twins[0]

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {scouting.season} season
					</p>
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Season twins</h1>
					<p className="mt-5 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						{view && top
							? `Which team since ${view.first} looked the most like the Raiders after ${view.n} games? Right now it is the ${top.label}. Lay any of the closest teams over the Raiders, stat by stat, and see how their seasons ended.`
							: "Which team since 1999 looked the most like the Raiders after the same number of games, and how did its season end?"}
					</p>
				</div>
			</section>

			{view && view.modes.all ? (
				<section className="container py-10 sm:py-14" aria-label="The twins">
					<SeasonTwins modes={view.modes} season={view.season} n={view.n} first={view.first} last={view.last} start={view.start} stamp={view.stamp} />
				</section>
			) : (
				<section className="container py-14">
					<div className="max-w-2xl rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
						<h2 className="m-0 font-serif text-2xl font-bold">{games < MIN_GAMES ? `Opens after the Raiders play ${MIN_GAMES} games` : "Back next season"}</h2>
						<p className="m-0 mt-3 text-base leading-relaxed text-lab-soft">
							{games < MIN_GAMES
								? "A team's stats mean very little after one or two games, so this waits for a bigger sample. Check back after the Raiders' third game."
								: `This compares the Raiders with other teams over their first ${MAX_GAMES} games of a season. It comes back with next season's first games.`}
						</p>
					</div>
				</section>
			)}

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; The Lab
					</Link>
					<Credit>{view ? `History covers every regular season from ${view.first} to ${view.last}. ` : ""}</Credit>
				</div>
			</section>
		</div>
	)
}
