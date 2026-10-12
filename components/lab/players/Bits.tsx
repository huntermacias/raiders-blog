import { type Confidence, CONFIDENCE_WORD, type Tier, TIER_WORD } from "@/lib/lab/playersKit"

export const UP = "text-emerald-700 dark:text-emerald-400"
export const DOWN = "text-rose-700 dark:text-rose-400"

/** Good, bad and middling are each an arrow or a dot and a word as well as a color. */
const TIER_MARK: Record<Tier, { mark: string; cls: string }> = {
	elite: { mark: "▲", cls: UP },
	great: { mark: "▲", cls: UP },
	good: { mark: "▲", cls: UP },
	typical: { mark: "●", cls: "text-lab-soft" },
	below: { mark: "▼", cls: DOWN },
	poor: { mark: "▼", cls: DOWN },
	worst: { mark: "▼", cls: DOWN },
}

export function TierChip({ tier, className = "" }: { tier: Tier; className?: string }) {
	const t = TIER_MARK[tier]
	return (
		<span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${t.cls} ${className}`}>
			<span aria-hidden="true" className="text-[9px]">{t.mark}</span>
			{TIER_WORD[tier]}
		</span>
	)
}

/** How sure a change is, in a word, so a thin sample never reads like a trend. */
export function ConfidenceChip({ conf, className = "" }: { conf: Confidence; className?: string }) {
	const strong = conf === "clear"
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${strong ? "border-lab-ink text-lab-ink" : "border-lab-line-strong text-lab-muted"} ${className}`}
		>
			{CONFIDENCE_WORD[conf]}
		</span>
	)
}

export function TeamPill({ team }: { team: string }) {
	return (
		<span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "var(--pc-accent)", color: "var(--pc-on)" }}>
			{team}
		</span>
	)
}

/** A change in grade points, with a direction that does not depend on color. */
export function Delta({ v, className = "" }: { v: number | undefined | null; className?: string }) {
	if (v === undefined || v === null) return <span className="text-lab-muted">–</span>
	if (Math.abs(v) < 1) return <span className={`text-lab-muted ${className}`}>even</span>
	const up = v > 0
	return (
		<span className={`inline-flex items-center gap-1 font-mono font-bold tabular-nums ${up ? UP : DOWN} ${className}`}>
			<span aria-hidden="true">{up ? "▲" : "▼"}</span>
			{`${up ? "+" : "−"}${Math.abs(v).toFixed(1)}`}
			<span className="sr-only">{up ? "grade points up" : "grade points down"}</span>
		</span>
	)
}
