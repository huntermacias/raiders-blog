import type { Metadata } from "next"
import { notFound } from "next/navigation"

import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { TeamPill, TierChip } from "@/components/lab/players/Bits"
import GameLog from "@/components/lab/players/GameLog"
import { Headshot, TeamLogo } from "@/components/lab/players/Media"
import PercentileProfile from "@/components/lab/players/PercentileProfile"
import TrackView from "@/components/lab/players/TrackView"
import ProgressExplorer, { type ExplorerStat } from "@/components/lab/players/ProgressExplorer"
import SnapStrip from "@/components/lab/players/SnapStrip"
import StatTile from "@/components/lab/players/StatTile"
import { getPlayers } from "@/lib/lab/data"
import { getPlayerLogs } from "@/lib/lab/playerData"
import { boardHref, cardStyle, compareHref, profileHref, teamName } from "@/lib/lab/playerView"
import {
	BOX,
	GROUP_META,
	HEADLINE,
	type LogPoint,
	type PlayerRow,
	bioFacts,
	boxRank,
	formatBox,
	formatStat,
	gameLog,
	gradeWord,
	isCore,
	opponentFor,
	overall,
	overallRank,
	pctFromRank,
	profileSlugs,
	rankPhrase,
	roleOf,
	rowsFor,
	scoutingRead,
	statInfo,
	tierOf,
	windowWeeks,
	winSentence,
} from "@/lib/lab/playersKit"
import { labWeeks } from "@/lib/lab/toolsData"

const SITE_URL = "https://www.raidersrundown.com"

// Every player is built once, ahead of time, from the JSON in the repo. A player who is not in the data is a 404.
export const dynamicParams = false

export function generateStaticParams() {
	return profileSlugs(getPlayers()).map((slug) => ({ slug }))
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
	const { slug } = await props.params
	const data = getPlayers()
	const rows = rowsFor(data, slug)
	if (!rows.length) return { title: "Players | Raiders Rundown" }
	const p = rows[0]
	const read = scoutingRead(data, p)[0] ?? ""
	const title = `${p.name} stats: ${teamName(p.team)} ${GROUP_META[p.group].single.toLowerCase()} ranked against the league | Raiders Rundown`
	const description = `${p.name}'s ${data.season} advanced stats ranked against every ${GROUP_META[p.group].single.toLowerCase()} in the NFL, with how he has changed through the season and how sure the numbers are. ${read}`.slice(0, 300)
	const url = `${SITE_URL}/lab/players/${slug}`
	return { title, description, alternates: { canonical: url }, openGraph: { type: "profile", title, description, url, siteName: "Raiders Rundown", images: [`${SITE_URL}/og-default-v2.png`] }, twitter: { card: "summary_large_image", title, description, images: [`${SITE_URL}/og-default-v2.png`] } }
}

