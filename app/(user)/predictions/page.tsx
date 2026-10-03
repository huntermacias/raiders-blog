import { groq } from "next-sanity"
import type { Metadata } from "next"

import { client } from "../../../lib/sanity.client"
import {
	SEASON,
	type FlagPlant,
	type GamePrediction,
	type SeasonDoc,
	summarize,
	summarizeFlags,
	summarizeKeys,
} from "../../../lib/predictions"
import ScoreboardHero from "../../../components/predictions/ScoreboardHero"
import PicksFeed from "../../../components/predictions/PicksFeed"
import SeasonTracker from "../../../components/predictions/SeasonTracker"
import FlagLedger from "../../../components/predictions/FlagLedger"

// Same reasoning as the game reports index: render fresh on every request so
// newly graded picks and reader votes show immediately instead of waiting for
// a background revalidation on a low-traffic route.
export const dynamic = "force-dynamic"

const PAGE_URL = "https://www.raidersrundown.com/predictions"
const TITLE = "Prediction Scoreboard | Raiders Rundown"
const DESCRIPTION =
	"Every pick on the record: weekly game predictions graded in public, win-total picks for all 32 teams, and reader picks versus mine."
// Metadata on a page replaces (not merges) the layout's openGraph/twitter, so
// the share image has to be restated here. A plain string first -- this Next
// version only emits a real og:image tag from a string entry. The card shows
// the live record (pages/api/og.tsx); `v` rolls hourly so a newly graded game
// reaches X and Facebook without waiting on their image caches.
export function generateMetadata(): Metadata {
	const hour = Math.floor(Date.now() / 3_600_000)
	const image = `https://www.raidersrundown.com/api/og?type=scoreboard&v=${hour}`
	return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: {
			type: "website",
			title: TITLE,
			description: DESCRIPTION,
			url: PAGE_URL,
			siteName: "Raiders Rundown",
			images: [image, { url: image, width: 1200, height: 630, alt: "Raiders Rundown prediction scoreboard" }],
		},
		twitter: {
			card: "summary_large_image",
			title: TITLE,
			description: DESCRIPTION,
			images: [image],
		},
	}
}

const picksQuery = groq`
	*[_type == 'gamePrediction' && season == $season && !(_id in path('drafts.**'))] | order(kickoff desc) {
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore, writeup,
		actualAwayScore, actualHomeScore,
		readerVotesAway, readerVotesHome,
		"report": gameReport->{ "slug": slug.current, title },
		"preview": previewPost->{ "slug": slug.current, title },
		keys[]{ _key, text, result }
	}
`

const flagsQuery = groq`
	*[_type == 'flagPlant' && season == $season && !(_id in path('drafts.**'))] | order(week desc, _createdAt desc) {
		_id, week, text, detail, result, resultNote,
		"post": post->{ "slug": slug.current, title }
	}
`

const seasonQuery = groq`
	*[_type == 'seasonPredictions' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt desc)[0] {
		_id, season, throughWeek, isFinal,
		teams[]{ _key, team, predictedWins, playoffs, divisionWinner, note, wins, losses, ties }
	}
`

function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
	return (
		<div id={id} className="mb-6 scroll-mt-28">
			<h2 className="font-serif text-3xl font-bold tracking-tight">{title}</h2>
			<p className="mt-1 max-w-2xl text-muted-foreground">{subtitle}</p>
		</div>
	)
}

