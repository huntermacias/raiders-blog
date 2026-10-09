"use client"

import { divisionShort, oddsText, ordinal } from "@/lib/playoffs/format"
import { recordText } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import { standingLabel } from "@/lib/playoffs/summary"
import { teamByAbbr } from "@/lib/nfl"
import { accentStyle } from "./accent"
import type { TeamOdds } from "./useOdds"

function Stat({ label, value, sub, small, busy }: { label: string; value: string; sub?: string; small?: boolean; busy?: boolean }) {
	return (
		<div className="min-w-0">
			<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{label}</dt>
			<dd className={`m-0 mt-1 font-serif font-bold leading-tight transition-opacity ${busy ? "opacity-50" : ""} ${small ? "text-lg sm:text-2xl" : "text-2xl sm:text-3xl"}`}>{value}</dd>
			{sub ? <p className="m-0 mt-0.5 text-xs text-lab-muted">{sub}</p> : null}
		</div>
	)
}

/** Everything here is read from the simulation and the odds run. Nothing is typed in. */
export default function TeamOutlook({ sim, team, picked, odds, working }: { sim: SimulationResult; team: string; picked: number; odds: TeamOdds | null; working: boolean }) {
	const t = sim.teams[team]
	if (!t) return null
	const info = teamByAbbr(team)
	const seed = t.seed ? `#${t.seed}` : "Out"
	const mine = odds?.base.teams[team]
	return (
		<section aria-labelledby="team-outlook" className="lab-opp rounded-2xl border border-lab-ink bg-lab-surface p-4 sm:p-5" style={{ ...accentStyle(team), boxShadow: "inset 0 4px 0 var(--pm-accent)" }}>
			<h2 id="team-outlook" className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-lab-soft">
				{info.nick} playoff outlook
			</h2>
			<dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 sm:gap-6">
				<Stat label="Projected record" value={recordText(t.overall)} sub={t.openGames ? `${t.openGames} left to pick` : "Season complete"} />
				<Stat label={`${t.conference} seed`} value={seed} sub={`${divisionShort(t.division)}: ${ordinal(t.divisionRank)}`} />
				<Stat label="Status" value={standingLabel(t)} small />
				<Stat label="Playoff odds" value={oddsText(mine?.playoffs, odds?.base.exact)} sub={odds ? (odds.base.exact ? "Final for this scenario" : `From ${odds.base.sims.toLocaleString("en-US")} simulated seasons`) : "Working it out…"} busy={working} />
			</dl>
			{picked === 0 ? <p className="m-0 mt-3 text-xs text-lab-muted">This is the table with the games played so far. Pick winners to see how the {info.nick}&rsquo; outlook changes.</p> : null}
		</section>
	)
}
