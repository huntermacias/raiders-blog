import { previewData } from "next/headers";
import { groq } from "next-sanity";
import type { Metadata } from "next";
import { client, readClient } from "../../lib/sanity.client";
import { cardImageUrl, heroImageUrl, hotspotPosition } from "../../lib/urlFor";
import {
	SEASON,
	type FlagPlant,
	type GamePrediction,
	summarize,
	summarizeFlags,
	summarizeKeys,
} from "../../lib/predictions";
import { type RankingsDoc, buildBoards, raidersRow } from "../../lib/rankings";
import { type ScheduleGame, joinSchedule, scheduleRecord } from "../../lib/schedule";
import { hubState, playedGames, readingMinutes } from "../../lib/home";
import { loadLeague } from "../../lib/league.data";
import { buildStandings, gradedWeeks, openGames, weekSummary } from "../../lib/league";
import PreviewSuspense from "../../components/PreviewSuspense"
import PreviewBlogList from "../../components/PreviewBlogList";
import BlogList from "../../components/BlogList";
import GameReportsTeaser from "../../components/GameReportsTeaser";
import SubscribeBox from "../../components/SubscribeBox";
import GameDayHub from "../../components/home/GameDayHub";
import StatStrip, { type HomeRank } from "../../components/home/StatStrip";
import FeaturedStories, { type FeaturedPost } from "../../components/home/FeaturedStories";
import FlagCard from "../../components/home/FlagCard";
import LeagueTeaser from "../../components/league/LeagueTeaser";

const query = groq`
	*[_type=='post' && !(_id in path('drafts.**'))] {
		...,
		author->,
		categories[]->
	} | order(_createdAt desc)
`

const gameReportsQuery = groq`
	*[_type=='gameReport' && !(_id in path('drafts.**'))] {
		_id, title, slug, opponent, gameDate, raidersScore, opponentScore, mainImage
	} | order(gameDate desc) [0...3]
`

// The hub, the stat strip and the flag card are all derived from the same
// documents the schedule, scoreboard and rankings pages use.
const scheduleQuery = groq`
	*[_type == 'raidersSchedule' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt desc)[0] {
		games[]{ _key, week, bye, opponent, homeAway, kickoff, network }
	}
`

const picksQuery = groq`
	*[_type == 'gamePrediction' && season == $season && !(_id in path('drafts.**'))] | order(kickoff desc) {
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore,
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

const rankingsQuery = groq`
	*[_type == 'powerRankings' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt asc) {
		_id, season, week, headline,
		teams[]{ _key, team, note }
	}
