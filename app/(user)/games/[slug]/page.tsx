import { groq } from "next-sanity"
import { notFound } from "next/navigation"
import Link from "@/components/SiteLink"
import type { Metadata } from "next"
import { MessageCircle } from "lucide-react"

import { isrFetch } from "../../../../lib/sanity.client"
import { heroImageUrl, ogImageUrl, hotspotPosition } from "../../../../lib/urlFor"
import { readingMinutes } from "../../../../lib/home"
import BoxScore from "../../../../components/BoxScore"
import GameLeaders from "../../../../components/GameLeaders"
import GameTimeline from "../../../../components/GameTimeline"
import Embed from "../../../../components/embeds/Embed"
import GamePoll from "../../../../components/GamePoll"
import PlayerOfTheGame from "../../../../components/PlayerOfTheGame"
import ReactionBar from "../../../../components/ReactionBar"
import SocialShare from "../../../../components/SocialShare"
import CommentField from "../../../../components/CommentField"
import RelatedGameReports from "../../../../components/RelatedGameReports"
import GameReportNav from "../../../../components/GameReportNav"
import SubscribeBox from "../../../../components/SubscribeBox"
import MyPicksStrip from "../../../../components/league/MyPicksStrip"
import KeysScorecard from "../../../../components/predictions/KeysScorecard"
import ReportHero from "../../../../components/report/ReportHero"
import ReportNav, { type NavSection } from "../../../../components/report/ReportNav"
import Glance from "../../../../components/report/Glance"
import Recap from "../../../../components/report/Recap"
import RecapRail from "../../../../components/report/RecapRail"
import WinSection from "../../../../components/report/WinSection"
import NumbersSection from "../../../../components/report/NumbersSection"
import DrivesSection from "../../../../components/report/DrivesSection"
import PlayersSection from "../../../../components/report/PlayersSection"
import ReportShare from "../../../../components/report/ReportShare"
import { composeReport, roster } from "../../../../lib/report/build"
import { realScore } from "../../../../lib/report/score"
import { labGameFor } from "../../../../lib/lab/match"
import { getGames } from "../../../../lib/lab/data"
import { getReportStats } from "../../../../lib/live/service"
import { mergeStats } from "../../../../lib/live/gamestats"
import type { PickKey } from "../../../../lib/predictions"

const SITE_URL = "https://www.raidersrundown.com"

type Props = {
	params: Promise<{ slug: string }>
}

// Served through ISR: Next keeps the rendered page and refreshes it in the background every minute, so most
// visits are answered from the CDN instead of waiting on Sanity and ESPN. Slugs are rendered on first request
// rather than at build (the empty generateStaticParams below is what lets Next cache them on demand;
// without it Next 15 renders every request fresh). Everything this page fetches must be cacheable: one no-store
// fetch would make the whole page dynamic again (the ESPN box score read in getReportStats opts into a
// two-minute cache for that reason).
export const revalidate = 60

export async function generateStaticParams() {
	return []
}

export async function generateMetadata(props: Props): Promise<Metadata> {
    const params = await props.params;

    const {
        slug
    } = params;

    const query = groq`
	*[_type=='gameReport' && slug.current == $slug && !(_id in path('drafts.**'))][0]{
		title, description, opponent, gameDate, raidersScore, opponentScore, _updatedAt
	}`
    const game = await isrFetch(query, { slug })
    if (!game) return {}

    // The score as it really was, so a score typed the wrong way round in Studio does not turn a loss into a win in the description.
    const real = realScore(game)
    const won = real.raiders > real.opponent
    const title = `${game.title} | Raiders Rundown`
    const description =
		game.description ||
		`Raiders ${won ? "beat" : "fell to"} the ${game.opponent} ${real.raiders}-${real.opponent}.`
    const url = `${SITE_URL}/games/${slug}`
    // Designed share card (see pages/api/og.tsx). `v` changes when the report
    // is edited so social networks re-fetch instead of serving a stale image.
    // Absolute URL because this Next version (13.2.1) has no `metadataBase`.
    const stamp = game._updatedAt ? new Date(game._updatedAt).getTime() : 0
    const image = `${SITE_URL}/api/og?type=report&kind=final&slug=${encodeURIComponent(slug)}&v=${stamp}`

    return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: {
			type: "article",
			title,
			description,
			url,
			siteName: "Raiders Rundown",
			// A plain string entry first, then the structured object with
			// width/height/alt as a second entry. This Next.js version's
			// metadata API only emits a real `og:image` tag from a plain
			// string -- the object-only form was rendering `og:image:url`
			// (a secondary property with no corresponding primary tag),
			// which strict Open Graph consumers ignore entirely.
			images: [image, { url: image, width: 1200, height: 630, alt: game.title }],
			publishedTime: game.gameDate,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [image],
		},
	}
}

function shortDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Los_Angeles" })
}

async function GameReportPage(props: Props) {
    const params = await props.params;

    const {
        slug
    } = params;

    const query = groq`
	*[_type=='gameReport' && slug.current == $slug && !(_id in path('drafts.**'))][0]{
		...,
		author->,
		categories[]->,
		'comments': *[
			_type=="comment" &&
			post._ref == ^._id &&
			approved == true
		],
	}
	`
    const allGamesQuery = groq`
	*[_type=='gameReport' && !(_id in path('drafts.**'))] | order(gameDate desc) {
		_id, title, slug, opponent, homeAway, gameDate, raidersScore, opponentScore, mainImage
	}
	`

    const [game, allGames]: [GameReport, any[]] = await Promise.all([
		isrFetch(query, { slug }),
		isrFetch(allGamesQuery),
	])

    if (!game) return notFound()

    // The pre-game "keys to the game", if a preview was linked to this
    // recap in Studio (Game Prediction -> keys), graded hit/miss.
    const keysDoc: { keys?: PickKey[] | null } | null = await isrFetch(
		groq`*[_type=="gamePrediction" && gameReport._ref == $id && !(_id in path("drafts.**"))][0]{ keys[]{_key, text, result} }`,
		{ id: game._id }
	)

    // ESPN's box score once the game is final, with anything typed in Studio laid over it (see lib/live/gamestats.ts).
    const auto = game.autoStats === false ? null : await getReportStats(game)
    const stats = mergeStats(game, auto)

    // The Lab's play-by-play for this game, found by opponent and date, if the Lab has it yet. Everything the report works out
    // (the real score, the win probability, the numbers, the drives, the players) is built from it; without it the page is the recap and the box score.
    const labGame = labGameFor({ opponent: game.opponent, gameDate: game.gameDate })
    const view = composeReport(slug, game, labGame, getGames(), auto, roster())
    const stamp = game._updatedAt ? new Date(game._updatedAt).getTime() : 0
    const minutes = game.body ? readingMinutes(game.body) : null

    const currentIndex = allGames.findIndex((g) => g.slug.current === slug)
    // Sorted newest-first: the entry after this one in the array is the
    // chronologically earlier ("previous") game, the one before is later ("next").
    const prevGame = currentIndex >= 0 ? allGames[currentIndex + 1] ?? null : null
    const nextGame = currentIndex > 0 ? allGames[currentIndex - 1] ?? null : null
    const moreGames = allGames
		.filter((g) => g.slug.current !== slug)
		.slice(0, 3)
		.map((g) => {
			const r = realScore(g)
			return { ...g, raidersScore: r.raiders, opponentScore: r.opponent }
		})

    const pageUrl = `${SITE_URL}/games/${slug}`
    const homeTeam = game.homeAway === "home" ? "Las Vegas Raiders" : game.opponent
    const awayTeam = game.homeAway === "home" ? game.opponent : "Las Vegas Raiders"

    const sections: NavSection[] = [
		{ id: "recap", label: "Recap" },
		...(view.lab ? [{ id: "win-probability", label: "Win probability" }] : []),
		...(view.head.length ? [{ id: "numbers", label: "The numbers" }] : []),
		...(view.drives.length ? [{ id: "drives", label: "Drives" }] : []),
		...(view.performers.me.length || view.performers.opp.length ? [{ id: "players", label: "Players" }] : []),
		{ id: "box-score", label: "Box score" },
		{ id: "comments", label: `Comments${game.comments?.length ? ` (${game.comments.length})` : ""}` },
	]

    const jsonLd = [
		{
			"@context": "https://schema.org",
			"@type": "NewsArticle",
			headline: game.title,
			description: game.description,
			image: [ogImageUrl(game.mainImage)],
			datePublished: game._createdAt,
			dateModified: game._updatedAt,
			author: [{ "@type": "Person", name: game.author?.name || "Raiders Rundown" }],
			publisher: {
				"@type": "Organization",
				name: "Raiders Rundown",
				logo: { "@type": "ImageObject", url: "https://www.raidersrundown.com/og-default-v2.png" },
			},
			mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
		},
		{
			"@context": "https://schema.org",
			"@type": "SportsEvent",
			name: `${awayTeam} at ${homeTeam}`,
			startDate: game.gameDate,
			homeTeam: { "@type": "SportsTeam", name: homeTeam },
			awayTeam: { "@type": "SportsTeam", name: awayTeam },
			description: game.description,
		},
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{ "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
				{ "@type": "ListItem", position: 2, name: "Game Reports", item: `${SITE_URL}/games` },
				{ "@type": "ListItem", position: 3, name: game.title, item: pageUrl },
			],
		},
	]

    return (
		<article>
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

			<ReportHero
				view={view}
				imageUrl={heroImageUrl(game.mainImage)}
				imagePosition={hotspotPosition(game.mainImage)}
				author={game.author?.name || "Raiders Rundown"}
				published={shortDate(game.gameDate)}
				minutes={minutes}
				homeAway={game.homeAway}
				actions={
					<>
						<ReportShare slug={slug} kind="final" stamp={stamp} text={`${game.title}`} alt={`${game.title}: the final score card`} label="Share" tone="dark" />
						<SocialShare customurl={pageUrl} />
						<a href="#comments" className="flex shrink-0 items-center gap-1.5 text-sm text-white/70 hover:text-white">
							<MessageCircle className="h-4 w-4" />
							{game.comments?.length ?? 0}
						</a>
						<ReactionBar docId={game._id} initialReactions={game.reactions} />
					</>
				}
			/>

			<ReportNav sections={sections} progressFor="recap" />

			<Glance view={view} />

			<section id="recap" className="container max-w-6xl scroll-mt-32 pb-14 pt-6">
				<div className="grid gap-x-14 lg:grid-cols-[minmax(0,720px)_260px] lg:justify-center">
					<div className="order-last min-w-0 lg:order-none lg:col-start-1 lg:row-start-1">
						{game.body && <Recap body={view.body} headings={view.headings} />}

						{game.videoEmbeds?.map((embed) => (
							<div key={embed._key} className="mt-10">
								<Embed url={embed.url} caption={embed.caption} />
							</div>
						))}

						<div className="mt-10 space-y-10">
							<GameTimeline moments={game.keyMoments} />
							<KeysScorecard keys={keysDoc?.keys} title="The keys, graded" />
						</div>
					</div>
					<div className="lg:col-start-2 lg:row-start-1">
						<RecapRail headings={view.headings.filter((h) => h.level === 2)} minutes={minutes} />
					</div>
				</div>
			</section>

			{view.lab ? (
				<div className="container max-w-6xl space-y-10 pb-14">
					<WinSection view={view} stamp={stamp} />
					<NumbersSection view={view} stamp={stamp} />
					<DrivesSection view={view} stamp={stamp} />
					<PlayersSection view={view} stamp={stamp} />
				</div>
			) : null}

			<section id="box-score" className="container max-w-3xl scroll-mt-32 space-y-10 pb-14">
				<BoxScore
					opponent={game.opponent}
					homeAway={game.homeAway}
					raidersScore={view.score.raiders}
					opponentScore={view.score.opponent}
					teamStats={stats.teamStats}
					quarterScores={stats.quarterScores}
					playerStats={stats.playerStats}
					fromEspn={stats.fromEspn}
				/>
				{!view.lab && <GameLeaders playerStats={stats.playerStats} />}
			</section>

			<div className="container max-w-3xl space-y-10 pb-12">
				{game.pollQuestion && game.pollOptionA && game.pollOptionB && (
					<GamePoll
						docId={game._id}
						question={game.pollQuestion}
						optionA={game.pollOptionA}
						optionB={game.pollOptionB}
						initialVotesA={game.pollVotesA}
						initialVotesB={game.pollVotesB}
					/>
				)}

				{game.potmCandidates && game.potmCandidates.length > 0 && (
					<PlayerOfTheGame docId={game._id} candidates={game.potmCandidates} />
				)}

				<MyPicksStrip bare className="mt-8" />

				<SubscribeBox source="recap" />

				<GameReportNav prevGame={prevGame} nextGame={nextGame} />
			</div>

			<div id="comments" className="scroll-mt-32">
				<CommentField postId={game._id} />

				{game.comments && game.comments.length > 0 && (
					<div className="container max-w-2xl py-10">
						<h3 className="mb-4 font-serif text-2xl font-bold">
							Comments <span className="text-muted-foreground">({game.comments.length})</span>
						</h3>
						<div className="flex flex-col divide-y divide-border">
							{game.comments.map((comment) => (
								<div key={comment._id} className="py-4">
									<p className="text-sm">
										<span className="font-semibold text-primary">@{comment.name}</span>
										<span className="ml-2 text-foreground">{comment.comment}</span>
									</p>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			<RelatedGameReports games={moreGames} />
		</article>
	)
}

export default GameReportPage
