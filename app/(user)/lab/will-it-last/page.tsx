import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Credit from "@/components/lab/Credit"
import WillItLast from "@/components/lab/WillItLast"
import { getScouting } from "@/lib/lab/data"
import { MAX_GAMES, MIN_GAMES, getHistoryView } from "@/lib/lab/history"

// Built from the JSON in the repo, so it is static: it changes when the Monday data refresh is deployed.

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/will-it-last`
const TITLE = "Will it last? The Raiders' hot and cold stats, tested against every team since 1999 | Raiders Rundown"
const DESCRIPTION = "The Raiders' best and worst numbers so far, lined up against every NFL team since 1999 that started the same way, with who made the playoffs. Filter by team and compare any Raiders season."

export function generateMetadata(): Metadata {
	const view = getHistoryView()
	const stamp = Date.parse(getScouting().generatedAt) || 0
	const card = view ? `${SITE_URL}/api/og?type=last&stat=${encodeURIComponent(view.stories[0].key)}&n=${view.n}&v=${stamp}` : `${SITE_URL}/og-default-v2.png`
	return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title: "Will it last? | Raiders Rundown", description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title: "Will it last? | Raiders Rundown", description: DESCRIPTION, images: [card] },
	}
}

export default function WillItLastPage() {
	const view = getHistoryView()
	const scouting = getScouting()
	const games = scouting.teams.LV?.g ?? 0
	const stamp = Date.parse(scouting.generatedAt) || 0

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
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Will it last?</h1>
					<p className="mt-5 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						{view
							? `The Raiders' loudest numbers after ${view.n} games, tested against every team since ${view.first} that started the same way. Press play to see what happened to them, then filter by team or playoff result, or compare with any Raiders season.`
							: "The Raiders' loudest numbers, tested against every team since 1999 that started the same way."}
					</p>
				</div>
			</section>

			{view ? (
				<>
					<section className="container py-10 sm:py-14" aria-label="The chart">
						<WillItLast meta={view.meta} tables={view.tables} standouts={view.standouts} checklist={view.checklist} season={view.season} n={view.n} first={view.first} last={view.last} stamp={stamp} start={view.start} />
					</section>

					<section className="container pb-10 sm:pb-14" aria-labelledby="bottom-heading">
						<div className="rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
							<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">The bottom line</p>
							<h2 id="bottom-heading" className="m-0 mt-2 max-w-3xl font-serif text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
								{view.bottomLine.title}
							</h2>
							<p className="m-0 mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">{view.bottomLine.body}</p>
						</div>
					</section>

					<section className="container pb-10 sm:pb-14" aria-labelledby="how-heading">
						<h2 id="how-heading" className="m-0 mb-3 font-serif text-xl font-bold">
							How to read this
						</h2>
						<div className="grid max-w-5xl gap-6 text-sm leading-relaxed text-lab-soft md:grid-cols-2">
							<p className="m-0">
								Each dot is one team in one season. It starts where that team stood on a stat through its first {view.n} games and moves to where it stood over the rest of
								that season. {view.n} games is a small sample, and an extreme start is partly luck, which is why teams tend to drift back toward average. It is not all luck: teams
								that start well still finish better than average, just not as far above it.
							</p>
							<p className="m-0">
								The &ldquo;typical finish&rdquo; uses every team since {view.first}, not only the extreme ones: it takes the share of an early gap from average that usually
								carried over and applies it to the Raiders&rsquo; number. The league average moves a little each year, so a few dots can sit on the wrong side of it. Every
								regular season from {view.first} to {view.last} is here, {view.meta.teams.length} team-seasons in all, including all {view.last - view.first + 1} Raiders teams. Six teams from 1999 and 2000 are left out because the open data is missing some of their games. Stats are defined exactly as they are on the scouting reports.
							</p>
						</div>
					</section>
				</>
			) : (
				<section className="container py-14">
					<div className="max-w-2xl rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
						<h2 className="m-0 font-serif text-2xl font-bold">
							{games < MIN_GAMES ? `Opens after the Raiders play ${MIN_GAMES} games` : "Back next season"}
						</h2>
						<p className="m-0 mt-3 text-base leading-relaxed text-lab-soft">
							{games < MIN_GAMES
								? "A team's stats mean very little after one or two games, so this waits for a bigger sample. Check back after the Raiders' third game."
								: `This compares the Raiders with other teams over their first ${MAX_GAMES} games of a season, and then looks at what happened over the rest of it. It comes back with next season's first games.`}
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
