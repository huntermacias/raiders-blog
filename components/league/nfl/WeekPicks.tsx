"use client"

import * as React from "react"
import { Check, Lock } from "lucide-react"

import { post } from "@/lib/league2/client"
import { kickoffLabel } from "@/lib/league2/format"
import type { NflGame, Outcome } from "@/lib/league2/view/nfl"
import { cn } from "@/lib/utils"
import Countdown from "@/components/league/home/Countdown"

type Side = "away" | "home"
type Saving = Record<string, "saving" | "saved" | string | undefined>

const OUTCOME: Record<Outcome, { label: string; cls: string }> = {
	correct: { label: "Correct", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
	wrong: { label: "Missed", cls: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200" },
	push: { label: "Tie: no score", cls: "bg-muted text-foreground" },
	void: { label: "Game cancelled", cls: "bg-muted text-foreground" },
	missed: { label: "No pick", cls: "bg-muted text-muted-foreground" },
	pending: { label: "Waiting on the result", cls: "bg-muted text-foreground" },
}

function Team({ g, side, chosen, disabled, onPick, winner }: { g: NflGame; side: Side; chosen: boolean; disabled: boolean; onPick: () => void; winner: boolean }) {
	const t = g[side]
	return (
		<button
			type="button"
			role="radio"
			aria-checked={chosen}
			disabled={disabled}
			onClick={onPick}
			className={cn(
				"relative flex min-h-[4.5rem] flex-1 flex-col items-start justify-center rounded-xl border-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				chosen ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/50",
				disabled && !chosen && "opacity-80 hover:border-border",
				disabled && "cursor-default"
			)}
		>
			<span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest opacity-80">
				<span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: t.color }} />
				{side === "away" ? "Away" : "Home"}
				{winner && <span className="rounded bg-emerald-600 px-1 py-px text-[10px] font-bold tracking-wider text-white">WON</span>}
			</span>
			<span className="mt-0.5 font-serif text-xl font-bold leading-tight">{t.nick}</span>
			{chosen && <Check aria-hidden className="absolute right-3 top-3 h-4 w-4" />}
		</button>
	)
}

function Crowd({ g }: { g: NflGame }) {
	if (!g.crowd || g.crowd.total === 0) return null
	const a = Math.round((g.crowd.away / g.crowd.total) * 100)
	return (
		<div className="mt-3" aria-label={`${a}% of players picked ${g.away.nick}, ${100 - a}% picked ${g.home.nick}`}>
			<div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
				<div className="h-full" style={{ width: `${a}%`, background: g.away.color }} />
				<div className="h-full flex-1" style={{ background: g.home.color }} />
			</div>
			<p className="mt-1 flex justify-between text-xs text-muted-foreground">
				<span>
					{a}% {g.away.abbr}
				</span>
				<span>{g.crowd.total} picks</span>
				<span>
					{100 - a}% {g.home.abbr}
				</span>
			</p>
		</div>
	)
}

export default function WeekPicks({ games, signedIn, week }: { games: NflGame[]; signedIn: boolean; week: number }) {
	const [picks, setPicks] = React.useState<Record<string, Side | null>>(() => Object.fromEntries(games.map((g) => [g.eventId, g.pick])))
	const [state, setState] = React.useState<Saving>({})
	const open = games.filter((g) => g.status === "open")
	const done = open.filter((g) => picks[g.eventId]).length

	async function choose(g: NflGame, side: Side) {
		if (!signedIn || g.status !== "open" || picks[g.eventId] === side) return
		const before = picks[g.eventId] ?? null
		setPicks((p) => ({ ...p, [g.eventId]: side }))
		setState((s) => ({ ...s, [g.eventId]: "saving" }))
		const r = await post<{ ok: true }>("/api/league/account/pick", { competition: "winners", eventId: g.eventId, payload: { pick: side } })
		if (r.ok) return setState((s) => ({ ...s, [g.eventId]: "saved" }))
		setPicks((p) => ({ ...p, [g.eventId]: before }))
		setState((s) => ({ ...s, [g.eventId]: r.status === 401 ? "Sign in again to save picks." : r.message }))
	}

	return (
		<div>
			{signedIn && open.length > 0 && (
				<div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm" role="status" aria-live="polite">
					<div className="flex items-baseline justify-between gap-3">
						<p className="font-semibold">
							{done} of {open.length} open game{open.length === 1 ? "" : "s"} picked
						</p>
						<p className="text-sm text-muted-foreground">{done === open.length ? "All set. Change any pick until its kickoff." : "Tap a team to pick. It saves right away."}</p>
					</div>
					<div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
						<div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${open.length ? (done / open.length) * 100 : 0}%` }} />
					</div>
				</div>
			)}
			<ul className="grid gap-4 lg:grid-cols-2" aria-label={`Week ${week} games`}>
				{games.map((g) => {
					const mine = picks[g.eventId] ?? null
					const closed = g.status !== "open"
					const st = state[g.eventId]
					const label = `${g.away.nick} at ${g.home.nick}`
					return (
						<li key={g.eventId} className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
								<p className="text-muted-foreground">{kickoffLabel(g.kickoff)}</p>
								{g.status === "open" ? <Countdown lockAt={g.lockAt} className="font-semibold" /> : g.status === "cancelled" ? <span className="font-semibold">Cancelled</span> : g.status === "locked" ? <span className="inline-flex items-center gap-1 font-semibold"><Lock aria-hidden className="h-3.5 w-3.5" /> Picks locked</span> : <span className="font-semibold">Final</span>}
							</div>
							<div role="radiogroup" aria-label={`Pick the winner: ${label}`} className="flex flex-col gap-2 sm:flex-row">
								<Team g={g} side="away" chosen={mine === "away"} disabled={closed || !signedIn} onPick={() => choose(g, "away")} winner={g.result?.winner === "away"} />
								<Team g={g} side="home" chosen={mine === "home"} disabled={closed || !signedIn} onPick={() => choose(g, "home")} winner={g.result?.winner === "home"} />
							</div>
							{g.result && (
								<p className="mt-3 text-center font-serif text-2xl font-bold tabular-nums">
									{g.away.abbr} {g.result.away}
									<span className="mx-2 text-muted-foreground">–</span>
									{g.result.home} {g.home.abbr}
								</p>
							)}
							<div className="mt-2 flex min-h-[1.5rem] flex-wrap items-center gap-2" aria-live="polite">
								{g.outcome && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", OUTCOME[g.outcome].cls)}>{OUTCOME[g.outcome].label}</span>}
								{!closed && st === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
								{!closed && st === "saved" && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Saved</span>}
								{!closed && st && st !== "saving" && st !== "saved" && <span role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-400">{st}</span>}
							</div>
							<Crowd g={g} />
						</li>
					)
				})}
			</ul>
		</div>
	)
}
