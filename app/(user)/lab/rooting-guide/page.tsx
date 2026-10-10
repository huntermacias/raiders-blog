import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import OpenPing from "@/components/rooting/OpenPing"
import RootingControls from "@/components/rooting/RootingControls"
import RootingGame from "@/components/rooting/RootingGame"
import RootingShare from "@/components/rooting/RootingShare"
import PlayoffMachineLink from "@/components/rooting/TrackedLink"
import { TeamBadge } from "@/components/rooting/parts"
import { getScoreboard } from "@/lib/live/service"
import { labWeeks } from "@/lib/lab/toolsData"
import { matchupPath } from "@/lib/lab/unitsKit"
import { teamByAbbr } from "@/lib/nfl"
import { getGames, getSchedule } from "@/lib/playoffs/data"
import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { PLAYOFFS_PATH, scenarioQuery } from "@/lib/playoffs/share"
import { gameFactsFor } from "@/lib/rooting/facts"
import { GOAL_INFO, pctText, pointsText } from "@/lib/rooting/guide"
import { type BoardGame, settledGames } from "@/lib/rooting/live"
import { ROOTING_PATH, SITE_URL, type RawQuery, canonicalFor, readQuery } from "@/lib/rooting/share"
import { getRooting } from "@/lib/rooting/data"
import { buildView, shareText, topThree } from "@/lib/rooting/view"

// Built per request from the stored guide (data/lab/rooting.json), the schedule file and ESPN's scoreboard, so a game that has just ended
// comes off the list right away. No simulation runs here: the numbers were worked out when the final scores last arrived, by the
// Rooting Guide workflow, and every request is a lookup. The team, goal and week are in the link, so a share card and its preview are
// built from the same address on the server, with no script involved.

type Props = { searchParams?: Promise<RawQuery> }

const TEAM_IDS: ReadonlySet<string> = new Set(NFL_LEAGUE.teams.map((t) => t.id))

async function liveBoard(): Promise<BoardGame[]> {
	try {
		const slow = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ESPN was slow")), 1500))
		const board = await Promise.race([getScoreboard(), slow])
		return board.value.map((g) => ({ state: g.state, home: { abbr: g.home.abbr, score: g.home.score }, away: { abbr: g.away.abbr, score: g.away.score } }))
	} catch {
		// The guide works from its own data when ESPN does not answer.
		return []
	}
}

async function load(props: Props) {
	const sp = (await props.searchParams) ?? {}
	const query = readQuery(sp, TEAM_IDS)
	const data = getRooting()
	const schedule = getSchedule()
	const games = getGames()
	if (!data) return { query, data: null, view: null, games, schedule }
	const settled = settledGames(data, games, await liveBoard())
	const view = buildView({ data, schedule: games, query, settled, season: schedule.season })
	return { query, data, view, games, schedule }
}

const stampOf = (iso: string) => Date.parse(iso) || 0

