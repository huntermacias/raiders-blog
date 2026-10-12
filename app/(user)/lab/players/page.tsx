import type { Metadata } from "next"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import PlayerCard from "@/components/lab/players/PlayerCard"
import PlayerSearch from "@/components/lab/players/PlayerSearch"
import { BoardIndex, GroupLeaderCard, HowToRead, RoleCard } from "@/components/lab/players/Sections"
import StatTile from "@/components/lab/players/StatTile"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { getPlayers } from "@/lib/lab/data"
import { getPlayerLogs } from "@/lib/lab/playerData"
import { teamNick } from "@/lib/lab/playerView"
import { SIT_BOARDS, sitBoardHref } from "@/lib/lab/situationsKit"
import { GROUP_META, GROUP_ORDER, HEADLINE, MOVE_MIN, SIDES, overall, players, profileSlugs, risersFallers, roleMovers, searchIndex, standouts } from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"

// Built from the JSON in the repo, so it is static: it changes when a data refresh (every few hours on game days) is deployed.

const SITE_URL = "https://www.raidersrundown.com"
const PAGE_URL = `${SITE_URL}/lab/players`
const TITLE = "NFL player stats in context: every player ranked, tracked and compared | Raiders Rundown"
const DESCRIPTION = "Every qualifying NFL player ranked against the players who do his job, with the advanced numbers the box score hides, how each one has changed through the season, and how sure we are of it."

export function generateMetadata(): Metadata {
	return {
		title: TITLE,
		description: DESCRIPTION,
		alternates: { canonical: PAGE_URL },
		openGraph: { type: "website", title: "NFL player stats in context | Raiders Rundown", description: DESCRIPTION, url: PAGE_URL, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] },
		twitter: { card: "summary_large_image", title: "NFL player stats in context | Raiders Rundown", description: DESCRIPTION, images: [`${SITE_URL}/og-default-v2.png`] },
	}
}

function Section({ id, title, blurb, children, tint = false }: { id: string; title: string; blurb?: React.ReactNode; children: React.ReactNode; tint?: boolean }) {
	return (
		<section className={`border-t border-lab-line ${tint ? "bg-lab-tint" : ""}`} aria-labelledby={id}>
			<div className="container py-10 sm:py-14">
				<h2 id={id} className="m-0 font-serif text-3xl font-bold tracking-tight">
					{title}
				</h2>
				{blurb ? <div className="m-0 mt-2 max-w-3xl text-sm leading-relaxed text-lab-soft sm:text-base">{blurb}</div> : null}
				<div className="mt-6">{children}</div>
			</div>
		</section>
	)
}

