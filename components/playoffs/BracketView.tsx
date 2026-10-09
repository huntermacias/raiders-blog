"use client"

import { recordText } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import type { Conference } from "@/lib/playoffs/types"
import { teamByAbbr } from "@/lib/nfl"

function Side({ seed, id, sim, raiders }: { seed: number; id: string; sim: SimulationResult; raiders: boolean }) {
	const info = teamByAbbr(id)
	const t = sim.teams[id]
	const me = raiders && id === "LV"
	return (
		<div className={`flex items-center gap-3 px-3.5 py-3 ${me ? "bg-lab-hover" : ""}`} style={me ? { boxShadow: "inset 4px 0 0 var(--lab-team)" } : undefined}>
			<span className="w-5 text-center font-mono text-sm font-bold tabular-nums text-lab-muted">{seed}</span>
			<span className="block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: info.color }} aria-hidden="true" />
			<span className="font-serif text-xl font-bold leading-none">{id}</span>
			<span className="truncate text-xs text-lab-muted">{info.nick}</span>
			<span className="ml-auto font-mono text-sm tabular-nums text-lab-soft">{recordText(t.overall)}</span>
		</div>
	)
}

export default function BracketView({ sim, conference, raiders }: { sim: SimulationResult; conference: Conference; raiders: boolean }) {
	const b = sim.bracket[conference]
	return (
		<div>
			<h3 className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">{conference} wild-card round</h3>
			<ol className="m-0 mt-3 list-none space-y-3 p-0">
				{b.wildCard.map((g) => (
					<li key={g.homeSeed} className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface">
						<p className="sr-only">
							Seed {g.awaySeed} {teamByAbbr(g.away).name} at seed {g.homeSeed} {teamByAbbr(g.home).name}
						</p>
						<div aria-hidden="true" className="divide-y divide-lab-line">
							<Side seed={g.awaySeed} id={g.away} sim={sim} raiders={raiders} />
							<div className="bg-lab-tint px-3.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">at</div>
							<Side seed={g.homeSeed} id={g.home} sim={sim} raiders={raiders} />
						</div>
					</li>
				))}
			</ol>
			{b.byes.map((bye) => (
				<div key={bye.seed} className="mt-3 overflow-hidden rounded-2xl border border-dashed border-lab-line-strong bg-lab-surface">
					<Side seed={bye.seed} id={bye.team} sim={sim} raiders={raiders} />
					<p className="m-0 border-t border-lab-line bg-lab-tint px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">First-round bye</p>
				</div>
			))}
			<p className="mt-3 text-xs leading-relaxed text-lab-muted">
				After the first round the NFL reseeds: the best seed left hosts the lowest, and the next best hosts the next lowest. The bracket is drawn from the picks you have made
				so far; games you have not picked do not count yet.
			</p>
		</div>
	)
}
