"use client"

import * as React from "react"
import { Lock, Zap } from "lucide-react"

import Countdown from "@/components/league/home/Countdown"
import { post } from "@/lib/league2/client"
import { kickoffLabel } from "@/lib/league2/format"
import type { UpsetGame } from "@/lib/league2/view/nflFormats"
import { cn } from "@/lib/utils"

type Msg = Record<string, "saving" | "saved" | string | undefined>

const OUTCOME = {
	hit: { label: "Upset called", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
	miss: { label: "No upset", cls: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200" },
	pending: { label: "Waiting on the result", cls: "bg-muted text-foreground" },
	void: { label: "Game cancelled", cls: "bg-muted text-foreground" },
} as const

export default function UpsetCalls({ games, max, signedIn, week }: { games: UpsetGame[]; max: number; signedIn: boolean; week: number }) {
	const [called, setCalled] = React.useState<Record<string, boolean>>(() => Object.fromEntries(games.map((g) => [g.eventId, g.called])))
	const [msg, setMsg] = React.useState<Msg>({})
	const used = Object.values(called).filter(Boolean).length

	async function toggle(g: UpsetGame) {
		if (!signedIn || g.status !== "open" || !g.line) return
		const was = Boolean(called[g.eventId])
		if (!was && used >= max) return setMsg((m) => ({ ...m, [g.eventId]: `You have used all ${max} calls this week. Take one back to call this game.` }))
		setCalled((c) => ({ ...c, [g.eventId]: !was }))
		setMsg((m) => ({ ...m, [g.eventId]: "saving" }))
		const r = await post<{ ok: true }>("/api/league/account/pick", { competition: "upset", eventId: g.eventId, payload: { pick: was ? "none" : g.line.underdog } })
		if (r.ok) return setMsg((m) => ({ ...m, [g.eventId]: "saved" }))
		setCalled((c) => ({ ...c, [g.eventId]: was }))
		setMsg((m) => ({ ...m, [g.eventId]: r.status === 401 ? "Sign in again to save calls." : r.message }))
	}

	return (
		<div>
			{signedIn && (
				<div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm" role="status" aria-live="polite">
					<div className="flex items-baseline justify-between gap-3">
						<p className="font-semibold">
							{used} of {max} upset calls used
						</p>
						<p className="text-sm text-muted-foreground">{used >= max ? "Take one back to use it on another game." : "Call only the games you think the underdog wins."}</p>
					</div>
					<div className="mt-2 flex gap-1.5" aria-hidden>
						{Array.from({ length: max }, (_, i) => (
							<span key={i} className={cn("h-2 flex-1 rounded-full", i < used ? "bg-foreground" : "bg-muted")} />
						))}
					</div>
				</div>
			)}
			<ul className="grid gap-4 lg:grid-cols-2" aria-label={`Week ${week} games`}>
				{games.map((g) => {
					const on = Boolean(called[g.eventId])
					const m = msg[g.eventId]
					const line = g.line
					const dog = line ? g[line.underdog] : null
					const fav = line ? g[line.underdog === "away" ? "home" : "away"] : null
					const closed = g.status !== "open"
					const out = g.outcome ? OUTCOME[g.outcome] : null
					return (
						<li key={g.eventId} className={cn("rounded-2xl border bg-card p-4 shadow-sm md:p-5", on ? "border-foreground" : "border-border")}>
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
								<p className="text-muted-foreground">{kickoffLabel(g.kickoff)}</p>
								{g.status === "open" ? <Countdown lockAt={g.lockAt} className="font-semibold" /> : g.status === "cancelled" ? <span className="font-semibold">Cancelled</span> : g.status === "locked" ? <span className="inline-flex items-center gap-1 font-semibold"><Lock aria-hidden className="h-3.5 w-3.5" /> Locked</span> : <span className="font-semibold">Final</span>}
							</div>
							<p className="font-serif text-xl font-bold leading-tight">
								{g.away.nick} <span className="text-muted-foreground">at</span> {g.home.nick}
							</p>
							{line && dog && fav ? (
								<>
									<div className="mt-3 flex flex-wrap items-center gap-2">
										<span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-xs font-bold text-background">
											<Zap aria-hidden className="h-3 w-3" /> +{line.value} {line.value === 1 ? "point" : "points"}
										</span>
										<span className="text-sm font-semibold">{line.label}</span>
									</div>
									<p className="mt-2 text-sm text-muted-foreground">
										<span className="font-semibold text-foreground">{dog.nick}</span> are the underdog. Our ratings give the {fav.nick} a {Math.round(line.favouriteWinChance * 100)}% chance.
									</p>
									{!closed && signedIn && (
										<button
											type="button"
											aria-pressed={on}
											onClick={() => toggle(g)}
											className={cn(
												"mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg border-2 px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
												on ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/50"
											)}
										>
											{on ? `Calling a ${dog.nick} upset · tap to take back` : `Call the ${dog.nick} upset`}
										</button>
									)}
								</>
							) : (
								<p className="mt-3 text-sm text-muted-foreground">{closed ? "No underdog was named for this game." : "The underdog is named when the week opens."}</p>
							)}
							{g.result && (
								<p className="mt-3 text-center font-serif text-2xl font-bold tabular-nums">
									{g.away.abbr} {g.result.away}
									<span className="mx-2 text-muted-foreground">–</span>
									{g.result.home} {g.home.abbr}
								</p>
							)}
							<div className="mt-2 flex min-h-[1.5rem] flex-wrap items-center gap-2" aria-live="polite">
								{out && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", out.cls)}>{out.label}</span>}
								{g.outcome === "hit" && line && <span className="text-sm font-bold tabular-nums">+{line.value}</span>}
								{closed && g.status !== "cancelled" && line && g.upsetHappened !== null && <span className="text-xs text-muted-foreground">{g.upsetHappened ? "The underdog won." : "The favourite held on."}</span>}
								{closed && g.callers !== null && g.callers > 0 && <span className="text-xs text-muted-foreground">{g.callers} {g.callers === 1 ? "player" : "players"} called it</span>}
								{!closed && m === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
								{!closed && m === "saved" && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Saved</span>}
								{!closed && m && m !== "saving" && m !== "saved" && (
									<span role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-400">
										{m}
									</span>
								)}
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
