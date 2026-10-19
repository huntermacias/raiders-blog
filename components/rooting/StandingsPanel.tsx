"use client"

import { useId, useState } from "react"

import Link from "@/components/SiteLink"
import { TeamBadge } from "@/components/rooting/parts"
import { pctText } from "@/lib/rooting/guide"
import { guidePath } from "@/lib/rooting/share"
import { EXTRAS, type Extra, type Scope, type TableRow, extraText, rowsFor } from "@/lib/rooting/table"
import type { Goal } from "@/lib/rooting/types"

type Props = {
	rows: TableRow[]
	team: string
	goal: Goal
	goalShort: string
	week: number | null
	color: string
}

const SCOPES: { key: Scope; label: string }[] = [
	{ key: "division", label: "Division" },
	{ key: "conference", label: "Conference" },
	{ key: "league", label: "League" },
]

/**
 * The table beside the games on a wide screen: where the followed team sits in its division, its conference or the league, each team's
 * chance at the chosen goal, and one more number from the Lab to compare them on. Tabs and the column choice are plain buttons, nothing
 * is fetched, and every team in it links to its own guide. Hidden on a phone, where the list of games is the page.
 */
export default function StandingsPanel({ rows, team, goal, goalShort, week, color }: Props) {
	const [scope, setScope] = useState<Scope>("conference")
	const [extra, setExtra] = useState<Extra>("wins")
	const id = useId()
	const shown = rowsFor(rows, team, scope)
	const extraInfo = EXTRAS.find((e) => e.key === extra) ?? EXTRAS[0]
	const rankKey = scope === "division" ? "divRank" : scope === "conference" ? "confRank" : "leagueRank"
	const me = rows.find((r) => r.team === team)

	const moveTab = (e: React.KeyboardEvent, i: number) => {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
		e.preventDefault()
		const next = SCOPES[(i + (e.key === "ArrowRight" ? 1 : SCOPES.length - 1)) % SCOPES.length]
		setScope(next.key)
		document.getElementById(`${id}-tab-${next.key}`)?.focus()
	}

	return (
		<aside aria-labelledby={`${id}-h`} className="hidden self-start rounded-2xl border border-lab-line bg-lab-surface lg:sticky lg:top-28 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
			<div className="border-b border-lab-line px-4 pb-3 pt-4">
				<h2 id={`${id}-h`} className="m-0 font-serif text-xl font-bold">
					The race{week ? `, Week ${week}` : ""}
				</h2>
				<div role="tablist" aria-label="Which teams to compare" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-lab-tint p-1">
					{SCOPES.map((s, i) => {
						const on = s.key === scope
						return (
							<button
								key={s.key}
								id={`${id}-tab-${s.key}`}
								role="tab"
								type="button"
								aria-selected={on}
								aria-controls={`${id}-panel`}
								tabIndex={on ? 0 : -1}
								onClick={() => setScope(s.key)}
								onKeyDown={(e) => moveTab(e, i)}
								className={`rounded-lg px-2 py-1 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink ${on ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}
							>
								{s.label}
							</button>
						)
					})}
				</div>
			</div>

			<div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${scope}`}>
				<table className="w-full border-collapse text-sm">
					<caption className="sr-only">
						{scope === "division" ? `${me?.division ?? "Division"}` : scope === "conference" ? `${me?.conference ?? ""} standings` : "League standings"}, with each team&rsquo;s chance to {goalShort.toLowerCase()} and {extraInfo.label.toLowerCase()}
					</caption>
					<thead>
						<tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-lab-muted">
							<th scope="col" className="w-8 py-2 pl-4 font-bold">
								<span className="sr-only">Rank</span>
								<span aria-hidden="true">#</span>
							</th>
							<th scope="col" className="py-2 font-bold">
								Team
							</th>
							<th scope="col" className="py-2 text-right font-bold">
								W-L
							</th>
							<th scope="col" className="py-2 pl-3 text-right font-bold">
								{goalShort}
							</th>
							<th scope="col" className="py-2 pl-3 pr-4 text-right font-bold">
								<span className="sr-only">{extraInfo.label}</span>
								<span aria-hidden="true">{extraInfo.label === "Projected wins" ? "Proj. W" : extraInfo.label === "Point diff" ? "Diff" : extraInfo.label === "Offense" ? "Off." : "Def."}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((r, i) => {
							const mine = r.team === team
							const cut = scope === "conference" && r.confRank === 7
							return (
								<tr key={r.team} className={`${mine ? "bg-lab-tint" : ""} ${cut ? "border-b-2 border-dashed border-lab-line-strong" : "border-b border-lab-line"}`} style={mine ? { boxShadow: `inset 4px 0 0 ${color}` } : undefined}>
									<td className="py-1 pl-4 align-middle font-mono text-xs tabular-nums text-lab-muted">{r[rankKey]}</td>
									<td className="py-1 align-middle">
										<Link href={guidePath({ team: r.team, goal })} scroll={false} aria-current={mine ? "true" : undefined} className="flex items-center gap-2 font-semibold text-lab-ink hover:underline">
											<TeamBadge abbr={r.team} size={22} />
											<span className="min-w-0 leading-tight">
												{r.nick}
												{scope === "conference" && r.seed ? <span className="ml-1.5 rounded bg-lab-ink px-1 py-px text-[10px] font-bold text-lab-page">{r.seed} seed</span> : null}
												{scope === "division" && r.divRank === 1 ? <span className="ml-1.5 rounded bg-lab-ink px-1 py-px text-[10px] font-bold text-lab-page">Leads</span> : null}
												{scope === "league" ? <span className="ml-1.5 text-[10px] font-bold text-lab-muted">{r.conference}</span> : null}
											</span>
										</Link>
									</td>
									<td className="py-1 text-right align-middle font-mono text-xs tabular-nums">{r.record}</td>
									<td className="py-1 pl-3 text-right align-middle">
										<span className="font-bold tabular-nums" title={r.oddsRange ? `${pctText(r.oddsRange[0])} to ${pctText(r.oddsRange[1])} if the model were refit` : undefined}>
											{pctText(r.odds)}
										</span>
										<span aria-hidden="true" className="mt-1 block h-1 w-full min-w-[44px] overflow-hidden rounded-full bg-lab-line">
											<span className={`block h-full rounded-full ${mine ? "" : "bg-lab-ink opacity-50"}`} style={{ width: `${Math.max(r.odds > 0 ? 3 : 0, Math.min(100, r.odds * 100))}%`, ...(mine ? { background: color } : {}) }} />
										</span>
									</td>
									<td className="py-1 pl-3 pr-4 text-right align-middle font-mono text-xs tabular-nums">{extraText(r, extra)}</td>
								</tr>
							)
						})}
					</tbody>
				</table>

				<div className="border-t border-lab-line px-4 pb-4 pt-3">
					<div role="group" aria-label="Number to compare on" className="flex flex-wrap gap-1.5">
						{EXTRAS.map((e) => (
							<button
								key={e.key}
								type="button"
								aria-pressed={e.key === extra}
								onClick={() => setExtra(e.key)}
								title={e.hint}
								className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink ${e.key === extra ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line text-lab-soft hover:border-lab-line-strong hover:text-lab-ink"}`}
							>
								{e.label}
							</button>
						))}
					</div>
					<p className="m-0 mt-2 text-[11px] leading-snug text-lab-muted">
						{extraInfo.hint}.{scope === "conference" ? " The dashed line is the playoff cut." : ""} {goalShort} is the model&rsquo;s estimate for the goal you picked.
					</p>
				</div>
			</div>
		</aside>
	)
}
