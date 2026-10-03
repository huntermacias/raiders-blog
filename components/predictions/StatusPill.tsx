import { Check, Clock, Minus, Target, TrendingDown, TrendingUp, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { PickResult, SeasonStatus } from "@/lib/predictions"

// Status colors always travel with an icon AND a text label, so the meaning
// never depends on telling green from red.
const TONES = {
	good: "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400",
	bad: "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400",
	warn: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:text-amber-400",
	neutral: "border-border bg-muted text-muted-foreground",
} as const

function Pill({ tone, icon: Icon, label, className }: { tone: keyof typeof TONES; icon: typeof Check; label: string; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
				TONES[tone],
				className
			)}
		>
			<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
			{label}
		</span>
	)
}

export function PickPill({ result, className }: { result: PickResult; className?: string }) {
	switch (result) {
		case "hit":
			return <Pill tone="good" icon={Check} label="Called it" className={className} />
		case "miss":
			return <Pill tone="bad" icon={X} label="Missed" className={className} />
		case "push":
			return <Pill tone="neutral" icon={Minus} label="Push" className={className} />
		default:
			return <Pill tone="neutral" icon={Clock} label="Pending" className={className} />
	}
}

export function SeasonPill({ status, label, className }: { status: SeasonStatus; label: string; className?: string }) {
	switch (status) {
		case "hit":
			return <Pill tone="good" icon={Check} label={label} className={className} />
		case "close":
			return <Pill tone="warn" icon={Minus} label={label} className={className} />
		case "miss":
			return <Pill tone="bad" icon={X} label={label} className={className} />
		case "over":
			return <Pill tone="warn" icon={TrendingUp} label={label} className={className} />
		case "under":
			return <Pill tone="warn" icon={TrendingDown} label={label} className={className} />
		case "alive":
			return <Pill tone="neutral" icon={Target} label={label} className={className} />
		default:
			return <Pill tone="neutral" icon={Minus} label={label} className={className} />
	}
}
