import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import DriveReplay from "@/components/lab/DriveReplay"
import WinProbabilityReplay from "@/components/lab/WinProbabilityReplay"
import { gameSlug, getGameBySlug, getGames, getSeason, neighbours } from "@/lib/lab/data"
import { LAB } from "@/lib/lab/theme"
import type { LabGame } from "@/lib/lab/types"
import { clockAt, formatSwing, gameStory, kindLabel, pct, swingPoints } from "@/lib/lab/wp"

const SITE_URL = "https://www.raidersrundown.com"

// The data only changes when a new game is added and the site is rebuilt, so every
// game is built once, ahead of time. Anything else is a 404.
export const dynamicParams = false

export function generateStaticParams() {
	return getGames().map((g) => ({ slug: gameSlug(g) }))
}

function title(g: LabGame) {
	return `Week ${g.week}: Raiders ${g.score[0]}, ${g.oppName} ${g.score[1]}`
}

function dateLabel(g: LabGame) {
	return new Date(`${g.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
	const g = getGameBySlug(params.slug)
	if (!g) return { title: "The Lab | Raiders Rundown" }
	const story = gameStory(g.wp, g.keyPlays)
	const low = clockAt(story.low.el)
	const pageTitle = `${title(g)} | Win probability replay | Raiders Rundown`
	const description = `Replay the ${g.result === "W" ? "win" : "loss"} ${g.home ? "against" : "at"} the ${g.oppName} play by play. The Raiders' win probability bottomed out at ${pct(story.low.p)} in ${low.q}, ${low.clock}.`
	const url = `${SITE_URL}/lab/${gameSlug(g)}`
	return {
		title: pageTitle,
		description,
		alternates: { canonical: url },
		openGraph: { type: "article", title: pageTitle, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
		twitter: { card: "summary_large_image", title: pageTitle, description, images: [`${SITE_URL}/og-default-v2.png`] },
	}
}

export default function LabGamePage({ params }: { params: { slug: string } }) {
	const g = getGameBySlug(params.slug)
	if (!g) notFound()
	const season = getSeason()
	const slug = gameSlug(g)
	const { prev, next } = neighbours(slug)
	const story = gameStory(g.wp, g.keyPlays)
	const low = clockAt(story.low.el)
	const swing = story.swing
	const swingPts = swing ? swingPoints(swing) : null
	const swingClock = swing ? clockAt(swing.el) : null

	const tiles = [
		{
			label: "Lowest point",
			value: pct(story.low.p),
			note: `${low.q} ${low.clock}, chance to win`,
		},
		{
			label: "Biggest swing",
			value: formatSwing(swingPts),
			note: swing && swingClock ? `${kindLabel(swing.kind)}, ${swingClock.q} ${swing.clock}` : "",
		},
		{
			label: "Lead changes",
			value: String(story.leadChanges),
			note: "counting scoring plays",
		},
		{
			label: story.maxDeficit > 0 ? "Biggest deficit" : "Biggest lead",
			value: `${story.maxDeficit > 0 ? story.maxDeficit : story.maxLead} pts`,
			note: story.maxDeficit > 0 ? "the Raiders faced" : "the Raiders held",
		},
	]

	return (
		<div className="bg-[#07080a] text-white">
			<section className="border-b border-white/10">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
						<Link href="/lab" className="hover:text-white">
							The Lab
						</Link>{" "}
						&middot; {season.season} season
					</p>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{title(g)}</h1>
					<p className="mt-3 text-sm text-white/60">
						{g.home ? "Home" : "Road"} game {g.home ? "against" : "at"} the {g.oppName} &middot; {dateLabel(g)}
						{g.roof ? ` · ${g.roof === "dome" ? "Indoors" : g.roof === "retractable" ? "Retractable roof" : "Outdoors"}` : ""}
					</p>
					<dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{tiles.map((t) => (
							<div key={t.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
								<dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{t.label}</dt>
								<dd className="mt-1 font-mono text-2xl font-bold tabular-nums sm:text-3xl" style={{ color: LAB.ink }}>
									{t.value}
								</dd>
								<dd className="mt-0.5 text-xs text-white/50">{t.note}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<section className="container py-10 sm:py-14" aria-labelledby="wp-heading">
				<div className="mb-5">
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">Replay</p>
					<h2 id="wp-heading" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
						How the game was won
					</h2>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
						Press play, or drag across the chart. Click any marker to jump straight to that play.
					</p>
				</div>
				<WinProbabilityReplay
					series={g.wp}
					keyPlays={g.keyPlays}
					scores={g.scores}
					teamName="Raiders"
					oppName={g.oppName}
					finalScore={g.score}
					sharePath={`/lab/${slug}`}
					shareText={`${title(g)}: scrub through the win probability, play by play.`}
				/>
			</section>

			<section className="container pb-10 sm:pb-14" aria-labelledby="drive-heading">
				<div className="mb-5">
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">Drive replays</p>
					<h2 id="drive-heading" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
						Every drive, one snap at a time
					</h2>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
						Pick a drive and press play. The blue line is the line of scrimmage and the yellow line is the first-down marker. Ball positions come from the official play log.
					</p>
				</div>
				<DriveReplay drives={g.drives} teamAbbr={season.team} teamName="Raiders" oppName={g.oppName} />
			</section>

			<section className="border-t border-white/10">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<div className="flex gap-6 text-sm font-semibold">
						{prev ? (
							<Link href={`/lab/${gameSlug(prev)}`} className="text-white/70 hover:text-white">
								&larr; Week {prev.week}
							</Link>
						) : null}
						{next ? (
							<Link href={`/lab/${gameSlug(next)}`} className="text-white/70 hover:text-white">
								Week {next.week} &rarr;
							</Link>
						) : null}
					</div>
					<p className="max-w-xl text-xs leading-relaxed text-white/45">
						Data: <a className="underline underline-offset-4 hover:text-white" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse</a> play-by-play, CC BY 4.0. Win probability is
						the nflverse model&rsquo;s. Key plays, charts and replays by Raiders Rundown.
					</p>
				</div>
			</section>
		</div>
	)
}
