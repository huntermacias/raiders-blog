"use client"

import { divisionShort } from "@/lib/playoffs/format"
import { recordText } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import { describeTie, standingLabel } from "@/lib/playoffs/summary"
import type { Conference } from "@/lib/playoffs/types"
import { teamByAbbr } from "@/lib/nfl"

type Props = {
	sim: SimulationResult
	conference: Conference
	raiders: boolean
	rivals: ReadonlySet<string>
}

const NUMBER_ONE = "No. 1 seed, first-round bye"

export default function StandingsTable({ sim, conference, raiders, rivals }: Props) {
	const table = sim.conferences[conference].table
	const inConf = new Set(table)
	const ties = sim.ties.filter((d) => inConf.has(d.placed))

	return (
		<div>
			<div className="overflow-hidden rounded-2xl border border-lab-line">
				<table className="w-full border-collapse text-sm">
					<caption className="sr-only">
						{conference} projected standings. Seeds 1 to 4 are division leaders, seeds 5 to 7 are wild cards, and the rest are outside the playoff line.
					</caption>
					<thead>
						<tr className="border-b border-lab-line bg-lab-tint text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
							<th scope="col" className="w-9 p-2 text-center">
								Seed
							</th>
							<th scope="col" className="p-2 text-left">
								Team
							</th>
							<th scope="col" className="p-2 text-right">
								W-L-T
							</th>
							<th scope="col" className="hidden p-2 text-right sm:table-cell">
								Div
							</th>
							<th scope="col" className="hidden p-2 text-right sm:table-cell">
								Conf
							</th>
						</tr>
					</thead>
					<tbody>
						{table.map((id, i) => {
							const t = sim.teams[id]
							const info = teamByAbbr(id)
							const me = raiders && id === "LV"
							const rival = raiders && rivals.has(id)
							const out = t.eliminated
							return (
								<RowGroup key={id} showFourLine={i === 4} showPlayoffLine={i === 7}>
									<tr
										className={`border-b border-lab-line last:border-b-0 ${me ? "bg-lab-hover" : rival ? "bg-lab-tint" : ""} ${out ? "text-lab-muted" : ""}`}
										style={me ? { boxShadow: "inset 4px 0 0 var(--lab-team)" } : undefined}
									>
										<td className="p-2 text-center font-mono text-sm font-bold tabular-nums">
											{t.seed ?? <span className="text-lab-muted">&ndash;</span>}
											{t.seed === 1 ? <span className="sr-only"> ({NUMBER_ONE})</span> : null}
										</td>
										<td className="p-2">
											<div className="flex items-center gap-2">
												<span className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: info.color }} aria-hidden="true" />
												<span className={`font-semibold ${me ? "text-lab-ink" : ""}`}>
													<span className="sm:hidden">{id}</span>
													<span className="hidden sm:inline">{info.nick}</span>
												</span>
												{me ? <span className="rounded-sm bg-lab-ink px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-lab-page">Raiders</span> : rival ? <span className="rounded-sm border border-lab-line-strong px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-lab-soft">Rival</span> : null}
											</div>
											<div className="mt-0.5 pl-[18px] text-[11px] leading-snug text-lab-muted">
												{divisionShort(t.division)} &middot; <span className={t.eliminated ? "" : "text-lab-soft"}>{standingLabel(t)}</span>
											</div>
										</td>
										<td className="p-2 text-right font-mono text-sm tabular-nums">{recordText(t.overall)}</td>
										<td className="hidden p-2 text-right font-mono text-xs tabular-nums text-lab-soft sm:table-cell">{recordText(t.divisionRecord)}</td>
										<td className="hidden p-2 text-right font-mono text-xs tabular-nums text-lab-soft sm:table-cell">{recordText(t.conferenceRecord)}</td>
									</tr>
								</RowGroup>
							)
						})}
					</tbody>
				</table>
			</div>

			<p className="mt-3 text-xs leading-relaxed text-lab-muted">
				Seeds 1 to 4 are the division leaders; 5 to 7 are the wild cards. A division leader is seeded above a wild card even with a worse record. &ldquo;Clinched&rdquo; and
				&ldquo;Eliminated&rdquo; appear only when they are certain without needing a tiebreaker, so a team can be safe a little before the table says so.
			</p>

			{ties.length ? (
				<details className="mt-3 rounded-xl border border-lab-line bg-lab-surface p-3 text-sm">
					<summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-lab-soft">How {ties.length === 1 ? "a tie was" : `${ties.length} ties were`} settled</summary>
					<ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-lab-soft">
						{ties.map((d, i) => (
							<li key={i}>{describeTie(d)}</li>
						))}
					</ul>
				</details>
			) : null}
		</div>
	)
}

/** A table row with an optional heading row before it, to mark where the division leaders end and where the playoff line falls. */
function RowGroup({ children, showFourLine, showPlayoffLine }: { children: React.ReactNode; showFourLine: boolean; showPlayoffLine: boolean }) {
	return (
		<>
			{showFourLine ? (
				<tr aria-hidden="true">
					<td colSpan={5} className="border-y border-lab-line bg-lab-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">
						Wild cards
					</td>
				</tr>
			) : null}
			{showPlayoffLine ? (
				<tr aria-hidden="true">
					<td colSpan={5} className="border-y-2 border-lab-ink bg-lab-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-lab-ink">
						Playoff line &middot; outside the playoffs
					</td>
				</tr>
			) : null}
			{children}
		</>
	)
}
