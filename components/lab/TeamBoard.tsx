"use client"

import * as React from "react"

import Link from "@/components/SiteLink"
import ShareCard from "@/components/lab/ShareCard"
import { BOARD_SHARE_PATH, BOARD_SORTS, MATCHUP_SHARE_PATH, boardQuery, matchupQuery } from "@/lib/lab/matchupShare"
import { GROUPS, GROUP_ORDER, type BoardRow, type GroupKey, heat, matchupPath, ordinal } from "@/lib/lab/unitsKit"

type TeamLite = { abbr: string; nick: string; name: string; division: string; conference: string; color: string }

type Props = {
	rows: BoardRow[]
	teams: TeamLite[]
	n: number
	/** Changes when the data does, so a new share card is fetched. */
	stamp: number
}

type SortKey = "composite" | "off" | "def" | GroupKey
const ALL = "All teams"

/** A cell's background: the Lab's team color for a top rank, its warning color for a bottom one, nothing in the middle. */
function cellStyle(rank: number | null | undefined, n: number): React.CSSProperties {
	const h = heat(rank ?? undefined, n)
	if (h === null) return {}
	const strength = Math.abs(h - 0.5) * 2
	const pct = Math.round(strength * 38)
	if (pct < 4) return {}
	return { background: `color-mix(in srgb, ${h > 0.5 ? "var(--lab-team)" : "var(--lab-bad)"} ${pct}%, transparent)` }
}

const rankOf = (r: BoardRow, key: SortKey): number => (key === "composite" ? r.compositeRank : key === "off" ? (r.off ?? 99) : key === "def" ? (r.def ?? 99) : r.groups[key])

