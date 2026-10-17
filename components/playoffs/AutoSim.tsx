"use client"

import { Dices, Sparkles } from "lucide-react"

import { teamByAbbr } from "@/lib/nfl"
import { btn, btnSm } from "./ui"

type Props = {
	week: number
	team: string
	openLeft: number
	/** The sim number that "Simulate" will use next. Shown so a reader can tell two runs apart and repeat one. */
	simNumber: number
	onSimulate: (scope: "week" | "rest", rule: "model" | "favorites") => void
	onHome: () => void
	onTeam: (result: "W" | "L") => void
	onClearWeek: () => void
}

/** The quick ways to fill in games. Every one of them is just a set of picks the reader can edit, undo and share. */
export default function AutoSim({ week, team, openLeft, simNumber, onSimulate, onHome, onTeam, onClearWeek }: Props) {
	const nick = teamByAbbr(team).nick
	return (
		<section aria-label="Simulate games" className="rounded-xl border border-lab-line bg-lab-surface p-3">
			<div className="flex flex-wrap items-center gap-2">
				<button type="button" className={`${btn} !bg-lab-ink !text-lab-page hover:!bg-lab-ink`} onClick={() => onSimulate("rest", "model")} disabled={openLeft === 0}>
					<Dices className="h-4 w-4" aria-hidden="true" />
					Simulate the rest of the season
				</button>
				<button type="button" className={btn} onClick={() => onSimulate("week", "model")} disabled={openLeft === 0}>
					Simulate Week {week}
				</button>
				<span className="font-mono text-[11px] text-lab-muted" title="Each sim number is one repeatable season. Press Simulate again for the next one.">
					sim #{simNumber}
				</span>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-1.5">
				<span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">Presets</span>
				<button type="button" className={btnSm} onClick={() => onTeam("W")}>
					{nick} win out
				</button>
				<button type="button" className={btnSm} onClick={() => onTeam("L")}>
					{nick} lose out
				</button>
				<button type="button" className={btnSm} onClick={() => onSimulate("rest", "favorites")} title="Every game goes to the team the model favors">
					<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
					Favorites win
				</button>
				<button type="button" className={btnSm} onClick={onHome}>
					Home teams win
				</button>
				<button type="button" className={btnSm} onClick={onClearWeek}>
					Clear Week {week}
				</button>
			</div>
			<p className="m-0 mt-2 text-[11px] leading-relaxed text-lab-muted">
				Simulated games are weighted by each team&rsquo;s Elo rating from this season&rsquo;s scores, with a home edge. No injuries, no spread, no ties. Your own picks always stay; the next simulation re-rolls only the games an earlier one filled in.
			</p>
		</section>
	)
}
