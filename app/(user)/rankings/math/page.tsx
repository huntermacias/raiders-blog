import { groq } from "next-sanity"
import type { Metadata } from "next"
import Link from "@/components/SiteLink"

import { readClient as client } from "../../../../lib/sanity.client"
import { SEASON } from "../../../../lib/predictions"
import { type RankingsDoc, buildBoards } from "../../../../lib/rankings"
import { getSeasonSchedule } from "../../../../lib/live/service"
import { cached } from "../../../../lib/live/cache"
import { HOT, buildOdds, buildReport, finals, type MathReport } from "../../../../lib/math/report"
import { cn } from "../../../../lib/utils"
import { HotTakes, Scoreboard } from "../../../../components/math/BloggerVsMath"
import PlayoffOdds from "../../../../components/math/PlayoffOdds"
import TeamTable from "../../../../components/math/TeamTable"
import { WinsChart, oddsText } from "../../../../components/math/charts"

// Rendered on every request: the ratings come from ESPN's results and the rankings from Studio, and either
// can change the minute a game ends or a board is published.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/rankings/math`

const rankingsQuery = groq`
	*[_type == 'powerRankings' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt asc) {
		_id, season, week, headline,
		teams[]{ _key, team, note }
	}
`

const TITLE = "Blogger vs. the Math: Power Rankings, Elo and Playoff Odds | Raiders Rundown"
const DESCRIPTION =
	"My weekly NFL power rankings next to an Elo model built from every real result, plus simulated playoff odds and projected wins for all 32 teams, updated after every game."

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

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

type Props = { searchParams?: { week?: string | string[] } }

export default async function MathPage({ searchParams }: Props) {
	const docs: RankingsDoc[] = (await client.fetch(rankingsQuery, { season: SEASON })) ?? []
	const boards = buildBoards(docs)
	const newest = boards[boards.length - 1]
	const weeks = boards.map((b) => b.week)
	const asked = Number(first(searchParams?.week))
	const week = weeks.includes(asked) ? asked : newest?.week

	let report: MathReport | null = null
	if (newest) {
		const sched = await getSeasonSchedule(week)
		if (sched && finals(sched.games, week).length > 0) {
			// Ten thousand simulated seasons are worth keeping for ten minutes, not redoing on every visit.
			const key = `mathodds:${week}:${finals(sched.games, week).length}:${sched.games.length}`
			const odds = sched.complete ? (await cached(key, 600_000, async () => buildOdds(sched.games, week))).value : null
			report = buildReport(boards, sched.games, week, odds)
		}
	}

	return (
		<div className="container py-12">
			<Link href="/rankings" className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
				&larr; Power Rankings
			</Link>

			<div className="mb-8 mt-4">
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					{SEASON} season{week ? ` · Through Week ${week}` : ""}
				</p>
				<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight md:text-5xl">Blogger vs. the Math</h1>
				<p className="mt-3 max-w-2xl text-lg text-muted-foreground">
					My rankings are opinion. The math is just results: an Elo rating for every team, rebuilt from every final score after every game, then played forward 10,000 times. Here is where we disagree, who has been right, and who is likely to make the playoffs.
				</p>
				{weeks.length > 1 && (
					<nav aria-label="Look at a past week" className="mt-5 flex flex-wrap items-center gap-2">
						<span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Week</span>
						{weeks.map((w) => (
							<Link
								key={w}
								href={w === newest.week ? "/rankings/math" : `/rankings/math?week=${w}`}
								aria-current={w === week ? "page" : undefined}
								className={cn(
									"inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors",
									w === week ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"
								)}
							>
								{w}
							</Link>
						))}
					</nav>
				)}
			</div>

			{!newest ? (
				<div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
					The first power rankings of {SEASON} haven&rsquo;t been posted yet, so there is nothing to compare. Check back soon.
				</div>
			) : !report ? (
				<p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
					The game results are having trouble loading right now, so the math can&rsquo;t be worked out. Refresh in a minute.
				</p>
			) : (
				<Body report={report} latestWeek={newest.week} />
			)}
		</div>
	)
}

