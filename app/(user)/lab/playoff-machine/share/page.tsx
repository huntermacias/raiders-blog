import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import ShareRedirect from "@/components/lab/ShareRedirect"
import { teamByAbbr } from "@/lib/nfl"
import { getGames, getSchedule } from "@/lib/playoffs/data"
import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { DEFAULT_TEAM, PLAYOFFS_PATH, decodeScenario, readTeam, scenarioQuery } from "@/lib/playoffs/share"

// Where a shared Playoff Machine link lands. The link preview (the card for the scenario that was shared) is read from this
// page's HTML, and a reader is sent straight on to the interactive page with the same picks and team. It reads the query, so
// it is built per request; it is kept out of search results because the real page is /lab/playoff-machine.

const SITE_URL = "https://www.raidersrundown.com"
const TEAM_IDS: ReadonlySet<string> = new Set(NFL_LEAGUE.teams.map((t) => t.id))

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)

async function resolve(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const schedule = getSchedule()
	const team = readTeam(one(sp.t), TEAM_IDS) || DEFAULT_TEAM
	const raw = one(sp.s)
	const decoded = raw ? decodeScenario(getGames(), raw) : null
	// A code that does not fit this schedule is dropped, so the link opens the race as it stands.
	const code = decoded && decoded.ok ? raw! : ""
	const picks = decoded && decoded.ok ? Object.keys(decoded.predictions).length : 0
	const query = scenarioQuery(code, team)
	const stamp = Date.parse(schedule.generatedAt) || 0
	return { season: schedule.season, team, nick: teamByAbbr(team).nick, picks, query, stamp }
}

const cardPath = (query: string, stamp: number) => `/api/og?type=playoffs&${query ? `${query}&` : ""}size=wide&v=${stamp}`

export async function generateMetadata(props: Props): Promise<Metadata> {
	const f = await resolve(props)
	const title = f.picks ? `The ${f.nick}' ${f.season} playoff scenario | NFL Playoff Machine | Raiders Rundown` : `The ${f.nick} and the ${f.season} playoff race | NFL Playoff Machine | Raiders Rundown`
	const description = `Pick the winner of every remaining NFL game and see the seeds, the bracket and the playoff odds. ${f.picks ? "This is one reader's scenario." : "This is the race as it stands."}`
	const page = `${SITE_URL}${PLAYOFFS_PATH}`
	const card = `${SITE_URL}${cardPath(f.query, f.stamp)}`
	return {
		title,
		description,
		robots: { index: false, follow: true },
		alternates: { canonical: page },
		openGraph: { type: "website", title, description, url: page, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title, description, images: [card] },
	}
}

export default async function PlayoffMachineShareLanding(props: Props) {
	const f = await resolve(props)
	const href = `${PLAYOFFS_PATH}${f.query ? `?${f.query}` : ""}`
	const image = cardPath(f.query, f.stamp)
	const heading = f.picks ? `The ${f.nick}' ${f.season} playoff scenario` : `The ${f.nick} and the ${f.season} playoff race`

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<ShareRedirect href={href} />
			<section className="container py-10 sm:py-14">
				<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
					<Link href="/lab" className="hover:text-lab-ink">
						The Lab
					</Link>{" "}
					&middot; NFL Playoff Machine
				</p>
				<h1 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight tracking-tight sm:text-5xl">{heading}</h1>
				<Link href={href} className="mt-6 block max-w-3xl overflow-hidden rounded-2xl border border-lab-line bg-lab-tint">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={image} alt={`${f.nick} playoff scenario: seeds, bracket and playoff odds`} width={1200} height={630} className="block h-auto w-full" />
				</Link>
				<p className="mt-6">
					<Link href={href} className="inline-flex min-h-[44px] items-center rounded-lg bg-lab-ink px-5 py-2 text-sm font-bold text-lab-page transition hover:opacity-90">
						Open the playoff machine
					</Link>
				</p>
			</section>
		</div>
	)
}