export default function PlayersPage() {
	const data = getPlayers()
	const logs = getPlayerLogs().logs
	const has = data.players.length > 0
	const us = data.team
	const mine = risersFallers(data, { team: us, limit: 3 })
	const around = risersFallers(data, { limit: 3, byConfidence: true })
	const { best, worst } = standouts(data, { team: us, top: 3, hi: 80, lo: 20 })
	const raidersRoles = roleMovers(data, { team: us, limit: 4 })
	const leagueRoles = roleMovers(data, { limit: 6 }).filter((r) => r.player.team !== us)
	const roster = players(data).filter((p) => p.team === us)
	const lagging = data.defWeek > 0 && data.defWeek < data.week
	const example = (() => {
		const p = roster.find((x) => x.group === "te" || x.group === "wr") ?? roster[0]
		return p ? { player: p, key: HEADLINE[p.group] } : undefined
	})()
	const logOf = (p: { slug: string; group: (typeof GROUP_ORDER)[number] }) => logs[p.slug]?.[p.group]

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
					<h1 className="mt-3 max-w-4xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Every player, in context</h1>
					<p className="mt-5 max-w-3xl text-base leading-relaxed text-lab-soft sm:text-lg">
						{profileSlugs(data).length} NFL players ranked against the players who do the same job, on the numbers the box score hides: points added per play, accuracy over what the throw allowed, pressures per snap, field goals over what the distance predicts. Every number shows where it ranks, what typical looks like, and how sure we are.
					</p>
					<PlayerSearch className="mt-6 max-w-xl" index={searchIndex(data)} placeholder="Search any player, like Brock Bowers" autoFocus={false} />
					<ul className="m-0 mt-4 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-sm text-lab-soft">
						{SIDES.map((s) => (
							<li key={s.id}>
								<span className="font-semibold text-lab-ink">{s.title}:</span>{" "}
								{s.groups.map((g, i) => (
									<span key={g}>
										{i ? ", " : ""}
										<Link href={`/lab/players/leaders/${g}`} className="underline decoration-lab-line-strong underline-offset-2 hover:text-lab-ink">
											{GROUP_META[g].title.toLowerCase()}
										</Link>
									</span>
								))}
							</li>
						))}
					</ul>
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-5" />
					{lagging ? <p className="m-0 mt-1 text-xs text-lab-muted">Defensive numbers run through Week {data.defWeek}. Pro Football Reference posts them a day or two after each game.</p> : null}
				</div>
			</section>

			{has ? (
				<>
					<section className="container py-10 sm:py-12" aria-label="How to read the cards">
						<HowToRead data={data} example={example} />
					</section>

					<Section
						id="raiders-moving"
						title="Raiders on the move"
						blurb={
							<p className="m-0">
								Who is playing better or worse than he was. We compare each Raider&apos;s last {data.formGames} games with the games before them, against everyone at his position, in grade points ({MOVE_MIN} is a real move and 10 is a full standard deviation). Each card says how sure the change is, because after a few games a stat can swing on a handful of plays.
							</p>
						}
					>
						{mine.risers.length || mine.fallers.length ? (
							<div className="grid gap-8 lg:grid-cols-2">
								<div>
									<h3 className="m-0 mb-3 font-serif text-xl font-bold text-emerald-700 dark:text-emerald-400">
										<span aria-hidden="true">▲ </span>Playing better
									</h3>
									<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
										{mine.risers.map((p) => (
											<PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
										))}
									</div>
									{!mine.risers.length ? <p className="m-0 text-sm text-lab-soft">Nobody has moved up by {MOVE_MIN} grade points or more yet.</p> : null}
								</div>
								<div>
									<h3 className="m-0 mb-3 font-serif text-xl font-bold text-rose-700 dark:text-rose-400">
										<span aria-hidden="true">▼ </span>Slipping
									</h3>
									<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
										{mine.fallers.map((p) => (
											<PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
										))}
									</div>
									{!mine.fallers.length ? <p className="m-0 text-sm text-lab-soft">Nobody has moved down by {MOVE_MIN} grade points or more yet.</p> : null}
								</div>
							</div>
						) : (
							<p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm leading-relaxed text-lab-soft">No Raider has moved by {MOVE_MIN} grade points or more with enough plays behind it. That is normal after a steady stretch.</p>
						)}
						<p className="m-0 mt-6 max-w-3xl text-xs leading-relaxed text-lab-muted">
							Small samples move fast. After {data.week} {data.week === 1 ? "game" : "games"}, treat a move as a reason to watch, not a verdict. &ldquo;A clear change&rdquo; means the move is bigger than what a few plays would produce by chance.
						</p>
					</Section>

					{best.length || worst.length ? (
						<Section id="box-score-hides" title="What the box score hides" blurb={<p className="m-0">The Raiders&apos; most telling numbers, each set against every player at the position, with what the box score would have shown instead.</p>} tint>
							{best.length ? (
								<>
									<h3 className="m-0 mb-3 font-serif text-xl font-bold">Where they stand out</h3>
									<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
										{best.map((x) => (
											<StatTile key={x.player.id + x.stat.k} data={data} player={x.player} stat={x.stat} showBox />
										))}
									</div>
								</>
							) : null}
							{worst.length ? (
								<>
									<h3 className="m-0 mb-3 mt-10 font-serif text-xl font-bold">Where they struggle</h3>
									<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
										{worst.map((x) => (
											<StatTile key={x.player.id + x.stat.k} data={data} player={x.player} stat={x.stat} showBox />
										))}
									</div>
								</>
							) : null}
						</Section>
					) : null}

					{raidersRoles.length || leagueRoles.length ? (
						<Section
							id="playing-time"
							title="Playing time is shifting"
							blurb={<p className="m-0">Snaps often move before the stats do. Each card says what changed in plain words, then shows every game: how much of the team&apos;s offensive or defensive snaps he played, and where he missed a game entirely.</p>}
						>
							{raidersRoles.length ? (
								<div className="grid gap-4 md:grid-cols-2" data-testid="role-movers">
									{raidersRoles.map(({ player, role }) => (
										<RoleCard key={player.id + player.group} data={data} player={player} role={role} log={logOf(player)} />
									))}
								</div>
							) : (
								<p className="m-0 text-sm text-lab-soft">No Raider&apos;s role has changed much lately.</p>
							)}
							{leagueRoles.length ? (
								<>
									<h3 className="m-0 mb-3 mt-10 font-serif text-xl font-bold">Around the league</h3>
									<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
										{leagueRoles.map(({ player, role }) => (
											<RoleCard key={player.id + player.group} data={data} player={player} role={role} log={logOf(player)} />
										))}
									</div>
								</>
							) : null}
						</Section>
					) : null}

					<Section id="roster" title="The Raiders, card by card" blurb={<p className="m-0">Every Raider with enough plays to grade. The grade is the average of his main stats against players at his position: 50 is average and each 10 points is a standard deviation. Open a card for the whole season.</p>} tint>
						<div className="grid gap-10">
							{SIDES.map((side) => {
								const list = roster.filter((p) => side.groups.includes(p.group)).sort((a, b) => (overall(b) ?? 0) - (overall(a) ?? 0))
								if (!list.length) return null
								return (
									<div key={side.id}>
										<h3 className="m-0 mb-3 font-serif text-xl font-bold">{side.title}</h3>
										<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
											{list.map((p) => (
												<PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
											))}
										</div>
									</div>
								)
							})}
						</div>
					</Section>

					{around.risers.length || around.fallers.length ? (
						<Section id="league-movers" title="Around the league: the surest movers" blurb={<p className="m-0">The players whose recent change is most convincing, not just largest. A move counts for more when it shows up across several stats and enough plays.</p>}>
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
								{[...around.risers, ...around.fallers].map((p) => (
									<PlayerCard key={p.id + p.group} data={data} player={p} log={logOf(p)} />
								))}
							</div>
						</Section>
					) : null}

					<Section id="leaders" title="League leaders by position" blurb={<p className="m-0">The top five at each position on the stat that matters most there. Every board has its own page with every qualifying player, a filter by team, and the box score alongside.</p>} tint>
						<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
							{GROUP_ORDER.map((g) => (
								<GroupLeaderCard key={g} data={data} group={g} />
							))}
						</div>
					</Section>

					<Section id="situations" title="Situational football: who delivers when it counts" blurb={<p className="m-0">Success on 3rd down, on 3rd and short, inside the 20. Rank every quarterback, back, receiver and tight end in the spot you pick, and open any player to see every play of every game as a success or a failure.</p>}>
						<ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
							{SIT_BOARDS.map((b) => (
								<li key={b.slug}>
									<Link href={sitBoardHref(b.slug)} className="block rounded-xl border border-lab-line bg-lab-surface p-4 hover:border-lab-ink">
										<span className="block font-serif text-lg font-bold text-lab-ink">{b.title}</span>
										<span className="mt-1 block text-xs leading-relaxed text-lab-muted">By down, by distance and in the red zone, against the league average.</span>
									</Link>
								</li>
							))}
						</ul>
					</Section>

					<Section id="all-boards" title="Every leaderboard" blurb={<p className="m-0">One page per stat. Solid pills are advanced stats, graded against the league. Dashed pills are box-score totals.</p>}>
						<BoardIndex data={data} />
					</Section>

					<section className="border-t border-lab-line" aria-labelledby="how-it-works">
						<div className="container py-10 sm:py-12">
							<details className="max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
								<summary id="how-it-works" className="cursor-pointer text-sm font-semibold text-lab-ink">
									How the grades, ranks and movers work
								</summary>
								<ol className="mb-3 mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-lab-muted">
									<li>Every player is compared only with players who do the same job: {GROUP_ORDER.map((g) => GROUP_META[g].title.toLowerCase()).join(", ")}. A defensive tackle is never graded against an edge rusher.</li>
									<li>To be graded on a stat a player needs enough plays behind it (for example 40 dropbacks for a quarterback or 12 targets for a receiver). Everyone below that is left off, rather than ranked on a few plays.</li>
									<li>Rank is among the players who qualify. The strip under each number shows the 10th-best to the 90th-best player; the shaded part is the middle half. The thin line beside the dot is the range his true level most likely sits in, which is wide when few plays are behind it.</li>
									<li>A grade puts the stat on the scouting scale: 50 is the average of the qualifying players and every 10 points is one standard deviation. For a stat where less is better, like drops, the scale is flipped so a higher grade is always better.</li>
									<li>The same stat is measured three ways: over the whole season, over the team&apos;s last {data.formGames} games, and over the games before that. A mover score is the average change in grade between the last two, with the main stat counting double and a thin recent sample counting for less. How sure the change is comes from comparing it with the noise a handful of plays creates.</li>
									<li>Stats that describe a style, like how deep a quarterback throws or how often a back runs to the edge, are shown against the league but never graded. Stats that are mostly zeros, like drop rate, are shown and graded but not counted in the overall grade.</li>
									<li>Field goals are judged against the make rate of every kick of that distance this season, and EPA means expected points added from the down, distance and field position.</li>
								</ol>
								<p className="m-0 text-xs leading-relaxed text-lab-muted">
									These are not film grades. They come from play-by-play, charting and snap-count data, so they cannot see blocking, route running or assignments, and offensive linemen are not included because the data has no stats for them. Box-score totals use the same games as the rest of the page.
								</p>
							</details>
						</div>
					</section>
				</>
			) : (
				<section className="container py-14">
					<div className="max-w-2xl rounded-2xl border border-lab-line bg-lab-surface p-6 sm:p-8">
						<h2 className="m-0 font-serif text-2xl font-bold">Opens after the first games</h2>
						<p className="m-0 mt-3 text-base leading-relaxed text-lab-soft">Player numbers need a few games to mean anything. Check back after the first week of the season is in the data.</p>
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
			<span className="sr-only">Showing {teamNick(us)} first.</span>
		</div>
	)
}
