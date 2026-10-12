"use client"

import * as React from "react"

import Link from "@/components/SiteLink"
import { DOWN, UP } from "@/components/lab/players/Bits"
import { Headshot } from "@/components/lab/players/Media"
import { useTeamFilter } from "@/components/lab/players/useTeamFilter"
import { cardStyle, profileHref, teamNick } from "@/lib/lab/playerView"
import { trackPlayers } from "@/lib/lab/track"
import {
	type Cell,
	METRICS,
	type Metric,
	ROLE,
	type Role,
	SPLIT_CHOICES,
	type SitBoardRow,
	cellStats,
	formatMetric,
	higherIsBetter,
	splitCell,
} from "@/lib/lab/situationsKit"

type Row = { r: SitBoardRow; n: number; v: number; all: ReturnType<typeof cellStats> }

/**
 * Every player at one job ranked on how he does in one spot: pick the down, the distance or the red zone, and the number to rank by.
 * The league average for that spot sits at the top of the table, so a row is always read against it.
 */
export default function SituationBoard({
	role,
	peers,
	single,
	rows,
	league,
	mins,
	teams,
}: {
	role: Role
	peers: string
	single: string
	rows: SitBoardRow[]
	league: Record<string, Cell>
	mins: Record<string, number>
	teams: string[]
}) {
	const meta = ROLE[role]
	const [split, setSplit] = React.useState("3")
	const [metric, setMetric] = React.useState<Metric>("sr")
	const [q, setQ] = React.useState("")
	const [custom, setCustom] = React.useState<number | null>(null)
	const [urlTeam, setTeam] = useTeamFilter()
	const team = urlTeam
	// Start where the season's ranking starts, and step down early in the season so the board is not three names long.
	const auto = React.useMemo(() => {
		const base = mins[split] ?? 3
		const steps = Array.from(new Set([base, Math.round(base * 0.75), Math.round(base / 2), 3].filter((n) => n >= 3))).sort((a, b) => b - a)
		for (const m of steps) {
			let c = 0
			for (const r of rows) {
				const n = splitCell(r.c, split, r.rz)?.[0] ?? 0
				if (n >= m) c++
			}
			if (c >= 12) return m
		}
		return steps[steps.length - 1] ?? 3
	}, [rows, split, mins])
	const min = custom ?? auto
	const label = SPLIT_CHOICES.find((s) => s.key === split)?.label ?? split
	const lg = cellStats(league[split])
	const styles = React.useMemo(() => Object.fromEntries(teams.map((t) => [t, cardStyle(t)])), [teams])

	const shown = React.useMemo(() => {
		const needle = q.trim().toLowerCase()
		const list: Row[] = []
		for (const r of rows) {
			const s = cellStats(splitCell(r.c, split, r.rz))
			if (!s || s.n < min) continue
			if (team && r.team !== team) continue
			if (needle && !r.name.toLowerCase().includes(needle)) continue
			list.push({ r, n: s.n, v: s[metric], all: s })
		}
		const dir = higherIsBetter(role, metric) ? -1 : 1
		return list.sort((a, b) => (a.v - b.v) * dir || b.n - a.n || a.r.name.localeCompare(b.r.name))
	}, [rows, split, metric, min, team, q, role])

	// The league rank is among everyone who qualifies, even when the list is filtered to one team.
	const rankOf = React.useMemo(() => {
		const all: Row[] = []
		for (const r of rows) {
			const s = cellStats(splitCell(r.c, split, r.rz))
			if (s && s.n >= min) all.push({ r, n: s.n, v: s[metric], all: s })
		}
		const dir = higherIsBetter(role, metric) ? -1 : 1
		all.sort((a, b) => (a.v - b.v) * dir || b.n - a.n || a.r.name.localeCompare(b.r.name))
		return new Map(all.map((x, i) => [x.r.slug, i + 1]))
	}, [rows, split, metric, min, role])

	const sel = "min-w-[9rem] rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-lab-ink"
	return (
		<div data-testid="situation-board">
			<div className="flex flex-wrap items-end gap-3">
				<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					Situation
					<select
						value={split}
						onChange={(e) => {
							setSplit(e.target.value)
							setCustom(null)
							trackPlayers("situation_board", { role, group: single, action: "split", split: e.target.value })
						}}
						className={sel}
					>
						{SPLIT_CHOICES.map((s) => (
							<option key={s.key} value={s.key}>
								{s.label}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					Team
					<select value={team} onChange={(e) => setTeam(e.target.value)} className={sel}>
						<option value="">All teams</option>
						{(team && !teams.includes(team) ? [...teams, team].sort() : teams).map((t) => (
							<option key={t} value={t}>
								{teamNick(t)}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					At least
					<select value={min} onChange={(e) => setCustom(Number(e.target.value))} className={sel}>
						{Array.from(new Set([1, 3, 5, 8, 10, 15, 20, 30, min])).sort((a, b) => a - b).map((n) => (
							<option key={n} value={n}>
								{n} {n === 1 ? meta.noun : meta.nouns}
							</option>
						))}
					</select>
				</label>
				<label className="grid gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					Player
					<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" className="w-44 rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-lab-ink placeholder:text-lab-muted" />
				</label>
			</div>
			<div role="radiogroup" aria-label="Rank by" className="mt-3 flex flex-wrap gap-1.5">
				{METRICS.map((m) => (
					<button
						key={m}
						type="button"
						role="radio"
						aria-checked={m === metric}
						onClick={() => {
							setMetric(m)
							trackPlayers("situation_board", { role, group: single, action: "metric", metric: m })
						}}
						className={`rounded-full border px-3 py-1 text-xs font-semibold ${m === metric ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
					>
						{meta.label[m]}
					</button>
				))}
			</div>
			<p className="m-0 mt-3 text-xs text-lab-muted" aria-live="polite">
				{shown.length} of {rankOf.size} {peers} with at least {min} {min === 1 ? meta.noun : meta.nouns} on {label.toLowerCase()}.
				{lg ? ` The average ${single.toLowerCase()} there: ${formatMetric(metric, lg[metric])} ${meta.label[metric].toLowerCase()} on ${lg.n} ${meta.nouns} in all.` : ""}
			</p>

			<div className="mt-3 overflow-x-auto rounded-xl border border-lab-line bg-lab-surface">
				<table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-sm">
					<caption className="sr-only">
						{peers} ranked by {meta.label[metric].toLowerCase()} on {label.toLowerCase()}
					</caption>
					<thead>
						<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:text-[11px]">
							<th scope="col" className="w-10 px-2 py-2">#</th>
							<th scope="col" className="sticky left-0 z-10 lab-solid-tint px-2 py-2">Player</th>
							<th scope="col" className="px-2 py-2 text-right">{meta.nouns.replace(/^\w/, (c) => c.toUpperCase())}</th>
							{METRICS.map((m) => (
								<th key={m} scope="col" className={`whitespace-nowrap px-2 py-2 text-right ${m === metric ? "text-lab-ink" : ""}`} aria-sort={m === metric ? (higherIsBetter(role, m) ? "descending" : "ascending") : "none"}>
									{meta.short[m]}
								</th>
							))}
							<th scope="col" className="px-2 py-2 text-right">vs. league</th>
						</tr>
					</thead>
					<tbody>
						{lg ? (
							<tr className="border-t border-lab-line bg-lab-tint/60 text-lab-soft">
								<td className="px-2 py-2" />
								<th scope="row" className="sticky left-0 z-10 lab-solid-tint px-2 py-2 text-left font-normal italic">
									League average
								</th>
								<td className="px-2 py-2 text-right font-mono tabular-nums">{lg.n}</td>
								{METRICS.map((m) => (
									<td key={m} className="whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums">
										{formatMetric(m, lg[m])}
									</td>
								))}
								<td />
							</tr>
						) : null}
						{shown.slice(0, 60).map(({ r, n, v, all }) => {
							const diff = lg ? (higherIsBetter(role, metric) ? v - lg[metric] : lg[metric] - v) : null
							const gap = lg ? v - lg[metric] : null
							return (
								<tr key={r.slug} className="border-t border-lab-line align-middle" data-testid="situation-row">
									<td className="px-2 py-2 font-mono tabular-nums text-lab-muted">{rankOf.get(r.slug)}</td>
									<th scope="row" className="sticky left-0 bg-lab-surface px-2 py-2 font-normal">
										<div className="lab-opp flex items-center gap-2.5" style={styles[r.team]}>
											<Headshot espn={r.espn} shot={r.shot} name={r.name} size={36} className="hidden sm:inline-flex" />
											<div>
												<Link href={profileHref(r.slug)} className="font-serif text-sm font-bold text-lab-ink hover:underline sm:text-base">
													{r.name}
												</Link>
												<span className="block text-[11px] text-lab-muted">
													{r.pos} &middot; {r.team}
												</span>
											</div>
										</div>
									</th>
									<td className="px-2 py-2 text-right font-mono tabular-nums">{n}</td>
									{METRICS.map((m) => (
										<td key={m} className={`whitespace-nowrap px-2 py-2 text-right font-mono tabular-nums ${m === metric ? "text-base font-bold text-lab-ink" : "text-lab-soft"}`}>
											{formatMetric(m, all![m])}
										</td>
									))}
									<td className="whitespace-nowrap px-2 py-2 text-right">
										{diff === null || gap === null ? (
											<span className="text-lab-muted">–</span>
										) : (
											<span className={`inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums ${Math.abs(diff) < (metric === "ypp" ? 0.2 : metric === "epa" ? 0.03 : 0.02) ? "text-lab-muted" : diff > 0 ? UP : DOWN}`}>
												<span aria-hidden="true" className="text-[9px]">
													{Math.abs(diff) < (metric === "ypp" ? 0.2 : metric === "epa" ? 0.03 : 0.02) ? "●" : diff > 0 ? "▲" : "▼"}
												</span>
												{metric === "ypp" ? `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)}` : metric === "epa" ? `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(2)}` : `${gap >= 0 ? "+" : "−"}${Math.abs(Math.round(gap * 100))} pts`}
												<span className="sr-only">{diff > 0 ? "better than the league" : "worse than the league"}</span>
											</span>
										)}
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
			{!shown.length ? (
				<p className="m-0 mt-4 text-sm text-lab-soft">
					Nobody has {min} {meta.nouns} on {label.toLowerCase()} yet{team ? ` for the ${teamNick(team)}` : ""}. Lower the minimum, pick another situation, or choose All teams.
				</p>
			) : shown.length > 60 ? (
				<p className="m-0 mt-3 text-xs text-lab-muted">Showing the top 60. Filter by team or name to see the rest.</p>
			) : null}
		</div>
	)
}
