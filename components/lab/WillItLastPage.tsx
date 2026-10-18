import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import { labWeeks } from "@/lib/lab/toolsData"
import Credit from "@/components/lab/Credit"
import MyTeamBar from "@/components/league/MyTeamBar"
import ShareCard from "@/components/lab/ShareCard"
import WillItLast from "@/components/lab/WillItLast"
import { WeekByWeek } from "@/components/lab/WillItLastExtras"
import { getScouting } from "@/lib/lab/data"
import { MAX_GAMES, MIN_GAMES, getHistoryView, teamAbbrs } from "@/lib/lab/history"
import { subjectOf } from "@/lib/lab/historyKit"
import { pagePath } from "@/lib/lab/lastShare"
import { raidersLogo } from "@/lib/lab/shield"

// Built from the JSON in the repo, so it is static: it changes when a data refresh (every few hours on game days) is deployed.
// One page for every team: the Raiders' is /lab/will-it-last, the other 31 are /lab/will-it-last/<team>.

const SITE_URL = "https://www.raidersrundown.com"

export function willItLastMetadata(team: string): Metadata {
	const view = getHistoryView(team)
	const subject = subjectOf(team) ?? { abbr: "LV", name: "Raiders" }
	const stamp = Date.parse(getScouting().generatedAt) || 0
	const url = `${SITE_URL}${pagePath(team)}`
	const ofParam = team === "LV" ? "" : `&of=${team}`
	const card = view ? `${SITE_URL}/api/og?type=last${ofParam}&stat=${encodeURIComponent(view.stories[0].key)}&n=${view.n}&v=${stamp}` : `${SITE_URL}/og-default-v2.png`
	const raiders = team === "LV"
	const title = raiders ? "Will it last? The Raiders' hot and cold stats, tested against every team since 1999 | Raiders Rundown" : `Will the ${subject.name}' start last? Their hot and cold stats against every team since 1999 | Raiders Rundown`
	const description = raiders
		? "The Raiders' best and worst numbers so far, lined up against every NFL team since 1999 that started the same way, with who made the playoffs. Filter by team and compare any Raiders season."
		: `The ${subject.name}' best and worst numbers so far, lined up against every NFL team since 1999 that started the same way, with who made the playoffs and the range teams like them finished in.`
	const short = raiders ? "Will it last? | Raiders Rundown" : `Will the ${subject.name}' start last? | Raiders Rundown`
	return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: { type: "website", title: short, description, url, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title: short, description, images: [card] },
	}
}

export default function WillItLastPage({ team = "LV" }: { team?: string }) {
	const subject = subjectOf(team) ?? { abbr: "LV", name: "Raiders" }
	const raiders = subject.abbr === "LV"
	const view = getHistoryView(subject.abbr)
	const scouting = getScouting()
	const games = scouting.teams[subject.abbr]?.g ?? 0
	const stamp = Date.parse(scouting.generatedAt) || 0
	const name = subject.name
	const of = raiders ? null : subject.abbr

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-6 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {scouting.season} season
					</p>
					<h1 className="mt-2 max-w-3xl font-serif text-3xl font-bold leading-[1.05] tracking-tight sm:mt-3 sm:text-6xl">{raiders ? "Will it last?" : `Will the ${name}' start last?`}</h1>
					<p className="mt-3 max-w-2xl text-base leading-relaxed text-lab-soft sm:mt-5 sm:text-lg">
						{view
							? `The ${name}' loudest numbers after ${view.n} games, tested against every team since ${view.first} that started the same way. Press play to see what happened to them.`
							: `The ${name}' loudest numbers, tested against every team since 1999 that started the same way.`}
					</p>
					<UpdatedStamp at={scouting.generatedAt} kind="grades" className="mt-3 sm:mt-4" />
				</div>
			</section>

			<MyTeamBar abbr={subject.abbr} />

			{view ? (
				<>
					<section className="container py-6 sm:py-14" aria-label="The chart">
						<WillItLast meta={view.meta} tables={view.tables} standouts={view.standouts} checklist={view.checklist} season={view.season} n={view.n} first={view.first} last={view.last} stamp={stamp} start={view.start} raidersLogo={raiders ? raidersLogo : null} subject={subject} />
					</section>

					{view.trail ? <WeekByWeek trail={view.trail} subject={subject} n={view.n} /> : null}

					<section className="container pb-10 sm:pb-14" aria-labelledby="bottom-heading">
						<div className="rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">The bottom line</p>
								<ShareCard kind="bottom" view={{ of }} stamp={stamp} text={`${view.bottomLine.title} What the ${name}' hot and cold stats looked like against every team since ${view.first}.`} alt={`The bottom line: ${view.bottomLine.title}`} />
							</div>
							<h2 id="bottom-heading" className="m-0 mt-2 max-w-3xl scroll-mt-6 font-serif text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
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
								carried over and applies it to the {name}&rsquo; number. The range is where 80% of the teams that started like them actually finished. The league average moves a little each year, so a few dots can sit on the wrong side of it. Every
								regular season from {view.first} to {view.last} is here, {view.meta.teams.length} team-seasons in all, including all {view.last - view.first + 1} {name} teams. Six teams from 1999 and 2000 are left out because the open data is missing some of their games. Stats are defined exactly as they are on the scouting reports.
							</p>
						</div>
					</section>
				</>
			) : (
				<section className="container py-14">
					<div className="max-w-2xl rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
						<h2 className="m-0 font-serif text-2xl font-bold">{games < MIN_GAMES ? `Opens after the ${name} play ${MIN_GAMES} games` : "Back next season"}</h2>
						<p className="m-0 mt-3 text-base leading-relaxed text-lab-soft">
							{games < MIN_GAMES
								? `A team's stats mean very little after one or two games, so this waits for a bigger sample. Check back after the ${name}' third game.`
								: `This compares the ${name} with other teams over their first ${MAX_GAMES} games of a season, and then looks at what happened over the rest of it. It comes back with next season's first games.`}
						</p>
					</div>
				</section>
			)}

			<section className="border-t border-lab-line" aria-labelledby="teams-heading">
				<div className="container py-8 sm:py-10">
					<h2 id="teams-heading" className="m-0 font-serif text-xl font-bold">
						Every team&rsquo;s page
					</h2>
					<p className="m-0 mt-1 text-sm text-lab-soft">The same test for any team: its loudest numbers against every team since 1999 that started the same way.</p>
					<ul className="m-0 mt-4 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4 lg:grid-cols-8" aria-label="Teams">
						{teamAbbrs()
							.map((a) => ({ a, n: subjectOf(a)!.name }))
							.sort((x, y) => x.n.localeCompare(y.n))
							.map(({ a, n }) => (
								<li key={a}>
									<Link href={pagePath(a)} aria-current={a === subject.abbr ? "page" : undefined} className={`flex min-h-[44px] items-center justify-center rounded-lg border px-2 py-2 text-center text-sm font-semibold transition ${a === subject.abbr ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}>
										{n}
									</Link>
								</li>
							))}
					</ul>
				</div>
			</section>

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; The Lab
					</Link>
					<Credit>{view ? `History covers every regular season from ${view.first} to ${view.last}. ` : ""}</Credit>
				</div>
			</section>
			<MoreFromLab current="/lab/will-it-last" weeks={labWeeks()} />
		</div>
	)
}
