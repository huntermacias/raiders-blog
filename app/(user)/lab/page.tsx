import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Sparkline from "@/components/lab/Sparkline"
import Tip from "@/components/lab/Tip"
import WinProbabilityReplay from "@/components/lab/WinProbabilityReplay"
import { gameSlug, getGames, getSeason } from "@/lib/lab/data"
import { SWING_HELP } from "@/lib/lab/glossary"
import { labColorVars } from "@/lib/lab/colors"
import { formatSwing, gameStory, swingPoints, clockAt, pct } from "@/lib/lab/wp"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab`

export const metadata: Metadata = {
	title: "The Lab: Raiders win probability and drive replays | Raiders Rundown",
	description:
		"Every Raiders game rebuilt from the play-by-play. Scrub through the win probability, watch each drive move across the field, and see the plays that decided the game.",
	alternates: { canonical: PAGE_URL },
	openGraph: {
		type: "website",
		title: "The Lab | Raiders Rundown",
		description: "Every Raiders game rebuilt from the play-by-play: win probability replays and drive-by-drive animations.",
		url: PAGE_URL,
		siteName: "Raiders Rundown",
		images: [`${SITE_URL}/og-default-v2.png`],
	},
	twitter: {
		card: "summary_large_image",
		title: "The Lab | Raiders Rundown",
		description: "Every Raiders game rebuilt from the play-by-play: win probability replays and drive-by-drive animations.",
		images: [`${SITE_URL}/og-default-v2.png`],
	},
}

export default function LabPage() {
	const season = getSeason()
	const games = getGames()
	const latest = games[games.length - 1]
	const wins = games.filter((g) => g.result === "W").length
	const losses = games.filter((g) => g.result === "L").length

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={labColorVars(latest?.opp ?? "")}>
			<section className="border-b border-lab-line">
				<div className="container py-12 sm:py-16">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">Raiders Rundown &middot; The Lab</p>
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
						Every Raiders game, rebuilt from the play-by-play.
					</h1>
					<p className="mt-5 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						Drag through the win probability to find the play that turned the game. Watch any drive move down the field, one snap at a time.
						Updated every Monday from open NFL data.
					</p>
					<div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm tabular-nums text-lab-muted">
						<span>
							{season.season} season &middot; {wins}-{losses}
						</span>
						<span>{games.length} games replayed</span>
					</div>
				</div>
			</section>

			{latest && (
				<section className="container py-10 sm:py-14">
					<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">Latest game</p>
							<h2 className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
								Week {latest.week}: Raiders {latest.score[0]}, {latest.oppName} {latest.score[1]}
							</h2>
						</div>
						<Link href={`/lab/${gameSlug(latest)}`} className="text-sm font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
							Full game, with drive replays &rarr;
						</Link>
					</div>
					<WinProbabilityReplay
						series={latest.wp}
						keyPlays={latest.keyPlays}
						scores={latest.scores}
						teamName="Raiders"
						oppName={latest.oppName}
						finalScore={latest.score}
						sharePath={`/lab/${gameSlug(latest)}`}
						shareText={`Raiders ${latest.score[0]}, ${latest.oppName} ${latest.score[1]}: scrub through the win probability, play by play.`}
					/>
				</section>
			)}

			<section className="container pb-10 sm:pb-14" aria-labelledby="tools-heading">
				<h2 id="tools-heading" className="mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
					More from the Lab
				</h2>
				<ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
					{[
						{ href: "/lab/top-plays", title: "Top plays", text: "The snaps that moved the Raiders' chance to win the furthest this season." },
						{ href: "/lab/matchups", title: "This week's matchups", text: "Every game on the slate, position group by position group: who has the edge at quarterback, on the line and in coverage." },
						{ href: "/lab/teams", title: "How all 32 teams stack up", text: "Quarterback, line, receivers, run game, pass rush, run defense and coverage, ranked across the league." },
						{ href: "/lab/scouting", title: "Scouting reports", text: "Where the Raiders have the edge on every opponent, and what to watch." },
						{ href: "/lab/will-it-last", title: "Will it last?", text: "The Raiders' hottest and coldest stats, against every team since 1999 that started the same way." },
						{ href: "/lab/season-twins", title: "Season twins", text: "The past teams that looked the most like the Raiders so far, laid over them stat by stat, and how their seasons ended." },
					].map((t) => (
						<li key={t.href}>
							<Link href={t.href} className="group block h-full rounded-2xl border border-lab-line bg-lab-surface p-5 transition hover:border-lab-line-strong hover:bg-lab-tint">
								<h3 className="m-0 font-serif text-xl font-bold">{t.title}</h3>
								<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">{t.text}</p>
								<p className="m-0 mt-3 text-sm font-semibold text-lab-soft transition group-hover:text-lab-ink">Open &rarr;</p>
							</Link>
						</li>
					))}
				</ul>
			</section>

			<section className="container pb-14 sm:pb-20">
				<h2 className="mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">The season so far</h2>
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
