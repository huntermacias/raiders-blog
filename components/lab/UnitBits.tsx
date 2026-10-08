import { type CSSProperties } from "react"

import { ordinal } from "@/lib/lab/unitsKit"

/**
 * One pairing on a line from the weakest unit in the league (left) to the best (right). The offense is a circle and
 * the defense a diamond, so the two never rely on color alone. Whoever sits further right wins the pairing, and the
 * stretch between the two is drawn in the winner's color.
 */
export function PairRail({
	attack,
	defend,
	attackColor,
	defendColor,
	attackName,
	defendName,
}: {
	attack: { score: number; rank: number }
	defend: { score: number; rank: number }
	attackColor: string
	defendColor: string
	attackName: string
	defendName: string
}) {
	const lo = Math.min(attack.score, defend.score)
	const hi = Math.max(attack.score, defend.score)
	const winner = attack.score >= defend.score ? attackColor : defendColor
	const at = (s: number) => `${Math.max(2, Math.min(98, s))}%`
	return (
		<div>
			<div
				className="relative h-7"
				role="img"
				aria-label={`${attackName} offense ranks ${ordinal(attack.rank)}; ${defendName} defense ranks ${ordinal(defend.rank)}. Further right is better.`}
			>
				<div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-lab-tint ring-1 ring-inset ring-lab-line" />
				<div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-60" style={{ left: at(lo), width: `${Math.max(0, hi - lo)}%`, background: winner }} />
				<span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-lab-page" style={{ left: at(attack.score), background: attackColor }} />
				<span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ring-2 ring-lab-page" style={{ left: at(defend.score), background: defendColor }} />
			</div>
			<div className="mt-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">
				<span>Weakest</span>
				<span>Best</span>
			</div>
		</div>
	)
}

/** A team's tag: a dot in its color and its name. */
export function TeamTag({ color, name, shape = "dot" }: { color: string; name: string; shape?: "dot" | "diamond" }) {
	const style: CSSProperties = { background: color }
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className={`block h-2.5 w-2.5 ${shape === "dot" ? "rounded-full" : "rotate-45"}`} style={style} aria-hidden="true" />
			{name}
		</span>
	)
}

/** "28th" in a small, even-width pill. */
export function RankPill({ rank, n = 32 }: { rank: number; n?: number }) {
	return (
		<span className="inline-block min-w-[2.75rem] rounded-full border border-lab-line bg-lab-tint px-2 py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums" title={`${ordinal(rank)} of ${n}`}>
			{ordinal(rank)}
		</span>
	)
}

/** The strength of an edge in words, as a badge. */
export function EdgeBadge({ label, tier, color, ink }: { label: string; tier: "big" | "edge" | "even"; color: string | null; ink: string | null }) {
	if (tier === "even" || !color) {
		return <span className="inline-block rounded-full border border-lab-line px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-lab-muted">{label}</span>
	}
	return (
		<span
			className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${tier === "big" ? "" : "bg-lab-tint ring-1 ring-inset"}`}
			style={tier === "big" ? { background: color, color: ink ?? "var(--lab-page)" } : { color, boxShadow: `inset 0 0 0 1px ${color}` }}
		>
			{label}
		</span>
	)
}
