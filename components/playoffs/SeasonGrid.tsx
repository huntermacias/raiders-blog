"use client"

import { useMemo, useState } from "react"

import { teamByAbbr } from "@/lib/nfl"
import { NFL_LEAGUE, actualOutcome } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import type { Conference, Game, Outcome, Predictions } from "@/lib/playoffs/types"
import { focusRing, outcomeFor, resultFor } from "./ui"

type Props = {
	games: readonly Game[]
	picks: Predictions
	simulated: ReadonlySet<string>
	sim: SimulationResult
	onPick: (id: string, outcome: Outcome) => void
	onSet: (id: string, outcome: Outcome | null) => void
	team: string | null
}

const tone = (r: "W" | "L" | "T" | null, locked: boolean, simulated: boolean) =>
	locked
		? r === "W"
			? "bg-lab-tint text-lab-ink"
			: r === "L"
				? "bg-lab-surface text-lab-muted"
				: "bg-lab-surface text-lab-ink"
		: r === "W"
			? simulated
				? "border-dashed border-lab-ink bg-lab-tint text-lab-ink"
				: "border-lab-ink bg-lab-ink text-lab-page"
			: r === "L"
				? simulated
					? "border-dashed border-lab-line-strong bg-lab-surface text-lab-muted"
					: "border-lab-line-strong bg-lab-surface text-lab-muted line-through"
				: r === "T"
					? "border-lab-ink bg-lab-surface text-lab-ink"
					: "border-lab-line bg-lab-surface text-lab-ink hover:border-lab-line-strong hover:bg-lab-tint"

/**
 * Every team against every week on one screen. A cell is one team's game; tap it to cycle win, loss, open. A game is one
 * object, so the opponent's cell changes with it and the two teams can never disagree.
 */
export default function SeasonGrid({ games, picks, simulated, sim, onPick, onSet, team }: Props) {
	const [conference, setConference] = useState<Conference>(() => (team ? (NFL_LEAGUE.teams.find((t) => t.id === team)?.conference ?? "AFC") : "AFC"))
	const weeks = useMemo(() => Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b), [games])
	const cell = useMemo(() => {
		const m = new Map<string, Game>()
		for (const g of games) {
			m.set(`${g.homeTeam}:${g.week}`, g)
			m.set(`${g.awayTeam}:${g.week}`, g)
		}
		return m
	}, [games])
	const rows = sim.conferences[conference].table

	const cycle = (g: Game, id: string) => {
		const current = resultFor(g, id, picks[g.id])
		if (current === null) onPick(g.id, outcomeFor(g, id, "W"))
		else if (current === "W") onPick(g.id, outcomeFor(g, id, "L"))
		else onSet(g.id, null)
	}

	return (
		<div>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div role="group" aria-label="Conference" className="inline-flex rounded-lg border border-lab-line bg-lab-surface p-0.5">
					{(["AFC", "NFC"] as const).map((c) => (
						<button key={c} type="button" aria-pressed={conference === c} onClick={() => setConference(c)} className={`min-h-[36px] min-w-[56px] rounded-md px-3 text-sm font-bold ${conference === c ? "bg-lab-ink text-lab-page" : "text-lab-soft hover:text-lab-ink"}`}>
							{c}
						</button>
					))}
				</div>
				<p className="m-0 text-xs text-lab-muted">Tap a game to cycle win, loss, open. Teams are in projected standings order.</p>
			</div>
			<div className="overflow-x-auto rounded-xl border border-lab-line">
				<table className="w-max min-w-full border-collapse text-xs">
					<caption className="sr-only">{conference} season grid: each cell is one team&rsquo;s game that week. Choose a cell to cycle win, loss and open.</caption>
					<thead>
						<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted">
							<th scope="col" className="sticky left-0 z-10 min-w-[88px] bg-lab-tint p-2 text-left">
								Team
							</th>
							{weeks.map((w) => (
								<th key={w} scope="col" className="min-w-[46px] p-1 text-center">
									{w}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((id, i) => {
							const t = sim.teams[id]
							return (
								<tr key={id} className={`border-t border-lab-line ${i === 6 ? "border-b-2 border-b-lab-line-strong" : ""} ${id === team ? "bg-lab-tint/60" : ""}`}>
									<th scope="row" className="sticky left-0 z-10 bg-lab-surface p-2 text-left">
										<span className="flex items-center gap-1.5">
											<span className="block h-4 w-1.5 rounded-full" style={{ background: teamByAbbr(id).color }} aria-hidden="true" />
											<span className="font-bold">{id}</span>
											<span className="font-mono text-[10px] font-normal text-lab-muted">{t.seed ? `#${t.seed}` : ""}</span>
										</span>
									</th>
									{weeks.map((w) => {
										const g = cell.get(`${id}:${w}`)
										if (!g) return <td key={w} className="p-1 text-center text-lab-muted">bye</td>
										const locked = actualOutcome(g) !== null
										const outcome = locked ? actualOutcome(g) : picks[g.id]
										const r = resultFor(g, id, outcome)
										const opp = g.homeTeam === id ? g.awayTeam : g.homeTeam
										const label = `${id} ${g.homeTeam === id ? "vs" : "at"} ${opp}, week ${w}${locked ? `, ${r === "W" ? "won" : r === "L" ? "lost" : "tied"}, final` : r ? `, ${r === "W" ? "win" : r === "L" ? "loss" : "tie"} ${simulated.has(g.id) ? "simulated" : "picked"}` : ", open"}`
										return (
											<td key={w} className="p-0.5 text-center">
												<button
													type="button"
													disabled={locked}
													onClick={() => cycle(g, id)}
													aria-label={label}
													title={label}
													className={`flex h-9 w-full min-w-[42px] flex-col items-center justify-center rounded border font-mono text-[10px] font-semibold leading-tight ${focusRing} ${locked ? "cursor-default border-transparent" : "border"} ${tone(r, locked, simulated.has(g.id))}`}
												>
													<span>{g.homeTeam === id ? "" : "@"}{opp}</span>
													<span className="text-[9px] font-bold opacity-80">{r ?? "·"}</span>
												</button>
											</td>
										)
									})}
								</tr>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}
