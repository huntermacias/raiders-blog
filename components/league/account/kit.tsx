"use client"

import * as React from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** The card every account page sits in. Dark band on top matches the League hero. */
export function AuthShell({ eyebrow, title, intro, children, footer }: { eyebrow?: string; title: string; intro?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
	return (
		<div className="container py-10 md:py-16">
			<div className="mx-auto w-full max-w-md">
				<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
					<div className="relative bg-[#09090b] px-6 py-6 text-zinc-50 md:px-8">
						<div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(70% 120% at 100% 0%, rgba(161,161,170,0.16) 0%, rgba(9,9,11,0) 60%)" }} />
						<div className="relative">
							{eyebrow && <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{eyebrow}</p>}
							<h1 className="mt-1 font-serif text-3xl font-bold leading-tight tracking-tight">{title}</h1>
							{intro && <p className="mt-2 text-sm text-zinc-300">{intro}</p>}
						</div>
					</div>
					<div className="px-6 py-6 md:px-8">{children}</div>
				</div>
				{footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
			</div>
		</div>
	)
}

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
	return (
		<div>
			<label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				{label}
			</label>
			{children}
			{hint && !error && (
				<p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
					{hint}
				</p>
			)}
			{error && (
				<p id={`${id}-err`} role="alert" className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-400">
					{error}
				</p>
			)}
		</div>
	)
}

export function TextInput(props: React.ComponentProps<typeof Input> & { id: string; invalid?: boolean; hintId?: boolean }) {
	const { invalid, hintId, ...rest } = props
	return <Input {...rest} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${props.id}-err` : hintId ? `${props.id}-hint` : undefined} />
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password"; invalid?: boolean; placeholder?: string }) {
	const [shown, setShown] = React.useState(false)
	return (
		<div className="relative">
			<TextInput id={id} type={shown ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} invalid={invalid} className="pr-11" placeholder={placeholder} maxLength={128} />
			<button
				type="button"
				onClick={() => setShown((s) => !s)}
				aria-label={shown ? "Hide password" : "Show password"}
				aria-pressed={shown}
				className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{shown ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
			</button>
		</div>
	)
}

export function Hints({ items }: { items: { ok: boolean; label: string }[] }) {
	return (
		<ul className="mt-2 grid gap-1 text-xs" aria-label="Password rules">
			{items.map((h) => (
				<li key={h.label} className={cn("flex items-center gap-2", h.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
					<span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", h.ok ? "bg-emerald-600" : "bg-zinc-400")} />
					<span>
						{h.label}
						<span className="sr-only">{h.ok ? ": done" : ": not yet"}</span>
					</span>
				</li>
			))}
		</ul>
	)
}

export function Submit({ busy, children, busyLabel = "One sec", disabled }: { busy: boolean; children: React.ReactNode; busyLabel?: string; disabled?: boolean }) {
	return (
		<Button type="submit" disabled={busy || disabled} className="w-full" aria-busy={busy}>
			{busy ? (
				<>
					<Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> {busyLabel}
				</>
			) : (
				children
			)}
		</Button>
	)
}

/** A polite live region for form-level errors and confirmations. */
export function Notice({ kind, children }: { kind: "error" | "ok" | "info"; children: React.ReactNode }) {
	if (!children) return <p aria-live="polite" className="min-h-[1.25rem]" />
	const tone = kind === "error" ? "border-rose-300/60 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200" : kind === "ok" ? "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-border bg-muted text-foreground"
	return (
		<p role={kind === "error" ? "alert" : "status"} aria-live="polite" className={cn("rounded-lg border px-3 py-2 text-sm", tone)}>
			{children}
		</p>
	)
}
