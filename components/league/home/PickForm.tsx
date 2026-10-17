"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Lock, Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MAX_SCORE } from "@/lib/league"
import { nick, teamColor } from "@/lib/league2/format"
import { post } from "@/lib/league2/client"
import Countdown from "./Countdown"

type Props = { eventId: string; awayTeam: string; homeTeam: string; lockAt: string; initial: { away: number; home: number } | null; kickoffLabel: string; week: number }

function Stepper({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
	const n = value.trim() === "" ? null : Number(value)
	const bump = (d: number) => onChange(String(Math.min(MAX_SCORE, Math.max(0, (n === null || Number.isNaN(n) ? 20 : n) + d))))
	const btn = "flex h-11 w-11 items-center justify-center rounded-lg border border-input bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
	return (
		<div className="flex items-center gap-1.5">
			<button type="button" className={btn} onClick={() => bump(-1)} disabled={disabled || (n !== null && n <= 0)} aria-label={`Lower ${label}`}>
				<Minus aria-hidden className="h-4 w-4" />
			</button>
			<input
				type="text"
				inputMode="numeric"
				pattern="[0-9]*"
				value={value}
				disabled={disabled}
				aria-label={label}
				onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
				className="h-11 w-16 rounded-lg border border-input bg-background text-center font-serif text-2xl font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
				placeholder="0"
			/>
			<button type="button" className={btn} onClick={() => bump(1)} disabled={disabled || (n !== null && n >= MAX_SCORE)} aria-label={`Raise ${label}`}>
				<Plus aria-hidden className="h-4 w-4" />
			</button>
		</div>
	)
}

export default function PickForm({ eventId, awayTeam, homeTeam, lockAt, initial, kickoffLabel, week }: Props) {
	const router = useRouter()
	const [a, setA] = React.useState(initial ? String(initial.away) : "")
	const [h, setH] = React.useState(initial ? String(initial.home) : "")
	const [saved, setSaved] = React.useState(initial)
	const [busy, setBusy] = React.useState(false)
	const [closed, setClosed] = React.useState(false)
	const [msg, setMsg] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null)

	React.useEffect(() => {
		const check = () => setClosed(Date.now() >= Date.parse(lockAt))
		check()
		const t = setInterval(check, 15_000)
		return () => clearInterval(t)
	}, [lockAt])

	const an = a === "" ? null : Number(a)
	const hn = h === "" ? null : Number(h)
	const dirty = !saved || String(saved.away) !== a || String(saved.home) !== h
	const summary = an !== null && hn !== null && an !== hn ? `${nick(an > hn ? awayTeam : homeTeam)} by ${Math.abs(an - hn)}` : null

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		if (busy || closed) return
		if (an === null || hn === null) return setMsg({ kind: "error", text: "Enter both scores." })
		if (an === hn) return setMsg({ kind: "error", text: "Pick a winner: the scores cannot be tied." })
		setBusy(true)
		setMsg(null)
		const r = await post("/api/league/account/pick", { competition: "btb", eventId, payload: { away: an, home: hn } })
		setBusy(false)
		if (r.ok) {
			setSaved({ away: an, home: hn })
			setMsg({ kind: "ok", text: "Saved. You can change it until kickoff." })
			router.refresh()
		} else if (r.status === 401) {
			window.location.assign("/league/sign-in?next=/league")
		} else if (r.status === 409) {
			setClosed(true)
			setMsg({ kind: "error", text: "This game just locked. Your last saved pick stands." })
		} else setMsg({ kind: "error", text: r.message })
	}

	const rows = [
		{ team: awayTeam, tag: "Away", value: a, set: setA },
		{ team: homeTeam, tag: "Home", value: h, set: setH },
	]
	return (
		<form onSubmit={submit} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-label={`Week ${week} pick: ${nick(awayTeam)} at ${nick(homeTeam)}`} noValidate>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
					Week {week} <span aria-hidden>·</span> {kickoffLabel}
				</p>
				{closed ? (
					<span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
						<Lock aria-hidden className="h-3 w-3" /> Picks closed
					</span>
				) : (
					<Countdown lockAt={lockAt} className="text-xs font-semibold text-muted-foreground" />
				)}
			</div>
			<div className="mt-4 grid gap-3">
				{rows.map((r) => (
					<div key={r.team} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
						<div className="flex min-w-0 items-center gap-2">
							<span aria-hidden className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15" style={{ backgroundColor: teamColor(r.team) }} />
							<span className="truncate font-serif text-xl font-bold">{nick(r.team)}</span>
							<span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{r.tag}</span>
						</div>
						<Stepper label={`${nick(r.team)} score`} value={r.value} onChange={(v) => (r.set(v), setMsg(null))} disabled={closed} />
					</div>
				))}
			</div>
			<div className="mt-4 flex flex-wrap items-center gap-3">
				<Button type="submit" disabled={busy || closed || !dirty} aria-busy={busy}>
					{busy ? (
						<>
							<Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> Saving
						</>
					) : saved && !dirty ? (
						<>
							<Check aria-hidden className="mr-1.5 h-4 w-4" strokeWidth={3} /> Locked in
						</>
					) : saved ? (
						"Update pick"
					) : (
						"Lock in pick"
					)}
				</Button>
				{summary && <p className="text-sm text-muted-foreground">Your call: {summary}</p>}
			</div>
			<p aria-live="polite" role="status" className={cn("mt-2 min-h-[1.25rem] text-sm font-medium", msg?.kind === "error" ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground")}>
				{msg?.text}
			</p>
		</form>
	)
}
