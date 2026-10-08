import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import ClipPanel from "@/components/lab/ClipPanel"
import DriveReplay from "@/components/lab/DriveReplay"
import TopPlays from "@/components/lab/TopPlays"
import Tip from "@/components/lab/Tip"
import WinProbabilityReplay from "@/components/lab/WinProbabilityReplay"
import { clipFor } from "@/lib/lab/clips"
import { gameSlug, getGameBySlug, getGames, getSeason, neighbours } from "@/lib/lab/data"
import { SWING_HELP, WP_HELP } from "@/lib/lab/glossary"
import { labColorVars } from "@/lib/lab/colors"
import { topPlaysFor } from "@/lib/lab/topPlays"
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

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const params = await props.params;
    const g = getGameBySlug(params.slug)
    if (!g) return { title: "The Lab | Raiders Rundown" }
    const story = gameStory(g.wp, g.keyPlays, g.scores)
    const low = clockAt(story.low.el)
    const pageTitle = `${title(g)} | Win probability replay | Raiders Rundown`
    const description = `Replay the ${g.result === "W" ? "win" : "loss"} ${g.home ? "against" : "at"} the ${g.oppName} play by play. The Raiders' win probability bottomed out at ${pct(story.low.p)} in ${low.q}, ${low.clock}.`
    const slug = gameSlug(g)
    const url = `${SITE_URL}/lab/${slug}`
    // The share card is drawn by /api/og from the same data. The lab is static, so the stamp is the data's own
    // date: a refreshed data file gives a new URL and the networks re-scrape a fresh card.
    const stamp = Date.parse(getSeason().generatedAt) || 0
    const card = `${SITE_URL}/api/og?type=lab&slug=${slug}&v=${stamp}`
    const drive = `${SITE_URL}/api/og?type=lab&slug=${slug}&view=drive&v=${stamp}`
    const play = `${SITE_URL}/api/og?type=lab&slug=${slug}&view=play&rank=1&v=${stamp}`
    return {
		title: pageTitle,
		description,
		alternates: { canonical: url },
		openGraph: { type: "article", title: pageTitle, description, url, siteName: "Raiders Rundown", images: [{ url: card, width: 1200, height: 630, alt: `${title(g)}: the win probability story` }, { url: drive, width: 1200, height: 630, alt: `${title(g)}: the Raiders' best drive` }, { url: play, width: 1200, height: 630, alt: `${title(g)}: the play that moved the game most` }] },
		twitter: { card: "summary_large_image", title: pageTitle, description, images: [card] },
		// Next 13.2 only writes og:image:url from openGraph.images; most scrapers read og:image.
		other: { "og:image": card },
	}
}

export default async function LabGamePage(props: { params: Promise<{ slug: string }> }) {
    const params = await props.params;
    const g = getGameBySlug(params.slug)
    if (!g) notFound()
    const season = getSeason()
    const slug = gameSlug(g)
    const { prev, next } = neighbours(slug)
    const story = gameStory(g.wp, g.keyPlays, g.scores)
    const low = clockAt(story.low.el)
    const swing = story.swing
    const swingPts = swing ? swingPoints(swing) : null
    const swingClock = swing ? clockAt(swing.el) : null
    const plays = topPlaysFor(g, season.team, 5)
    const stamp = Date.parse(season.generatedAt) || 0
    const clip = clipFor(g.week)

    const tiles = [
		{
			label: "Lowest point",
			help: WP_HELP,
			value: pct(story.low.p),
			note: `${low.q} ${low.clock}, chance to win`,
		},
		{
			label: "Biggest swing",
			help: SWING_HELP,
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
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={labColorVars(g.opp)}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {season.season} season
					</p>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{title(g)}</h1>
					<p className="mt-3 text-sm text-lab-muted">
						{g.home ? "Home" : "Road"} game {g.home ? "against" : "at"} the {g.oppName} &middot; {dateLabel(g)}
						{g.roof ? ` · ${g.roof === "dome" ? "Indoors" : g.roof === "retractable" ? "Retractable roof" : "Outdoors"}` : ""}
					</p>
					<dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{tiles.map((t) => (
							<div key={t.label} className="rounded-xl border border-lab-line bg-lab-tint p-4">
								<dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">
									{"help" in t && t.help ? (
										<Tip text={t.help} align="start" side="bottom">
											<span className="border-b border-dotted border-lab-line-strong">{t.label}</span>
										</Tip>
									) : (
										t.label
									)}
								</dt>
								<dd className="mt-1 font-mono text-2xl font-bold tabular-nums sm:text-3xl">
									{t.value}
								</dd>
								<dd className="mt-0.5 text-xs text-lab-muted">{t.note}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<section className="container py-10 sm:py-14" aria-labelledby="wp-heading">
				<div className="mb-5">
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">Replay</p>
					<h2 id="wp-heading" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
						How the game was won
					</h2>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-lab-muted">
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

			{clip && (
				<section className="container pb-10 sm:pb-14" aria-labelledby="clip-heading">
					<div className="mb-5">
						<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">Clip</p>
						<h2 id="clip-heading" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							The game in {Math.round(clip.seconds)} seconds
						</h2>
						<p className="mt-2 max-w-2xl text-sm leading-relaxed text-lab-muted">The win probability, drawn as the game was played. Made for sharing, in the size each app likes.</p>
					</div>
					<ClipPanel clip={clip} title={title(g)} />
				</section>
			)}

			{plays.length > 0 && (
				<section className="container pb-10 sm:pb-14" aria-labelledby="plays-heading">
					<div className="mb-5">
						<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">Top plays</p>
						<h2 id="plays-heading" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							The five plays that decided it
						</h2>
						<p className="mt-2 max-w-2xl text-sm leading-relaxed text-lab-muted">
							Ranked by how far each snap moved the Raiders&rsquo; chance to win, whoever it helped. See{" "}
							<Link href="/lab/top-plays" className="underline underline-offset-4 hover:text-lab-ink">
								the biggest plays of the season
							</Link>
							.
						</p>
					</div>
					<TopPlays plays={plays} scope={slug} stamp={stamp} />
				</section>
			)}

			<section className="container pb-10 sm:pb-14" aria-labelledby="drive-heading">
				<div className="mb-5">
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">Drive replays</p>
					<h2 id="drive-heading" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
						Every drive, one snap at a time
					</h2>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-lab-muted">
						Pick a drive and press play. Passes and kicks arc through the air, runs slide along the ground. Ball positions come from the official play log.
					</p>
				</div>
				<DriveReplay drives={g.drives} teamAbbr={season.team} teamName="Raiders" oppName={g.oppName} scores={g.scores} />
			</section>

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<div className="flex gap-6 text-sm font-semibold">
						{prev ? (
							<Link href={`/lab/${gameSlug(prev)}`} className="text-lab-soft hover:text-lab-ink">
								&larr; Week {prev.week}
							</Link>
						) : null}
						{next ? (
							<Link href={`/lab/${gameSlug(next)}`} className="text-lab-soft hover:text-lab-ink">
								Week {next.week} &rarr;
							</Link>
						) : null}
					</div>
					<p className="max-w-xl text-xs leading-relaxed text-lab-muted">
						Data: <a className="underline underline-offset-4 hover:text-lab-ink" href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse</a> play-by-play, CC BY 4.0. Win probability is
						the nflverse model&rsquo;s. Key plays, charts and replays by Raiders Rundown.
					</p>
				</div>
			</section>
		</div>
	)
}
