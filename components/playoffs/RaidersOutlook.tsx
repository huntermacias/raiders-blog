"use client"

import { recordText } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import { scenarioSummary, standingLabel } from "@/lib/playoffs/summary"
import { divisionShort } from "@/lib/playoffs/format"

function Stat({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
	return (
		<div className="min-w-0">
			<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{label}</dt>
			<dd className={`m-0 mt-1 font-serif font-bold leading-tight ${small ? "text-lg sm:text-2xl" : "text-2xl sm:text-3xl"}`}>{value}</dd>
			{sub ? <p className="m-0 mt-0.5 text-xs text-lab-muted">{sub}</p> : null}
		</div>
	)
}

/** Everything here is read from the simulation. Nothing is typed in. */
export default function RaidersOutlook({ sim, picked }: { sim: SimulationResult; picked: number }) {
	const lv = sim.teams.LV
	const s = scenarioSummary(sim, "LV")
	if (!lv || !s) return null
	const seed = lv.seed ? `#${lv.seed}` : "Out"
	const status = standingLabel(lv)
	return (
		<section aria-labelledby="raiders-outlook" className="rounded-2xl border border-lab-ink bg-lab-surface p-4 sm:p-5" style={{ boxShadow: "inset 0 4px 0 var(--lab-team)" }}>
			<h2 id="raiders-outlook" className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-lab-soft">
				Raiders playoff outlook
			</h2>
			<dl className="m-0 mt-3 grid grid-cols-3 gap-3 sm:gap-6">
				<Stat label="Projected record" value={recordText(lv.overall)} sub={lv.openGames ? `${lv.openGames} left to pick` : "Season complete"} />
				<Stat label={`${lv.conference} seed`} value={seed} sub={`${divisionShort(lv.division)}: ${lv.divisionRank}${lv.divisionRank === 1 ? "st" : lv.divisionRank === 2 ? "nd" : lv.divisionRank === 3 ? "rd" : "th"}`} />
				<Stat label="Status" value={status} small />
			</dl>
			{picked === 0 ? <p className="m-0 mt-3 text-xs text-lab-muted">This is the table with the games played so far. Pick winners to see how the Raiders&rsquo; outlook changes.</p> : null}
		</section>
	)
}
