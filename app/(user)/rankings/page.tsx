import { groq } from "next-sanity"
import type { Metadata } from "next"
import Link from "@/components/SiteLink"

import { readClient as client } from "../../../lib/sanity.client"
import { SEASON } from "../../../lib/predictions"
import { gamesThrough, getScoreboard } from "../../../lib/live/service"
import type { LiveGameInfo } from "../../../lib/live/types"
import { recordsAsOf } from "../../../lib/live/standings"
import { type RankingsDoc, buildBoards, noLabel, raidersRow } from "../../../lib/rankings"
import RankingsBoard, { type Records } from "../../../components/rankings/RankingsBoard"

// Rendered on every request, like /predictions: these pages are small, the data
// changes by hand in Studio, and an edit should show up immediately instead of
// waiting on (or getting stuck behind) a cached copy.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/rankings`

const rankingsQuery = groq`
	*[_type == 'powerRankings' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt asc) {
		_id, season, week, headline, _updatedAt,
		"post": post->{ "slug": slug.current, title },
		teams[]{ _key, team, note }
	}
`

type Doc = RankingsDoc & { _updatedAt?: string }

export async function generateMetadata(): Promise<Metadata> {
	const docs: Doc[] = (await client.fetch(rankingsQuery, { season: SEASON })) ?? []
	const latest = docs.slice().sort((a, b) => b.week - a.week)[0]
	const title = latest ? `NFL Power Rankings, Week ${latest.week} | Raiders Rundown` : "NFL Power Rankings | Raiders Rundown"
	const description = latest?.headline
		? `${latest.headline}. All 32 teams ranked, with weekly movement and rank history.`
		: "All 32 NFL teams ranked every week, with movement, rank history and where the Raiders stand."
	const stamp = latest?._updatedAt ? new Date(latest._updatedAt).getTime() : 0
	const image = `${SITE_URL}/api/og?type=rankings&v=${stamp}`

	return {
		title,
		description,
		alternates: { canonical: PAGE_URL },
		openGraph: {
			type: "website",
			title,
			description,
			url: PAGE_URL,
			siteName: "Raiders Rundown",
			images: [image, { url: image, width: 1200, height: 630, alt: title }],
		},
		twitter: { card: "summary_large_image", title, description, images: [image] },
	}
}

export default async function RankingsPage() {
	const docs: Doc[] = (await client.fetch(rankingsQuery, { season: SEASON })) ?? []

	const boards = buildBoards(docs)
	const latest = boards[boards.length - 1]

	// Each week's records are what ESPN's results said when that week's rankings were posted: games from
	// that week and earlier that were over by the time the document was last saved. Live standings would
	// run ahead of the write-ups while a week is still being played, and the hand-typed records in the
	// Season Predictions doc are only as fresh as the last time someone typed them. If ESPN can't be
	// read, no records are shown rather than wrong ones.
	const postedAt = new Map<number, string>()
	for (const d of docs) if (d.teams && d.teams.length > 0 && d._updatedAt) postedAt.set(d.week, d._updatedAt)
	const games = latest ? await gamesThrough(latest.week) : null
	const recordsByWeek: Record<number, Records> = {}
	const recordsAsOfByWeek: Record<number, string> = {}
	if (games) {
		for (const b of boards) {
			const at = postedAt.get(b.week) ?? null
			recordsByWeek[b.week] = recordsAsOf(games, b.week, at ? Date.parse(at) : null)
			if (at) recordsAsOfByWeek[b.week] = at
		}
	}

	const lv = latest ? raidersRow(latest.rows) : null
	const summary =
		latest?.headline ||
		(lv ? `All 32 teams, ranked every week. The Raiders are ${noLabel(lv.rank)} right now.` : "All 32 teams, ranked every week, with movement and rank history.")

	// This week's scoreboard, so scores are on the page the moment it loads. It is the same cached read the Live page uses; if ESPN is slow or
	// down the page does not wait more than a couple of seconds, and the browser asks for the scores itself.
	const serverNow = Date.now()
	const initialGames: LiveGameInfo[] | null = await Promise.race<LiveGameInfo[] | null>([
		getScoreboard().then((b) => b.value).catch(() => null),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
	])
	// When the latest rankings were last saved: the version that goes on shared links so X fetches a fresh card.
	const stamp = docs.filter((d) => d.week === latest?.week && d._updatedAt).map((d) => Date.parse(d._updatedAt as string))[0] ?? 0

	const jsonLd = latest
		? {
				"@context": "https://schema.org",
				"@type": "ItemList",
				name: `NFL power rankings, week ${latest.week}`,
				itemListOrder: "https://schema.org/ItemListOrderAscending",
				numberOfItems: latest.rows.length,
				itemListElement: latest.rows.map((r) => ({ "@type": "ListItem", position: r.rank, name: r.team })),
		  }
		: null

	return (
		<div className="container py-8 md:py-12">
			{jsonLd && (
				// eslint-disable-next-line react/no-danger
				<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			)}

			{latest ? (
				<RankingsBoard
					boards={boards}
					recordsByWeek={recordsByWeek}
					recordsAsOf={recordsAsOfByWeek}
					season={SEASON}
					summary={summary}
					share={{ url: PAGE_URL, stamp, text: `Week ${latest.week} NFL power rankings${lv ? `: the Raiders are ${noLabel(lv.rank)}.` : "."}` }}
					initialGames={initialGames}
					serverNow={serverNow}
				/>
			) : (
				<div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
					<h1 className="mb-2 font-serif text-3xl font-bold text-foreground">Power Rankings</h1>
					The first power rankings of {SEASON} haven't been posted yet. Check back soon.
				</div>
			)}

			{latest && (
				<Link
					href="/rankings/math"
					className="group mt-10 flex flex-col gap-1 rounded-xl border border-border bg-card px-5 py-4 shadow-sm transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
				>
					<span>
						<span className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">New</span>
						<span className="block font-serif text-xl font-bold">Blogger vs. the Math</span>
						<span className="block text-sm text-muted-foreground">My rankings next to an Elo model built from every result. Where we disagree, and who has been right.</span>
					</span>
					<span className="text-sm font-semibold underline-offset-4 group-hover:underline">See the comparison &rarr;</span>
				</Link>
			)}
		</div>
	)
}
