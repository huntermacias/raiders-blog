import Link from "@/components/SiteLink"
import MoreFromLab from "@/components/lab/MoreFromLab"
import TeamLink from "@/components/lab/players/TeamLink"
import TrackView from "@/components/lab/players/TrackView"
import LeaderTable, { type BoxCol, type LeaderRowSlim } from "@/components/lab/players/LeaderTable"
import { BoardIndex } from "@/components/lab/players/Sections"
import UpdatedStamp from "@/components/lab/UpdatedStamp"
import UnitsCredit from "@/components/lab/UnitsCredit"
import { getPlayers } from "@/lib/lab/data"
import {
	BOX,
	type Board,
	GROUP_META,
	GROUP_ORDER,
	type PlayerGroup,
	boards,
	formatStat,
	leaders,
	statInfo,
	STAT,
	SIGNAL_HELP,
	SIGNAL_WORD,
	signalOf,
	UNIT_NOTE,
} from "@/lib/lab/playersKit"
import { boardHref } from "@/lib/lab/playerView"
import { labWeeks } from "@/lib/lab/toolsData"

const SITE_URL = "https://www.raidersrundown.com"

/** One leaderboard: the definition, the table, and a way to every other board. */
export default function BoardPage({ group, board }: { group: PlayerGroup; board: Board }) {
	const data = getPlayers()
	const meta = GROUP_META[group]
	const info = board.kind === "stat" ? statInfo(group, board.key) : null
	const rows = leaders(data, board)
	const yard = board.kind === "stat" ? (data.yard[group]?.[board.key] ?? null) : null
	const signal = info && info.higher !== null ? signalOf(yard) : null
	const slim: LeaderRowSlim[] = rows.map((r) => ({
		slug: r.player.slug,
		name: r.player.name,
		team: r.player.team,
		pos: r.player.pos,
		espn: r.player.espn,
		shot: r.player.shot,
		v: r.value,
		rank: r.rank,
		n: r.volume,
		d: r.delta,
		z: r.z,
		box: r.player.box,
	}))
	const boxCols: BoxCol[] = Object.entries(BOX[group]).map(([key, b]) => ({ key, short: b.short, label: b.label }))
	const teams = Array.from(new Set(rows.map((r) => r.player.team))).sort()
	const url = `${SITE_URL}/lab/players/leaders/${group}/${board.path}`
	const first = rows[0]
	const ld = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{ "@type": "ListItem", position: 1, name: "The Lab", item: `${SITE_URL}/lab` },
			{ "@type": "ListItem", position: 2, name: "Players", item: `${SITE_URL}/lab/players` },
			{ "@type": "ListItem", position: 3, name: meta.title, item: `${SITE_URL}/lab/players/leaders/${group}` },
			{ "@type": "ListItem", position: 4, name: board.label, item: url },
		],
	}
	const siblings = boards(group)
	return (
		<div className="lab lab-opp min-h-screen bg-lab-page text-lab-ink">
			{/* eslint-disable-next-line react/no-danger */}
			<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
			<section className="border-b border-lab-line">
				<div className="container py-10 sm:py-12">
					<nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
						<Link href="/lab/players" className="hover:text-lab-ink">
							Players
						</Link>{" "}
						&rsaquo; <span>{meta.title}</span> &rsaquo; <span className="text-lab-soft">{board.label}</span>
					</nav>
					<h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
						{board.label}: {meta.title.toLowerCase()} ranked
					</h1>
					<p className="mt-4 max-w-3xl text-base leading-relaxed text-lab-soft">
						{info ? info.what : `${board.label} so far this season. A box-score total, shown beside the advanced numbers so you can see who piles up counts and who makes them count.`}
					</p>
					{info ? (
						<p className="m-0 mt-3 max-w-3xl border-l-2 border-lab-line-strong pl-3 text-sm leading-relaxed text-lab-muted">
							<span className="font-semibold text-lab-soft">Why the box score misses it: </span>
							{info.box}
						</p>
					) : null}
					{info?.unit ? (
						<p className="m-0 mt-4 max-w-3xl rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="unit-note">
							<span className="font-semibold text-lab-ink">A line stat, not one man&apos;s. </span>
							{UNIT_NOTE} Linemen who start together are tied here and ordered by snaps played.
						</p>
					) : null}
					{signal && signal !== "real" ? (
						<p className="m-0 mt-4 max-w-3xl rounded-xl border border-dashed border-lab-line-strong bg-lab-surface px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="signal-note">
							<span className="font-semibold text-lab-ink">{SIGNAL_WORD[signal]}. </span>
							{SIGNAL_HELP[signal]}
							{signal === "luck" ? " Players are still ordered below, but nobody is called elite or poor on it yet." : ""}
						</p>
					) : null}
					<p className="m-0 mt-4 text-sm text-lab-soft">
						{first && yard && info && signal !== "luck" ? (
							<>
								Best so far: <span className="font-semibold text-lab-ink">{first.player.name}</span> ({first.player.team}), {formatStat(group, board.key, first.value)}. A typical {meta.single.toLowerCase()} is {formatStat(group, board.key, yard.q[2])}.{" "}
							</>
						) : null}
						{info ? `Players need at least ${meta.need} to qualify, so nobody is ranked on a handful of plays.` : null}
						{info?.higher === false ? " Lower is better." : null}
						{board.kind === "box" && BOX[group][board.key]?.bad ? " This is a total where more is worse, so first place has the most of it. It is listed for completeness, never as an honor." : null}
					</p>
					<TrackView event="board_view" props={{ group, board: board.path }} />
					<UpdatedStamp at={data.generatedAt} kind="grades" className="mt-4" />
				</div>
			</section>

			<section className="container py-8 sm:py-10" aria-label="Pick another stat">
				<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
					{siblings.map((b) => (
						<li key={b.path + b.kind}>
							<TeamLink
								href={boardHref(group, b.path)}
								aria-current={b.path === board.path && b.kind === board.kind ? "page" : undefined}
								className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${b.path === board.path && b.kind === board.kind ? "border-lab-ink bg-lab-ink text-lab-page" : b.kind === "box" ? "border-dashed border-lab-line-strong text-lab-muted hover:border-lab-ink hover:text-lab-ink" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
							>
								{b.label}
							</TeamLink>
						</li>
					))}
				</ul>

				<div className="mt-6">
					{slim.length ? (
						<LeaderTable
							group={group}
							statKey={board.key}
							kind={board.kind}
							yard={yard}
							rows={slim}
							boxCols={boxCols}
							higher={info ? info.higher : true}
							teams={teams}
							defaultTeam=""
							valueLabel={info ? info.short : (BOX[group][board.key]?.short ?? board.label)}
							perLabel={info ? info.per.replace(/^\w/, (c) => c.toUpperCase()) : "Plays"}
							lean={info?.lean}
						/>
					) : (
						<p className="m-0 rounded-2xl border border-dashed border-lab-line-strong p-5 text-sm text-lab-soft">Nobody qualifies yet. This fills in as the season goes on.</p>
					)}
				</div>

				<details className="mt-8 max-w-3xl rounded-xl border border-lab-line bg-lab-surface px-4 py-3 text-sm text-lab-soft">
					<summary className="cursor-pointer text-sm font-semibold text-lab-ink">How to read this table</summary>
					<ul className="mb-2 mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-lab-muted">
						<li>The number on the left is the league rank among {meta.peers}, even when the list is filtered to one team. On a graded stat the rank allows for how many plays are behind each number: a player with a few plays has his number pulled toward the middle, so he cannot jump ahead of a player who did the same over many more.</li>
						<li>&ldquo;Against the league&rdquo; draws each player on the same strip: the ends are the 10th-best and 90th-best player, the shaded stretch is the middle half, and the tick is the median. Right is always better.</li>
						<li>&ldquo;Lately&rdquo; is the change in grade between a player&apos;s last {data.formGames} games and the games before them. The tag says whether the change is bigger than what a few plays could cause.</li>
						<li>Tick &ldquo;Show the box score&rdquo; to put the traditional totals next to the advanced number and sort by either.</li>
					</ul>
				</details>

				<div className="mt-10">
					<h2 className="m-0 mb-4 font-serif text-2xl font-bold">Other leaderboards</h2>
					<BoardIndex data={data} current={{ group, path: board.path }} />
				</div>
				<p className="m-0 mt-8 text-xs text-lab-muted">
					{GROUP_ORDER.length} positions &middot; {Object.keys(STAT[group]).length} advanced stats here &middot; <Link href="/lab/players/compare" className="underline">Compare two players</Link>
				</p>
			</section>
			<section className="border-t border-lab-line">
				<div className="container flex flex-wrap items-center justify-between gap-4 py-8">
					<Link href="/lab/players" className="text-sm font-semibold text-lab-soft hover:text-lab-ink">
						&larr; All players
					</Link>
					<UnitsCredit />
				</div>
			</section>
			<MoreFromLab current="/lab/players" weeks={labWeeks()} />
		</div>
	)
}
