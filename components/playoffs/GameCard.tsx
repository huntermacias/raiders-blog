"use client"

import { Check, Lock } from "lucide-react"

import { kickoffLabel } from "@/lib/playoffs/format"
import { recordText } from "@/lib/playoffs/season"
import type { SimulationResult } from "@/lib/playoffs/simulator"
import type { Game, Outcome } from "@/lib/playoffs/types"
import { teamByAbbr } from "@/lib/nfl"

type Props = {
	game: Game
	pick: Outcome | undefined
	sim: SimulationResult
	onPick: (id: string, outcome: Outcome) => void
	/** Draw this game as one to watch: the followed team's own game, or one with a team it is racing. */
	focus?: "mine" | "rival" | null
	/** Says whose game it is, e.g. "Raiders game". */
	focusLabel?: string
	/** The followed team's division mates, tagged with `divisionLabel` (e.g. "AFC West"). */
	divisionMates?: ReadonlySet<string>
	divisionLabel?: string
}

function TeamButton({ game, side, picked, dimmed, sim, onPick, rival }: { game: Game; side: "H" | "A"; picked: boolean; dimmed: boolean; sim: SimulationResult; onPick: Props["onPick"]; rival: string }) {
	const id = side === "H" ? game.homeTeam : game.awayTeam
	const info = teamByAbbr(id)
	const rec = sim.teams[id]?.overall
	return (
		<button
			type="button"
			aria-pressed={picked}
			onClick={() => onPick(game.id, side)}
			className={`group relative flex min-h-[76px] flex-1 flex-col items-start justify-center rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink ${
				picked ? "border-lab-ink bg-lab-ink text-lab-page" : dimmed ? "border-lab-line bg-lab-surface text-lab-muted hover:border-lab-line-strong hover:text-lab-ink" : "border-lab-line bg-lab-surface text-lab-ink hover:border-lab-line-strong hover:bg-lab-tint"
			}`}
		>
			<span className="flex w-full items-center gap-2">
				<span className="block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-lab-page" style={{ background: info.color }} aria-hidden="true" />
				<span className="font-serif text-2xl font-bold leading-none tracking-tight">{id}</span>
				{picked ? <Check className="ml-auto h-5 w-5 shrink-0" aria-hidden="true" /> : null}
			</span>
			<span className={`mt-1 text-xs ${picked ? "opacity-80" : "text-lab-muted"}`}>
				{info.nick}
				{rival ? <span className="ml-1.5 rounded-sm border border-current px-1 text-[9px] font-bold uppercase tracking-[0.1em]">{rival}</span> : null}
			</span>
			<span className={`mt-0.5 font-mono text-xs tabular-nums ${picked ? "opacity-80" : "text-lab-soft"}`}>{rec ? recordText(rec) : ""}</span>
			<span className="sr-only">{picked ? ", picked to win" : ", tap to pick this team to win"}</span>
		</button>
	)
}

export default function GameCard({ game, pick, sim, onPick, focus = null, focusLabel = "Your team", divisionMates, divisionLabel = "" }: Props) {
	const away = teamByAbbr(game.awayTeam)
	const home = teamByAbbr(game.homeTeam)
	const final = game.status === "final"
	const when = kickoffLabel(game.date, game.time)
	const rivalOf = (id: string) => (divisionMates?.has(id) ? divisionLabel : "")

	if (final) {
		const hw = (game.homeScore ?? 0) > (game.awayScore ?? 0)
		const aw = (game.awayScore ?? 0) > (game.homeScore ?? 0)
		const row = (id: string, score: number | null, won: boolean) => (
			<div className={`flex items-center gap-2 ${won ? "font-bold text-lab-ink" : "text-lab-muted"}`}>
				<span className="block h-2 w-2 shrink-0 rounded-full" style={{ background: teamByAbbr(id).color }} aria-hidden="true" />
				<span className="font-serif text-lg leading-none">{id}</span>
				<span className="ml-auto font-mono text-base tabular-nums">{score}</span>
				{won ? <span className="text-[10px] font-bold uppercase tracking-[0.12em]">W</span> : <span className="w-3" />}
			</div>
		)
		return (
			<article aria-label={`${away.name} at ${home.name}, final`} className={`rounded-2xl border bg-lab-surface p-3.5 ${focus === "mine" ? "border-lab-ink" : "border-lab-line"}`}>
				<header className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
					<span>{when}</span>
					<span className="inline-flex items-center gap-1">
						<Lock className="h-3 w-3" aria-hidden="true" />
						Final{game.tie ? ", tie" : ""} &middot; locked
					</span>
				</header>
				<div className="space-y-1.5">
					{row(game.awayTeam, game.awayScore, aw)}
					{row(game.homeTeam, game.homeScore, hw)}
				</div>
			</article>
		)
	}

	return (
		<article
			aria-label={`${away.name} at ${home.name}`}
			className={`rounded-2xl border bg-lab-surface p-3.5 ${focus === "mine" ? "border-lab-ink ring-1 ring-lab-ink" : focus === "rival" ? "border-lab-line-strong" : "border-lab-line"}`}
		>
			<header className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-lab-muted">
				<span>{when}</span>
				<span className={pick ? "text-lab-ink" : ""}>{focus === "mine" ? focusLabel : pick ? "Picked" : "Open"}</span>
			</header>
			<div className="flex items-stretch gap-2">
				<TeamButton game={game} side="A" picked={pick === "A"} dimmed={pick === "H" || pick === "T"} sim={sim} onPick={onPick} rival={rivalOf(game.awayTeam)} />
				<span className="flex w-5 shrink-0 items-center justify-center text-sm font-semibold text-lab-muted" aria-hidden="true">
					@
				</span>
				<TeamButton game={game} side="H" picked={pick === "H"} dimmed={pick === "A" || pick === "T"} sim={sim} onPick={onPick} rival={rivalOf(game.homeTeam)} />
			</div>
			<div className="mt-2 flex justify-center">
				<button
					type="button"
					aria-pressed={pick === "T"}
					onClick={() => onPick(game.id, "T")}
					className={`min-h-[32px] rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${pick === "T" ? "bg-lab-ink text-lab-page" : "text-lab-muted underline-offset-4 hover:text-lab-ink hover:underline"}`}
				>
					{pick === "T" ? "Tie picked" : "Tie"}
				</button>
			</div>
		</article>
	)
}