export default function TeamBoard({ rows, teams, n, stamp }: Props) {
	const [sort, setSort] = React.useState<SortKey>("composite")
	const [filter, setFilter] = React.useState<string>(ALL)
	const [left, setLeft] = React.useState("LV")
	const [right, setRight] = React.useState("")

	const info = React.useMemo(() => new Map(teams.map((t) => [t.abbr, t])), [teams])
	const filters = React.useMemo(() => [ALL, "AFC", "NFC", ...Array.from(new Set(teams.map((t) => t.division)))], [teams])

	// A shared link carries the sort, the group of teams and the team in the query; this reads them once the page is up.
	React.useEffect(() => {
		const q = new URLSearchParams(window.location.search)
		const sortParam = q.get("sort")
		const show = q.get("show")
		const team = q.get("team")
		if (sortParam && (BOARD_SORTS as readonly string[]).includes(sortParam)) setSort(sortParam as SortKey)
		if (show && filters.includes(show) && show !== ALL) setFilter(show)
		if (team && info.has(team)) setLeft(team)
	}, [filters, info])
	const shown = rows
		.filter((r) => {
			const t = info.get(r.abbr)
			if (!t) return false
			return filter === ALL || t.conference === filter || t.division === filter
		})
		.sort((a, b) => rankOf(a, sort) - rankOf(b, sort) || a.abbr.localeCompare(b.abbr))

	const options = [...teams].sort((a, b) => a.name.localeCompare(b.name))
	const shareQuery = boardQuery({ sort, show: filter === ALL ? null : filter, team: left })
	const nick = (abbr: string) => info.get(abbr)?.nick ?? abbr
	const pair = left && right && left !== right ? matchupPath(left, right) : null

	const head = (key: SortKey, label: string, sub?: string) => (
		<th key={key} scope="col" className="p-0 text-center align-bottom" aria-sort={sort === key ? "ascending" : "none"}>
			<button
				type="button"
				onClick={() => setSort(key)}
				className={`flex min-h-[44px] w-full flex-col items-center justify-end px-1.5 pb-2 pt-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] hover:text-lab-ink sm:text-[11px] ${sort === key ? "text-lab-ink" : "text-lab-muted"}`}
			>
				{sub ? <span className="text-[9px] font-medium tracking-[0.12em] text-lab-muted">{sub}</span> : null}
				<span>{label}</span>
				<span aria-hidden="true" className={`mt-0.5 block h-0.5 w-5 rounded-full ${sort === key ? "bg-lab-ink" : "bg-transparent"}`} />
			</button>
		</th>
	)

	return (
		<div>
			<div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-4">
				<label className="block text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">
					Show
					<select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 block min-h-[44px] rounded-lg border border-lab-line bg-lab-surface px-3 text-sm font-semibold normal-case tracking-normal text-lab-ink">
						{filters.map((f) => (
							<option key={f} value={f}>
								{f}
							</option>
						))}
					</select>
				</label>
				<div className="flex flex-wrap items-end gap-3">
					<label className="block text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">
						Compare
						<select value={left} onChange={(e) => setLeft(e.target.value)} className="mt-1 block min-h-[44px] rounded-lg border border-lab-line bg-lab-surface px-3 text-sm font-semibold normal-case tracking-normal text-lab-ink">
							{options.map((t) => (
								<option key={t.abbr} value={t.abbr}>
									{t.name}
								</option>
							))}
						</select>
					</label>
					<label className="block text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">
						with
						<select value={right} onChange={(e) => setRight(e.target.value)} className="mt-1 block min-h-[44px] rounded-lg border border-lab-line bg-lab-surface px-3 text-sm font-semibold normal-case tracking-normal text-lab-ink">
							<option value="">Pick a team</option>
							{options
								.filter((t) => t.abbr !== left)
								.map((t) => (
									<option key={t.abbr} value={t.abbr}>
										{t.name}
									</option>
								))}
						</select>
					</label>
					{pair ? (
						<>
							<Link href={pair} className="inline-flex min-h-[44px] items-center rounded-lg bg-lab-ink px-5 text-sm font-bold text-lab-page transition hover:opacity-90">
								See the matchup &rarr;
							</Link>
							<ShareCard
								target={{ type: "matchup", query: matchupQuery(left, right, "overview"), sharePath: MATCHUP_SHARE_PATH, name: `${nick(left)} vs ${nick(right)}`, file: `raiders-rundown-${left.toLowerCase()}-vs-${right.toLowerCase()}-matchup` }}
								stamp={stamp}
								label="Share matchup"
								text={`${nick(left)} vs ${nick(right)}, position group by position group.`}
								alt={`${nick(left)} vs ${nick(right)}: how the position groups stack up, with a radar of both teams`}
							/>
						</>
					) : (
						<span className="inline-flex min-h-[44px] items-center text-xs text-lab-muted">Pick two teams to see them side by side.</span>
					)}
				</div>
			</div>

			<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
				<p className="m-0 text-xs text-lab-muted">
					Sorted by {sort === "composite" ? "overall grade" : sort === "off" ? "offense" : sort === "def" ? "defense" : GROUPS[sort].label.toLowerCase()}
					{filter === ALL ? "" : `, ${filter} only`}.
				</p>
				<ShareCard
					target={{ type: "board", query: shareQuery, sharePath: BOARD_SHARE_PATH, name: filter === ALL ? "The league board" : `The ${filter} board`, file: `raiders-rundown-position-groups${filter === ALL ? "" : `-${filter.toLowerCase().replace(/\s+/g, "-")}`}${sort === "composite" ? "" : `-${sort}`}` }}
					stamp={stamp}
					text={`How ${filter === ALL ? "all 32 NFL teams" : `the ${filter}`} stack up, position group by position group.`}
					alt={`${filter === ALL ? "Every team" : `The ${filter}`} ranked at each position group, as a heat map`}
				/>
			</div>
			<div className="overflow-x-auto rounded-2xl border border-lab-line">
				<table className="w-full min-w-[46rem] border-collapse text-sm">
					<caption className="sr-only">Every team ranked at each position group. 1st is best. Select a column heading to sort by it.</caption>
					<thead>
						<tr className="border-b border-lab-line bg-lab-tint">
							<th scope="col" className="sticky left-0 z-10 bg-lab-tint p-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">
								Team
							</th>
							<th scope="col" className="p-2 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-lab-muted">
								Record
							</th>
							{head("composite", "All", "Overall")}
							{head("off", "Off", "Per play")}
							{head("def", "Def", "Per play")}
							{GROUP_ORDER.map((g) => head(g, GROUPS[g].short, GROUPS[g].side === "off" ? "Offense" : "Defense"))}
						</tr>
					</thead>
					<tbody className="divide-y divide-lab-line">
						{shown.map((r) => {
							const t = info.get(r.abbr)!
							const raiders = r.abbr === "LV"
							return (
								<tr key={r.abbr} className={raiders ? "bg-lab-tint" : ""}>
									<th scope="row" className={`sticky left-0 z-10 whitespace-nowrap p-0 text-left font-semibold ${raiders ? "bg-lab-tint" : "bg-lab-page"}`}>
										{raiders ? (
											<span className="flex min-h-[44px] items-center gap-2 px-3">
												<span className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden="true" />
												{t.nick}
											</span>
										) : (
											<Link href={matchupPath("LV", r.abbr)} className="flex min-h-[44px] items-center gap-2 px-3 hover:text-lab-ink" title={`Raiders vs ${t.nick}`}>
												<span className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden="true" />
												{t.nick}
											</Link>
										)}
									</th>
									<td className="p-2 text-center font-mono text-xs tabular-nums text-lab-soft">{r.record}</td>
									{([["composite", r.compositeRank], ["off", r.off], ["def", r.def]] as const).map(([k, v]) => (
										<td key={k} className="p-1 text-center" style={cellStyle(v, n)}>
											<span className="font-mono text-xs font-semibold tabular-nums" title={v ? ordinal(v) : ""}>
												{v ?? "–"}
											</span>
										</td>
									))}
									{GROUP_ORDER.map((g) => (
										<td key={g} className="p-1 text-center" style={cellStyle(r.groups[g], n)}>
											<span className="font-mono text-xs font-semibold tabular-nums" title={`${t.nick} ${GROUPS[g].label.toLowerCase()}: ${ordinal(r.groups[g])}`}>
												{r.groups[g]}
											</span>
										</td>
									))}
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
			<div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-lab-muted">
				<span>Numbers are league ranks out of {n}; 1 is best.</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="block h-3 w-6 rounded-sm" style={{ background: "color-mix(in srgb, var(--lab-team) 38%, transparent)" }} aria-hidden="true" /> top of the league
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span className="block h-3 w-6 rounded-sm" style={{ background: "color-mix(in srgb, var(--lab-bad) 38%, transparent)" }} aria-hidden="true" /> bottom of the league
				</span>
			</div>
		</div>
	)
}
