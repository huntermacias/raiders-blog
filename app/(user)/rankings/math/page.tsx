import { groq } from "next-sanity"
import type { Metadata } from "next"
import Link from "@/components/SiteLink"

import { readClient } from "../../../../lib/sanity.client"
import { SEASON } from "../../../../lib/predictions"
import { TEAMS, teamByAbbr } from "../../../../lib/nfl"
import { HOT, type MathPage as Loaded, type ModelChoice, loadMath } from "../../../../lib/math/server"
import type { MathReport } from "../../../../lib/math/report"
import { toCompareTeam } from "../../../../lib/math/headToHead"
import { type Tally, tallyMap } from "../../../../lib/math/votes"
import { SITE_URL, absolute, cardPath, hourStamp, pagePath } from "../../../../lib/math/share"
import { cn } from "../../../../lib/utils"
import { HotTakes, Scoreboard } from "../../../../components/math/BloggerVsMath"
import Compare from "../../../../components/math/Compare"
import PlayoffOdds from "../../../../components/math/PlayoffOdds"
import ShareMenu from "../../../../components/math/ShareMenu"
import Slate from "../../../../components/math/Slate"
import TeamTable from "../../../../components/math/TeamTable"
import { WinsChart, oddsText } from "../../../../components/math/charts"

// Rendered on every request: the ratings come from ESPN's results and the rankings from Studio, and either
// can change the minute a game ends or a board is published.
export const dynamic = "force-dynamic"

const PAGE_URL = `${SITE_URL}/rankings/math`

const votesQuery = groq`*[_type == "mathVote" && season == $season]{ week, away, home, blogger, math }`

const TITLE = "Blogger vs. the Math: Power Rankings, Elo and Playoff Odds | Raiders Rundown"
const DESCRIPTION =
	"My weekly NFL power rankings next to an Elo model built from last season, every real result and the box scores, plus simulated playoff odds, a forecast for every game and projected wins for all 32 teams."

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

type Props = { searchParams?: { week?: string | string[]; model?: string | string[]; team?: string | string[]; take?: string | string[] } }

const modelOf = (v: string | string[] | undefined): ModelChoice => (first(v) === "season" ? "season" : "full")

function weekOf(v: string | string[] | undefined): number | undefined {
	const n = Number(first(v))
	return Number.isInteger(n) && n >= 1 && n <= 18 ? n : undefined
}

const teamOf = (v: string | string[] | undefined) => {
	const s = (first(v) ?? "").toUpperCase()
	return /^[A-Z]{2,3}$/.test(s) ? s : null
}

// The link preview shows the card for whatever view was shared: the Raiders by default, or the team asked for.
export function generateMetadata({ searchParams }: Props): Metadata {
	const team = teamOf(searchParams?.team)
	const take = team ? null : teamOf(searchParams?.take)
	const abbr = team ?? take
	const known = abbr && TEAMS.some((t) => t.abbr === abbr) ? teamByAbbr(abbr) : null
	const valid = known != null
	const view = { team: valid ? team : null, take: valid ? take : null, week: weekOf(searchParams?.week), model: modelOf(searchParams?.model) }
	const image = absolute(cardPath(view, hourStamp()))
	const title = valid && known ? `${known.nick}: Blogger vs. the Math | Raiders Rundown` : TITLE
	return {
		title,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title, description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [image] },
		// Next 13.2 writes og:image:url from openGraph.images but not og:image itself; most scrapers want both.
		other: { "og:image": image },
		twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [image] },
	}
}

function Heading({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
	return (
		<div className="mb-5">
			<h2 id={id} className="font-serif text-3xl font-bold tracking-tight">{title}</h2>
			{children && <p className="mt-1 max-w-2xl text-muted-foreground">{children}</p>}
		</div>
	)
}

async function loadTallies(): Promise<Record<string, Tally>> {
	try {
		return tallyMap(await readClient.fetch(votesQuery, { season: SEASON }))
	} catch {
		return {}
	}
}

export default async function MathPage({ searchParams }: Props) {
	const model = modelOf(searchParams?.model)
	const [page, tallies] = await Promise.all([loadMath(weekOf(searchParams?.week), { model }), loadTallies()])
	const { weeks, newest, week, report } = page

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
					My rankings are opinion. The math is an Elo rating for every team, built from last season, every final score and the box scores, then played forward 10,000 times. Here is where we disagree, who has been right, what happens next, and who is likely to make the playoffs.
				</p>
				{newest != null && weeks.length > 1 && <WeekNav weeks={weeks} week={week as number} newest={newest} model={model} />}
				{newest != null && <ModelNav week={week as number} newest={newest} model={model} />}
			</div>

			{newest == null ? (
				<div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
					The first power rankings of {SEASON} haven&rsquo;t been posted yet, so there is nothing to compare. Check back soon.
				</div>
			) : !report ? (
				<p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
					The game results are having trouble loading right now, so the math can&rsquo;t be worked out. Refresh in a minute.
				</p>
			) : (
				<Body report={report} latestWeek={newest} model={model} tallies={tallies} stamp={hourStamp()} />
			)}
		</div>
	)
}

