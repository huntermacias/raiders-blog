import { groq } from "next-sanity"
import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "@/components/SiteLink"
import { PortableText } from "@portabletext/react"
import type { Metadata } from "next"
import { MessageCircle } from "lucide-react"

import { isrFetch } from "../../../../lib/sanity.client"
import { heroImageUrl, ogImageUrl, hotspotPosition } from "../../../../lib/urlFor"
import { RichTextComponents } from "../../../../components/RichTextComponents"
import { readingMinutes } from "../../../../lib/home"
import BoxScore from "../../../../components/BoxScore"
import GameLeaders from "../../../../components/GameLeaders"
import GameTimeline from "../../../../components/GameTimeline"
import VideoEmbed from "../../../../components/VideoEmbed"
import GamePoll from "../../../../components/GamePoll"
import PlayerOfTheGame from "../../../../components/PlayerOfTheGame"
import ReactionBar from "../../../../components/ReactionBar"
import SocialShare from "../../../../components/SocialShare"
import CommentField from "../../../../components/CommentField"
import RelatedGameReports from "../../../../components/RelatedGameReports"
import GameReportNav from "../../../../components/GameReportNav"
import SubscribeBox from "../../../../components/SubscribeBox"
import KeysScorecard from "../../../../components/predictions/KeysScorecard"
import LabTake from "../../../../components/games/LabTake"
import { labGameFor } from "../../../../lib/lab/match"
import { getReportStats } from "../../../../lib/live/service"
import { mergeStats } from "../../../../lib/live/gamestats"
import { Badge } from "@/components/ui/badge"
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

    const won = game.raidersScore > game.opponentScore
    const title = `${game.title} | Raiders Rundown`
    const description =
		game.description ||
		`Raiders ${won ? "beat" : "fell to"} the ${game.opponent} ${game.raidersScore}-${game.opponentScore}.`
    const url = `${SITE_URL}/games/${slug}`
    // Designed share card (see pages/api/og.tsx). `v` changes when the report
    // is edited so social networks re-fetch instead of serving a stale image.
    // Absolute URL because this Next version (13.2.1) has no `metadataBase`.
    const stamp = game._updatedAt ? new Date(game._updatedAt).getTime() : 0
    const image = `${SITE_URL}/api/og?type=game&slug=${encodeURIComponent(slug)}&v=${stamp}`

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

function formatDate(date: string) {
	return new Date(date).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
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

    const won = game.raidersScore > game.opponentScore
    // The Lab's replay of this game, found by opponent and date, if the Lab has it yet.
    const labGame = labGameFor({ opponent: game.opponent, gameDate: game.gameDate })
    const currentIndex = allGames.findIndex((g) => g.slug.current === slug)
    // Sorted newest-first: the entry after this one in the array is the
    // chronologically earlier ("previous") game, the one before is later ("next").
    const prevGame = currentIndex >= 0 ? allGames[currentIndex + 1] ?? null : null
    const nextGame = currentIndex > 0 ? allGames[currentIndex - 1] ?? null : null
    const moreGames = allGames.filter((g) => g.slug.current !== slug).slice(0, 3)

    const pageUrl = `${SITE_URL}/games/${slug}`
    const homeTeam = game.homeAway === "home" ? "Las Vegas Raiders" : game.opponent
    const awayTeam = game.homeAway === "home" ? game.opponent : "Las Vegas Raiders"

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

			<div className="container max-w-3xl py-12">
				{/* min-w-0 on the nav + flex-1/min-w-0 on the title span is what
				    actually lets `truncate` kick in -- flex items don't shrink
				    below their content size by default, so without this the
				    title just overflowed instead of ellipsizing on narrow
				    screens. The middle crumb also shortens to "Games" below the
				    sm breakpoint so two crumbs of chrome don't crowd out the
				    part that actually matters, the title. */}
				<nav className="mb-4 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
					<Link href="/" className="shrink-0 hover:text-foreground hover:underline">
						Home
					</Link>
					<span className="shrink-0">/</span>
					<Link href="/games" className="shrink-0 hover:text-foreground hover:underline">
						<span className="sm:hidden">Games</span>
						<span className="hidden sm:inline">Game Reports</span>
					</Link>
					<span className="shrink-0">/</span>
					<span className="min-w-0 flex-1 truncate text-foreground/70">{game.title}</span>
				</nav>

				<div className="mb-4 flex flex-wrap gap-2">
					{game.categories?.map((category) => (
						<Badge key={category._id} variant="secondary">
							{category.title}
						</Badge>
					))}
					<Badge variant={won ? "default" : "destructive"}>
						{won ? "WIN" : "LOSS"}
					</Badge>
				</div>

				<h1 className="font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
					{game.title}
				</h1>

				{game.description && <p className="mt-4 text-xl text-muted-foreground">{game.description}</p>}

				{/* Stacked on mobile (date, then a wrapping row of share/comment/
				    reactions) instead of one wide flex-wrap row -- cramming four
				    share icons, a comment count, and three reaction pills into
				    whatever width was left next to the date was overflowing and
				    wrapping mid-icon on phones. From sm: up it goes back to a
				    single row with the date on the left. */}
				<div className="mt-6 flex flex-col gap-3 border-y border-border/70 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<span>
						{formatDate(game.gameDate)}
						{game.body ? <> &middot; {readingMinutes(game.body)} min read</> : null}
					</span>
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						<SocialShare customurl={pageUrl} />
						<a
							href="#comments"
							className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						>
							<MessageCircle className="h-4 w-4" />
							{game.comments?.length ?? 0}
						</a>
						<ReactionBar docId={game._id} initialReactions={game.reactions} />
					</div>
				</div>
			</div>

			<div className="container max-w-5xl">
				<div className="relative h-72 w-full overflow-hidden rounded-lg sm:h-[28rem]">
					<Image className="object-cover" src={heroImageUrl(game.mainImage)} alt={game.title} fill style={{ objectPosition: hotspotPosition(game.mainImage) }} sizes="100vw" priority />
				</div>
			</div>

			<div className="container max-w-3xl space-y-10 pt-12">
				<BoxScore
					opponent={game.opponent}
					homeAway={game.homeAway}
					raidersScore={game.raidersScore}
					opponentScore={game.opponentScore}
					teamStats={stats.teamStats}
					quarterScores={stats.quarterScores}
					playerStats={stats.playerStats}
					fromEspn={stats.fromEspn}
				/>

				<GameLeaders playerStats={stats.playerStats} />
			</div>

			{labGame && (
				<div className="container max-w-5xl py-10">
					<LabTake game={labGame} />
				</div>
			)}

			<div className="container max-w-3xl space-y-10 pb-12">
				{game.videoEmbeds?.map((embed) => (
					<VideoEmbed key={embed._key} url={embed.url} caption={embed.caption} />
				))}

				<GameTimeline moments={game.keyMoments} />

				<KeysScorecard keys={keysDoc?.keys} title="The keys, graded" />

				{game.body && (
					<div className="prose prose-neutral max-w-none dark:prose-invert lg:prose-lg prose-headings:font-serif prose-blockquote:not-italic">
						<PortableText value={game.body} components={RichTextComponents} />
					</div>
				)}

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

				<SubscribeBox source="recap" />

				<GameReportNav prevGame={prevGame} nextGame={nextGame} />
			</div>

			<div id="comments">
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