export async function generateMetadata(props: Props): Promise<Metadata> {
	const sp = (await props.searchParams) ?? {}
	const query = readQuery(sp, TEAM_IDS)
	const data = getRooting()
	const info = teamByAbbr(query.team)
	const season = getSchedule().season
	const canonical = canonicalFor(query.team)
	if (!data) {
		const title = `${info.nick} Sunday Rooting Guide ${season} | Raiders Rundown`
		const description = `Which NFL games to root for if you are a ${info.nick} fan, ranked by how much each one moves your playoff chances.`
		return { title, description, alternates: { canonical }, openGraph: { type: "website", title, description, url: canonical, siteName: "Raiders Rundown" }, twitter: { card: "summary_large_image", title, description } }
	}
	const games = getGames()
	const view = buildView({ data, schedule: games, query, settled: settledGames(data, games, []), season })
	const lead = view.recs[0]
	const goal = GOAL_INFO[query.goal]
	const weekText = view.week ? `Week ${view.week}` : `${season}`
	const title = `${info.nick} Sunday Rooting Guide: who to root for in ${weekText} | Raiders Rundown`
	const base = view.goals.find((g) => g.goal === query.goal)
	const standing = base && base.status === "live" ? `The ${info.nick}' chance to ${goal.phrase} is ${pctText(base.baseline)}. ` : view.headline ? `${view.headline} ` : ""
	const top = lead && lead.rootFor && lead.gain !== null ? `The game that matters most: root for the ${teamByAbbr(lead.rootFor).nick} (${pointsText(lead.gain)} to your odds).` : "See which games still move your odds."
	const description = `${standing}${top}`
	const card = `${SITE_URL}/api/og?type=rooting&team=${query.team}&goal=${query.goal}${view.week ? `&week=${view.week}` : ""}&size=wide&v=${stampOf(data.generatedAt)}`
	return {
		title,
		description,
		alternates: { canonical },
		openGraph: { type: "website", title, description, url: `${SITE_URL}${ROOTING_PATH}?team=${query.team}&goal=${query.goal}${view.week ? `&week=${view.week}` : ""}`, siteName: "Raiders Rundown", images: [card] },
		twitter: { card: "summary_large_image", title, description, images: [card] },
	}
}

const kindText: Record<string, string> = { helped: "Helped", hurt: "Hurt", neutral: "Barely moved" }

