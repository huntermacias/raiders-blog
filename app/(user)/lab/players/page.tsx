import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import PlayerRoster from "@/components/lab/PlayerRoster"
import { MoverColumn, StandoutList } from "@/components/lab/PlayerMovers"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { getPlayers } from "@/lib/lab/data"
import { GROUP_LABEL, GROUP_ORDER, MOVE_MIN, risersFallers, roleMovers, snapText, standouts } from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"

// Built from the JSON in the repo, so it is static: it changes when a data refresh (every few hours on game days) is deployed.

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/players`
const TITLE = "Raiders player movers: who is playing better and worse | Raiders Rundown"
const DESCRIPTION = "Which Raiders are playing better or worse than they were, in the numbers the box score hides: EPA per target, catches over expected, pressures per snap and more, graded against the league."

export function generateMetadata(): Metadata {
	return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title: "Raiders player movers | Raiders Rundown", description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
		twitter: { card: "summary_large_image", title: "Raiders player movers | Raiders Rundown", description: DESCRIPTION, images: [`${SITE_URL}/og-default-v2.png`] },
	}
}

export default function PlayersPage() {
	const data = getPlayers()
	const has = data.players.length > 0
	const { risers, fallers } = risersFallers(data, 4)
	const { best, worst } = standouts(data, { top: 5 })
	const role = roleMovers(data).slice(0, 5)
	const lagging = data.defWeek > 0 && data.defWeek < data.week

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
					<h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Player movers</h1>
					<p className="mt-5 max-w-2xl text-base leading-relaxed text-lab-soft sm:text-lg">
						Who is playing better than he was, and who is slipping? These are the numbers the box score leaves out: points added per target, catches beyond what the throw allowed, pressures per snap, yards a back makes on his own. Each one is graded against every player at his position in the league.
					</p>
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-4" />
					{lagging ? (
						<p className="m-0 mt-1 text-xs text-lab-muted">Defensive numbers run through Week {data.defWeek}. Pro Football Reference posts them a day or two after each game.</p>
					) : null}
				</div>
			</section>

			{has ? (
				<>
					<section className="container py-10 sm:py-14" aria-label="Risers and fallers">
						<div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
							<MoverColumn
								data={data}
								dir="up"
								title="Risers"
								blurb={`Playing better lately. Each player\u2019s last ${data.formGames} games, compared with his games before them, in grade points: ${MOVE_MIN} is a real move and 10 is a full standard deviation.`}
								players={risers}
							/>
							<MoverColumn data={data} dir="down" title="Fallers" blurb="Slipping against his own earlier games and against the league's players at his position." players={fallers} />
						</div>
						<p className="m-0 mt-6 max-w-3xl text-xs leading-relaxed text-lab-muted">
							Small samples move fast. After {data.week} {data.week === 1 ? "game" : "games"} a stat can swing on a handful of plays, so every card says how many plays are behind it, and a recent stretch with only a few plays counts for less. Treat a move as a reason to watch, not a verdict.
						</p>
					</section>

					<section className="border-t border-lab-line" aria-labelledby="under-the-hood">
						<div className="container py-10 sm:py-14">
							<h2 id="under-the-hood" className="m-0 font-serif text-3xl font-bold tracking-tight">What the box score hides</h2>
							<p className="m-0 mt-2 max-w-2xl text-sm leading-relaxed text-lab-soft sm:text-base">
								The Raiders&apos; best and worst numbers this season, each compared with the league&apos;s players at the same position.
							</p>
							<div className="mt-6 grid gap-8 lg:grid-cols-2">
								<div>
									<h3 className="m-0 mb-3 font-serif text-xl font-bold">Best in the league</h3>
									<StandoutList data={data} items={best} tone="good" />
								</div>
								<div>
									<h3 className="m-0 mb-3 font-serif text-xl font-bold">Biggest concerns</h3>
									<StandoutList data={data} items={worst} tone="bad" />
								</div>
							</div>
						</div>
					</section>

					{role.length ? (
						<section className="border-t border-lab-line" aria-labelledby="playing-time">
							<div className="container py-10 sm:py-14">
								<h2 id="playing-time" className="m-0 font-serif text-3xl font-bold tracking-tight">Playing time is shifting</h2>
								<p className="m-0 mt-2 max-w-2xl text-sm leading-relaxed text-lab-soft sm:text-base">
									A jump or drop in snaps often shows up before anything else does. These players&apos; share of the team&apos;s snaps changed by 15 points or more.
								</p>
								<ul className="m-0 mt-5 grid list-none gap-2 p-0 sm:grid-cols-2" data-testid="role-movers">
									{role.map((p) => (
										<li key={p.id} className="flex items-baseline justify-between gap-3 rounded-xl border border-lab-line bg-lab-surface px-4 py-3">
											<span>
												<span className="font-serif text-base font-bold">{p.name}</span> <span className="text-xs text-lab-muted">{p.pos}</span>
											</span>
											<span className="font-mono text-sm tabular-nums text-lab-soft">
												{snapText(p.snaps.earlier)} &rarr; {snapText(p.snaps.form)}
											</span>
										</li>
									))}
								</ul>
							</div>
						</section>
					) : null}

					<section className="border-t border-lab-line" aria-labelledby="whole-roster">
						<div className="container py-10 sm:py-14">
							<h2 id="whole-roster" className="m-0 font-serif text-3xl font-bold tracking-tight">Every player</h2>
							<p className="m-0 mt-2 max-w-2xl text-sm leading-relaxed text-lab-soft sm:text-base">
								Open a player for all of his stats: the whole season, the recent stretch and the games before it, with what each number means.
							</p>
							<div className="mt-6">
								<PlayerRoster data={data} />
							</div>
						</div>
					</section>

					<section className="border-t border-lab-line" aria-labelledby="how-it-works">
						<div className="container py-10 sm:py-12">
							<details className="max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
								<summary id="how-it-works" className="cursor-pointer text-sm font-semibold text-lab-ink">How the grades and movers work</summary>
								<ol className="mb-3 mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-lab-muted">
									<li>Every player in the league is measured on the same few stats for his position: {GROUP_ORDER.map((g) => GROUP_LABEL[g].title.toLowerCase()).join(", ")}.</li>
									<li>A stat is graded only against players at his position with enough plays behind it. 50 is the average of those players, every 10 points is one standard deviation, and a higher grade is always better. For a stat where less is better, like drops, the scale is flipped.</li>
									<li>The same stat is measured three ways: over the whole season, over the team&apos;s last {data.formGames} games, and over the games before that.</li>
									<li>A mover score is the average change in grade from the earlier games to the recent ones. The main stat for the position counts double, and a recent stretch with few plays counts for less, so a quiet two games cannot make a big headline.</li>
									<li>Stats that describe a style, like how deep a quarterback throws, are shown but never graded. Drop rate is shown and graded but left out of the score, because almost everyone has none.</li>
								</ol>
								<p className="m-0 text-xs leading-relaxed text-lab-muted">
									These are not film grades. They come from play-by-play and charting data, so they cannot see blocking, route running or assignments, and offensive linemen are not included because the data has no stats for them.
								</p>
							</details>
						</div>
					</section>
				</>
			) : (
				<section className="container py-14">
					<div className="max-w-2xl rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
						<h2 className="m-0 font-serif text-2xl font-bold">Opens after the first games</h2>
						<p className="m-0 mt-3 text-base leading-relaxed text-lab-soft">Player numbers need a few games to mean anything. Check back after the Raiders&apos; first game of the season is in the data.</p>
					</div>
				</section>
			)}

			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; The Lab
					</Link>
					<UnitsCredit />
				</div>
			</section>
			<MoreFromLab current="/lab/players" weeks={labWeeks()} />
		</div>
	)
}
