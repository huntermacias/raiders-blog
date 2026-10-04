import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import Sparkline from "@/components/lab/Sparkline"
import WinProbabilityReplay from "@/components/lab/WinProbabilityReplay"
import { gameSlug, getGames, getSeason } from "@/lib/lab/data"
import { LAB } from "@/lib/lab/theme"
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
		<div className="bg-[#07080a] text-white">
			<section className="border-b border-white/10">
				<div className="container py-12 sm:py-16">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">Raiders Rundown &middot; The Lab</p>
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
						Every Raiders game, rebuilt from the play-by-play.
					</h1>
					<p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg">
						Drag through the win probability to find the play that turned the game. Watch any drive move down the field, one snap at a time.
						Updated every Monday from open NFL data.
					</p>
					<div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm tabular-nums text-white/60">
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
							<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">Latest game</p>
							<h2 className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
								Week {latest.week}: Raiders {latest.score[0]}, {latest.oppName} {latest.score[1]}
							</h2>
						</div>
						<Link href={`/lab/${gameSlug(latest)}`} className="text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
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

			<section className="container pb-14 sm:pb-20">
				<h2 className="mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">The season so far</h2>
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{games
						.slice()
						.reverse()
						.map((g) => {
							const story = gameStory(g.wp, g.keyPlays)
							const swing = story.swing
							const swingPts = swing ? swingPoints(swing) : null
							const lowAt = clockAt(story.low.el)
							return (
								<li key={g.id}>
									<Link
										href={`/lab/${gameSlug(g)}`}
										className="group block h-full rounded-2xl border border-white/10 bg-[#0b0d10] p-4 transition hover:border-white/30 hover:bg-[#10131a]"
									>
										<div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
											<span>
												Week {g.week} &middot; {g.home ? "vs" : "at"} {g.oppName}
											</span>
											<span style={{ color: g.result === "W" ? LAB.team : LAB.opp }}>{g.result}</span>
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
												<dt className="text-white/45">Lowest point</dt>
												<dd className="font-mono font-semibold tabular-nums text-white/85">
													{pct(story.low.p)} at {lowAt.q} {lowAt.clock}
												</dd>
											</div>
											<div>
												<dt className="text-white/45">Biggest swing</dt>
												<dd className="font-mono font-semibold tabular-nums text-white/85">{formatSwing(swingPts)}</dd>
											</div>
										</dl>
										<p className="mt-3 text-sm font-semibold text-white/70 transition group-hover:text-white">Replay this game &rarr;</p>
									</Link>
								</li>
							)
						})}
				</ul>
			</section>

			<section className="border-t border-white/10">
				<div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
					<div>
						<h3 className="font-serif text-xl font-bold">What is win probability?</h3>
						<p className="mt-2 text-sm leading-relaxed text-white/65">
							A model&rsquo;s estimate of how likely a team is to win from the exact situation on the field: score, time left, down, distance and field position. It is not a
							prediction of what will happen. It is how surprised you should be by what just happened.
						</p>
					</div>
					<div>
						<h3 className="font-serif text-xl font-bold">How the replays are made</h3>
						<p className="mt-2 text-sm leading-relaxed text-white/65">
							Each Monday a script pulls the latest play-by-play, finds the scoring plays, turnovers and biggest swings, and rebuilds every drive. No video, no tracking data, just
							what the official play log records.
						</p>
					</div>
					<div>
						<h3 className="font-serif text-xl font-bold">Where the data comes from</h3>
						<p className="mt-2 text-sm leading-relaxed text-white/65">
							Open play-by-play data from the <a className="underline underline-offset-4 hover:text-white" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse project</a>, shared under a CC BY 4.0 license. Charts, selection of key plays and the
							replays are Raiders Rundown&rsquo;s. Last updated {new Date(season.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}.
						</p>
					</div>
				</div>
			</section>
		</div>
	)
}
