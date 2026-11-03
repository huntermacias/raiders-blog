"use client"

import { cn } from "@/lib/utils"
import type { StoryType, StoryTypeId } from "@/lib/storyType"

type Props = {
	total: number
	types: { type: StoryType; count: number }[]
	active: StoryTypeId | "all"
	onChange: (id: StoryTypeId | "all") => void
}

/** "All 45, Previews 9, Power Rankings 5 ..." The kinds of story the site has, with how many of each. */
export default function TypeChips({ total, types, active, onChange }: Props) {
	const items: { id: StoryTypeId | "all"; label: string; count: number }[] = [
		{ id: "all", label: "All", count: total },
		...types.map(({ type, count }) => ({ id: type.id, label: type.plural, count })),
	]
	return (
		<div role="tablist" aria-label="Kinds of story" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
			{items.map((item) => {
				const on = active === item.id
				return (
					<button
						key={item.id}
						type="button"
						role="tab"
						aria-selected={on}
						onClick={() => onChange(item.id)}
						className={cn(
							"inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
							on ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
						)}
					>
						{item.label}
						<span className={cn("rounded-full px-1.5 text-xs tabular-nums", on ? "bg-background/20" : "bg-muted")}>{item.count}</span>
					</button>
				)
			})}
		</div>
	)
}