`

// Always render fresh from Sanity. Time-based ISR (revalidate) only refreshes
// this page in the background on the *next* real visitor request after the
// window elapses -- on a low-traffic route that can mean it never refreshes.
// force-dynamic renders on every request instead, so newly published content
// (or the games index / homepage list of recent posts) shows immediately.
// The countdown and "what's next" logic also depend on the current time.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"
const HOME_TITLE = "Las Vegas Raiders News, Picks and Power Rankings | Raiders Rundown"
const HOME_DESCRIPTION =
	"Las Vegas Raiders previews, recaps and analysis, with every game pick graded in public, weekly NFL power rankings for all 32 teams, and the full schedule."
const HOME_IMAGE = `${SITE_URL}/og-default-v2.png`

// Set here (page-level), not on the root layout: every other route already
// sets its own `alternates.canonical` via generateMetadata, and adding one
// at the layout level too made Next 13.2.1's metadata merge crash
// ("Cannot clone object of unsupported type") on every route that has to
// reconcile a layout-level `alternates` against its own page-level one.
// Page-level only, matching the working pattern everywhere else, avoids
// that merge entirely. openGraph/twitter are restated because page-level
// metadata replaces (not merges) the layout's.
export const metadata: Metadata = {
	title: HOME_TITLE,
	description: HOME_DESCRIPTION,
	alternates: {
		canonical: `${SITE_URL}/`,
	},
	openGraph: {
		type: "website",
		title: HOME_TITLE,
		description: HOME_DESCRIPTION,
		url: `${SITE_URL}/`,
		siteName: "Raiders Rundown",
		images: [HOME_IMAGE],
	},
	twitter: {
		card: "summary_large_image",
		title: HOME_TITLE,
		description: HOME_DESCRIPTION,
		images: [HOME_IMAGE],
	},
}

// The season widgets are extras: if one query fails the rest of the page,
// and the stories, should still render.
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
	try {
		return await p
	} catch (err) {
		console.log("homepage query failed", err)
		return fallback
	}
}

export default async function page() {

	if(previewData()) {
		return (
			<PreviewSuspense
				fallback={(
					<div role="status">
						<p className="text-center text-lg animate-pulse text-[#51e665]">Loading preview Data...</p>
					</div>
				)}

			>
			<PreviewBlogList query={query} />
			</PreviewSuspense>
		)
	}

	const [posts, games, scheduleDoc, picks, flags, rankingDocs, league]: [
		Post[],
		GameReport[],
		{ games?: ScheduleGame[] } | null,
		GamePrediction[],
		FlagPlant[],
		RankingsDoc[],
		Awaited<ReturnType<typeof loadLeague>>,
	] = await Promise.all([
		client.fetch(query),
		client.fetch(gameReportsQuery),
		safe(readClient.fetch(scheduleQuery, { season: SEASON }), null),
		safe(readClient.fetch(picksQuery, { season: SEASON }), []),
		safe(readClient.fetch(flagsQuery, { season: SEASON }), []),
		safe(readClient.fetch(rankingsQuery, { season: SEASON }), []),
		loadLeague(),
	]);

	// Season data
	const rows = joinSchedule(scheduleDoc?.games ?? [], picks ?? [])
	const record = scheduleRecord(rows)
	const played = playedGames(rows)
	const state = hubState(rows, Date.now())
	const summary = summarize(picks ?? [])
	const keysSummary = summarizeKeys(picks ?? [])
	const flagSummary = summarizeFlags(flags ?? [])
	const latestFlag = (flags ?? [])[0] ?? null

	const boards = buildBoards(rankingDocs ?? [])
	const latestBoard = boards[boards.length - 1]
	const mine = latestBoard ? raidersRow(latestBoard.rows) : null
	const rank: HomeRank | null =
		latestBoard && mine ? { rank: mine.rank, change: mine.change, week: latestBoard.week, history: mine.history } : null

	// League (loadLeague never throws; on a failure the teaser just shows no data)
	const leagueRows = buildStandings(league.data.games, league.data.players, league.data.picks)
	const leagueWeeks = gradedWeeks(league.data.games)
	const leagueLast = leagueWeeks.length > 0 ? weekSummary(league.data.games, league.data.players, league.data.picks, leagueWeeks[leagueWeeks.length - 1]) : null
	const leagueOpen = openGames(league.data.games, Date.now()).length

	// Stories
	const featured: FeaturedPost[] = (posts ?? []).slice(0, 3).map((post, i) => ({
		_id: post._id,
		slug: post.slug.current,
		title: post.title,
		description: post.description,
		createdAt: post._createdAt,
		categories: (post.categories ?? []).map((c) => c.title),
		minutes: readingMinutes(post.body),
		imageUrl: i === 0 ? heroImageUrl(post.mainImage) : cardImageUrl(post.mainImage),
		imagePosition: hotspotPosition(post.mainImage),
	}))

	const today = new Date().toLocaleDateString("en-US", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "America/Los_Angeles",
	})

	const jsonLd = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				"@id": `${SITE_URL}/#website`,
				url: `${SITE_URL}/`,
				name: "Raiders Rundown",
				description: HOME_DESCRIPTION,
				publisher: { "@id": `${SITE_URL}/#org` },
			},
			{
				"@type": "Organization",
				"@id": `${SITE_URL}/#org`,
				name: "Raiders Rundown",
				url: `${SITE_URL}/`,
				logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
			},
		],
	}

	// BlogList is a client component: hand it the read time, not 34 article bodies.
	const listPosts: Post[] = (posts ?? []).map((p) => ({ ...p, body: [], readMinutes: readingMinutes(p.body) }))

  return (
	  <div>
		  {/* eslint-disable-next-line react/no-danger */}
		  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
		  <h1 className="sr-only">Raiders Rundown: Las Vegas Raiders news, graded picks and power rankings</h1>

		  <div className="container pt-5 md:pt-7">
			  <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
				  <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-secondary-foreground">{today}</span>
				  <p className="font-serif text-lg font-bold tracking-tight">All About the Shield</p>
				  <p className="hidden text-sm text-muted-foreground md:block">Independent coverage of the Las Vegas Raiders, with every pick graded in public.</p>
			  </div>
			  <GameDayHub
				  state={state}
				  picks={picks ?? []}
				  played={played}
				  record={record}
				  latestReport={games?.[0] ? { slug: games[0].slug.current, title: games[0].title } : null}
			  />
			  <div className="mt-4">
				  <StatStrip rank={rank} summary={summary} keys={keysSummary} />
			  </div>
		  </div>

		  <FeaturedStories posts={featured} />

		  <LeagueTeaser players={league.data.players.length} top={leagueRows} lastWeek={leagueLast} open={leagueOpen} />

		  <div className="pt-14">
			  <GameReportsTeaser games={games} />
		  </div>

		  {latestFlag && <FlagCard flag={latestFlag} summary={flagSummary} />}

		  <SubscribeBox source="home" variant="band" />

		  <BlogList posts={listPosts} featuredIds={featured.map((f) => f._id)} />
	  </div>

  )
}