const pill = (on: boolean) =>
	cn(
		"inline-flex h-8 items-center justify-center rounded-full border px-3 text-sm font-semibold transition-colors",
		on ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"
	)

function WeekNav({ weeks, week, newest, model }: { weeks: number[]; week: number; newest: number; model: ModelChoice }) {
	return (
		<nav aria-label="Look at a past week" className="mt-5 flex flex-wrap items-center gap-2">
			<span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Week</span>
			{weeks.map((w) => (
				<Link key={w} href={pagePath({ week: w === newest ? null : w, model })} aria-current={w === week ? "page" : undefined} className={cn(pill(w === week), "min-w-[2.25rem] tabular-nums")}>
					{w}
				</Link>
			))}
		</nav>
	)
}

function ModelNav({ week, newest, model }: { week: number; newest: number; model: ModelChoice }) {
	const w = week === newest ? null : week
	return (
		<nav aria-label="Which model" className="mt-3 flex flex-wrap items-center gap-2">
			<span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Model</span>
			<Link href={pagePath({ week: w })} aria-current={model === "full" ? "page" : undefined} className={pill(model === "full")}>
				Full: last season + box scores
			</Link>
			<Link href={pagePath({ week: w, model: "season" })} aria-current={model === "season" ? "page" : undefined} className={pill(model === "season")}>
				This season&rsquo;s results only
			</Link>
		</nav>
	)
}