export default async function PredictionsPage() {
	const [picks, season, flags]: [GamePrediction[], SeasonDoc | null, FlagPlant[]] = await Promise.all([
		client.fetch(picksQuery, { season: SEASON }),
		client.fetch(seasonQuery, { season: SEASON }),
		client.fetch(flagsQuery, { season: SEASON }),
	])

	const summary = summarize(picks)
	const keysSummary = summarizeKeys(picks)
	const flagSummary = summarizeFlags(flags ?? [])
	const teamRows = season?.teams ?? []

	return (
		<div className="container py-12">
			<div className="mb-10">
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{SEASON} season</p>
				<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight md:text-5xl">Prediction Scoreboard</h1>
				<p className="mt-3 max-w-2xl text-lg text-muted-foreground">
					Every pick goes on the record before kickoff and gets graded in public. Hits, misses, and how far off the margin was.
				</p>
				<nav aria-label="On this page" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
					<a href="#weekly-picks" className="underline-offset-4 hover:underline">
						Weekly picks
					</a>
					{flags && flags.length > 0 && (
						<a href="#flags" className="underline-offset-4 hover:underline">
							Flags planted
						</a>
					)}
					<a href="#season-tracker" className="underline-offset-4 hover:underline">
						All 32 teams
					</a>
					<a href="#how-it-works" className="underline-offset-4 hover:underline">
						How grading works
					</a>
				</nav>
			</div>

			<ScoreboardHero summary={summary} season={SEASON} keys={keysSummary} flags={flagSummary} />

			<section className="mt-16" aria-labelledby="weekly-picks">
				<SectionHeading
					id="weekly-picks"
					title="Weekly picks"
					subtitle="My pick for every game, with a final score and a grade once it's in. Pick the winner yourself before kickoff and see how readers are leaning."
				/>
				<PicksFeed picks={picks} />
			</section>

			{flags && flags.length > 0 && (
				<section className="mt-16" aria-labelledby="flags">
					<SectionHeading
						id="flags"
						title="Flags planted"
						subtitle="The bold, specific calls I put my name on before the game: a player stat line, a turnover, a play. Each one is graded when it's over."
					/>
					<FlagLedger flags={flags} pageUrl={PAGE_URL} />
				</section>
			)}

			<section className="mt-16" aria-labelledby="season-tracker">
				<SectionHeading
					id="season-tracker"
					title="All 32 teams: win totals"
					subtitle={
						season
							? `My predicted win total for every team versus how the season is actually going${
									season.throughWeek ? ` (records through week ${season.throughWeek})` : ""
							  }. A pick stays alive until the wins or losses cross it.`
							: "My predicted win total for every team, tracked against the real standings all season."
					}
				/>
				{teamRows.length > 0 ? (
					<SeasonTracker rows={teamRows} isFinal={Boolean(season?.isFinal)} />
				) : (
					<div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
						Season win-total picks are coming soon.
					</div>
				)}
			</section>

			<section id="how-it-works" className="mt-16 scroll-mt-28 max-w-3xl" aria-labelledby="how-it-works-title">
				<h2 id="how-it-works-title" className="font-serif text-2xl font-bold tracking-tight">
					How grading works
				</h2>
				<div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
					<p>
						<strong className="text-foreground">Weekly picks</strong> are graded on the winner: right team is a hit, wrong team is a miss, and a tie is a push that doesn&rsquo;t count either way.
						The score prediction is graded separately as a <em>margin miss</em>, the gap between my predicted margin of victory and the real one, so a close call and a lucky guess don&rsquo;t look the same.
					</p>
					<p>
						<strong className="text-foreground">Win totals</strong> are graded exactly: nail the win total and it&rsquo;s a hit, off by one is close, anything else is a miss. During the season a pick
						shows as &ldquo;too many wins&rdquo; or &ldquo;too many losses&rdquo; once it&rsquo;s mathematically gone, and what a team still needs while it&rsquo;s alive.
					</p>
					<p>
						<strong className="text-foreground">Keys to the game</strong> are the three or so things I say have to happen for the Raiders to win. After the final I mark each one hit or missed, and
						the scoreboard keeps a running hit rate. <strong className="text-foreground">Flags planted</strong> are single bold calls, like a specific player making a specific play, graded the same way.
					</p>
					<p>
						<strong className="text-foreground">Reader picks</strong> are anonymous and lock at kickoff.
					</p>
				</div>
			</section>
		</div>
	)
}
