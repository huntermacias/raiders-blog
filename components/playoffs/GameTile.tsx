"use client"

import { Check, Lock } from "lucide-react"

import { kickoffLabel } from "@/lib/playoffs/format"
import { recordText } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import type { Game, Outcome } from "@/lib/playoffs/types"
import { teamByAbbr } from "@/lib/nfl"
import { focusRing } from "./ui"

type Props = {
	game: Game
	pick: Outcome | undefined
	/** True when the pick came from a simulation rather than from the reader. */
	simulated?: boolean
	sim: SimulationResult
	/** The model's chance that the home team wins. Left out, no percentages are shown. */
	homeChance?: number
	onPick: (id: string, outcome: Outcome) => void
	/** The followed team, drawn with a ring on its own games. */
	team?: string | null
}

function Side({ game, side, picked, dimmed, simulated, sim, chance, onPick }: { game: Game; side: "H" | "A"; picked: boolean; dimmed: boolean; simulated: boolean; sim: SimulationResult; chance?: number; onPick: Props["onPick"] }) {
	const id = side === "H" ? game.homeTeam : game.awayTeam
	const info = teamByAbbr(id)
	const rec = sim.teams[id]?.overall
	const move = (e: React.KeyboardEvent<HTMLButtonElement>) => {
		if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
		const group = e.currentTarget.parentElement
		const buttons = group ? Array.from(group.querySelectorAll<HTMLButtonElement>("button[data-side]")) : []
		const target = buttons.find((b) => b.dataset.side === (e.key === "ArrowLeft" ? "A" : "H"))
		if (target && target !== e.currentTarget) {
			e.preventDefault()
			target.focus()
		}
	}
	return (
		<button
			type="button"
			data-side={side}
			aria-pressed={picked}
			onKeyDown={move}
			onClick={() => onPick(game.id, side)}
			className={`group flex min-h-[56px] min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition active:scale-[0.99] ${focusRing} ${
				picked
					? simulated
						? "border-lab-ink border-dashed bg-lab-tint text-lab-ink"
						: "border-lab-ink bg-lab-ink text-lab-page"
					: dimmed
						? "border-lab-line bg-lab-surface text-lab-muted hover:border-lab-line-strong hover:text-lab-ink"
						: "border-lab-line bg-lab-surface text-lab-ink hover:border-lab-line-strong hover:bg-lab-tint"
			}`}
		>
			<span className="block h-8 w-1.5 shrink-0 rounded-full" style={{ background: info.color }} aria-hidden="true" />
			<span className="min-w-0 flex-1">
				<span className="flex items-baseline gap-1.5">
					<span className="font-serif text-lg font-bold leading-none tracking-tight">{id}</span>
					{picked ? <Check className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden="true" /> : null}
				</span>
				<span className={`block font-mono text-[11px] tabular-nums ${picked && !simulated ? "opacity-80" : "text-lab-muted"}`}>
					{rec ? recordText(rec) : ""}
					{chance !== undefined ? <span className="ml-1.5" title="The model's chance this team wins, from this season's results">{Math.round(chance * 100)}%</span> : null}
				</span>
			</span>
			<span className="sr-only">
				{info.name}
				{picked ? (simulated ? ", simulated to win" : ", picked to win") : ", tap to pick to win"}
				{chance !== undefined ? `, model chance ${Math.round(chance * 100)} percent` : ""}
			</span>
		</button>
	)
}

export default function GameTile({ game, pick, simulated = false, sim, homeChance, onPick, team }: Props) {
	const away = teamByAbbr(game.awayTeam)
	const home = teamByAbbr(game.homeTeam)
	const mine = team && (game.homeTeam === team || game.awayTeam === team)

	if (game.status === "final") {
		const hw = (game.homeScore ?? 0) > (game.awayScore ?? 0)
		const aw = (game.awayScore ?? 0) > (game.homeScore ?? 0)
		const row = (id: string, score: number | null, won: boolean) => (
			<span className={`flex min-w-0 flex-1 items-center gap-2 ${won ? "font-bold text-lab-ink" : "text-lab-muted"}`}>
				<span className="block h-5 w-1.5 shrink-0 rounded-full" style={{ background: teamByAbbr(id).color }} aria-hidden="true" />
				<span className="font-serif text-base leading-none">{id}</span>
				<span className="ml-auto font-mono text-sm tabular-nums">{score}</span>
			</span>
		)
		return (
			<article aria-label={`${away.name} at ${home.name}, final${game.tie ? ", tie" : ""}`} className={`flex min-h-[56px] items-center gap-3 rounded-lg border bg-lab-surface px-3 py-2 ${mine ? "border-lab-ink" : "border-lab-line"}`}>
				{row(game.awayTeam, game.awayScore, aw)}
				<Lock className="h-3 w-3 shrink-0 text-lab-muted" aria-label="Played, locked" />
				{row(game.homeTeam, game.homeScore, hw)}
			</article>
		)
	}

	const tied = pick === "T"
	return (
		<article aria-label={`${away.name} at ${home.name}`} className={`rounded-lg border bg-lab-surface p-1.5 ${mine ? "border-lab-ink ring-1 ring-lab-ink" : "border-lab-line"}`}>
			<div role="group" aria-label={`${away.nick} at ${home.nick}`} className="flex items-stretch gap-1.5">
				<Side game={game} side="A" picked={pick === "A"} dimmed={pick === "H" || tied} simulated={simulated} sim={sim} chance={homeChance === undefined ? undefined : 1 - homeChance} onPick={onPick} />
				<button
					type="button"
					aria-pressed={tied}
					aria-label={tied ? "Tie picked, tap to take it back" : "Pick a tie"}
					title="Call it a tie"
					onClick={() => onPick(game.id, "T")}
					className={`flex w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${focusRing} ${tied ? "bg-lab-ink text-lab-page" : "text-lab-muted hover:bg-lab-tint hover:text-lab-ink"}`}
				>
					{tied ? "T" : "@"}
				</button>
				<Side game={game} side="H" picked={pick === "H"} dimmed={pick === "A" || tied} simulated={simulated} sim={sim} chance={homeChance} onPick={onPick} />
			</div>
			<p className="m-0 mt-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{kickoffLabel(game.date, game.time)}</p>
		</article>
	)
}
