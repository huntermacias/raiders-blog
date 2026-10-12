import Link from "@/components/SiteLink"
import { Headshot, TeamLogo } from "@/components/lab/players/Media"
import TeamLink from "@/components/lab/players/TeamLink"
import SnapStrip from "@/components/lab/players/SnapStrip"
import Yardstick from "@/components/lab/players/Yardstick"
import { boardHref, cardStyle, profileHref } from "@/lib/lab/playerView"
import {
	GROUP_META,
	HEADLINE,
	type PlayerGroup,
	type PlayerLog,
	type PlayerRow,
	type PlayersData,
	type Role,
	boards,
	boardFor,
	formatStat,
	leaders,
	snapText,
	statInfo,
} from "@/lib/lab/playersKit"

const ROLE_LABEL: Record<Role["kind"], string> = { back: "Back in the lineup", out: "Out of the lineup", bigger: "Bigger role", smaller: "Smaller role" }

/** A player whose playing time changed: what happened in words, then every game as a column so the change can be seen. */
export function RoleCard({ data, player, role, log }: { data: PlayersData; player: PlayerRow; role: Role; log?: PlayerLog }) {
	const weeks = (data.opp[player.team] ? Object.keys(data.opp[player.team]).map(Number) : []).sort((a, b) => a - b)
	const defensive = GROUP_META[player.group].side === "defense"
	const form = defensive ? data.defFormWeeks : data.formWeeks
	return (
		<article className="lab-opp rounded-2xl border border-lab-line bg-lab-surface p-4" style={cardStyle(player.team)} data-testid="role-card">
			<header className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<Headshot espn={player.espn} shot={player.shot} name={player.name} size={44} />
					<div className="min-w-0">
						<p className="m-0 flex items-center gap-1.5 text-xs text-lab-muted">
							<TeamLogo team={player.team} size={16} />
							{player.pos} &middot; {GROUP_META[player.group].single}
						</p>
						<h3 className="m-0 mt-0.5 font-serif text-lg font-bold leading-tight">
							<Link href={profileHref(player.slug)} className="hover:underline">
								{player.name}
							</Link>
						</h3>
					</div>
				</div>
				<span className="shrink-0 rounded-full border border-lab-line-strong px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-ink">{ROLE_LABEL[role.kind]}</span>
			</header>
			<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">{role.detail}</p>
			{log?.s?.length ? (
				<div className="mt-3">
					<SnapStrip weeks={weeks} shares={log.s} formWeeks={form} opp={data.opp[player.team]} />
					<p className="m-0 mt-1 text-[11px] leading-snug text-lab-muted">Share of his team&apos;s offensive or defensive snaps in each game. &ldquo;Out&rdquo; means he did not play. Shaded games are the recent stretch.</p>
				</div>
			) : (
				<p className="m-0 mt-2 text-xs text-lab-muted">
					Before: {snapText(role.before)} &middot; lately: {snapText(role.now)} of snaps when he plays.
				</p>
			)}
		</article>
	)
}

/** One position group on the hub: the top five on its main stat, with a link to the whole board and to the other stats. */
export function GroupLeaderCard({ data, group }: { data: PlayersData; group: PlayerGroup }) {
	const meta = GROUP_META[group]
	const key = HEADLINE[group]
	const info = statInfo(group, key)!
	const board = boardFor(group, info.path)!
	const rows = leaders(data, board).slice(0, 5)
	const yard = data.yard[group]?.[key]
	if (!rows.length) return null
	return (
		<article className="flex h-full flex-col rounded-2xl border border-lab-line bg-lab-surface p-4" data-testid="group-leaders">
			<h3 className="m-0 font-serif text-lg font-bold">{meta.title}</h3>
			<p className="m-0 mt-0.5 text-xs text-lab-muted">
				{info.label}
				{info.higher === false ? ", lower is better" : ""} &middot; {data.leagueN[group] ?? rows.length} graded
			</p>
			<ol className="m-0 mt-3 grid list-none gap-2 p-0">
				{rows.map((r) => (
					<li key={r.player.id} className="lab-opp grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-2 text-sm" style={cardStyle(r.player.team)}>
						<span className="font-mono text-xs text-lab-muted">{r.rank}</span>
						<span className="min-w-0 truncate">
							<Link href={profileHref(r.player.slug)} className="font-semibold text-lab-ink hover:underline">
								{r.player.name}
							</Link>{" "}
							<span className="text-xs text-lab-muted">{r.player.team}</span>
						</span>
						<span className="font-mono text-xs font-bold tabular-nums">{formatStat(group, key, r.value)}</span>
					</li>
				))}
			</ol>
			{yard ? (
				<p className="m-0 mt-3 text-[11px] leading-snug text-lab-muted">
					A typical {meta.single.toLowerCase()} is {formatStat(group, key, yard.q[2])}; the 10th best is {formatStat(group, key, info.higher === false ? yard.q[0] : yard.q[4])}.
				</p>
			) : null}
			<p className="m-0 mt-auto pt-3 text-xs">
				<Link href={boardHref(group, info.path)} className="font-semibold text-lab-ink hover:underline">
					Full {meta.title.toLowerCase()} board &rarr;
				</Link>
			</p>
		</article>
	)
}

