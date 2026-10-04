"use client"

import * as React from "react"

import { clockText, kickoffLabel, periodName } from "@/lib/live/format"
import type { LiveGameInfo } from "@/lib/live/types"

function label(g: LiveGameInfo): string {
	if (g.state === "in") return `${periodName(g.period)} ${clockText(g.clockSeconds)}`
	if (g.state === "post") return "Final"
	return kickoffLabel(g.kickoff)
}

/** A row of this week's games to switch between. Scrolls sideways on a phone. */
export default function GamePicker({ games, selected, onSelect }: { games: LiveGameInfo[]; selected: string; onSelect: (id: string) => void }) {
	if (games.length <= 1) return null
	return (
		<nav aria-label="This week's games" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
			<ul className="flex gap-2">
				{games.map((g) => {
					const active = g.id === selected
					return (
						<li key={g.id} className="shrink-0">
							<button
								type="button"
								onClick={() => onSelect(g.id)}
								aria-pressed={active}
								className={
									"flex min-w-[8.5rem] flex-col rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lab-ink " +
									(active ? "border-lab-line-strong bg-lab-hover" : "border-lab-line bg-lab-surface hover:bg-lab-tint")
								}
							>
								<span className="flex items-center justify-between gap-3 font-mono text-xs font-bold tabular-nums">
									<span>{g.away.abbr} {g.state === "pre" ? "" : g.away.score}</span>
									{g.state === "in" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-label="live" />}
								</span>
								<span className="font-mono text-xs font-bold tabular-nums">{g.home.abbr} {g.state === "pre" ? "" : g.home.score}</span>
								<span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{label(g)}</span>
							</button>
						</li>
					)
				})}
			</ul>
		</nav>
	)
}
