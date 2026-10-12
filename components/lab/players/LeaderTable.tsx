"use client"

import * as React from "react"

import Link from "@/components/SiteLink"
import { ConfidenceChip, Delta, TierChip } from "@/components/lab/players/Bits"
import Yardstick from "@/components/lab/players/Yardstick"
import { useTeamFilter } from "@/components/lab/players/useTeamFilter"
import { Headshot } from "@/components/lab/players/Media"
import { cardStyle, profileHref, teamNick } from "@/lib/lab/playerView"
import { type PlayerGroup, type Yard, confidenceOf, formatBox, formatStat, pctFromRank, tierOf, GROUP_META } from "@/lib/lab/playersKit"

export type LeaderRowSlim = {
	slug: string
	name: string
	team: string
	pos: string
	espn?: number
	v: number
	rank: number
	n: number | null
	d: number | null
	z: number | null
	box: Record<string, number>
}
export type BoxCol = { key: string; short: string; label: string }

type Col = "rank" | "v" | "n" | "d" | string

/**
 * A leaderboard that can be filtered by team or name and sorted by any column, with the box score a click away. The rank is always the
 * league rank, so filtering to one team still says "3rd in the league", and every row carries the same strip: where he sits against
 * the league's middle half.
 */
export default function LeaderTable({
	group,
	statKey,
	kind,
	yard,
	rows,
	boxCols,
	higher,
	teams,
	defaultTeam = "",
	valueLabel,
	perLabel,
}: {
	group: PlayerGroup
	statKey: string
	kind: "stat" | "box"
	yard: Yard | null
	rows: LeaderRowSlim[]
	boxCols: BoxCol[]
	higher: boolean | null
	teams: string[]
	defaultTeam?: string
	valueLabel: string
	perLabel: string
}) {
	const [urlTeam, setTeam] = useTeamFilter()
	const team = urlTeam || defaultTeam
	const [q, setQ] = React.useState("")
	const [showBox, setShowBox] = React.useState(kind === "box")
	const [sort, setSort] = React.useState<{ col: Col; dir: 1 | -1 }>({ col: "rank", dir: 1 })
	const [limit, setLimit] = React.useState(40)
	const styles = React.useMemo(() => Object.fromEntries(teams.map((t) => [t, cardStyle(t)])), [teams])
	const meta = GROUP_META[group]
	const stat = kind === "stat"

	const shown = React.useMemo(() => {
		const needle = q.trim().toLowerCase()
		const list = rows.filter((r) => (!team || r.team === team) && (!needle || r.name.toLowerCase().includes(needle)))
		const val = (r: LeaderRowSlim): number => {
			if (sort.col === "rank") return r.rank
			if (sort.col === "v") return r.v
			if (sort.col === "n") return r.n ?? -1
			if (sort.col === "d") return r.d ?? -999
			return r.box[sort.col] ?? -1
		}
		return list.slice().sort((a, b) => (val(a) - val(b)) * sort.dir || a.rank - b.rank || a.name.localeCompare(b.name))
	}, [rows, team, q, sort])

	const head = (col: Col, label: string, extra = "") => {
		const on = sort.col === col
		return (
			<th scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-2 py-2 ${extra}`}>
				<button
					type="button"
					onClick={() => setSort(on ? { col, dir: sort.dir === 1 ? -1 : 1 } : { col, dir: col === "rank" ? 1 : -1 })}
					className={`inline-flex items-center gap-1 font-semibold uppercase tracking-[0.1em] ${on ? "text-lab-ink" : "text-lab-muted hover:text-lab-ink"}`}
				>
					{label}
					<span aria-hidden="true" className="text-[9px]">{on ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
				</button>
			</th>
		)
	}

	return (
		<div>
			<div className="flex flex-wrap items-end gap-3">
				<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					Team
					<select value={team} onChange={(e) => setTeam(e.target.value)} className="min-w-[9rem] rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-lab-ink">
						<option value="">All teams</option>
						{(team && !teams.includes(team) ? [...teams, team].sort() : teams).map((t) => (
							<option key={t} value={t}>
								{teamNick(t)}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					Player
					<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className="w-44 rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-lab-ink placeholder:text-lab-muted" />
				</label>
				{boxCols.length && stat ? (
					<label className="flex items-center gap-2 pb-2 text-sm text-lab-soft">
						<input type="checkbox" checked={showBox} onChange={(e) => setShowBox(e.target.checked)} className="h-4 w-4" />
						Show the box score
					</label>
				) : null}
				<p className="m-0 ml-auto pb-2 text-xs text-lab-muted" aria-live="polite">
					{shown.length} of {rows.length} {meta.peers}
				</p>
			</div>

			<div className="mt-3 overflow-x-auto rounded-xl border border-lab-line bg-lab-surface">
				<table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-sm">
					<caption className="sr-only">{valueLabel} leaders among {meta.peers}</caption>
					<thead>
						<tr className="bg-lab-tint text-[10px] sm:text-[11px]">
							{head("rank", "#", "w-10")}
							<th scope="col" className="sticky left-0 bg-lab-tint px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:text-[11px]">Player</th>
							{head("v", valueLabel, "text-right")}
							<th scope="col" className="hidden w-56 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:table-cell sm:text-[11px]">Against the league</th>
							{stat ? head("n", perLabel, "text-right") : null}
							{stat ? head("d", "Lately", "text-right") : null}
							{showBox || !stat ? boxCols.map((c) => <React.Fragment key={c.key}>{head(c.key, c.short, "text-right")}</React.Fragment>) : null}
						</tr>
					</thead>
					<tbody>
						{shown.slice(0, limit).map((r) => {
							const pct = stat && yard ? pctFromRank(r.rank, yard.n) : null
							return (
								<tr key={r.slug} className="border-t border-lab-line align-middle" data-testid="leader-row">
									<td className="px-2 py-2 font-mono tabular-nums text-lab-muted">{r.rank}</td>
									<th scope="row" className="sticky left-0 bg-lab-surface px-2 py-2 font-normal">
										<div className="lab-opp flex items-center gap-2.5" style={styles[r.team]}>
											<Headshot espn={r.espn} name={r.name} size={36} className="hidden sm:inline-flex" />
											<div>
												<Link href={profileHref(r.slug)} className="font-serif text-sm font-bold text-lab-ink hover:underline sm:text-base">
													{r.name}
												</Link>
												<span className="block text-[11px] text-lab-muted">
													{r.pos} &middot; {r.team}
												</span>
												{pct !== null && stat ? <TierChip tier={tierOf(pct)} className="sm:hidden" /> : null}
											</div>
										</div>
									</th>
									<td className="whitespace-nowrap px-2 py-2 text-right font-mono text-sm font-bold tabular-nums text-lab-ink sm:text-base">{stat ? formatStat(group, statKey, r.v) : formatBox(group, statKey, r.v)}</td>
									<td className="hidden px-2 py-2 sm:table-cell">
										{yard && stat ? (
											<div className="lab-opp" style={styles[r.team]}>
												<Yardstick compact marks={[{ v: r.v, name: r.name }]} yard={yard} higher={higher} fmt={(v) => formatStat(group, statKey, v)} peers={meta.peers} />
												{pct !== null ? <TierChip tier={tierOf(pct)} className="mt-0.5" /> : null}
											</div>
										) : null}
									</td>
									{stat ? <td className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums text-lab-muted">{r.n === null ? "–" : Math.round(r.n)}</td> : null}
									{stat ? (
										<td className="px-2 py-2 text-right">
											{r.d === null || higher === null ? (
												<span className="text-lab-muted">–</span>
											) : (
												<span className="inline-flex flex-col items-end gap-0.5">
													<Delta v={r.d} />
													{Math.abs(r.d) >= 3 ? <ConfidenceChip conf={confidenceOf(r.z)} /> : null}
												</span>
											)}
										</td>
									) : null}
									{showBox || !stat ? boxCols.map((c) => <td key={c.key} className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums text-lab-soft">{formatBox(group, c.key, r.box[c.key])}</td>) : null}
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
			{shown.length > limit ? (
				<button type="button" onClick={() => setLimit((l) => l + 60)} className="mt-3 rounded-lg border border-lab-line-strong px-4 py-2 text-sm font-semibold text-lab-soft hover:border-lab-ink hover:text-lab-ink">
					Show more ({shown.length - limit} left)
				</button>
			) : null}
			{!shown.length ? (
				<p className="m-0 mt-4 text-sm text-lab-soft">
					{team && !q.trim() ? `No ${teamNick(team)} ${meta.peers} qualify for this stat yet. Pick another team, or choose All teams to see the league.` : "Nobody matches. Try another team or a shorter name."}
				</p>
			) : null}
		</div>
	)
}
