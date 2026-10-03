import { teamInfo } from "@/lib/nfl"
import { cn } from "@/lib/utils"

/**
 * Compact team marker: a small color dot plus the abbreviation. The dot is
 * decorative (aria-hidden) -- the abbreviation text carries the identity, so
 * nothing depends on color alone. No logos on purpose (trademark/hotlinking).
 */
export function TeamChip({ team, className }: { team: string; className?: string }) {
	const t = teamInfo(team)
	return (
		<span
			title={t.name}
			className={cn(
				"inline-flex h-6 min-w-[2.75rem] items-center justify-center gap-1.5 rounded-md border border-border bg-muted px-1.5 text-[11px] font-bold tracking-wide tabular-nums",
				className
			)}
		>
			<span aria-hidden className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/15" style={{ backgroundColor: t.color }} />
			{t.abbr}
		</span>
	)
}