function Body({ report, latestWeek }: { report: MathReport; latestWeek: number }) {
	const lv = report.teams.find((t) => t.abbr === "LV")
	const o = lv?.odds

	return (
		<>
			{report.week !== latestWeek && (
				<p role="status" className="mb-8 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
					You are looking at how things stood after Week {report.week}, using only what was known then. <Link href="/rankings/math" className="font-semibold text-foreground underline-offset-4 hover:underline">Back to the latest</Link>.
				</p>
			)}

			{lv && (
				<section aria-label="The Raiders" className="mb-12 rounded-2xl border border-border bg-[#09090b] p-6 text-zinc-50 shadow-sm md:p-8">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">The Raiders</p>
					<p className="mt-2 font-serif text-3xl font-bold leading-tight md:text-4xl">
						I have them No. {lv.blogger}. The math has them No. {lv.math}.
					</p>
					<p className="mt-2 text-zinc-300">
						{lv.gap === 0 ? "We agree." : lv.gap > 0 ? `That puts me ${lv.gap} spot${lv.gap === 1 ? "" : "s"} higher than the results alone.` : `The results alone like them ${-lv.gap} spot${lv.gap === -1 ? "" : "s"} more than I do.`}
					</p>
					{o && (
						<div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
							<div className="grid grid-cols-2 gap-3">
								<HeroStat label="Make the playoffs" value={oddsText(o.playoffs, report.sims)} />
								<HeroStat label="Win the AFC West" value={oddsText(o.division, report.sims)} />
								<HeroStat label="Projected wins" value={o.projWins.toFixed(1)} foot={`Now ${lv.record.w}–${lv.record.l}${lv.record.t ? `–${lv.record.t}` : ""}, ${o.remaining} to play`} />
								<HeroStat label="Schedule left" value={o.sosRank ? `No. ${o.sosRank}` : "n/a"} foot={o.sosRank ? "of 32, 1 is hardest" : undefined} />
							</div>
							<div>
								<p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Where they finish: chance of each win total</p>
								<WinsChart dist={o.winsDist} won={lv.record.w} remaining={o.remaining} name="Raiders" />
								<p className="mt-1 text-[11px] text-zinc-500">Bright bars are totals still possible. Numbers are percent.</p>
							</div>
						</div>
					)}
					<p className="mt-5 text-sm">
						<Link href="#team-LV" className="font-semibold text-zinc-50 underline underline-offset-4">See the Raiders&rsquo; full story</Link>
					</p>
				</section>
			)}

			<section className="mb-14" aria-labelledby="who-is-right">
				<Heading id="who-is-right" title="Who has been right?">
					The rankings are only useful if they predict something. So every week&rsquo;s board is graded on the next week&rsquo;s games.
				</Heading>
				<Scoreboard card={report.card} />
			</section>

			{report.hasOdds && (
				<section className="mb-14" aria-labelledby="odds">
					<Heading id="odds" title="Playoff odds">
						The rest of the season, played {report.sims.toLocaleString("en-US")} times from the ratings. Each division is sorted by its chance to win it; the big number is the chance to make the playoffs.
					</Heading>
					<PlayoffOdds teams={report.teams} sims={report.sims} />
				</section>
			)}

			<section className="mb-14" aria-labelledby="hot-takes">
				<Heading id="hot-takes" title="Where we disagree most">
					Teams where my rank and the math&rsquo;s rank are {HOT} or more spots apart.
				</Heading>
				<HotTakes takes={report.takes} />
			</section>

			<section className="mb-14" aria-labelledby="all-teams">
				<Heading id="all-teams" title="All 32 teams">
					Open any team for its rank history, every result and what each one did to its rating, and the games still to come.
				</Heading>
				<TeamTable teams={report.teams} hot={HOT} sims={report.sims} />
			</section>

			<section aria-labelledby="method" className="max-w-2xl">
				<h2 id="method" className="font-serif text-2xl font-bold tracking-tight">How the math works</h2>
				<div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
					<p>
						Every team starts the season at the same rating, 1,500. After each game the winner takes points from the loser. Beat a better team, or win by more, and you take more. Home teams get about two points of credit, so a road win counts for a little extra. The margin of victory is dampened, so a blowout of a bad team doesn&rsquo;t run the ratings away.
					</p>
					<p>
						Playoff odds come from playing every game still on the schedule {report.hasOdds ? report.sims.toLocaleString("en-US") : "10,000"} times. Each game&rsquo;s result is drawn around the margin the ratings expect (about 25 rating points per point on the scoreboard, with the usual spread of NFL results), and then the standings are worked out: division winners, then three wild cards, in each conference. Ratings are held fixed while a season plays out.
					</p>
					<p>
						It is a simplification. The math knows nothing about injuries, quarterbacks or last season, and ties in the standings are broken by win percentage and then point differential, not the league&rsquo;s full head-to-head and division-record rules. Early in the year it is mostly a record with a margin attached, so expect it to wobble through the first month and settle after that. It is a check on my opinions, not a replacement for them.
					</p>
					<p>
						Results come from ESPN&rsquo;s public scoreboard and update after every final. Ratings use {SEASON} regular-season games only.
					</p>
				</div>
			</section>
		</>
	)
}

function HeroStat({ label, value, foot }: { label: string; value: string; foot?: string }) {
	return (
		<div className="rounded-xl border border-white/10 bg-white/5 p-3">
			<p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
			<p className="mt-1 font-serif text-3xl font-bold leading-none tabular-nums">{value}</p>
			{foot && <p className="mt-1.5 text-[11px] text-zinc-400">{foot}</p>}
		</div>
	)
}
