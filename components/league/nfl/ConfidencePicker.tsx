"use client"

import * as React from "react"
import { Check, Lock } from "lucide-react"

import Countdown from "@/components/league/home/Countdown"
import { post } from "@/lib/league2/client"
import { kickoffLabel } from "@/lib/league2/format"
import type { ConfidenceGame } from "@/lib/league2/view/nflFormats"
import { cn } from "@/lib/utils"

type Side = "away" | "home"
type Slot = { pick: Side | null; rank: number | null }
type Slots = Record<string, Slot>

const OUTCOME: Record<string, { label: string; cls: string }> = {
	correct: { label: "Correct", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
	wrong: { label: "Missed", cls: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200" },
	push: { label: "Tie: no score", cls: "bg-muted text-foreground" },
	void: { label: "Game cancelled", cls: "bg-muted text-foreground" },
	missed: { label: "No pick", cls: "bg-muted text-muted-foreground" },
	pending: { label: "Waiting on the result", cls: "bg-muted text-foreground" },
}

const initial = (games: ConfidenceGame[]): Slots => Object.fromEntries(games.map((g) => [g.eventId, { pick: g.pick, rank: g.rank }]))

export default function ConfidencePicker({ games, gameCount, signedIn, week }: { games: ConfidenceGame[]; gameCount: number; signedIn: boolean; week: number }) {
	const [slots, setSlots] = React.useState<Slots>(() => initial(games))
	const saved = React.useRef<Slots>(initial(games))
	const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | string>("idle")
	const run = React.useRef(0)

	const byId: Record<string, ConfidenceGame> = Object.fromEntries(games.map((g) => [g.eventId, g]))
	const open = games.filter((g) => g.status === "open")
	const ranked = open.filter((g) => slots[g.eventId].pick && slots[g.eventId].rank !== null).length
	const used = new Set(Object.values(slots).map((s) => s.rank).filter((r): r is number => r !== null))
	const free: number[] = []
	for (let r = 1; r <= gameCount; r++) if (!used.has(r)) free.push(r)

	// Save every complete, changed pick of the open games together, a moment after the last change. A swap changes two
	// games at once and must reach the server in one request.
	React.useEffect(() => {
		if (!signedIn) return
		const items = open
			.map((g) => ({ eventId: g.eventId, ...slots[g.eventId] }))
			.filter((s) => s.pick && s.rank !== null && (saved.current[s.eventId].pick !== s.pick || saved.current[s.eventId].rank !== s.rank))
			.map((s) => ({ eventId: s.eventId, pick: s.pick, rank: s.rank }))
		if (items.length === 0) return
		const mine = ++run.current
		const t = setTimeout(async () => {
			setStatus("saving")
			const r = await post<{ ok: true }>("/api/league/account/pick", { competition: "confidence", items })
			if (mine !== run.current) return
			if (r.ok) {
				items.forEach((i) => (saved.current[i.eventId] = { pick: i.pick as Side, rank: i.rank as number }))
				return setStatus("saved")
			}
			// The server refused: show what it has, so the page never claims a slate that was not saved.
			setSlots({ ...saved.current })
			setStatus(r.status === 401 ? "Sign in again to save your slate." : r.message)
		}, 500)
		return () => clearTimeout(t)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [slots])

	const setPick = (id: string, pick: Side) => {
		setStatus("idle")
		setSlots((s) => (s[id].pick === pick ? s : { ...s, [id]: { ...s[id], pick } }))
	}
	const setRank = (id: string, rank: number | null) => {
		setStatus("idle")
		setSlots((s) => {
			const mine = s[id]
			if (rank === mine.rank) return s
			const next: Slots = { ...s, [id]: { ...mine, rank } }
			// Taking a rank another open game holds swaps the two.
			const holder = rank === null ? undefined : Object.keys(s).find((k) => k !== id && s[k].rank === rank)
			if (holder) next[holder] = { ...s[holder], rank: mine.rank }
			return next
		})
	}

	return (
		<div>
			{signedIn && open.length > 0 && (
				<div className="mb-4 rounded-xl border border-border bg-card p-4 shadow-sm" role="status" aria-live="polite">
					<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<p className="font-semibold">
							{ranked} of {open.length} open game{open.length === 1 ? "" : "s"} picked and ranked
						</p>
						<p className="text-sm text-muted-foreground">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Pick a team, then give it a rank. It saves on its own."}</p>
					</div>
					<div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
						<div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${open.length ? (ranked / open.length) * 100 : 0}%` }} />
					</div>
					<p className="mt-2 text-sm text-muted-foreground">
						{free.length > 0 ? (
							<>
								Ranks not used yet: <span className="font-semibold tabular-nums text-foreground">{free.join(", ")}</span>.{" "}
							</>
						) : (
							"Every rank is in use. "
						)}
						A correct pick scores its rank, so give your surest pick {gameCount}.
					</p>
					{status !== "idle" && status !== "saving" && status !== "saved" && (
						<p role="alert" className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-400">
							{status}
						</p>
					)}
				</div>
			)}
			<ul className="grid gap-4 lg:grid-cols-2" aria-label={`Week ${week} games`}>
				{games.map((g) => {
					const s = slots[g.eventId]
					const closed = g.status !== "open" || !signedIn
					const label = `${g.away.nick} at ${g.home.nick}`
					return (
						<li key={g.eventId} className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
								<p className="text-muted-foreground">{kickoffLabel(g.kickoff)}</p>
								{g.status === "open" ? <Countdown lockAt={g.lockAt} className="font-semibold" /> : g.status === "cancelled" ? <span className="font-semibold">Cancelled</span> : g.status === "locked" ? <span className="inline-flex items-center gap-1 font-semibold"><Lock aria-hidden className="h-3.5 w-3.5" /> Locked</span> : <span className="font-semibold">Final</span>}
							</div>
							<div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
								<div role="radiogroup" aria-label={`Pick the winner: ${label}`} className="flex flex-1 flex-col gap-2 sm:flex-row">
									{(["away", "home"] as Side[]).map((side) => {
										const t = g[side]
										const chosen = s.pick === side
										return (
											<button
												key={side}
												type="button"
												role="radio"
												aria-checked={chosen}
												disabled={closed}
												onClick={() => setPick(g.eventId, side)}
												className={cn(
													"relative flex min-h-[4rem] flex-1 flex-col items-start justify-center rounded-xl border-2 px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
													chosen ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/50",
													closed && "cursor-default",
													closed && !chosen && "opacity-80 hover:border-border"
												)}
											>
												<span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest opacity-80">
													<span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: t.color }} />
													{side === "away" ? "Away" : "Home"}
													{g.result?.winner === side && <span className="rounded bg-emerald-600 px-1 py-px text-[10px] font-bold tracking-wider text-white">WON</span>}
												</span>
												<span className="mt-0.5 font-serif text-lg font-bold leading-tight">{t.nick}</span>
												{chosen && <Check aria-hidden className="absolute right-3 top-3 h-4 w-4" />}
											</button>
										)
									})}
								</div>
								<div className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 sm:w-28 sm:flex-col sm:justify-center">
									<label htmlFor={`rank-${g.eventId}`} className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
										Rank
									</label>
									{closed ? (
										<p className="font-serif text-2xl font-bold tabular-nums" aria-label={s.rank !== null ? `Rank ${s.rank}` : "No rank"}>
											{s.rank ?? "–"}
										</p>
									) : (
										<select
											id={`rank-${g.eventId}`}
											value={s.rank ?? ""}
											onChange={(e) => setRank(g.eventId, e.target.value === "" ? null : Number(e.target.value))}
											aria-label={`Confidence rank for ${label}`}
											className="h-10 w-20 rounded-lg border border-input bg-background px-2 text-center font-serif text-lg font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<option value="" disabled={s.rank !== null}>
												–
											</option>
											{Array.from({ length: gameCount }, (_, i) => i + 1).map((r) => {
												const holder = Object.keys(slots).find((k) => k !== g.eventId && slots[k].rank === r)
												const holderLocked = holder ? byId[holder].status !== "open" : false
												// A rank somebody else holds can be taken only by swapping, which needs a rank of my own to give.
												const blocked = Boolean(holder) && (holderLocked || s.rank === null)
												const hint = holder ? (holderLocked ? " (locked)" : s.rank === null ? " (used)" : ` (swap ${byId[holder].away.abbr}/${byId[holder].home.abbr})`) : ""
												return (
													<option key={r} value={r} disabled={blocked}>
														{r}
														{hint}
													</option>
												)
											})}
										</select>
									)}
								</div>
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
								{g.earned !== null && g.outcome === "correct" && <span className="text-sm font-bold tabular-nums">+{g.earned}</span>}
								{g.status === "open" && signedIn && s.pick && s.rank === null && <span className="text-xs text-muted-foreground">Give this pick a rank to save it.</span>}
								{g.status === "open" && signedIn && !s.pick && s.rank !== null && <span className="text-xs text-muted-foreground">Pick a team to save this rank.</span>}
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
