"use client"

import { useEffect, useMemo, useRef } from "react"
import { ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react"

import type { WeekProgress } from "@/lib/playoffs/picks"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import type { Game, Outcome, Predictions } from "@/lib/playoffs/types"
import GameTile from "./GameTile"
import { btnSm, focusRing } from "./ui"

type Props = {
	games: readonly Game[]
	week: number
	setWeek: (w: number) => void
	progress: WeekProgress[]
	picks: Predictions
	simulated: ReadonlySet<string>
	sim: SimulationResult
	chances: Record<string, number>
	onPick: (id: string, outcome: Outcome) => void
	team: string | null
	throughWeek: number
}

/** One week at a time as a compact grid, with a strip of all the weeks that never needs a long scroll. */
export default function WeekView({ games, week, setWeek, progress, picks, simulated, sim, chances, onPick, team, throughWeek }: Props) {
	const strip = useRef<HTMLDivElement>(null)
	const weeks = progress.map((w) => w.week)
	const idx = weeks.indexOf(week)
	const current = progress[idx]
	const list = useMemo(() => {
		const mine = (g: Game) => (team && (g.homeTeam === team || g.awayTeam === team) ? 0 : 1)
		return games.filter((g) => g.week === week).sort((a, b) => mine(a) - mine(b) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) || a.id.localeCompare(b.id))
	}, [games, week, team])
	const nextOpen = progress.find((w) => w.week > week && w.open > 0) ?? progress.find((w) => w.open > 0)

	useEffect(() => {
		strip.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "center" })
	}, [week])

	// Left and right arrows move through the weeks when the week strip has focus.
	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowRight" && idx < weeks.length - 1) setWeek(weeks[idx + 1])
		else if (e.key === "ArrowLeft" && idx > 0) setWeek(weeks[idx - 1])
		else return
		e.preventDefault()
	}

	return (
		<div>
			<div className="flex items-center gap-2">
				<button type="button" className={`${btnSm} !w-9 !px-0`} onClick={() => idx > 0 && setWeek(weeks[idx - 1])} disabled={idx <= 0} aria-label="Previous week">
					<ChevronLeft className="h-4 w-4" aria-hidden="true" />
				</button>
				<div ref={strip} role="group" aria-label="Choose a week" onKeyDown={onKey} className="flex min-w-0 flex-1 snap-x gap-1 overflow-x-auto pb-1">
					{progress.map((p) => {
						const done = p.played === p.total
						const full = p.open === 0
						return (
							<button
								key={p.week}
								type="button"
								aria-current={p.week === week ? "true" : undefined}
								aria-label={`Week ${p.week}${done ? ", played" : full ? ", all picked" : `, ${p.open} left to pick`}`}
								onClick={() => setWeek(p.week)}
								className={`relative min-h-[40px] min-w-[40px] shrink-0 snap-center rounded-md border px-1.5 text-sm font-bold tabular-nums transition ${focusRing} ${
									p.week === week ? "border-lab-ink bg-lab-ink text-lab-page" : done ? "border-lab-line text-lab-muted hover:text-lab-ink" : full ? "border-lab-line-strong bg-lab-tint text-lab-ink" : "border-lab-line bg-lab-surface text-lab-ink hover:border-lab-line-strong"
								}`}
							>
								{p.week}
								{!done && p.picked > 0 ? <span className="absolute bottom-0.5 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-current opacity-60" style={{ width: `${Math.round((p.picked / Math.max(1, p.total - p.played)) * 70)}%` }} aria-hidden="true" /> : null}
							</button>
						)
					})}
				</div>
				<button type="button" className={`${btnSm} !w-9 !px-0`} onClick={() => idx < weeks.length - 1 && setWeek(weeks[idx + 1])} disabled={idx >= weeks.length - 1} aria-label="Next week">
					<ChevronRight className="h-4 w-4" aria-hidden="true" />
				</button>
			</div>

			<div className="mt-3 flex flex-wrap items-center justify-between gap-2">
				<h3 className="m-0 font-serif text-xl font-bold">
					Week {week}
					<span className="ml-2 font-sans text-xs font-normal text-lab-muted">{current ? (current.played === current.total ? "all played" : `${current.played} played · ${current.picked} picked · ${current.open} open`) : ""}</span>
				</h3>
				{nextOpen && nextOpen.week !== week ? (
					<button type="button" className={btnSm} onClick={() => setWeek(nextOpen.week)}>
						Next unpicked: Week {nextOpen.week}
						<ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
					</button>
				) : null}
			</div>
			{week <= throughWeek && current && current.played > 0 ? <p className="m-0 mt-1 text-xs text-lab-muted">Played games are locked to their real score.</p> : null}

			<ul className="m-0 mt-3 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
				{list.map((g) => (
					<li key={g.id} className="min-w-0">
						<GameTile game={g} pick={picks[g.id]} simulated={simulated.has(g.id)} sim={sim} homeChance={chances[g.id]} onPick={onPick} team={team} />
					</li>
				))}
			</ul>
			<p className="m-0 mt-3 text-[11px] leading-relaxed text-lab-muted">
				Solid = your pick. Dashed = simulated. The percent is the model&rsquo;s win chance, from this season&rsquo;s scores. Arrow keys move between the two teams; Enter picks.
			</p>
		</div>
	)
}
