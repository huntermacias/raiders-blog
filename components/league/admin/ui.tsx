"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Notice } from "@/components/league/account/kit"
import { cn } from "@/lib/utils"
import { MIN_REASON } from "./api"

export function Panel({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
	return (
		<section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id={id} className="font-serif text-xl font-bold tracking-tight">
					{title}
				</h2>
				{aside}
			</div>
			<div className="mt-3">{children}</div>
		</section>
	)
}

const TONES = { neutral: "bg-muted text-foreground", good: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200", warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200", bad: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200" }
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
	return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", TONES[tone])}>{children}</span>
}

export const inputCls = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
			{label}
			<span className="mt-1 block normal-case tracking-normal text-foreground">{children}</span>
		</label>
	)
}

/**
 * A button that opens a small form. Every action that changes something asks for a written reason (at least ten
 * characters), which goes into the audit trail with the admin's id. `run` returns an error message, or null on
 * success; the form stays open on failure so nothing typed is lost.
 */
export function ActionBox({ label, title, tone = "default", children, onSubmit, canSubmit = true, confirmLabel = "Confirm", needsReason = true, onDone }: { label: string; title?: string; tone?: "default" | "danger"; children?: React.ReactNode; onSubmit: (reason: string) => Promise<string | null>; canSubmit?: boolean; confirmLabel?: string; needsReason?: boolean; onDone?: (message: string) => void }) {
	const [open, setOpen] = React.useState(false)
	const [reason, setReason] = React.useState("")
	const [busy, setBusy] = React.useState(false)
	const [err, setErr] = React.useState<string | null>(null)
	const id = React.useId()
	const short = needsReason && reason.trim().length < MIN_REASON

	async function go(e: React.FormEvent) {
		e.preventDefault()
		if (short || busy || !canSubmit) return
		setBusy(true)
		setErr(null)
		const m = await onSubmit(reason.trim())
		setBusy(false)
		if (m) return setErr(m)
		setOpen(false)
		setReason("")
		onDone?.(`${label}: done`)
	}

	if (!open)
		return (
			<Button type="button" size="sm" variant={tone === "danger" ? "destructive" : "outline"} onClick={() => setOpen(true)} aria-haspopup="true">
				{label}
			</Button>
		)
	return (
		<form onSubmit={go} aria-label={title ?? label} className={cn("mt-2 w-full rounded-xl border p-3", tone === "danger" ? "border-rose-300/70 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20" : "border-border bg-muted/40")}>
			<p className="text-sm font-semibold">{title ?? label}</p>
			{children && <div className="mt-2 grid gap-2 sm:grid-cols-2">{children}</div>}
			{needsReason && (
				<div className="mt-2">
					<label htmlFor={`${id}-r`} className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Reason (kept in the audit log)
					</label>
					<textarea id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className={cn(inputCls, "mt-1 h-auto py-2")} aria-describedby={`${id}-h`} />
					<p id={`${id}-h`} className={cn("mt-1 text-xs", short ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-400")}>
						{short ? `At least ${MIN_REASON} characters (${reason.trim().length} so far).` : "Looks good."}
					</p>
				</div>
			)}
			<div className="mt-2 flex flex-wrap gap-2">
				<Button type="submit" size="sm" variant={tone === "danger" ? "destructive" : "default"} disabled={short || busy || !canSubmit} aria-busy={busy}>
					{busy ? <Loader2 aria-hidden className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
					{confirmLabel}
				</Button>
				<Button type="button" size="sm" variant="ghost" onClick={() => (setOpen(false), setErr(null))}>
					Cancel
				</Button>
			</div>
			{err && (
				<div className="mt-2">
					<Notice kind="error">{err}</Notice>
				</div>
			)}
		</form>
	)
}

/** Loading, error and empty states in one place so each panel handles all three. */
export function Async({ state, error, children, empty }: { state: "loading" | "error" | "ready"; error?: string; children: React.ReactNode; empty?: React.ReactNode }) {
	if (state === "loading")
		return (
			<div role="status" aria-live="polite" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
				<Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading…
			</div>
		)
	if (state === "error") return <Notice kind="error">{error || "That did not load."}</Notice>
	return <>{empty ?? children}</>
}

export function useLoad<T>(load: () => Promise<{ ok: true; data: T } | { ok: false; message: string }>, deps: React.DependencyList) {
	const [state, setState] = React.useState<"loading" | "error" | "ready">("loading")
	const [data, setData] = React.useState<T | null>(null)
	const [error, setError] = React.useState("")
	const [tick, setTick] = React.useState(0)
	React.useEffect(() => {
		let live = true
		setState("loading")
		load().then((r) => {
			if (!live) return
			if (r.ok) (setData(r.data), setState("ready"))
			else (setError(r.message), setState("error"))
		})
		return () => {
			live = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, tick])
	return { state, data, error, reload: () => setTick((n) => n + 1) }
}
