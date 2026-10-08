import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { TeamTag } from "@/components/lab/UnitBits"
import { getUnits } from "@/lib/lab/data"
import { matchupFor, namesFor } from "@/lib/lab/units"
import { type SlateGame, edgeSentence, kickoffText, marketLine, matchupPath, tally, topEdges } from "@/lib/lab/unitsKit"
import { pairTheme } from "@/lib/lab/unitsTheme"

// Built from the JSON in the repo, so it is static: it changes when the Monday data refresh is deployed.

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/matchups`

export function generateMetadata(): Metadata {
	const week = getUnits().slate?.week
	const title = `${week ? `Week ${week} NFL matchups` : "NFL matchups"}, position group by position group | Raiders Rundown`
	const description = "Every game on the slate, broken down by quarterback, line, receivers, run game, pass rush, run defense and coverage: where each team has the edge."
	return {
		title,
		description,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title, description, url: PAGE_URL, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
		twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] },
	}
}

function GameCard({ game }: { game: SlateGame }) {
	const { rows, line } = matchupFor(game.away, game.home)
	const names = namesFor(game.away, game.home)
	const theme = pairTheme(game.away, game.home)
	const home = tally(rows, game.home)
	const away = tally(rows, game.away)
	const best = [...topEdges(rows, game.away, 1).map((r) => ({ team: game.away, r })), ...topEdges(rows, game.home, 1).map((r) => ({ team: game.home, r }))]
	const raiders = game.away === "LV" || game.home === "LV"
	return (
		<li className={`lab lab-opp ${theme.className.includes("lab-opp2") ? "lab-opp2" : ""} rounded-2xl border bg-lab-surface p-4 sm:p-5 ${raiders ? "border-lab-line-strong" : "border-lab-line"}`} style={theme.style}>
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h3 className="m-0 font-serif text-xl font-bold">
					<TeamTag color={theme.color[game.away]} name={names[game.away]} /> <span className="font-sans text-sm font-semibold text-lab-muted">at</span> <TeamTag color={theme.color[game.home]} name={names[game.home]} />
				</h3>
				<p className="m-0 font-mono text-xs tabular-nums text-lab-muted">{kickoffText(game.day, game.time)}</p>
			</div>
			{marketLine(game, names) ? <p className="m-0 mt-1 text-xs text-lab-muted">{marketLine(game, names)}{game.total ? ` · over/under ${game.total}` : ""}</p> : null}
			<div className="mt-4 flex items-center gap-3" role="img" aria-label={`Pairings with the edge: ${names[game.away]} ${away.edges}, ${names[game.home]} ${home.edges}, even ${away.even}.`}>
				<span className="w-6 text-right font-mono text-sm font-bold tabular-nums">{away.edges}</span>
				<div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-lab-tint">
					<div style={{ width: `${(away.edges / Math.max(1, rows.length)) * 100}%`, background: theme.color[game.away] }} />
					<div style={{ width: `${(away.even / Math.max(1, rows.length)) * 100}%` }} />
					<div className="ml-auto" style={{ width: `${(home.edges / Math.max(1, rows.length)) * 100}%`, background: theme.color[game.home] }} />
				</div>
				<span className="w-6 font-mono text-sm font-bold tabular-nums">{home.edges}</span>
			</div>
			<p className="m-0 mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">pairings with the edge, out of {rows.length}</p>
			<p className="m-0 mt-3 text-sm leading-relaxed text-lab-soft">{line}</p>
			{best.length ? (
				<ul className="m-0 mt-3 list-none space-y-1 p-0 text-xs text-lab-soft">
					{best.map(({ team, r }) => (
						<li key={`${team}-${r.pair.id}-${r.attacker}`}>
							<span className="font-semibold text-lab-ink">{names[team]}:</span> {edgeSentence(r, team, names)}
						</li>
					))}
				</ul>
			) : null}
			<p className="m-0 mt-4">
				<Link href={matchupPath(game.away, game.home)} className="text-sm font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
					Full matchup, coaches and injuries &rarr;
				</Link>
			</p>
		</li>
	)
}

export default function MatchupsPage() {
	const data = getUnits()
	const slate = data.slate
	const games = slate ? [...slate.games].sort((a, b) => Number(b.away === "LV" || b.home === "LV") - Number(a.away === "LV" || a.home === "LV")) : []

	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-14">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {data.season} season
					</p>
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">{slate ? `Week ${slate.week} matchups` : "Matchups"}</h1>
					<p className="mt-5 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						Every game on the slate, broken into eight pairings: each offense against the other team&rsquo;s defense, one position group at a time. Open any game for the numbers, the players, the
						coaches and who is missing.
					</p>
					<p className="mt-5">
						<Link href="/lab/teams" className="text-sm font-semibold text-lab-soft underline-offset-4 hover:text-lab-ink hover:underline">
							Or compare any two teams on the board &rarr;
						</Link>
					</p>
				</div>
			</section>

			<section className="container py-10 sm:py-14" aria-label="The slate">
				{games.length ? (
					<ul className="m-0 grid list-none gap-5 p-0 lg:grid-cols-2">
						{games.map((g) => (
							<GameCard key={`${g.away}-${g.home}`} game={g} />
						))}
					</ul>
				) : (
					<div className="max-w-2xl rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
						<h2 className="m-0 font-serif text-2xl font-bold">No games left on the schedule</h2>
						<p className="m-0 mt-3 text-base leading-relaxed text-lab-soft">The regular season is over. This page returns with next season&rsquo;s first games.</p>
					</div>
				)}
			</section>

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; The Lab
					</Link>
					<UnitsCredit>Ranks use the {data.season} regular season through Week {data.week}. Lines are the opening spreads in the games file. </UnitsCredit>
				</div>
			</section>
		</div>
	)
}
