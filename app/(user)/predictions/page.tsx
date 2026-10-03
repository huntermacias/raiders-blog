import { groq } from "next-sanity"
import type { Metadata } from "next"

import { client } from "../../../lib/sanity.client"
import { SEASON, type GamePrediction, type SeasonDoc, summarize } from "../../../lib/predictions"
import ScoreboardHero from "../../../components/predictions/ScoreboardHero"
import PicksFeed from "../../../components/predictions/PicksFeed"
import SeasonTracker from "../../../components/predictions/SeasonTracker"

// Same reasoning as the game reports index: render fresh on every request so
// newly graded picks and reader votes show immediately instead of waiting for
// a background revalidation on a low-traffic route.
export const dynamic = "force-dynamic"

const PAGE_URL = "https://www.raidersrundown.com/predictions"
const TITLE = "Prediction Scoreboard | Raiders Rundown"
const DESCRIPTION =
	"Every pick on the record: weekly game predictions graded in public, win-total picks for all 32 teams, and reader picks versus mine."
// Metadata on a page replaces (not merges) the layout's openGraph/twitter, so
// the fallback share image has to be restated here. A plain string first --
// this Next version only emits a real og:image tag from a string entry.
const DEFAULT_IMAGE = "https://i.imgur.com/q0mNqvS.jpeg"

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: PAGE_URL },
	openGraph: {
		type: "website",
		title: TITLE,
		description: DESCRIPTION,
		url: PAGE_URL,
		siteName: "Raiders Rundown",
		images: [DEFAULT_IMAGE],
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: DESCRIPTION,
		images: [DEFAULT_IMAGE],
	},
}

const picksQuery = groq`
	*[_type == 'gamePrediction' && season == $season && !(_id in path('drafts.**'))] | order(kickoff desc) {
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore, writeup,
		actualAwayScore, actualHomeScore,
		readerVotesAway, readerVotesHome,
		"report": gameReport->{ "slug": slug.current, title }
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
	const [picks, season]: [GamePrediction[], SeasonDoc | null] = await Promise.all([
		client.fetch(picksQuery, { season: SEASON }),
		client.fetch(seasonQuery, { season: SEASON }),
	])

	const summary = summarize(picks)
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
					<a href="#season-tracker" className="underline-offset-4 hover:underline">
						All 32 teams
					</a>
					<a href="#how-it-works" className="underline-offset-4 hover:underline">
						How grading works
					</a>
				</nav>
			</div>

			<ScoreboardHero summary={summary} season={SEASON} />

			<section className="mt-16" aria-labelledby="weekly-picks">
				<SectionHeading
					id="weekly-picks"
					title="Weekly picks"
					subtitle="My pick for every game, with a final score and a grade once it's in. Pick the winner yourself before kickoff and see how readers are leaning."
				/>
				<PicksFeed picks={picks} />
			</section>

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
						<strong className="text-foreground">Reader picks</strong> are anonymous and lock at kickoff. There are no accounts, so each browser gets one pick per game; that keeps it casual and fun, but it isn&rsquo;t tamper-proof, so treat the reader split as a pulse check rather than a poll.
					</p>
				</div>
			</section>
		</div>
	)
}