export default async function RootingGuidePage(props: Props) {
	const { query, data, view, games, schedule } = await load(props)
	const info = teamByAbbr(query.team)
	const season = schedule.season

	if (!data || !view) {
		return (
			<div className="lab min-h-screen bg-lab-page text-lab-ink">
				<section className="container max-w-3xl py-12">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {season} season
					</p>
					<h1 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-5xl">Sunday Rooting Guide</h1>
					<p className="mt-4 text-lg leading-relaxed text-lab-soft">The guide&rsquo;s numbers are not available right now. They are rebuilt every time a final score comes in, so this should fix itself soon.</p>
					<p className="mt-4">
						<Link href={PLAYOFFS_PATH} className="font-semibold underline underline-offset-4">
							Open the Playoff Machine instead
						</Link>
					</p>
				</section>
			</div>
		)
	}

	const facts = gameFactsFor(games, view.recs, view.team, view.goal)
	const stamp = stampOf(data.generatedAt)
	const goalInfo = GOAL_INFO[view.goal]
	const nextGame = games.find((g) => g.status !== "final" && (g.homeTeam === view.team || g.awayTeam === view.team))
	const nextOpp = nextGame ? (nextGame.homeTeam === view.team ? nextGame.awayTeam : nextGame.homeTeam) : null
	const machineHref = `${PLAYOFFS_PATH}${view.team === "LV" ? "" : `?${scenarioQuery("", view.team)}`}`
	const scopeLabel = view.scope === "all" || view.week === null ? "All remaining games" : `Week ${view.week}`
	const updated = new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })
	const baseGoal = view.goals.find((g) => g.goal === view.goal)
	const jsonLd = {
		"@context": "https://schema.org",
		"@type": "WebPage",
		name: `${info.nick} Sunday Rooting Guide ${season}`,
		url: `${SITE_URL}${ROOTING_PATH}`,
		description: `Which NFL games to root for if you are a ${info.nick} fan, ranked by how much each one changes your playoff, division or No. 1 seed chances.`,
		isPartOf: { "@type": "WebSite", name: "Raiders Rundown", url: SITE_URL },
		publisher: { "@type": "Organization", name: "Raiders Rundown", url: SITE_URL },
	}

	return (
		<div className="lab min-h-screen bg-lab-page text-lab-ink">
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
			<OpenPing team={view.team} goal={view.goal} />

			<section className="border-b border-lab-line">
				<div className="container py-6 sm:py-12">
					<p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lab-muted">
						<Link href="/lab" className="hover:text-lab-ink">
							The Lab
						</Link>{" "}
						&middot; {season} season, results through Week {data.throughWeek}
					</p>
					<h1 className="mt-2 max-w-3xl font-serif text-3xl font-bold leading-[1.05] tracking-tight sm:mt-3 sm:text-6xl">Sunday Rooting Guide</h1>
					<p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-lab-soft sm:mt-4 sm:text-lg">
						Pick your team and what you want for it. The guide plays out the rest of the season thousands of times and ranks the games by how much each result moves
						your odds, so you know who to cheer for on Sunday.
					</p>
				</div>
			</section>

			<section className="container grid gap-6 py-6 sm:py-10" aria-label="Choose a team and a goal">
				<RootingControls team={view.team} goal={view.goal} scope={view.scope} week={view.week} goals={view.goals} counts={{ week: countWeek(view), all: view.remaining }} color={info.color} />

				<div className="flex flex-wrap items-center gap-4 rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5" style={{ borderLeft: `6px solid ${info.color}` }}>
					<TeamBadge abbr={view.team} size={56} />
					<div className="min-w-0 flex-1 basis-40">
						<h2 className="m-0 font-serif text-2xl font-bold leading-tight">{teamByAbbr(view.team).name}</h2>
						<p className="m-0 mt-1 text-sm text-lab-soft">
							<span className="font-mono font-semibold text-lab-ink">{view.standing.record}</span> &middot; {view.standing.text} &middot; {view.standing.division}
						</p>
						{view.since ? (
							<p className="m-0 mt-1 text-xs text-lab-muted">
								{goalInfo.short} odds {sinceText(view.since)} since the end of Week {view.since.week} ({pctText(view.since.before)} to {pctText(view.since.now)}).
							</p>
						) : null}
					</div>
					<div className="w-full border-t border-lab-line pt-3 sm:w-auto sm:border-0 sm:pt-0 sm:text-right">
						<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{goalInfo.label}</p>
						<p className="m-0 font-serif text-4xl font-bold leading-none tabular-nums">{baseGoal?.text}</p>
					</div>
				</div>

				{view.weekNote ? (
					<p role="status" className="m-0 rounded-lg border border-lab-line bg-lab-tint px-4 py-3 text-sm text-lab-soft">
						{view.weekNote}
					</p>
				) : null}
				{view.notes.map((n) => (
					<p key={n} role="status" className="m-0 rounded-lg border border-lab-line bg-lab-tint px-4 py-3 text-sm text-lab-soft">
						{n}
					</p>
				))}
			</section>

			<section className="container pb-8 sm:pb-12" aria-labelledby="rooting-heading">
				<div className="mb-4 flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 id="rooting-heading" className="m-0 font-serif text-2xl font-bold sm:text-3xl">
							{scopeLabel}: who to root for
						</h2>
						<p className="m-0 mt-1 max-w-2xl text-sm text-lab-muted">
							Ranked by how far the {info.nick}&rsquo; chance to {goalInfo.phrase} moves between the best and worst result. Changes are in percentage points.
						</p>
					</div>
					{view.week !== null && view.empty !== "clinched" && view.empty !== "out" ? <RootingShare team={view.team} nick={info.nick} goal={view.goal} goalLabel={goalInfo.label} week={view.week} scope={view.scope} stamp={stamp} text={shareText(view)} /> : null}
				</div>

				{view.recs.length ? (
					<ol className="m-0 grid list-none gap-3 p-0">
						{view.recs.map((rec, i) => (
							<RootingGame key={rec.gameId} rec={rec} rank={i + 1} team={view.team} color={info.color} facts={facts[rec.gameId]} />
						))}
					</ol>
				) : (
					<div className="rounded-2xl border border-lab-line bg-lab-surface p-5 sm:p-6">
						<p className="m-0 font-serif text-xl font-bold">{emptyTitle(view.empty)}</p>
						<p className="m-0 mt-2 max-w-2xl text-sm leading-relaxed text-lab-soft">{view.emptyText}</p>
						<p className="m-0 mt-4 flex flex-wrap gap-4 text-sm font-semibold">
							{view.empty === "no-games-this-week" ? (
								<Link href={`${ROOTING_PATH}?team=${view.team}&goal=${view.goal}${view.week ? `&week=${view.week}` : ""}&scope=all`} className="underline underline-offset-4">
									See every remaining game
								</Link>
							) : null}
							<PlayoffMachineLink href={machineHref} className="underline underline-offset-4">
								Try it in the Playoff Machine
							</PlayoffMachineLink>
						</p>
					</div>
				)}

				{view.quiet > 0 && view.recs.length ? (
					<p className="m-0 mt-3 text-sm text-lab-muted">
						{view.quiet} other {view.quiet === 1 ? "game" : "games"} {view.scope === "all" ? "still to play" : `in Week ${view.week}`} {view.quiet === 1 ? "moves" : "move"} your odds by less than a point, or by less than the guide can tell apart from chance, so {view.quiet === 1 ? "it is" : "they are"} left off.
					</p>
				) : null}

				{view.settled.length ? (
					<div className="mt-6 rounded-2xl border border-dashed border-lab-line-strong p-4 sm:p-5">
						<h3 className="m-0 font-serif text-lg font-bold">Just finished</h3>
						<p className="m-0 mt-1 text-xs text-lab-muted">These games are over, so they are off the list. The numbers above catch up at the next refresh.</p>
						<ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-sm">
							{view.settled.map((s) => (
								<li key={s.gameId} className="flex items-center gap-2">
									<span className="font-mono tabular-nums">
										{s.away} {s.awayScore}, {s.home} {s.homeScore}
									</span>
									<span className="text-xs text-lab-muted">Final</span>
								</li>
							))}
						</ul>
					</div>
				) : null}
			</section>

			{view.completed.length ? (
				<section className="border-t border-lab-line" aria-labelledby="done-heading">
					<div className="container py-8 sm:py-12">
						<h2 id="done-heading" className="m-0 font-serif text-2xl font-bold sm:text-3xl">
							Results that already moved your odds
						</h2>
						<p className="m-0 mt-1 max-w-2xl text-sm text-lab-muted">
							For each recent final, how much better or worse off the {info.nick} are for the way it ended, compared with the other team winning. Same goal as above: {goalInfo.phrase}.
						</p>
						<ul className="m-0 mt-4 grid list-none gap-2 p-0">
							{view.completed.map((c) => (
								<li key={c.gameId} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-lab-line bg-lab-surface px-4 py-3">
									<span className="font-mono text-sm font-semibold tabular-nums">
										{c.away} {c.awayScore}, {c.home} {c.homeScore}
									</span>
									<span className="text-xs text-lab-muted">Week {c.week}</span>
									<span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${c.effect === "helped" ? "bg-lab-ink text-lab-page" : c.effect === "hurt" ? "bg-lab-tint text-lab-ink ring-1 ring-lab-line-strong" : "bg-lab-tint text-lab-muted"}`}>
										{kindText[c.effect]} {c.effect === "neutral" ? "" : pointsText(c.swing)}
									</span>
								</li>
							))}
						</ul>
					</div>
				</section>
			) : null}

			<section className="border-t border-lab-line" aria-label="About the Sunday Rooting Guide">
				<div className="container max-w-3xl py-10 sm:py-14">
					<h2 className="m-0 font-serif text-2xl font-bold">How the Sunday Rooting Guide works</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						For every game still to play, the guide asks one question: how much does the result change your team&rsquo;s chance to {goalInfo.phrase}? It plays the rest of the {season}{" "}
						season {data.exact ? "every possible way" : `${data.sims.toLocaleString("en-US")} times`}, with the same Elo ratings and the same NFL tiebreakers as the{" "}
						<PlayoffMachineLink href={machineHref} className="underline underline-offset-4">
							Playoff Machine
						</PlayoffMachineLink>
						. In each simulated season it records who made the playoffs, who won each division and who took the No. 1 seed. A game&rsquo;s effect is the difference between your team&rsquo;s
						chance in the seasons where one side won and in the seasons where the other did.
					</p>
					<h2 className="mt-8 font-serif text-2xl font-bold">Reading the numbers</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						Every change is in percentage points of your team&rsquo;s chance, not percent growth: going from 40% to 48% is +8 points. Games are ranked by the gap between the best and the worst result, and
						a game is only ranked when that gap is at least a point and clearly bigger than the simulation&rsquo;s own margin of error. The three goals are worked out separately, because a result that
						helps a wild-card chase can hurt a division race. When the standings already prove a goal is won or out of reach, the guide says so instead of showing odds. The same simulated seasons
						are used for every comparison, so the rankings do not shift from one reload to the next.
					</p>
					<h2 className="mt-8 font-serif text-2xl font-bold">What it does not know</h2>
					<p className="mt-3 leading-relaxed text-lab-soft">
						This is a model, not a forecast. The ratings come only from this season&rsquo;s final scores, so early in the year they are rough. They know nothing about injuries, quarterbacks, rest or the
						spread, and ties are not part of the main simulation (a tie is worked out separately for the biggest games, from a smaller sample). Cross-conference games matter only through tiebreakers such as
						strength of victory. The numbers are rebuilt when final scores reach our data, which can take a few hours after a game ends, and a game that has just finished is taken off the list in the meantime.
						Last rebuilt {updated}.
					</p>
					<p className="mt-6 text-sm">
						<PlayoffMachineLink href={machineHref} className="font-semibold underline underline-offset-4">
							Build your own scenario in the Playoff Machine
						</PlayoffMachineLink>
						{nextOpp ? (
							<>
								{" "}
								&middot;{" "}
								<Link href={matchupPath(view.team, nextOpp)} className="font-semibold underline underline-offset-4">
									{info.nick} vs. {teamByAbbr(nextOpp).nick}, position group by position group
								</Link>
							</>
						) : null}{" "}
						&middot;{" "}
						<Link href={`/lab/teams?team=${view.team}`} className="font-semibold underline underline-offset-4">
							How the {info.nick} stack up
						</Link>
					</p>
					<p className="mt-6 text-xs leading-relaxed text-lab-muted">
						Schedule and scores: the{" "}
						<a className="underline underline-offset-4 hover:text-lab-ink" href="https://github.com/nflverse/nfldata" target="_blank" rel="noopener noreferrer">
							nflverse nfldata
						</a>{" "}
						games file, CC BY 4.0. Odds and tiebreakers calculated by Raiders Rundown.
					</p>
				</div>
			</section>
			<MoreFromLab current="/lab/rooting-guide" weeks={labWeeks()} />
		</div>
	)
}

/** "up 3 pts", "down 1 pt" or "unchanged", from the numbers as they are shown, so 71% to 71% never reads as a move. */
function sinceText(since: { before: number; now: number }): string {
	const change = Math.round(since.now * 100) - Math.round(since.before * 100)
	if (change === 0) return "unchanged"
	return `${change > 0 ? "up" : "down"} ${Math.abs(change)} ${Math.abs(change) === 1 ? "pt" : "pts"}`
}

function countWeek(view: ReturnType<typeof buildView>): number {
	// Games that matter in the guide's week: the scope toggle's count, whichever scope is showing.
	return view.scope === "week" ? view.recs.length : view.recs.filter((r) => r.week === view.week).length
}

function emptyTitle(empty: string): string {
	switch (empty) {
		case "clinched":
			return "Already clinched"
		case "out":
			return "Out of reach"
		case "season-over":
			return "The regular season is over"
		case "no-games-this-week":
			return "Nothing this week moves the needle"
		default:
			return "Nothing left moves the needle"
	}
}
