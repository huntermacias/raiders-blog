"use client"

import * as React from "react"

import { LAB } from "@/lib/lab/theme"
import { type Analysis, type Meta, type Row, type Table, formatStat, recordText, seasonGames, seasonOf, teamLabel } from "@/lib/lab/historyKit"

/** The playoff marker used in the legend, the chips, the tooltip and the table: filled for a playoff team, hollow for one that missed. */
export function PlayoffMark({ made, size = 12 }: { made: boolean; size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
			{made ? <circle cx="6" cy="6" r="5" fill={LAB.scrimmage} /> : <circle cx="6" cy="6" r="4.4" fill={LAB.opp} fillOpacity={0.14} stroke={LAB.opp} strokeWidth="1.7" />}
		</svg>
	)
}

/** The Raiders' shield, when the site has the file. Decorative: the words next to it say who it is. */
export function RaidersMark({ src, size = 28, className = "" }: { src: string | null | undefined; size?: number; className?: string }) {
	if (!src) return null
	// eslint-disable-next-line @next/next/no-img-element
	return <img src={src} alt="" width={size} height={size} className={`shrink-0 object-contain ${className}`} style={{ width: size, height: size }} data-raiders-logo />
}

/**
 * The season as a row of games, so the slider says what it is showing: the first N games light up at the start,
 * the rest of the season at the end, and both glow while the dots are in between.
 */
export function GameRuler({ games, n, mix }: { games: number; n: number; mix: number }) {
	return (
		<div aria-hidden className="mt-1">
			<div className="flex gap-[3px]">
				{Array.from({ length: games }, (_, k) => {
					const first = k < n
					const on = first ? 1 - mix : mix
					return (
						<div
							key={k}
							className="flex h-6 min-w-0 flex-1 items-center justify-center rounded-[5px] text-[10px] font-bold tabular-nums"
							style={{ background: first ? LAB.ink : LAB.firstDown, color: first ? LAB.page : LAB.onFirstDown, opacity: 0.18 + 0.82 * on, outline: first && k === n - 1 ? "none" : undefined }}
						>
							{k + 1}
						</div>
					)
				})}
			</div>
			<div className="mt-1 flex text-[11px] font-semibold text-lab-muted">
				<span style={{ flex: n }}>Games 1&ndash;{n}</span>
				<span style={{ flex: games - n }}>Games {n + 1}&ndash;{games}</span>
			</div>
		</div>
	)
}

