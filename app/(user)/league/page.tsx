import Link from "next/link"
import type { Metadata } from "next"

import { SEASON } from "../../../lib/predictions"
import { loadLeague } from "../../../lib/league.data"
import {
	MAX_POINTS_PER_GAME,
	POINTS,
	aheadOfBlogger,
	bloggerLine,
	buildStandings,
	gradedWeeks,
	openGames,
	weekSummary,
} from "../../../lib/league"
import { cn } from "../../../lib/utils"
import LeagueEntry from "../../../components/league/LeagueEntry"
import Leaderboard from "../../../components/league/Leaderboard"
import YourRank from "../../../components/league/YourRank"

// Standings depend on the clock (which games are open) and on documents that
// change whenever someone picks, so never serve a cached copy.
export const dynamic = "force-dynamic"

const PAGE_URL = "https://www.raidersrundown.com/league"
const TITLE = "Beat the Blogger: Free Raiders Score-Pick League | Raiders Rundown"
const DESCRIPTION =
	"Pick the exact score of every Raiders game before kickoff, get graded with the same rules I use, and climb the public leaderboard. Free, no email needed."

export function generateMetadata(): Metadata {
	const hour = Math.floor(Date.now() / 3_600_000)
	const image = `https://www.raidersrundown.com/api/og?type=league&v=${hour}`
	return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: {
			type: "website",
			title: TITLE,
			description: DESCRIPTION,
			url: PAGE_URL,
			siteName: "Raiders Rundown",
			images: [image, { url: image, width: 1200, height: 630, alt: "Beat the Blogger, the Raiders Rundown score-pick league" }],
		},
		twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [image] },
	}
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
	return (
		<div>
			<dt className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{label}</dt>
			<dd className="font-serif text-3xl font-bold tabular-nums md:text-4xl">
				{value}
				{sub && <span className="text-lg text-zinc-500"> {sub}</span>}
			</dd>
		</div>
	)
}

export default async function LeaguePage({ searchParams }: { searchParams?: { week?: string } }) {
	const { data, ok } = await loadLeague()

	const open = openGames(data.games, Date.now())
	const weeks = gradedWeeks(data.games)
	const asked = Number(searchParams?.week)
	const week = Number.isInteger(asked) && weeks.includes(asked) ? asked : null

	const seasonRows = buildStandings(data.games, data.players, data.picks)
	const rows = week === null ? seasonRows : buildStandings(data.games, data.players, data.picks, { week })
	const blogger = bloggerLine(data.games, week ?? undefined)
	const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null
	const last = latest === null ? null : weekSummary(data.games, data.players, data.picks, latest)

	const scope = week === null ? "Season" : `Week ${week}`
	const tabs: { label: string; href: string; active: boolean }[] = [
		{ label: "Season", href: "/league#board", active: week === null },
		...weeks.map((w) => ({ label: `Week ${w}`, href: `/league?week=${w}#board`, active: week === w })),
	]

	return (
		<div className="container py-12">
			<section className="relative overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-xl">
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0"
					style={{ background: "radial-gradient(60% 80% at 100% 0%, rgba(161,161,170,0.14) 0%, rgba(9,9,11,0) 60%)" }}
				/>
				<div className="relative grid gap-8 p-6 md:grid-cols-[1.3fr_1fr] md:p-10">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{SEASON} season · free to play</p>
						<h1 className="mt-2 font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">Beat the Blogger</h1>
						<p className="mt-4 max-w-xl text-lg text-zinc-300">
							Pick the exact score of every game before kickoff. You get graded with the same rules I do, so &ldquo;did you beat me&rdquo; is just math.
						</p>
						<dl className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
							<Stat label="Players" value={data.players.length} />
							<Stat label="My points" value={blogger.points} sub={`in ${blogger.games} game${blogger.games === 1 ? "" : "s"}`} />
							{last && last.entrants > 0 && <Stat label={`Beat me, Week ${last.week}`} value={last.beat} sub={`of ${last.entrants}`} />}
						</dl>
						<div className="mt-7">
							<a
								href="#play"
								className="inline-flex items-center rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
							>
								{open.length > 0 ? "Make your picks" : "Join the league"}
							</a>
						</div>
					</div>

					<div>
						<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">How scoring works</p>
						<ul className="grid gap-2 text-sm">
							{[
								["Right winner", `+${POINTS.winner}`],
								["Margin exactly right", `+${POINTS.margin[0].pts}`],
								[`Margin within ${POINTS.margin[1].max}`, `+${POINTS.margin[1].pts}`],
								[`Margin within ${POINTS.margin[2].max}`, `+${POINTS.margin[2].pts}`],
								["Exact final score", `+${POINTS.exactScore}`],
							].map(([label, pts]) => (
								<li key={label} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
									<span className="text-zinc-200">{label}</span>
									<span className="font-serif text-lg font-bold tabular-nums">{pts}</span>
								</li>
							))}
						</ul>
						<p className="mt-2 text-xs text-zinc-500">Up to {MAX_POINTS_PER_GAME} a game. Picks lock at kickoff.</p>
					</div>
				</div>
			</section>

			{!ok && (
				<p role="status" className="mt-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
					The league is having trouble loading right now. Refresh in a minute.
				</p>
			)}

			<section id="play" aria-labelledby="play-heading" className="mt-12 scroll-mt-28">
				<h2 id="play-heading" className="font-serif text-3xl font-bold tracking-tight">
					Your picks
				</h2>
				<p className="mt-1 mb-6 max-w-2xl text-muted-foreground">Enter a score for each open game. You can change a pick any time before kickoff.</p>
				<LeagueEntry games={open} />
			</section>

			<section id="board" aria-labelledby="board-heading" className="mt-14 scroll-mt-28">
				<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
					<div>
						<h2 id="board-heading" className="font-serif text-3xl font-bold tracking-tight">
							{scope} leaderboard
						</h2>
						<p className="mt-1 max-w-2xl text-muted-foreground">
							{week === null
								? `Everyone's total across graded games. ${aheadOfBlogger(seasonRows)} of ${seasonRows.length} are ahead of me on the games they entered.`
								: `Week ${week} only. Joined late? A single week is a fresh start.`}
						</p>
					</div>
					<nav aria-label="Leaderboard period" className="flex flex-wrap gap-2 text-sm font-semibold">
						{tabs.map((t) => (
							<Link
								key={t.label}
								href={t.href}
								aria-current={t.active ? "page" : undefined}
								className={cn(
									"rounded-full border px-3 py-1.5 transition-colors",
									t.active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
								)}
							>
								{t.label}
							</Link>
						))}
					</nav>
				</div>

				<div className="mb-4">
					<YourRank
						rows={seasonRows.map((r) => ({ lower: r.lower, handle: r.handle, rank: r.rank, points: r.points, delta: r.delta }))}
						total={seasonRows.length}
					/>
				</div>
				<Leaderboard rows={rows} blogger={blogger} scope={scope} />
				<p className="mt-3 text-xs text-muted-foreground">
					Ties on points go to more correct winners, then the smaller average miss, and then to whoever joined first. &ldquo;vs me&rdquo; is each game&rsquo;s result against my own score for it.
				</p>
			</section>
		</div>
	)
}
