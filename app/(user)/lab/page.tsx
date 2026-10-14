import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Sparkline from "@/components/lab/Sparkline"
import Tip from "@/components/lab/Tip"
import LabToolCard from "@/components/lab/LabToolCard"
import Drops from "@/components/lab/hub/Drops"
import HubPulse from "@/components/lab/hub/HubPulse"
import CardPreview from "@/components/lab/hub/CardPreview"
import ReportShare from "@/components/lab/hub/ReportShare"
import SettleIt from "@/components/lab/hub/SettleIt"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import { getHub } from "@/lib/lab/hub"
import { teamNick } from "@/lib/lab/playerView"
import { gameSlug, getGames, getSeason } from "@/lib/lab/data"
import { SWING_HELP } from "@/lib/lab/glossary"
import { labColorVars } from "@/lib/lab/colors"
import { LAB_GROUPS, toolBadges, toolsIn } from "@/lib/lab/tools"
import { labWeeks } from "@/lib/lab/toolsData"
import { formatSwing, gameStory, swingPoints, clockAt, pct } from "@/lib/lab/wp"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab`

const hubStamp = () => getHub().input.stamp

export function generateMetadata(): Metadata {
	const card = `${SITE_URL}/api/og?type=hub&v=${hubStamp()}`
	return {
	title: "The Lab: this week's findings, playoff odds, matchups and game replays | Raiders Rundown",
	description:
		"The Raiders' playoff odds, the players moving the most, head-to-head debates the numbers can settle, and every Raiders game rebuilt from the play-by-play. Rebuilt after every game.",
	alternates: { canonical: PAGE_URL },
	openGraph: {
		type: "website",
		title: "The Lab | Raiders Rundown",
		description: "Playoff odds, matchup breakdowns and every Raiders game rebuilt from the play-by-play.",
		url: PAGE_URL,
		siteName: "Raiders Rundown",
		images: [{ url: card, width: 1200, height: 630, alt: "The Lab Report: this week's findings on one card" }],
	},
	twitter: {
		card: "summary_large_image",
		title: "The Lab | Raiders Rundown",
		description: "Playoff odds, matchup breakdowns and every Raiders game rebuilt from the play-by-play.",
		images: [card],
	},
	other: { "og:image": card },
	}
}

export default function LabPage() {
	const hub = getHub()
	const odds = hub.input.odds
	const next = hub.input.next
	const reportText = `The Raiders Rundown Lab Report${hub.pulse.week ? `, Week ${hub.pulse.week}` : ""}: ${odds && odds.status === "live" ? `Raiders at ${odds.pct} to make the playoffs, ` : ""}the players moving, the units and the biggest play.`
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
				<div className="container grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-center">
					<div className="min-w-0">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">Raiders Rundown &middot; The Lab</p>
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">The Lab</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						The numbers behind the Raiders and the league, rebuilt after every game: the playoff race, the players moving the most, the arguments the data can settle, and every Raiders game replayed from the play-by-play.
					</p>
					<dl className="mt-6 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3" data-testid="hub-tiles">
						<div className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3">
							<dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{season.season} record</dt>
							<dd className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums">{hub.pulse.record ?? `${wins}-${losses}`}</dd>
						</div>
						{odds ? (
							<div className="rounded-xl border border-lab-line bg-lab-surface px-4 py-3">
								<dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{odds.status === "live" ? "Playoff odds" : "Playoffs"}</dt>
								<dd className="m-0 mt-1 font-mono text-2xl font-bold tabular-nums">{odds.pct}</dd>
								{odds.change && odds.change.dir !== "flat" ? <dd className="m-0 text-xs text-lab-muted">{odds.change.text} {odds.change.since}</dd> : null}
							</div>
						) : null}
						{next ? (
							<div className="col-span-2 rounded-xl border border-lab-line bg-lab-surface px-4 py-3 sm:col-span-1">
								<dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">Next up{hub.input.units.slate ? `, Week ${hub.input.units.slate.week}` : ""}</dt>
								<dd className="m-0 mt-1 font-serif text-2xl font-bold">
									{next.venue === "at" ? "at" : "vs."} {teamNick(next.opp)}
								</dd>
							</div>
						) : null}
					</dl>
					<div className="mt-5 max-w-3xl">
						<HubPulse pulse={hub.pulse} />
					</div>
					<UpdatedStamp at={hub.input.players.generatedAt} kind="grades" className="mt-4" />
					<nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
						{[
							{ href: "#week", label: "This week" },
							{ href: "#settle", label: "Settle it" },
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
					{hub.drops.length >= 3 ? (
						<figure className="m-0 hidden lg:block">
							<CardPreview src={`/api/og?type=hub&v=${hub.input.stamp}`} alt="The Lab Report: this week's findings on one card" />
							<figcaption className="mt-3 flex items-center justify-between gap-3 text-xs text-lab-muted">
								<span>The Lab Report, as it looks when you post it.</span>
								<ReportShare stamp={hub.input.stamp} week={hub.pulse.week} text={reportText} />
							</figcaption>
						</figure>
					) : null}
				</div>
			</section>

			{hub.drops.length ? (
				<section id="week" className="container scroll-mt-24 pt-10 sm:pt-12" aria-labelledby="week-heading">
					<div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<h2 id="week-heading" className="m-0 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							{hub.pulse.week ? `Week ${hub.pulse.week} in the Lab` : "This week in the Lab"}
						</h2>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
							<p className="m-0 text-sm text-lab-muted">What the numbers found. Every one has a card you can post.</p>
							<span className="lg:hidden">
								<ReportShare stamp={hub.input.stamp} week={hub.pulse.week} text={reportText} />
							</span>
						</div>
					</div>
					<Drops drops={hub.drops} stamp={hub.input.stamp} />
				</section>
			) : null}

			{hub.takes.length ? (
				<section id="settle" className="container scroll-mt-24 pt-10 sm:pt-12" aria-labelledby="settle-heading">
					<div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<h2 id="settle-heading" className="m-0 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							Settle it
						</h2>
						<p className="m-0 text-sm text-lab-muted">Arguments the numbers can answer. You go first.</p>
					</div>
					<SettleIt takes={hub.takes} stamp={hub.input.stamp} />
				</section>
			) : null}

			{LAB_GROUPS.map((group) => (
				<section key={group.id} id={group.id} className="container scroll-mt-24 pt-10 sm:pt-12" aria-labelledby={`${group.id}-heading`}>
					<div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<h2 id={`${group.id}-heading`} className="m-0 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							{group.title}
						</h2>
						<p className="m-0 text-sm text-lab-muted">{group.blurb}</p>
					</div>
					<ul className={`m-0 grid list-none gap-4 p-0 ${group.id === "start" ? "md:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
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
								<LabToolCard tool={t} badges={toolBadges(t, weeks)} featured={group.id === "start"} teaser={hub.teasers[t.id]} />
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
