import { groq } from "next-sanity"
import Link from "next/link"
import type { Metadata } from "next"
import { ArrowRight } from "lucide-react"

import { readClient as client } from "../../../lib/sanity.client"
import { teamInfo } from "../../../lib/nfl"
import { type GamePrediction, SEASON } from "../../../lib/predictions"
import { type ScheduleGame, joinSchedule, nextGame, recordText, scheduleRecord } from "../../../lib/schedule"
import ScheduleList, { kickoffText } from "../../../components/schedule/ScheduleList"

// Rendered on every request, like /predictions: these pages are small, the data
// changes by hand in Studio, and an edit should show up immediately instead of
// waiting on (or getting stuck behind) a cached copy.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/schedule`
const TITLE = `Raiders ${SEASON} Schedule, Results and Picks | Raiders Rundown`
const DESCRIPTION = `The full ${SEASON} Las Vegas Raiders schedule with kickoff times, final scores, my pick for every game and links to each preview and recap.`
const IMAGE = `${SITE_URL}/og-default-v2.png`

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
		images: [IMAGE],
	},
	twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [IMAGE] },
}

const scheduleQuery = groq`
	*[_type == 'raidersSchedule' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt desc)[0] {
		games[]{ _key, week, bye, opponent, homeAway, kickoff, network }
	}
`

const picksQuery = groq`
	*[_type == 'gamePrediction' && season == $season && !(_id in path('drafts.**'))] {
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore,
		actualAwayScore, actualHomeScore,
		"report": gameReport->{ "slug": slug.current, title },
		"preview": previewPost->{ "slug": slug.current, title }
	}
`

export default async function SchedulePage() {
	const [doc, picks]: [{ games?: ScheduleGame[] } | null, GamePrediction[]] = await Promise.all([
		client.fetch(scheduleQuery, { season: SEASON }),
		client.fetch(picksQuery, { season: SEASON }),
	])

	const rows = joinSchedule(doc?.games ?? [], picks ?? [])
	const rec = scheduleRecord(rows)
	const played = rec.w + rec.l + rec.t
	const next = nextGame(rows, Date.now())
	const nextOpp = next ? teamInfo(next.opponent) : null

	const events = rows
		.filter((r) => !r.bye && r.opponent && r.kickoff)
		.map((r) => {
			const opp = teamInfo(r.opponent)
			const home = r.homeAway !== "away"
			return {
				"@type": "SportsEvent",
				name: `${home ? opp.name : "Las Vegas Raiders"} at ${home ? "Las Vegas Raiders" : opp.name}`,
				startDate: r.kickoff,
				homeTeam: { "@type": "SportsTeam", name: home ? "Las Vegas Raiders" : opp.name },
				awayTeam: { "@type": "SportsTeam", name: home ? opp.name : "Las Vegas Raiders" },
			}
		})

	return (
		<div className="container max-w-4xl py-12">
			{events.length > 0 && (
				// eslint-disable-next-line react/no-danger
				<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": events }) }} />
			)}

			<div className="mb-8">
				<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{SEASON} season</p>
				<h1 className="mt-1 font-serif text-4xl font-bold tracking-tight md:text-5xl">Raiders Schedule</h1>
				<p className="mt-3 max-w-2xl text-lg text-muted-foreground">
					Every game, with the result, my pick, and links to the preview and recap. Times are Pacific.
				</p>
			</div>

			{rows.length === 0 ? (
				<div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
					The {SEASON} schedule hasn't been added yet. Check back soon.
				</div>
			) : (
				<>
					<section aria-label="Season snapshot" className="mb-8 grid gap-px overflow-hidden rounded-2xl border border-[#27272a] bg-[#27272a] text-zinc-50 shadow-lg md:grid-cols-[1fr_2fr]">
						<div className="bg-[#09090b] p-6">
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Record</p>
							<p className="mt-1 font-serif text-5xl font-bold leading-none tabular-nums">{played > 0 ? recordText(rec) : "0–0"}</p>
							<p className="mt-2 text-xs text-zinc-400">{played > 0 ? `${played} game${played === 1 ? "" : "s"} played` : "Season hasn't started"}</p>
						</div>
						<div className="bg-[#09090b] p-6">
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Next up</p>
							{next && nextOpp ? (
								<>
									<p className="mt-1 font-serif text-3xl font-bold leading-tight">
										Week {next.week}: {next.homeAway === "away" ? "at" : "vs"} {nextOpp.name}
									</p>
									<p className="mt-1 text-sm text-zinc-300">{kickoffText(next.kickoff)}{next.network ? ` · ${next.network}` : ""}</p>
									{next.pick && (
										<p className="mt-3 text-sm text-zinc-300">
											My pick: <span className="font-semibold tabular-nums text-zinc-50">Raiders {next.pick.raiders}, {nextOpp.nick} {next.pick.opponent}</span>
											<Link href={`/predictions/pick/${next.pick.id}`} className="ml-3 inline-flex items-center gap-1 font-semibold text-zinc-50 underline-offset-4 hover:underline">
												Vote <ArrowRight aria-hidden className="h-3.5 w-3.5" />
											</Link>
										</p>
									)}
								</>
							) : (
								<p className="mt-1 font-serif text-2xl font-bold">No games left on the schedule</p>
							)}
						</div>
					</section>

					<ScheduleList rows={rows} />

					<p className="mt-6 text-sm text-muted-foreground">
						Want the rest of the league?{" "}
						<Link href="/predictions" className="font-semibold text-foreground underline-offset-4 hover:underline">
							See every pick on the scoreboard
						</Link>{" "}
						or{" "}
						<Link href="/rankings" className="font-semibold text-foreground underline-offset-4 hover:underline">
							this week's power rankings
						</Link>
						.
					</p>
				</>
			)}
		</div>
	)
}