function RoleSection({ row, primary }: { row: PlayerRow; primary: boolean }) {
	const data = getPlayers()
	const all = getPlayerLogs()
	const log = all.logs[row.slug]?.[row.group]
	const wins = all.win[row.group] ?? {}
	const meta = GROUP_META[row.group]
	const read = scoutingRead(data, row)
	const graded = row.stats.filter((s) => statInfo(row.group, s.k)?.higher !== null)
	const style = row.stats.filter((s) => statInfo(row.group, s.k)?.higher === null)
	const headFirst = graded.slice().sort((a, b) => (a.k === HEADLINE[row.group] ? -1 : b.k === HEADLINE[row.group] ? 1 : 0))
	const explorerStats: ExplorerStat[] = row.stats
		.filter((s) => log?.g[s.k]?.length)
		.map((s) => {
			const i = statInfo(row.group, s.k)!
			return { k: s.k, label: i.label, graded: i.higher !== null, lower: i.higher === false }
		})
		.sort((a, b) => (a.k === HEADLINE[row.group] ? -1 : b.k === HEADLINE[row.group] ? 1 : Number(b.graded) - Number(a.graded)))
	const trails: Record<string, LogPoint[]> = {}
	const per: Record<string, string> = {}
	const opp: Record<string, string> = {}
	for (const s of row.stats) {
		const pts = log?.g[s.k]
		if (!pts) continue
		trails[s.k] = pts
		per[s.k] = statInfo(row.group, s.k)?.per ?? "plays"
		for (const p of pts) opp[String(p[0])] = opponentFor(data, row.team, p[0], log)
	}
	const role = roleOf(row)
	const side = meta.side
	const weeks = Object.keys(data.opp[row.team] ?? {}).map(Number).sort((a, b) => a - b)
	const finished = windowWeeks(data, row.group)
	const boxKeys = Object.keys(BOX[row.group]).filter((k) => row.box[k] !== undefined)
	const games = gameLog(data, row, log, all.res)
	const logStats = headFirst.filter((s) => isCore(row.group, s.k)).slice(0, 4).map((s) => s.k)
	const sectionId = `${row.group}`
	return (
		<div className="lab-opp" style={cardStyle(row.team)} id={sectionId}>
			{!primary ? (
				<div className="container pt-10">
					<h2 className="m-0 font-serif text-3xl font-bold tracking-tight">As a {meta.single.toLowerCase()}</h2>
					<p className="m-0 mt-1 text-sm text-lab-soft">{meta.blurb}</p>
				</div>
			) : null}

			{read.length ? (
				<section className="container py-8" aria-label="The read">
					<h2 className="m-0 font-serif text-2xl font-bold">The read</h2>
					<div className="mt-3 grid max-w-3xl gap-2 text-base leading-relaxed text-lab-soft">
						{read.map((r, i) => (
							<p key={i} className="m-0">
								{r}
							</p>
						))}
					</div>
					<p className="m-0 mt-3 max-w-3xl text-xs leading-relaxed text-lab-muted">Written from his numbers, not from film. {row.games} {row.games === 1 ? "game" : "games"} are behind the season figures.</p>
				</section>
			) : null}

			<section className="border-t border-lab-line" aria-labelledby={`pct-${row.group}`}>
				<div className="container py-8 sm:py-10">
					<h2 id={`pct-${row.group}`} className="m-0 font-serif text-2xl font-bold">How he stacks up</h2>
					<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Every graded stat at a glance, against all the {meta.peers} in the league.</p>
					<div className="mt-5 max-w-4xl">
						<PercentileProfile data={data} player={row} />
					</div>
				</div>
			</section>

			{explorerStats.length ? (
				<section className="border-t border-lab-line" aria-labelledby={`prog-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<h2 id={`prog-${row.group}`} className="m-0 font-serif text-2xl font-bold">How he has progressed</h2>
						<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Where he has ranked among {meta.peers} after each week, and every game behind it.</p>
						<div className="mt-5">
							<ProgressExplorer group={row.group} name={row.name} stats={explorerStats} trails={trails} weeks={data.weeks} formWeeks={finished} opp={opp} initial={HEADLINE[row.group]} per={per} />
						</div>
					</div>
				</section>
			) : null}

			<section className="border-t border-lab-line bg-lab-tint" aria-labelledby={`grades-${row.group}`}>
				<div className="container py-8 sm:py-10">
					<h2 id={`grades-${row.group}`} className="m-0 font-serif text-2xl font-bold">The numbers, in context</h2>
					<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Each one against every {meta.single.toLowerCase()} with at least {meta.need}. Right on the strip is better.</p>
					<div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{headFirst.map((s) => (
							<StatTile key={s.k} data={data} player={row} stat={s} showBox win={winSentence(wins[s.k], meta.single, statInfo(row.group, s.k)?.label ?? "")} />
						))}
					</div>
				</div>
			</section>

			{style.length ? (
				<section className="border-t border-lab-line" aria-labelledby={`style-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<h2 id={`style-${row.group}`} className="m-0 font-serif text-2xl font-bold">How he plays</h2>
						<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Tendencies: how his game differs from the {meta.peers} around him. These are not better or worse, only different, and often say as much about the offense or defense he plays in as about him.</p>
						<div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							{style.map((s) => (
								<StatTile key={s.k} data={data} player={row} stat={s} showTrend={false} />
							))}
						</div>
					</div>
				</section>
			) : null}

			{side !== "special" ? (
				<section className="border-t border-lab-line bg-lab-tint" aria-labelledby={`time-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<h2 id={`time-${row.group}`} className="m-0 font-serif text-2xl font-bold">Playing time</h2>
						{row.snaps.season ? (
							<p className="m-0 mt-1 max-w-3xl text-sm leading-relaxed text-lab-soft">
								He has played in {row.snaps.season[1]} of his team&apos;s {row.snaps.season[2]} {row.snaps.season[2] === 1 ? "game" : "games"} with snap counts, on the field for about {Math.round(((row.snaps.season[0] * row.snaps.season[2]) / Math.max(1, row.snaps.season[1])) * 100)}% of the team&apos;s {side === "offense" ? "offensive" : "defensive"} plays when he plays.
							</p>
						) : null}
						{role ? (
							<p className="m-0 mt-2 max-w-3xl text-sm leading-relaxed text-lab-ink">
								<span className="font-semibold">{role.headline}.</span> {role.detail}
							</p>
						) : null}
						{log?.s?.length ? (
							<div className="mt-5 max-w-3xl">
								<SnapStrip weeks={weeks} shares={log.s} formWeeks={finished} opp={data.opp[row.team]} />
								<p className="m-0 mt-2 text-xs leading-relaxed text-lab-muted">
									Each column is a game: the share of his team&apos;s {side === "offense" ? "offensive" : "defensive"} snaps he played. 80% means about 8 of every 10 plays. &ldquo;Out&rdquo; means he did not play; a question mark means snap counts are not posted yet. Shaded games are the recent stretch.
								</p>
							</div>
						) : null}
					</div>
				</section>
			) : null}

			{games.length ? (
				<section className="border-t border-lab-line" aria-labelledby={`log-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<h2 id={`log-${row.group}`} className="m-0 font-serif text-2xl font-bold">Game by game</h2>
						<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Every game this season: how it ended for his team, how much he played, his box score, and the advanced numbers from that one game. One game is a small sample, so read the right-hand columns as a snapshot, not his level.</p>
						<div className="mt-5">
							<GameLog name={row.name} group={row.group} rows={games} boxKeys={Object.keys(BOX[row.group])} statKeys={logStats} snaps={side !== "special"} />
						</div>
					</div>
				</section>
			) : null}

			{boxKeys.length ? (
				<section className="border-t border-lab-line bg-lab-tint" aria-labelledby={`box-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<h2 id={`box-${row.group}`} className="m-0 font-serif text-2xl font-bold">The box score</h2>
						<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">The traditional totals, with where each ranks among {meta.peers}. A total rewards volume, which is why the advanced numbers above matter.</p>
						<div className="mt-4 max-w-2xl overflow-hidden rounded-xl border border-lab-line">
							<table className="w-full border-collapse text-left text-sm">
								<caption className="sr-only">{row.name} box score totals</caption>
								<thead>
									<tr className="bg-lab-tint text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
										<th scope="col" className="px-3 py-2">Stat</th>
										<th scope="col" className="px-3 py-2 text-right">Total</th>
										<th scope="col" className="px-3 py-2 text-right">Rank</th>
									</tr>
								</thead>
								<tbody>
									{boxKeys.map((k) => {
										const r = boxRank(data, row, k)
										return (
											<tr key={k} className="border-t border-lab-line">
												<th scope="row" className="px-3 py-2 font-normal text-lab-soft">
													<Link href={boardHref(row.group, BOX[row.group][k].path)} className="hover:underline">
														{BOX[row.group][k].label}
													</Link>
												</th>
												<td className="px-3 py-2 text-right font-mono font-bold tabular-nums">{formatBox(row.group, k, row.box[k])}</td>
												<td className="px-3 py-2 text-right text-xs text-lab-muted">{r ? rankPhrase(r.rank, r.of) : "–"}</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>
				</section>
			) : null}

			{row.like.length ? (
				<section className="border-t border-lab-line bg-lab-tint" aria-labelledby={`like-${row.group}`}>
					<div className="container py-8 sm:py-10">
						<h2 id={`like-${row.group}`} className="m-0 font-serif text-2xl font-bold">Players with a similar profile</h2>
						<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">The {meta.peers} whose grades are closest to his across the same stats. Similar means similar numbers, not the same style of play.</p>
						<ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
							{row.like.map((slug) => {
								const q = data.players.find((x) => x.slug === slug && x.group === row.group)
								if (!q) return null
								const o = overall(q)
								return (
									<li key={slug} className="lab-opp rounded-xl border border-lab-line bg-lab-surface p-3" style={cardStyle(q.team)}>
										<p className="m-0 flex items-center gap-2 text-xs text-lab-muted">
											<TeamPill team={q.team} /> {q.pos}
										</p>
										<p className="m-0 mt-1 font-serif text-base font-bold">
											<Link href={profileHref(slug)} className="hover:underline">
												{q.name}
											</Link>
										</p>
										<p className="m-0 mt-1 text-xs text-lab-soft">
											Overall {o === null ? "–" : Math.round(o)} &middot; {formatStat(q.group, HEADLINE[q.group], q.stats.find((s) => s.k === HEADLINE[q.group])?.season.v)}
										</p>
										<p className="m-0 mt-2 text-xs">
											<Link href={compareHref(row.slug, slug)} className="font-semibold text-lab-ink underline decoration-lab-line-strong underline-offset-2">
												Compare
											</Link>
										</p>
									</li>
								)
							})}
						</ul>
					</div>
				</section>
			) : null}
		</div>
	)
}

export default async function PlayerPage(props: { params: Promise<{ slug: string }> }) {
	const { slug } = await props.params
	const data = getPlayers()
	const rows = rowsFor(data, slug)
	if (!rows.length) notFound()
	const p = rows[0]
	const meta = GROUP_META[p.group]
	const o = overall(p)
	const rank = overallRank(data, p)
	const tier = rank ? tierOf(pctFromRank(rank.rank, rank.of)) : null
	const url = `${SITE_URL}/lab/players/${slug}`
	const bio = getPlayerLogs().bio[slug]
	const facts = bioFacts(bio, new Date())
	const ld = [
		{
			"@context": "https://schema.org",
			"@type": "Person",
			name: p.name,
			...(bio?.born ? { birthDate: bio.born } : {}),
			...(bio?.college ? { alumniOf: { "@type": "CollegeOrUniversity", name: bio.college } } : {}),
			...(bio?.ht ? { height: { "@type": "QuantitativeValue", value: bio.ht, unitCode: "INH" } } : {}),
			...(bio?.wt ? { weight: { "@type": "QuantitativeValue", value: bio.wt, unitCode: "LBR" } } : {}),
			jobTitle: `${meta.single}${p.pos ? ` (${p.pos})` : ""}`,
			memberOf: { "@type": "SportsTeam", name: teamName(p.team), sport: "American football" },
			url,
		},
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement: [
				{ "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
				{ "@type": "ListItem", position: 2, name: "Players", item: `${SITE_URL}/lab/players` },
				{ "@type": "ListItem", position: 3, name: p.name, item: url },
			],
		},
	]
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
			<TrackView event="player_view" props={{ slug, group: p.group, team: p.team }} />
			<section className="lab-opp border-b border-lab-line" style={cardStyle(p.team)}>
				<div className="h-2 w-full" style={{ background: "var(--pc-accent)" }} aria-hidden="true" />
				<div className="container py-8 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo;{" "}
						<Link href={`/lab/players/leaders/${p.group}`} className="hover:text-lab-ink">
							{meta.title}
						</Link>
					</nav>
					<div className="mt-4 flex flex-wrap items-start justify-between gap-6">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-5 sm:flex-nowrap">
							<div className="relative shrink-0">
								<Headshot espn={p.espn} name={p.name} size={128} className="ring-4 ring-lab-surface" />
								<span className="absolute -bottom-1 -right-1 grid h-10 w-10 place-items-center rounded-full border border-lab-line bg-lab-surface">
									<TeamLogo team={p.team} size={28} />
								</span>
							</div>
							<div className="min-w-0">
								<p className="m-0 flex flex-wrap items-center gap-2 text-sm text-lab-soft">
									<TeamPill team={p.team} /> {teamName(p.team)} &middot; {p.pos || meta.single}
									{bio?.no !== undefined ? <span className="font-mono text-lab-muted">&middot; #{bio.no}</span> : null}
									{rows.length > 1 ? <span className="text-lab-muted"> &middot; also {rows.slice(1).map((r) => GROUP_META[r.group].single.toLowerCase()).join(", ")}</span> : null}
								</p>
								<h1 className="m-0 mt-2 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">{p.name}</h1>
								{facts.length ? (
									<dl className="m-0 mt-3 flex flex-wrap gap-x-5 gap-y-2" data-testid="bio">
										{facts.map((f) => (
											<div key={f.label}>
												<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{f.label}</dt>
												<dd className="m-0 text-sm font-semibold text-lab-ink">{f.value}</dd>
											</div>
										))}
									</dl>
								) : null}
								<div className="mt-4 flex flex-wrap gap-3 text-sm">
									<Link href={compareHref(p.slug)} className="rounded-lg border border-lab-ink bg-lab-ink px-3.5 py-2 font-semibold text-lab-page">
										Compare with another player
									</Link>
									<Link href={boardHref(p.group, statInfo(p.group, HEADLINE[p.group])!.path)} className="rounded-lg border border-lab-line-strong px-3.5 py-2 font-semibold text-lab-soft hover:border-lab-ink hover:text-lab-ink">
										{meta.title} leaderboard
									</Link>
								</div>
							</div>
						</div>
						<div className="rounded-2xl border border-lab-line bg-lab-surface p-5 text-center" data-testid="overall">
							<p className="m-0 font-mono text-6xl font-bold leading-none tabular-nums">{o === null ? "–" : Math.round(o)}</p>
							<p className="m-0 mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Overall grade</p>
							{rank ? (
								<p className="m-0 mt-2 text-sm text-lab-soft">
									<span className="font-semibold text-lab-ink">{rankPhrase(rank.rank, rank.of)}</span> {meta.peers}
								</p>
							) : null}
							{tier ? <TierChip tier={tier} className="mt-1" /> : null}
							{o !== null ? <p className="m-0 mt-1 text-xs text-lab-muted">{gradeWord(o)}; 50 is average</p> : null}
						</div>
					</div>
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-6" />
				</div>
			</section>

			{rows.map((r, i) => (
				<RoleSection key={r.group} row={r} primary={i === 0} />
			))}

			<section className="border-t border-lab-line">
				<div className="container grid gap-3 py-8 text-xs leading-relaxed text-lab-muted">
					<p className="m-0 max-w-3xl">
						Ranks are among players at the same job who have enough plays to be graded. Grades and rankings come from play-by-play, charting and snap-count data, so they cannot see blocking, route running or assignments. See{" "}
						<Link href="/lab/players#how-it-works" className="underline">how the grades work</Link>.
					</p>
					<div className="flex flex-wrap items-center justify-between gap-4">
						<Link href="/lab/players" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
							&larr; All players
						</Link>
						<UnitsCredit />
					</div>
				</div>
			</section>
			<MoreFromLab current="/lab/players" weeks={labWeeks()} />
		</div>
	)
}
