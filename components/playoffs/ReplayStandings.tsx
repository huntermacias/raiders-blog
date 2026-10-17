"use client"

import { teamByAbbr } from "@/lib/nfl"
import { recordText } from "@/lib/playoffs/season"
import type { Frame } from "@/lib/playoffs/timeline"
import type { Conference } from "@/lib/playoffs/types"

const ROW = 34

function status(t: Frame["teams"][string]): { mark: string; text: string } | null {
	if (t.clinchedTopSeed) return { mark: "z", text: "Clinched the No. 1 seed" }
	if (t.clinchedDivision) return { mark: "y", text: "Clinched the division" }
	if (t.clinchedPlayoff) return { mark: "x", text: "Clinched a playoff berth" }
	if (t.eliminated) return { mark: "e", text: "Eliminated" }
	return null
}

type Props = {
	frame: Frame
	previous: Frame | null
	conference: Conference
	spotlight: ReadonlySet<string>
	hovered: string | null
	onToggle: (team: string) => void
	onHover: (team: string | null) => void
	reduced: boolean
	divisions: ReadonlySet<string> | null
}

/**
 * The table for the week on screen. Rows keep their place in the page and slide to their new spot, so nothing is
 * re-created between weeks. The animated list is hidden from screen readers; an ordinary table with the same rows,
 * in table order, takes its place.
 */
export default function ReplayStandings({ frame, previous, conference, spotlight, hovered, onToggle, onHover, reduced, divisions }: Props) {
	const order = frame.order[conference]
	const stable = [...order].sort()
	const lineAfter = frame.seeds[conference].length

	return (
		<div>
			<div aria-hidden="true" className="relative overflow-hidden rounded-xl border border-lab-line" style={{ height: order.length * ROW }}>
				{stable.map((id) => {
					const t = frame.teams[id]
					const i = order.indexOf(id)
					const moved = previous ? previous.order[conference].indexOf(id) - i : 0
					const s = status(t)
					const dim = divisions && !divisions.has(t.division)
					return (
						<button
							key={id}
							type="button"
							tabIndex={-1}
							onClick={() => onToggle(id)}
							onPointerEnter={() => onHover(id)}
							onPointerLeave={() => onHover(null)}
							className={`absolute left-0 right-0 flex items-center gap-2 px-2.5 text-left text-sm ${spotlight.has(id) || hovered === id ? "bg-lab-tint" : "bg-lab-surface"} ${dim ? "opacity-35" : ""}`}
							style={{ height: ROW, transform: `translateY(${i * ROW}px)`, transition: reduced ? undefined : "transform 420ms cubic-bezier(.2,.8,.2,1), background-color 150ms" }}
						>
							<span className={`w-6 shrink-0 text-center font-mono text-xs font-bold ${t.seed ? "text-lab-ink" : "text-lab-muted"}`}>{t.seed ?? i + 1}</span>
							<span className="block h-4 w-1.5 shrink-0 rounded-full" style={{ background: teamByAbbr(id).color }} />
							<span className="w-10 shrink-0 font-bold">{id}</span>
							<span className="font-mono text-xs tabular-nums text-lab-soft">{recordText(t.record)}</span>
							<span className="ml-auto flex items-center gap-2">
								{s ? <span className="rounded border border-lab-line-strong px-1 font-mono text-[10px] font-bold" title={s.text}>{s.mark}</span> : null}
								<span className={`w-7 text-right font-mono text-[11px] ${moved > 0 ? "text-lab-ink" : moved < 0 ? "text-lab-muted" : "text-transparent"}`}>{moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "·"}</span>
							</span>
						</button>
					)
				})}
				{/* the playoff line: below the seventh row */}
				<div className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-lab-ink" style={{ transform: `translateY(${lineAfter * ROW}px)` }} />
			</div>
			<p aria-hidden="true" className="m-0 mt-1.5 text-[11px] text-lab-muted">
				Dashed line = last playoff spot. z = No. 1 seed clinched · y = division · x = berth · e = eliminated. Click a team to follow it.
			</p>
			<table className="sr-only">
				<caption>
					{conference} standings after week {frame.week}. The first seven teams are in the playoffs.
				</caption>
				<thead>
					<tr>
						<th scope="col">Rank</th>
						<th scope="col">Team</th>
						<th scope="col">Record</th>
						<th scope="col">Seed</th>
						<th scope="col">Status</th>
					</tr>
				</thead>
				<tbody>
					{order.map((id, i) => (
						<tr key={id}>
							<td>{i + 1}</td>
							<th scope="row">{teamByAbbr(id).name}</th>
							<td>{recordText(frame.teams[id].record)}</td>
							<td>{frame.teams[id].seed ?? "out of the seeds"}</td>
							<td>{status(frame.teams[id])?.text ?? ""}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
