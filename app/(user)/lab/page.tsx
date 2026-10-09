import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Sparkline from "@/components/lab/Sparkline"
import Tip from "@/components/lab/Tip"
import LabToolCard from "@/components/lab/LabToolCard"
import { gameSlug, getGames, getSeason } from "@/lib/lab/data"
import { SWING_HELP } from "@/lib/lab/glossary"
import { labColorVars } from "@/lib/lab/colors"
import { LAB_GROUPS, toolBadges, toolsIn } from "@/lib/lab/tools"
import { labWeeks } from "@/lib/lab/toolsData"
import { formatSwing, gameStory, swingPoints, clockAt, pct } from "@/lib/lab/wp"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab`

export const metadata: Metadata = {
	title: "The Lab: playoff odds, matchups and Raiders game replays | Raiders Rundown",
	description:
		"Playoff odds and a playoff machine, position-group matchups for every game, and every Raiders game rebuilt from the play-by-play, with win probability scrubbers and drive replays.",
	alternates: { canonical: PAGE_URL },
	openGraph: {
		type: "website",
		title: "The Lab | Raiders Rundown",
		description: "Playoff odds, matchup breakdowns and every Raiders game rebuilt from the play-by-play.",
		url: PAGE_URL,
		siteName: "Raiders Rundown",
		images: [`${SITE_URL}/og-default-v2.png`],
	},
	twitter: {
		card: "summary_large_image",
		title: "The Lab | Raiders Rundown",
		description: "Playoff odds, matchup breakdowns and every Raiders game rebuilt from the play-by-play.",
		images: [`${SITE_URL}/og-default-v2.png`],
	},
}

export default function LabPage() {
	const season = getSeason()
	const games = getGames()
	const latest = games[games.length - 1]
	const wins = games.filter((g) => g.result === "W").length
	const losses = games.filter((g) => g.result === "L").length
	const weeks = labWeeks()
	const latestStory = latest ? gameStory(latest.wp, latest.keyPlays, latest.scores) : null
	const latestSwing = latestStory?.swing ? swingPoints(latestStory.swing) : null
	const latestLow = latestStory ? clockAt(latestStory.low.el) : null

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={labColorVars(latest?.opp ?? "")}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">Raiders Rundown &middot; The Lab</p>
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">The Lab</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						Playoff odds, matchup breakdowns and every Raiders game rebuilt from the play-by-play. Built from open NFL data and updated every Monday.
					</p>
					<div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm tabular-nums text-lab-muted">
						<span>
							{season.season} season &middot; {wins}-{losses}
						</span>
						<span>{games.length} games replayed</span>
					</div>
					<nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
						{[
							{ href: "#start", label: "Start here" },
							{ href: "#raiders", label: "The Raiders" },
							{ href: "#league", label: "League and history" },
							{ href: "#games", label: "Every game" },
						].map((l) => (
							<a key={l.href} href={l.href} className="inline-flex min-h-[40px] items-center rounded-full border border-lab-line-strong bg-lab-surface px-4 text-sm font-semibold text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink">
								{l.label}
							</a>
						))}
					</nav>
				</div>
			</section>

			{LAB_GROUPS.map((group) => (
				<section key={group.id} id={group.id} className="container scroll-mt-24 pt-10 sm:pt-12" aria-labelledby={`${group.id}-heading`}>
					<div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<h2 id={`${group.id}-heading`} className="m-0 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							{group.title}
						</h2>
						<p className="m-0 text-sm text-lab-muted">{group.blurb}</p>
					</div>
					<ul className={`m-0 grid list-none gap-4 p-0 ${group.id === "start" ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
						{group.id === "raiders" && latest && latestStory && latestLow ? (
							<li>
								<Link
									href={`/lab/${gameSlug(latest)}`}
									className="group block h-full rounded-2xl border border-lab-line-strong bg-lab-surface p-5 transition hover:bg-lab-tint"
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<h3 className="m-0 font-serif text-xl font-bold">Latest game</h3>
										<span className="rounded-full border border-lab-line-strong px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-lab-soft">Week {latest.week}</span>
									</div>
									<p className="m-0 mt-1 text-sm text-lab-soft">
										{latest.home ? "vs" : "at"} {latest.oppName} &middot;{" "}
										<span className="font-mono font-semibold tabular-nums text-lab-ink">
											{latest.score[0]}&ndash;{latest.score[1]} {latest.result}
										</span>
									</p>
									<div className="mt-3">
										<Sparkline id="spark-latest" series={latest.wp} label={`Raiders win probability in week ${latest.week} against the ${latest.oppName}`} />
									</div>
									<p className="m-0 mt-2 text-xs text-lab-muted">
										Lowest point{" "}
										<span className="font-mono font-semibold tabular-nums text-lab-ink">
											{pct(latestStory.low.p)} at {latestLow.q} {latestLow.clock}
										</span>
										{latestSwing !== null ? (
											<>
												{" "}
												&middot; Biggest swing <span className="font-mono font-semibold tabular-nums text-lab-ink">{formatSwing(latestSwing)}</span>
											</>
										) : null}
									</p>
									<p className="m-0 mt-3 text-sm font-semibold text-lab-soft transition group-hover:text-lab-ink">Scrub the win probability, drive by drive &rarr;</p>
								</Link>
							</li>
						) : null}
						{toolsIn(group.id).map((t) => (
							<li key={t.id}>
								<LabToolCard tool={t} badges={toolBadges(t, weeks)} featured={group.id === "start"} />
							</li>
						))}
					</ul>
				</section>
			))}

			<section id="games" className="container scroll-mt-24 py-10 pb-14 sm:py-12 sm:pb-20" aria-labelledby="games-heading">
				<h2 id="games-heading" className="mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">Every game, week by week</h2>
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{games
						.slice()
						.reverse()
						.map((g) => {
							const story = gameStory(g.wp, g.keyPlays, g.scores)
							const swing = story.swing
							const swingPts = swing ? swingPoints(swing) : null
							const lowAt = clockAt(story.low.el)
							return (
								<li key={g.id} className="lab-opp" style={labColorVars(g.opp)}>
									<Link
										href={`/lab/${gameSlug(g)}`}
										className="group block h-full rounded-2xl border border-lab-line bg-lab-surface p-4 transition hover:border-lab-line-strong hover:bg-lab-tint"
									>
										<div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">
											<span className="inline-flex items-center gap-2">
												<span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--lab-opp)" }} aria-hidden />
												Week {g.week} &middot; {g.home ? "vs" : "at"} {g.oppName}
											</span>
											<span
												className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded px-1.5 text-[10px] font-bold tracking-normal"
												style={{
													background: g.result === "W" ? "var(--lab-team)" : "var(--lab-opp)",
													color: g.result === "W" ? "var(--lab-on-team)" : "var(--lab-on-opp)",
												}}
												title={g.result === "W" ? "Raiders win" : g.result === "L" ? "Raiders loss" : "Tie"}
											>
												{g.result}
											</span>
										</div>
										<div className="mt-2 font-mono text-3xl font-bold tabular-nums">
											{g.score[0]}&ndash;{g.score[1]}
										</div>
										<div className="mt-3">
											<Sparkline
												id={`spark-${g.week}`}
												series={g.wp}
												label={`Raiders win probability in week ${g.week} against the ${g.oppName}`}
											/>
										</div>
										<dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
											<div>
												<dt className="text-lab-muted">Lowest point</dt>
												<dd className="font-mono font-semibold tabular-nums text-lab-ink">
													{pct(story.low.p)} at {lowAt.q} {lowAt.clock}
												</dd>
											</div>
											<div>
												<dt className="text-lab-muted">
													<Tip text={SWING_HELP} align="start" side="top" focusable={false}>
														<span className="border-b border-dotted border-lab-line-strong">Biggest swing</span>
													</Tip>
												</dt>
												<dd className="font-mono font-semibold tabular-nums text-lab-ink">{formatSwing(swingPts)}</dd>
											</div>
										</dl>
										<p className="mt-3 text-sm font-semibold text-lab-soft transition group-hover:text-lab-ink">Replay this game &rarr;</p>
									</Link>
								</li>
							)
						})}
				</ul>
			</section>

			<section className="border-t border-lab-line">
				<div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
					<div>
						<h3 className="font-serif text-xl font-bold">What is win probability?</h3>
						<p className="mt-2 text-sm leading-relaxed text-lab-soft">
							A model&rsquo;s estimate of how likely a team is to win from the exact situation on the field: score, time left, down, distance and field position. It is not a
							prediction of what will happen. It is how surprised you should be by what just happened.
						</p>
					</div>
					<div>
						<h3 className="font-serif text-xl font-bold">How the replays are made</h3>
						<p className="mt-2 text-sm leading-relaxed text-lab-soft">
							Each Monday a script pulls the latest play-by-play, finds the scoring plays, turnovers and biggest swings, and rebuilds every drive. No video, no tracking data, just
							what the official play log records.
						</p>
					</div>
					<div>
						<h3 className="font-serif text-xl font-bold">Where the data comes from</h3>
						<p className="mt-2 text-sm leading-relaxed text-lab-soft">
							Open play-by-play data from the <a className="underline underline-offset-4 hover:text-lab-ink" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse project</a>, shared under a CC BY 4.0 license. Charts, selection of key plays and the
							replays are Raiders Rundown&rsquo;s. Last updated {new Date(season.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}.
						</p>
					</div>
				</div>
			</section>
		</div>
	)
}
