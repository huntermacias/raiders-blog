import { Check, Circle, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { type PickKey, tallyKeys } from "@/lib/predictions"

// Same rule as the rest of the scoreboard: a status color never travels
// alone. Every key shows an icon AND a word (Hit / Missed / Open).
const STATE = {
	hit: {
		label: "Hit",
		Icon: Check,
		box: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400",
	},
	miss: {
		label: "Missed",
		Icon: X,
		box: "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400",
	},
	open: {
		label: "Open",
		Icon: Circle,
		box: "border-border bg-muted text-muted-foreground",
	},
} as const

function keyState(k: PickKey): keyof typeof STATE {
	return k.result === "hit" ? "hit" : k.result === "miss" ? "miss" : "open"
}

type Props = {
	keys?: PickKey[] | null
	/** "card" is the standalone box (articles, recaps). "compact" lives inside a pick card. */
	variant?: "card" | "compact"
	title?: string
	className?: string
}

/**
 * The pre-game "keys to the game", graded after the final. Server-safe and
 * purely presentational: it only reads the keys it is given.
 */
export default function KeysScorecard({ keys, variant = "card", title = "Keys to the game", className }: Props) {
	const list = keys ?? []
	if (list.length === 0) return null

	const t = tallyKeys(list)
	const graded = t.hit + t.miss
	const summary = graded > 0 ? `${t.hit} of ${graded} hit` : "Graded after the game"
	const compact = variant === "compact"

	const rows = (
		<ul className={cn(compact ? "space-y-1.5" : "space-y-2.5")}>
			{list.map((k, i) => {
				const st = STATE[keyState(k)]
				return (
					<li key={k._key ?? i} className="flex items-start gap-2.5">
						<span
							className={cn(
								"mt-0.5 inline-flex w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
								st.box
							)}
						>
							<st.Icon aria-hidden className="h-3 w-3" strokeWidth={3} />
							{st.label}
						</span>
						<span className={cn("min-w-0 leading-snug", compact ? "text-sm" : "text-base")}>{k.text}</span>
					</li>
				)
			})}
		</ul>
	)

	if (compact) {
		return (
			<div className={className}>
				<p className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
					<span>Keys</span>
					<span className="normal-case tracking-normal tabular-nums">{summary}</span>
				</p>
				{rows}
			</div>
		)
	}

	return (
		<aside aria-label={title} className={cn("rounded-xl border border-border bg-card p-5 shadow-sm", className)}>
			<div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 className="font-serif text-xl font-bold tracking-tight">{title}</h2>
				<p className="text-sm font-semibold tabular-nums text-muted-foreground">{summary}</p>
			</div>
			{rows}
		</aside>
	)
}