function Body({ report, latestWeek, model, tallies, stamp }: { report: MathReport; latestWeek: number; model: ModelChoice; tallies: Record<string, Tally>; stamp: number }) {
	const lv = report.teams.find((t) => t.abbr === "LV")
	const o = lv?.odds
	const plain = o?.plain ?? null
	const viewWeek = report.week
	const compare = report.teams.map(toCompareTeam)
	const nextOpp = lv?.upcoming[0]?.opp
	const pair: [string, string] = ["LV", nextOpp ?? (report.teams.find((t) => t.abbr !== "LV" && t.math === 1)?.abbr ?? "KC")]
	const shareView = { week: viewWeek === latestWeek ? null : viewWeek, model }

	return (
		<>
			{report.week !== latestWeek && (
				<p role="status" className="mb-8 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
					You are looking at how things stood after Week {report.week}, using only what was known then. <Link href={pagePath({ model })} className="font-semibold text-foreground underline-offset-4 hover:underline">Back to the latest</Link>.
				</p>
			)}

			{lv && (
				<section aria-label="The Raiders" className="mb-12 rounded-2xl border border-border bg-[#09090b] p-6 text-zinc-50 shadow-sm md:p-8">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">The Raiders</p>
					<p className="mt-2 font-serif text-3xl font-bold leading-tight md:text-4xl">
						I have them No. {lv.blogger}. The math has them No. {lv.math}.
					</p>
					<p className="mt-2 text-zinc-300">
						{lv.gap === 0 ? "We agree." : lv.gap > 0 ? `That puts me ${lv.gap} spot${lv.gap === 1 ? "" : "s"} higher than the math.` : `The math likes them ${-lv.gap} spot${lv.gap === -1 ? "" : "s"} more than I do.`}
					</p>
					{o && (
						<div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
							<div className="grid grid-cols-2 gap-3">
								<HeroStat label="Make the playoffs" value={oddsText(o.playoffs, report.sims)} foot={plain ? `Results alone: ${oddsText(plain.playoffs, report.sims)}` : undefined} />
								<HeroStat label="Win the AFC West" value={oddsText(o.division, report.sims)} foot={plain ? `Results alone: ${oddsText(plain.division, report.sims)}` : undefined} />
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
					{o && plain && Math.abs(o.playoffs - plain.playoffs) >= 0.08 && (
						<p className="mt-5 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
							Why two numbers? The full model starts from last season&rsquo;s ratings and looks at yards per play, not just the score, so it is slower to believe a hot start. Results alone put the Raiders at {oddsText(plain.playoffs, report.sims)} to make the playoffs; the full model says {oddsText(o.playoffs, report.sims)}. Neither knows about injuries.
						</p>
					)}
					<div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
						<Link href="#team-LV" className="text-sm font-semibold text-zinc-50 underline underline-offset-4">See the Raiders&rsquo; full story</Link>
						<ShareMenu tone="dark" view={shareView} stamp={stamp} text={`I have the Raiders No. ${lv.blogger}. The math has them No. ${lv.math}.`} />
					</div>
				</section>
			)}

			{report.slate.length > 0 && (
				<section className="mb-14" aria-labelledby="slate">
					<Heading id="slate" title="Next up: who wins?">
						The math&rsquo;s forecast for the coming games, next to my pick. Where we pick different teams, you get a vote: who do you trust?
					</Heading>
					<Slate slate={report.slate} season={SEASON} tallies={tallies} />
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

			<section className="mb-14" aria-labelledby="compare">
				<Heading id="compare" title="Compare any two teams">
					Pick two teams for their ratings, odds and what the math says if they played each other.
				</Heading>
				<Compare teams={compare} sims={report.sims} initial={pair} />
			</section>

			<section className="mb-14" aria-labelledby="hot-takes">
				<Heading id="hot-takes" title="Where we disagree most">
					Teams where my rank and the math&rsquo;s rank are {HOT} or more spots apart. Each one has a card you can share.
				</Heading>
				<HotTakes takes={report.takes} week={viewWeek === latestWeek ? undefined : viewWeek} model={model} stamp={stamp} />
			</section>

			<section className="mb-14" aria-labelledby="all-teams">
				<Heading id="all-teams" title="All 32 teams">
					Open any team for its rank history, every result and what each one did to its rating, what the box scores say, and the games still to come.
				</Heading>
				<TeamTable teams={report.teams} hot={HOT} sims={report.sims} week={viewWeek} model={model} stamp={stamp} />
			</section>

			<Method report={report} model={model} />
		</>
	)
}

function Method({ report, model }: { report: MathReport; model: ModelChoice }) {
	const sims = report.hasOdds ? report.sims.toLocaleString("en-US") : "10,000"
	return (
		<section aria-labelledby="method" className="max-w-2xl">
			<h2 id="method" className="font-serif text-2xl font-bold tracking-tight">How the math works</h2>
			<div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
				<p>
					Every team has an Elo rating, and the winner of a game takes points from the loser. Beat a better team, or win by more, and you take more. Home teams get about two points of credit, so a road win counts for a little extra. The margin of victory is dampened, so a blowout of a bad team doesn&rsquo;t run the ratings away.
				</p>
				{model === "full" ? (
					<p>
						<strong className="text-foreground">The full model</strong> adds three things to that. It starts the season from last year&rsquo;s final ratings, pulled most of the way back toward average (only a fifth of last year&rsquo;s edge is kept), so this season counts for far more than last, since rosters turn over and results are partly luck{report.basis.prior ? "" : " (last season’s games couldn’t be loaded right now, so this view starts everyone level)"}. It nudges each rating toward what the box scores say: a team that wins ugly, with fewer yards per play than its score suggests, is rated a little lower than its record, and one that outgains everyone but loses close games a little higher{report.basis.boxes > 0 ? ` (${report.basis.boxes} box scores so far)` : " (box scores aren’t in yet)"}. And it credits rest and travel: a bye week, a short week on Thursday night, the distance the visitor flew.
					</p>
				) : (
					<p>
						<strong className="text-foreground">You&rsquo;re looking at results only.</strong> Every team starts level at 1,500 and only this season&rsquo;s final scores count, plus the rest-and-travel credit. Switch to the full model above to add last season and the box scores.
					</p>
				)}
				<p>
					I tested the additions on last season&rsquo;s games, predicting each from the games before it. A gentle yards-per-play nudge (30% of the gap, and never more than 40 rating points) made the predictions a little better and a heavy one made them worse, so the weight is deliberately small. Rest and travel could not be told apart from noise, so they count at half strength. Turnovers are shown on each team&rsquo;s panel but don&rsquo;t move the rating: they decide games, but rarely repeat from team to team.
				</p>
				<p>
					Playoff odds come from playing every game still on the schedule {sims} times. Each result is drawn around the margin the ratings expect (about 25 rating points per point on the scoreboard, with the usual spread of NFL results), and then the standings are worked out: division winners, then three wild cards, in each conference. Ratings are held fixed while a season plays out.
				</p>
				<p>
					It is a simplification. The math knows nothing about injuries or quarterbacks, and ties in the standings are broken by win percentage and then point differential, not the league&rsquo;s full head-to-head and division-record rules. Early in the year it is mostly last season plus a few games, so expect it to wobble through the first month. It is a check on my opinions, not a replacement for them.
				</p>
				<p>Results and box scores come from ESPN&rsquo;s public scoreboard and update after every final. Votes are anonymous and one per browser; they are a reader poll, not part of the model.</p>
			</div>
		</section>
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
