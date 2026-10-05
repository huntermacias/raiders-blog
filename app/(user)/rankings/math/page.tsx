import { groq } from "next-sanity"
import type { Metadata } from "next"
import Link from "@/components/SiteLink"

import { readClient as client } from "../../../../lib/sanity.client"
import { SEASON } from "../../../../lib/predictions"
import { type RankingsDoc, buildBoards } from "../../../../lib/rankings"
import { getSeasonResults } from "../../../../lib/live/service"
import { runElo } from "../../../../lib/math/elo"
import { compareBoard, gradeBoards, hotTakes } from "../../../../lib/math/compare"
import { RAIDERS } from "../../../../lib/nfl"
import { GapTable, HotTakes, Scoreboard } from "../../../../components/math/BloggerVsMath"

// Rendered on every request: the ratings come from ESPN's results and the rankings from Studio, and either
// can change the minute a game ends or a board is published.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/rankings/math`
const HOT = 6

const rankingsQuery = groq`
	*[_type == 'powerRankings' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt asc) {
		_id, season, week, headline,
		teams[]{ _key, team, note }
	}
`

const TITLE = "Blogger vs. the Math: Power Rankings vs. an Elo Model | Raiders Rundown"
const DESCRIPTION =
	"My weekly NFL power rankings next to an Elo model built from every real result: where we disagree, and which of us has picked more winners."

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: PAGE_URL },
	openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
	twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [`${SITE_URL}/og-default-v2.png`] },
}

function Heading({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
	return (
		<div className="mb-5">
			<h2 id={id} className="font-serif text-3xl font-bold tracking-tight">{title}</h2>
			{children && <p className="mt-1 max-w-2xl text-muted-foreground">{children}</p>}
		</div>
	)
}

export default async function MathPage() {
	const docs: RankingsDoc[] = (await client.fetch(rankingsQuery, { season: SEASON })) ?? []
	const boards = buildBoards(docs)
	const latest = boards[boards.length - 1]
	const games = latest ? await getSeasonResults(latest.week) : null

	return (
		<div className="container py-12">
			<Link href="/rankings" className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
				&larr; Power Rankings
			</Link>

			<div className="mb-10 mt-4">
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					{SEASON} season{latest ? ` · Through Week ${latest.week}` : ""}
				</p>
				<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight md:text-5xl">Blogger vs. the Math</h1>
				<p className="mt-3 max-w-2xl text-lg text-muted-foreground">
					My rankings are opinion. The math is just results: an Elo rating for every team, rebuilt from every final score after every game. Here is where we disagree, and which of us has been right.
				</p>
			</div>

			{!latest ? (
				<div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
					The first power rankings of {SEASON} haven&rsquo;t been posted yet, so there is nothing to compare. Check back soon.
				</div>
			) : !games || games.length === 0 ? (
				<p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
					The game results are having trouble loading right now, so the math can&rsquo;t be worked out. Refresh in a minute.
				</p>
			) : (
				<Body boards={boards} games={games} />
			)}
		</div>
	)
}

function Body({ boards, games }: { boards: ReturnType<typeof buildBoards>; games: NonNullable<Awaited<ReturnType<typeof getSeasonResults>>> }) {
	const latest = boards[boards.length - 1]
	const run = runElo(games)
	const ratings = run.byWeek[latest.week] ?? run.ratings
	const rows = compareBoard(latest, ratings)
	const takes = hotTakes(rows, HOT)
	const card = gradeBoards(boards, games, run.byWeek)
	const lv = rows.find((r) => r.team === RAIDERS)

	return (
		<>
			{lv && (
				<section aria-label="The Raiders" className="mb-12 rounded-2xl border border-border bg-[#09090b] p-6 text-zinc-50 shadow-sm">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">The Raiders</p>
					<p className="mt-2 font-serif text-3xl font-bold leading-tight md:text-4xl">
						I have them No. {lv.blogger}. The math has them No. {lv.math}.
					</p>
					<p className="mt-2 text-zinc-300">
						{lv.gap === 0 ? "We agree." : lv.gap > 0 ? `That puts me ${lv.gap} spot${lv.gap === 1 ? "" : "s"} higher than the results alone.` : `The results alone like them ${-lv.gap} spot${lv.gap === -1 ? "" : "s"} more than I do.`}
					</p>
				</section>
			)}

			<section className="mb-14" aria-labelledby="who-is-right">
				<Heading id="who-is-right" title="Who has been right?">
					The rankings are only useful if they predict something. So every week&rsquo;s board is graded on the next week&rsquo;s games.
				</Heading>
				<Scoreboard card={card} />
			</section>

			<section className="mb-14" aria-labelledby="hot-takes">
				<Heading id="hot-takes" title="Where we disagree most">
					Teams where my rank and the math&rsquo;s rank are {HOT} or more spots apart.
				</Heading>
				<HotTakes takes={takes} />
			</section>

			<section className="mb-14" aria-labelledby="all-teams">
				<Heading id="all-teams" title="All 32 teams" />
				<GapTable rows={rows} hot={HOT} />
			</section>

			<section aria-labelledby="method" className="max-w-2xl">
				<h2 id="method" className="font-serif text-2xl font-bold tracking-tight">How the math works</h2>
				<div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
					<p>
						Every team starts the season at the same rating, 1,500. After each game the winner takes points from the loser. Beat a better team, or win by more, and you take more. Home teams get about two points of credit, so a road win counts for a little extra. The margin of victory is dampened, so a blowout of a bad team doesn&rsquo;t run the ratings away.
					</p>
					<p>
						The math knows nothing about injuries, quarterbacks, the schedule ahead or last season. Early in the year it is mostly a record with a margin attached, so expect it to wobble through the first month and settle after that. It is a check on my opinions, not a replacement for them.
					</p>
					<p>
						Results come from ESPN&rsquo;s public scoreboard and update after every final. Ratings use {SEASON} regular-season games only.
					</p>
				</div>
			</section>
		</>
	)
}
