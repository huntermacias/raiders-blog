import type { Metadata } from "next"
import { groq } from "next-sanity"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import { labWeeks } from "@/lib/lab/toolsData"
import Credit from "@/components/lab/Credit"
import ScoutReport from "@/components/lab/ScoutReport"
import { labColorVars } from "@/lib/lab/colors"
import { getScouting } from "@/lib/lab/data"
import { SEASON } from "@/lib/predictions"
import { readClient } from "@/lib/sanity.client"
import { type ScheduleGame, joinSchedule, nextGame } from "@/lib/schedule"
import { TEAMS, teamInfo } from "@/lib/nfl"

// The next opponent comes from the schedule in Studio, so this page is rendered on request like /schedule.
export const dynamic = "force-dynamic"

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/scouting`

export const metadata: Metadata = {
	title: "Raiders scouting reports | Raiders Rundown",
	description: "How the Raiders match up with every opponent, from this season's play-by-play: where they have the edge and what to watch.",
	alternates: { canonical: PAGE_URL },
	openGraph: { type: "website", title: "Raiders scouting reports | Raiders Rundown", description: "How the Raiders match up with every opponent, from this season's play-by-play.", url: PAGE_URL, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
	twitter: { card: "summary_large_image", title: "Raiders scouting reports | Raiders Rundown", description: "How the Raiders match up with every opponent, from this season's play-by-play.", images: [`${SITE_URL}/og-default-v2.png`] },
}

const scheduleQuery = groq`
	*[_type == 'raidersSchedule' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt desc)[0] {
		games[]{ _key, week, bye, opponent, homeAway, kickoff, network }
	}
`

async function upcoming(): Promise<{ abbr: string; week: number } | null> {
	try {
		const doc: { games?: ScheduleGame[] } | null = await readClient.fetch(scheduleQuery, { season: SEASON })
		const next = nextGame(joinSchedule(doc?.games ?? [], []), Date.now())
		if (!next?.opponent) return null
		const abbr = teamInfo(next.opponent).abbr
		return getScouting().teams[abbr] ? { abbr, week: next.week } : null
	} catch {
		return null
	}
}

export default async function ScoutingHub() {
	const data = getScouting()
	const stamp = Date.parse(data.generatedAt) || 0
	const next = await upcoming()
	const nextTeam = next ? teamInfo(TEAMS.find((t) => t.abbr === next.abbr)?.name) : null
	const divisions = Array.from(new Set(TEAMS.map((t) => t.division)))

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink" style={labColorVars(next?.abbr ?? "")}>
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {data.season} season
					</p>
					<h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Scouting reports</h1>
					<p className="mt-4 max-w-2xl text-base leading-relaxed text-lab-soft">
						Where the Raiders have the edge on each opponent, and where they are in trouble, from how every team has actually played this season.
					</p>
				</div>
			</section>

			{next && nextTeam ? (
				<section className="container py-10 sm:py-14" aria-labelledby="next-heading">
					<p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-lab-muted">Next up &middot; Week {next.week}</p>
					<h2 id="next-heading" className="mt-1 mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
						Raiders vs {nextTeam.nick}
					</h2>
					<ScoutReport abbr={next.abbr} stamp={stamp} week={next.week} compact />
				</section>
			) : null}

			<section className="container pb-10 sm:pb-14" aria-labelledby="all-heading">
				<h2 id="all-heading" className="m-0 mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
					Every opponent
				</h2>
				<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
					{divisions.map((d) => (
						<div key={d}>
							<h3 className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">{d}</h3>
							<ul className="m-0 list-none divide-y divide-lab-line rounded-xl border border-lab-line p-0">
								{TEAMS.filter((t) => t.division === d && t.abbr !== "LV" && data.teams[t.abbr]).map((t) => (
									<li key={t.abbr}>
										<Link href={`/lab/scouting/${t.abbr.toLowerCase()}`} className="block px-4 py-2.5 text-sm font-semibold hover:bg-lab-hover">
											{t.nick}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</section>

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; The Lab
					</Link>
					<Credit>Ranks use the {data.season} regular season so far. </Credit>
				</div>
			</section>
			<MoreFromLab current="/lab/scouting" weeks={labWeeks()} />
		</div>
	)
}
