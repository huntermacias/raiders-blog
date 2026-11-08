import { ArrowDown, ArrowUp, Minus, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { RankRow } from "@/lib/rankings"

/**
 * Movement is never colour alone: an arrow icon AND the number of spots, or a plain dash / "New" word when there is nothing to compare to.
 */
export default function Move({ row, hasPrev, dark = false, className }: { row: Pick<RankRow, "change">; hasPrev: boolean; dark?: boolean; className?: string }) {
	if (!hasPrev) return <span className="sr-only">First week of rankings</span>

	if (row.change === null) {
		return (
			<span className={cn("inline-flex items-center gap-1 text-xs font-semibold", dark ? "text-zinc-400" : "text-muted-foreground", className)}>
				<Sparkles aria-hidden className="h-3.5 w-3.5" /> New
			</span>
		)
	}

	const up = row.change > 0
	const flat = row.change === 0
	const Icon = flat ? Minus : up ? ArrowUp : ArrowDown
	const tone = flat
		? dark
			? "text-zinc-400"
			: "text-muted-foreground"
		: up
			? dark
				? "text-emerald-400"
				: "text-emerald-700 dark:text-emerald-400"
			: dark
				? "text-rose-400"
				: "text-rose-700 dark:text-rose-400"

	return (
		<span className={cn("inline-flex items-center gap-0.5 text-sm font-bold tabular-nums", tone, className)}>
			<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
			{flat ? <span className="sr-only">No change</span> : Math.abs(row.change)}
			{!flat && <span className="sr-only">{up ? " spots up" : " spots down"}</span>}
		</span>
	)
}
