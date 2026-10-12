import { DOWN, UP } from "@/components/lab/players/Bits"
import { Headshot } from "@/components/lab/players/Media"
import ProgressLine from "@/components/lab/players/ProgressLine"
import Link from "@/components/SiteLink"
import { cardStyle, profileHref } from "@/lib/lab/playerView"
import { GROUP_META, type PlayerLog, type PlayerRow, type PlayersData, arcChange, arcOf, ordinal, overall, shownPct } from "@/lib/lab/playersKit"

// The whole roster's season in one list: for every player with a few weeks behind him, where he has stood among the players at his job
// after each week. All the thinking is in playersKit.ts (arcOf); this only lays it out.

export type ArcRow = { player: PlayerRow; arc: ReturnType<typeof arcOf>; change: NonNullable<ReturnType<typeof arcChange>> }

/** Players with at least three weeks of standing, climbers first. */
export function arcRows(players: PlayerRow[], logOf: (p: PlayerRow) => PlayerLog | undefined): ArcRow[] {
	const rows: ArcRow[] = []
	for (const player of players) {
		const arc = arcOf(player, logOf(player))
		const change = arcChange(arc)
		if (change && change.weeks >= 3) rows.push({ player, arc, change })
	}
	return rows.sort((a, b) => b.change.delta - a.change.delta || (overall(b.player) ?? 0) - (overall(a.player) ?? 0) || a.player.name.localeCompare(b.player.name))
}

export default function SeasonArcs({ data, rows }: { data: PlayersData; rows: ArcRow[] }) {
	if (!rows.length) return null
	return (
		<ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2" data-testid="season-arcs">
			{rows.map(({ player, arc, change }) => {
				const up = change.delta >= 8
				const down = change.delta <= -8
				const meta = GROUP_META[player.group]
				const a = shownPct(change.first.pct)
				const b = shownPct(change.last.pct)
				return (
					<li key={player.id + player.group} className="lab-opp flex items-center gap-3 rounded-2xl border border-lab-line bg-lab-surface p-3" style={cardStyle(player.team)}>
						<Headshot espn={player.espn} shot={player.shot} name={player.name} size={44} />
						<div className="min-w-0 flex-1">
							<p className="m-0 truncate text-sm font-semibold">
								<Link href={profileHref(player.slug)} className="hover:underline">
									{player.name}
								</Link>{" "}
								<span className="text-xs font-normal text-lab-muted">{meta.single}</span>
							</p>
							<p className="m-0 mt-0.5 text-xs text-lab-soft">
								{up ? <span className={`font-semibold ${UP}`}>▲ Climbing</span> : down ? <span className={`font-semibold ${DOWN}`}>▼ Slipping</span> : <span className="font-semibold text-lab-ink">● Holding</span>}
								<span className="text-lab-muted">
									{" "}
									&middot; {ordinal(a)} to {ordinal(b)} percentile over {change.weeks} weeks
								</span>
							</p>
						</div>
						<div className="w-28 shrink-0 sm:w-36">
							<ProgressLine compact weeks={data.weeks} points={arc.map((t) => ({ w: t.w, pct: t.pct as number | null }))} formWeeks={data.formWeeks} label={`${player.name}, overall standing by week: ${ordinal(a)} to ${ordinal(b)} percentile`} />
						</div>
					</li>
				)
			})}
		</ul>
	)
}
