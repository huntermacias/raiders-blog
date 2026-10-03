import { groq } from "next-sanity"
import type { Metadata } from "next"

import { readClient as client } from "../../../lib/sanity.client"
import { SEASON } from "../../../lib/predictions"
import { type RankingsDoc, buildBoards, noLabel, raidersRow } from "../../../lib/rankings"
import RankingsBoard, { type Records } from "../../../components/rankings/RankingsBoard"

// Same approach as the rest of the read-only pages: token-free client, so
// this stays a statically cached page that refreshes every minute.
export const revalidate = 60

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/rankings`

const rankingsQuery = groq`
	*[_type == 'powerRankings' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt asc) {
		_id, season, week, headline, _updatedAt,
		"post": post->{ "slug": slug.current, title },
		teams[]{ _key, team, note }
	}
`

const recordsQuery = groq`
	*[_type == 'seasonPredictions' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt desc)[0] {
		teams[]{ team, wins, losses, ties }
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
	const [docs, season]: [Doc[], { teams?: { team: string; wins?: number | null; losses?: number | null; ties?: number | null }[] } | null] =
		await Promise.all([client.fetch(rankingsQuery, { season: SEASON }), client.fetch(recordsQuery, { season: SEASON })])

	const boards = buildBoards(docs ?? [])
	const latest = boards[boards.length - 1]

	const records: Records = {}
	for (const t of season?.teams ?? []) {
		if (t.team) records[t.team] = { w: t.wins ?? 0, l: t.losses ?? 0, t: t.ties ?? 0 }
	}

	const lv = latest ? raidersRow(latest.rows) : null

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
		<div className="container py-12">
			{jsonLd && (
				// eslint-disable-next-line react/no-danger
				<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			)}

			<div className="mb-10">
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					{SEASON} season{latest ? ` · Week ${latest.week}` : ""}
				</p>
				<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight md:text-5xl">Power Rankings</h1>
				<p className="mt-3 max-w-2xl text-lg text-muted-foreground">
					{latest?.headline ||
						(lv
							? `All 32 teams, ranked every week. The Raiders are ${noLabel(lv.rank)} right now.`
							: "All 32 teams, ranked every week, with movement and rank history.")}
				</p>
			</div>

			{latest ? (
				<RankingsBoard boards={boards} records={records} season={SEASON} />
			) : (
				<div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
					The first power rankings of {SEASON} haven't been posted yet. Check back soon.
				</div>
			)}
		</div>
	)
}
