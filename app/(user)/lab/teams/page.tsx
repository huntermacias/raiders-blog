import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import GradeKey from "@/components/lab/GradeKey"
import TeamBoard from "@/components/lab/TeamBoard"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { getUnits } from "@/lib/lab/data"
import { listedTeams } from "@/lib/lab/units"
import { GROUPS, GROUP_ORDER, boardRows, teamCount } from "@/lib/lab/unitsKit"

// Built from the JSON in the repo, so it is static: it changes when the Monday data refresh is deployed.

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/teams`
const TITLE = "How all 32 teams stack up, position group by position group | Raiders Rundown"
const DESCRIPTION = "Quarterback, offensive line, receivers, run game, pass rush, run defense and coverage: where every NFL team ranks right now, and any two teams side by side."

// The link preview is the league board card, refreshed whenever the data is.
const CARD = `${SITE_URL}/api/og?type=board&size=wide&v=${Date.parse(getUnits().generatedAt) || 0}`

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: { canonical: PAGE_URL },
	openGraph: { type: "website", title: TITLE, description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [CARD] },
	twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [CARD] },
}

export default function TeamsPage() {
	const data = getUnits()
	const rows = boardRows(data)
	const teams = listedTeams().map((t) => ({ abbr: t.abbr, nick: t.nick, name: t.name, division: t.division, conference: t.conference, color: t.color }))
	const slate = data.slate

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {data.season} season, through Week {data.week}
					</p>
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">How every team stacks up</h1>
					<p className="mt-5 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						Seven position groups, graded on plain stats like pressure rate, drops and points allowed per throw, and ranked across the league. Sort by any column, then pick two teams to
						see how their units line up against each other.
					</p>
					{slate ? (
						<p className="mt-5">
							<Link href="/lab/matchups" className="inline-flex min-h-[44px] items-center rounded-lg bg-lab-ink px-5 text-sm font-bold text-lab-page transition hover:opacity-90">
								Week {slate.week} matchups &rarr;
							</Link>
						</p>
					) : null}
				</div>
			</section>

			<section className="container py-10 sm:py-14" aria-label="The board">
				<TeamBoard rows={rows} teams={teams} n={teamCount(data)} stamp={Date.parse(data.generatedAt) || 0} />
				<GradeKey n={teamCount(data)} className="mt-6" />
			</section>

			<section className="border-t border-lab-line">
				<div className="container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
					{GROUP_ORDER.map((g) => (
						<div key={g}>
							<h3 className="m-0 font-serif text-lg font-bold">{GROUPS[g].label}</h3>
							<p className="m-0 mt-1 text-xs text-lab-muted">{GROUPS[g].players}</p>
							<ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm text-lab-soft">
								{Object.values(GROUPS[g].stats).map((s) => (
									<li key={s.label}>{s.label}</li>
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
					<UnitsCredit>Each group's grade is the average of its stats' league ranks. Early in the season a handful of plays can move a rank a lot. </UnitsCredit>
				</div>
			</section>
		</div>
	)
}