/** Every leaderboard, grouped by position, so any stat is one click away. */
export function BoardIndex({ data, current }: { data: PlayersData; current?: { group: PlayerGroup; path: string } }) {
	const groups = (Object.keys(GROUP_META) as PlayerGroup[]).filter((g) => data.players.some((p) => p.group === g))
	return (
		<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{groups.map((g) => (
				<div key={g}>
					<h3 className="m-0 font-serif text-base font-bold">{GROUP_META[g].title}</h3>
					<ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
						{boards(g).map((b) => {
							const on = current?.group === g && current.path === b.path
							return (
								<li key={b.path + b.kind}>
									<TeamLink
										href={boardHref(g, b.path)}
										aria-current={on ? "page" : undefined}
										className={`inline-block rounded-full border px-2.5 py-1 text-xs ${on ? "border-lab-ink bg-lab-ink text-lab-page" : b.kind === "box" ? "border-dashed border-lab-line-strong text-lab-muted hover:border-lab-ink hover:text-lab-ink" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
									>
										{b.label}
									</TeamLink>
								</li>
							)
						})}
					</ul>
				</div>
			))}
		</div>
	)
}

/** A worked example of how to read the strip, drawn from a real player so the numbers on screen are the ones the legend describes. */
export function HowToRead({ data, example }: { data: PlayersData; example?: { player: PlayerRow; key: string } }) {
	const ex = example
	const y = ex ? data.yard[ex.player.group]?.[ex.key] : null
	const info = ex ? statInfo(ex.player.group, ex.key) : null
	const s = ex ? ex.player.stats.find((x) => x.k === ex.key) : null
	return (
		<div className="grid gap-5 rounded-2xl border border-lab-line bg-lab-surface p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
			<div>
				<h2 className="m-0 font-serif text-2xl font-bold tracking-tight">Every number comes with context</h2>
				<p className="m-0 mt-2 text-sm leading-relaxed text-lab-soft">
					A stat on its own tells you very little. So every number here has three things beside it: where it ranks among players who do the same job, what a typical player and a very good one look like, and how many plays are behind it.
				</p>
			</div>
			{ex && y && info && s ? (
				<div className="lab-opp rounded-xl border border-lab-line p-4" style={cardStyle(ex.player.team)}>
					<p className="m-0 flex items-baseline justify-between gap-2 text-sm">
						<span className="font-semibold text-lab-ink">
							{ex.player.name} &middot; {info.label}
						</span>
						<span className="font-mono font-bold tabular-nums">{formatStat(ex.player.group, ex.key, s.season.v)}</span>
					</p>
					<div className="mt-2">
						<Yardstick marks={[{ v: s.season.v, se: s.season.se, name: ex.player.name }]} yard={y} higher={info.higher} fmt={(v) => formatStat(ex.player.group, ex.key, v)} peers={GROUP_META[ex.player.group].peers} />
					</div>
					<ul className="m-0 mt-3 grid list-none gap-1 p-0 text-xs leading-snug text-lab-soft">
						<li><span className="font-semibold text-lab-ink">The dot</span> is the player. Right is always better.</li>
						<li><span className="font-semibold text-lab-ink">The shaded stretch</span> is where the middle half of {GROUP_META[ex.player.group].peers} sit, and the tick is the typical one.</li>
						<li><span className="font-semibold text-lab-ink">The thin line</span> is where his true level most likely is. Longer means less certain.</li>
					</ul>
				</div>
			) : null}
		</div>
	)
}
