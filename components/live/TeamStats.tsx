"use client"

import * as React from "react"

import type { Side } from "@/lib/live/colors"
import type { LiveGame } from "@/lib/live/types"

const number = (s: string): number | null => {
	const n = Number(s.replace(/[^0-9.\-]/g, ""))
	return /^\d/.test(s.trim()) && Number.isFinite(n) ? n : null
}

/** Team stats side by side, with a split bar where both numbers are plain counts. */
export default function TeamStats({ game, away, home }: { game: LiveGame; away: Side; home: Side }) {
	if (game.stats.length === 0) return null
	return (
		<div>
			<div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">
				<span>{away.abbr}</span>
				<span>Team stats</span>
				<span>{home.abbr}</span>
			</div>
			<ul className="mt-3 space-y-3">
				{game.stats.map((s) => {
					const a = number(s.away)
					const h = number(s.home)
					const splittable = a != null && h != null && !s.away.includes(":") && !s.away.includes("-") && a + h > 0
					return (
						<li key={s.label}>
							<div className="flex items-baseline justify-between text-sm">
								<span className="font-mono font-semibold tabular-nums">{s.away}</span>
								<span className="text-xs text-lab-muted">{s.label}</span>
								<span className="font-mono font-semibold tabular-nums">{s.home}</span>
							</div>
							{splittable && (
								<div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
									<span style={{ width: `${(a! / (a! + h!)) * 100}%`, background: away.fill }} />
									<span style={{ width: `${(h! / (a! + h!)) * 100}%`, background: home.fill }} />
								</div>
							)}
						</li>
					)
				})}
			</ul>
		</div>
	)
}
