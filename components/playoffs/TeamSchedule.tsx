"use client"

import { useMemo } from "react"
import { Lock } from "lucide-react"

import { kickoffLabel } from "@/lib/playoffs/format"
import { actualOutcome, recordText } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import type { Game, Outcome, Predictions } from "@/lib/playoffs/types"
import { teamByAbbr } from "@/lib/nfl"
import TeamTag from "./TeamTag"
import { focusRing, outcomeFor, resultFor } from "./ui"

type Props = {
	games: readonly Game[]
	team: string
	picks: Predictions
	simulated: ReadonlySet<string>
	sim: SimulationResult
	chances: Record<string, number>
	onPick: (id: string, outcome: Outcome) => void
	/** Marks games that move this team's playoff odds the most, by game id. */
	important?: ReadonlyMap<string, number>
}

/** One team's whole season in order, with a win / loss switch on every game still to be decided. */
export default function TeamSchedule({ games, team, picks, simulated, sim, chances, onPick, important }: Props) {
	const rows = useMemo(() => {
		const mine = games.filter((g) => g.homeTeam === team || g.awayTeam === team).sort((a, b) => a.week - b.week)
		const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b)
		let w = 0
		let l = 0
		let t = 0
		const byWeek = new Map(mine.map((g) => [g.week, g]))
		return weeks.map((week) => {
			const g = byWeek.get(week)
			if (!g) return { week, game: null as Game | null, outcome: null as Outcome | null, record: recordText({ w, l, t }), locked: false }
			const real = actualOutcome(g)
			const outcome = real ?? picks[g.id] ?? null
			const r = resultFor(g, team, outcome)
			if (r === "W") w++
			else if (r === "L") l++
			else if (r === "T") t++
			return { week, game: g, outcome, record: r ? recordText({ w, l, t }) : "", locked: real !== null }
		})
	}, [games, team, picks])

	// Only the few games that matter most are flagged, so the flag still means something.
	const big = useMemo(() => {
		const mine = rows.flatMap((r) => (r.game && !r.locked && important?.has(r.game.id) ? [[r.game.id, important.get(r.game.id) as number] as const] : []))
		return new Set(mine.sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, v]) => v >= 0.05).map(([id]) => id))
	}, [rows, important])

	return (
		<ol className="m-0 list-none divide-y divide-lab-line overflow-hidden rounded-xl border border-lab-line p-0">
			{rows.map((row) => {
				if (!row.game) {
					return (
						<li key={row.week} className="flex min-h-[44px] items-center gap-3 bg-lab-tint/50 px-3 text-sm text-lab-muted">
							<span className="w-8 font-mono text-xs font-semibold">Wk {row.week}</span>
							<span>Bye</span>
						</li>
					)
				}
				const g = row.game
				const home = g.homeTeam === team
				const opp = home ? g.awayTeam : g.homeTeam
				const r = resultFor(g, team, row.outcome)
				const oppInfo = sim.teams[opp]
				const homeP = chances[g.id]
				const mine = homeP === undefined ? undefined : home ? homeP : 1 - homeP
				const swing = important?.get(g.id)
				return (
					<li key={row.week} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
						<span className="w-8 font-mono text-xs font-semibold text-lab-muted">Wk {row.week}</span>
						<span className="min-w-0 flex-1 text-sm">
							<span className="text-lab-muted">{home ? "vs" : "at"} </span>
							<TeamTag id={opp} nick />
							<span className="ml-2 font-mono text-[11px] text-lab-muted">
								{oppInfo ? recordText(oppInfo.overall) : ""}
								{oppInfo?.seed ? ` · #${oppInfo.seed}` : ""}
							</span>
							<span className="block text-[11px] text-lab-muted">
								{kickoffLabel(g.date, g.time)}
								{swing !== undefined && big.has(g.id) ? <span className="ml-2 rounded bg-lab-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lab-page">Big game · about {Math.round(swing * 100)} pts of odds</span> : null}
							</span>
						</span>
						{row.locked ? (
							<span className={`inline-flex items-center gap-1.5 font-mono text-sm font-bold ${r === "W" ? "text-lab-ink" : "text-lab-muted"}`}>
								<Lock className="h-3 w-3" aria-hidden="true" />
								{r} {home ? g.homeScore : g.awayScore}-{home ? g.awayScore : g.homeScore}
							</span>
						) : (
							<span role="group" aria-label={`Week ${row.week} ${home ? "vs" : "at"} ${teamByAbbr(opp).nick}`} className="inline-flex items-center gap-1">
								{mine !== undefined ? <span className="mr-1 font-mono text-[11px] text-lab-muted" title="The model's chance this team wins">{Math.round(mine * 100)}%</span> : null}
								{(["W", "L"] as const).map((res) => {
									const on = r === res
									return (
										<button
											key={res}
											type="button"
											aria-pressed={on}
											onClick={() => onPick(g.id, outcomeFor(g, team, res))}
											className={`min-h-[36px] min-w-[44px] rounded-md border px-2 text-sm font-bold ${focusRing} ${on ? (simulated.has(g.id) ? "border-dashed border-lab-ink bg-lab-tint text-lab-ink" : "border-lab-ink bg-lab-ink text-lab-page") : "border-lab-line bg-lab-surface text-lab-soft hover:border-lab-line-strong hover:text-lab-ink"}`}
										>
											{res}
											<span className="sr-only">{res === "W" ? " win" : " loss"}</span>
										</button>
									)
								})}
								<button
									type="button"
									aria-pressed={r === "T"}
									onClick={() => onPick(g.id, "T")}
									title="Call it a tie"
									className={`min-h-[36px] min-w-[32px] rounded-md border px-1.5 text-xs font-bold ${focusRing} ${r === "T" ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line bg-lab-surface text-lab-muted hover:text-lab-ink"}`}
								>
									T
								</button>
							</span>
						)}
						<span className="w-12 text-right font-mono text-xs tabular-nums text-lab-soft">{row.record}</span>
					</li>
				)
			})}
		</ol>
	)
}