/** Which seasons to look at: presets, and a grid of every year for picking any mix. */
export function YearPicker({ first, last, years, onChange }: { first: number; last: number; years: number[]; onChange: (years: number[]) => void }) {
	const all = Array.from({ length: last - first + 1 }, (_, k) => first + k)
	const span = (a: number, b: number) => all.filter((y) => y >= a && y <= b)
	const same = (a: number[], b: number[]) => a.length === b.length && a.every((y, i) => y === b[i])
	const presets: { label: string; years: number[] }[] = [
		{ label: "All seasons", years: [] },
		{ label: "Last 5", years: all.slice(-5) },
		{ label: "2020s", years: span(2020, 2029) },
		{ label: "2010s", years: span(2010, 2019) },
		{ label: "2000s", years: span(2000, 2009) },
		{ label: "1999", years: span(1999, 1999) },
	].filter((p) => p.label === "All seasons" || p.years.length > 0)
	const toggle = (y: number) => onChange(years.includes(y) ? years.filter((x) => x !== y) : [...years, y].sort((a, b) => a - b))
	return (
		<div role="group" aria-label="Seasons" className="flex min-w-0 flex-col gap-1">
			<span className="text-xs font-semibold text-lab-muted">Seasons</span>
			<div className="flex flex-wrap items-center gap-1.5">
				{presets.map((p) => {
					const on = same(p.years, [...years].sort((a, b) => a - b))
					return (
						<button
							key={p.label}
							type="button"
							aria-pressed={on}
							onClick={() => onChange(p.years)}
							className={`min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
						>
							{p.label}
						</button>
					)
				})}
			</div>
			<details className="mt-1 text-sm">
				<summary className="cursor-pointer text-xs font-semibold text-lab-soft">Pick years{years.length ? ` (${years.length} chosen)` : ""}</summary>
				<div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-9" role="group" aria-label="Pick years">
					{all.map((y) => {
						const on = years.includes(y)
						return (
							<button
								key={y}
								type="button"
								aria-pressed={on}
								onClick={() => toggle(y)}
								className={`min-h-[36px] rounded-md border px-2 py-1 font-mono text-xs font-semibold transition ${on ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong bg-lab-surface text-lab-ink hover:bg-lab-hover"}`}
							>
								{y}
							</button>
						)
					})}
				</div>
			</details>
		</div>
	)
}

/** One team-season on a number line: where it started, where it ended up, the league average and the Raiders now. */
export function MoveLine({ story, start, rest, width = 300, height = 46, labels = true }: { story: Analysis; start: number; rest: number; width?: number; height?: number; labels?: boolean }) {
	const [d0, d1] = story.domain
	const pad = 10
	const x = (v: number) => pad + Math.min(1, Math.max(0, (v - d0) / (d1 - d0))) * (width - 2 * pad)
	const y = labels ? 20 : height / 2
	return (
		<svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={`From ${formatStat(story, start)} to ${formatStat(story, rest)}`} className="block max-w-full overflow-visible">
			<line x1={pad} x2={width - pad} y1={y} y2={y} stroke={LAB.line} strokeWidth={2} />
			<line x1={x(story.base)} x2={x(story.base)} y1={y - 9} y2={y + 9} stroke={LAB.axis} strokeDasharray="2 3" />
			<line x1={x(story.value)} x2={x(story.value)} y1={y - 11} y2={y + 11} stroke={LAB.firstDown} strokeWidth={2.5} />
			<line x1={x(start)} x2={x(rest)} y1={y} y2={y} stroke={LAB.inkSoft} strokeWidth={2.5} strokeLinecap="round" />
			<circle cx={x(start)} cy={y} r={5} fill={LAB.surface} stroke={LAB.ink} strokeWidth={2} />
			<circle cx={x(rest)} cy={y} r={5.5} fill={LAB.ink} />
			{labels ? (
				<>
					<text x={x(start)} y={y - 12} fontSize={11} fontWeight={700} textAnchor="middle" fill={LAB.inkSoft}>
						start
					</text>
					<text x={x(rest)} y={y + 24} fontSize={11} fontWeight={700} textAnchor="middle" fill={LAB.ink}>
						rest
					</text>
				</>
			) : null}
		</svg>
	)
}

type SortKey = "near" | "team" | "start" | "rest" | "change" | "wins" | "po"
type Sort = { key: SortKey; dir: 1 | -1 }

/** Every highlighted team in a table that can be sorted and searched; picking a row pins its dot in the chart. */
export function Leaderboard({
	meta,
	table,
	story,
	rows,
	pin,
	onPin,
	season,
	limit,
}: {
	meta: Meta
	table: Table
	story: Analysis
	rows: Row[]
	pin: number | null
	onPin: (i: number) => void
	season: number
	limit: number
}) {
	const [sort, setSort] = React.useState<Sort>({ key: "near", dir: 1 })
	const [query, setQuery] = React.useState("")
	const q = query.trim().toLowerCase()
	const shown = React.useMemo(() => {
		const value = (r: Row): number => {
			switch (sort.key) {
				case "team":
					return seasonOf(meta.teams[r.i])
				case "start":
					return r.start
				case "rest":
					return r.rest
				case "change":
					return r.rest - r.start
				case "wins":
					return meta.wins[r.i]
				case "po":
					return r.po ? 1 : 0
				default:
					return Math.abs(r.start - story.value)
			}
		}
		const found = q ? rows.filter((r) => teamLabel(meta.teams[r.i]).toLowerCase().includes(q)) : rows
		const sorted = found.slice().sort((a, b) => sort.dir * (value(a) - value(b)) || a.i - b.i)
		return { total: found.length, list: sorted.slice(0, limit) }
	}, [rows, sort, q, meta, story.value, limit])
	const head = (key: SortKey, label: string, right = false) => {
		const on = sort.key === key
		return (
			<th scope="col" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`sticky top-0 z-[1] bg-lab-page py-1.5 pr-3 font-semibold ${right ? "text-right" : ""}`}>
				<button type="button" onClick={() => setSort({ key, dir: on ? (sort.dir === 1 ? -1 : 1) : key === "near" || key === "team" ? 1 : -1 })} className={`inline-flex min-h-[32px] items-center gap-1 font-semibold transition hover:text-lab-ink ${on ? "text-lab-ink" : "text-lab-muted"}`}>
					{label}
					<span aria-hidden className="text-[10px]">
						{on ? (sort.dir === 1 ? "▲" : "▼") : ""}
					</span>
				</button>
			</th>
		)
	}
	return (
		<div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<label className="flex items-center gap-2 text-xs font-semibold text-lab-muted">
					<span className="sr-only">Search the teams</span>
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search a team or year"
						className="min-h-[40px] w-56 max-w-full rounded-lg border border-lab-line-strong bg-lab-surface px-3 py-2 text-sm font-normal text-lab-ink placeholder:text-lab-muted"
					/>
				</label>
				<p className="m-0 text-xs text-lab-muted" aria-live="polite">
					{shown.list.length < shown.total ? `Showing ${shown.list.length} of ${shown.total} teams.` : `${shown.total} team${shown.total === 1 ? "" : "s"}.`} Select a team to pin it in the chart.
				</p>
			</div>
			<div className="mt-3 max-h-[26rem] overflow-auto rounded-lg border border-lab-line">
				<table className="w-full min-w-[640px] border-collapse text-left text-xs tabular-nums">
					<caption className="sr-only">
						Highlighted teams, closest to the {season} Raiders first unless you sort, with their {story.unit} through {meta.n} games and over the rest of the season, their records and whether they made the playoffs.
					</caption>
					<thead>
						<tr>
							{head("team", "Team")}
							{head("start", `First ${meta.n} games`, true)}
							{head("rest", "Rest of season", true)}
							{head("change", "Move", true)}
							{head("wins", "Finished", false)}
							{head("po", "Playoffs", false)}
						</tr>
					</thead>
					<tbody>
						{shown.list.map((r) => {
							const on = pin === r.i
							const g = seasonGames(seasonOf(meta.teams[r.i]))
							return (
								<tr key={r.i} className={`border-t border-lab-line ${on ? "bg-lab-hover" : ""}`}>
									<th scope="row" className="py-1 pr-3 font-semibold">
										<button type="button" aria-pressed={on} onClick={() => onPin(r.i)} className="inline-flex min-h-[32px] items-center gap-2 text-left transition hover:text-lab-ink">
											{r.raiders ? (
												<span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: LAB.firstDown }} />
											) : null}
											{teamLabel(meta.teams[r.i])}
										</button>
										<span className="ml-1 font-mono font-normal text-lab-muted">{recordText(meta.startWins[r.i], meta.startLosses[r.i], meta.n)}</span>
									</th>
									<td className="py-1 pr-3 text-right font-mono">{formatStat(table, r.start)}</td>
									<td className="py-1 pr-3 text-right font-mono">{formatStat(table, r.rest)}</td>
									<td className="w-28 py-1 pr-3 text-right">
										<span className="sr-only">{r.toward ? "Toward average" : "Away from average"}</span>
										<MoveLine story={story} start={r.start} rest={r.rest} width={110} height={16} labels={false} />
									</td>
									<td className="py-1 pr-3 font-mono">{recordText(meta.wins[r.i], meta.losses[r.i], g)}</td>
									<td className="py-1">
										<span className="inline-flex items-center gap-1.5">
											<PlayoffMark made={r.po} />
											{r.po ? "Made it" : "Missed"}
										</span>
									</td>
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}
