import Link from "next/link"
import { ArrowRight, Check, Clock, Flag, Share2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { FlagPlant, FlagSummary } from "@/lib/predictions"

const SITE_URL = "https://www.raidersrundown.com"

/**
 * The newest bold call, front and center: a specific claim, its status, and a
 * one-tap share. Open flags read as a dare; graded ones as a receipt.
 */
export default function FlagCard({ flag, summary }: { flag: FlagPlant; summary: FlagSummary }) {
	const hit = flag.result === "hit"
	const miss = flag.result === "miss"
	const open = !hit && !miss
	const decided = summary.hit + summary.miss

	const text = open
		? `I'm planting a flag: ${flag.text}. Screenshot this.`
		: hit
			? `Flag planted, flag delivered: ${flag.text}.`
			: `I planted a flag and missed: ${flag.text}. It's on the record either way.`
	const shareHref = `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url: `${SITE_URL}/predictions#flags` }).toString()}`

	const Icon = hit ? Check : miss ? X : Clock

	return (
		<section aria-labelledby="flag-planted" className="container pt-14">
			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
				<div className="grid md:grid-cols-[auto_1fr]">
					<div className="flex items-center gap-3 border-b border-border bg-muted/50 px-6 py-4 md:flex-col md:items-start md:justify-center md:border-b-0 md:border-r md:px-8">
						<span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
							<Flag aria-hidden className="h-6 w-6" />
						</span>
						<div>
							<p id="flag-planted" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
								Flag planted · Week {flag.week}
							</p>
							{decided > 0 && (
								<p className="text-sm font-semibold tabular-nums">
									Season: {summary.hit}&ndash;{summary.miss}
									{summary.open > 0 ? `, ${summary.open} open` : ""}
								</p>
							)}
						</div>
					</div>

					<div className="p-6 md:p-8">
						<p className="font-serif text-2xl font-bold leading-snug tracking-tight md:text-3xl">&ldquo;{flag.text}&rdquo;</p>
						{flag.detail && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{flag.detail}</p>}
						{flag.resultNote && !open && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{flag.resultNote}</p>}

						<div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
									hit && "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400",
									miss && "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400",
									open && "border-border bg-muted text-muted-foreground"
								)}
							>
								<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
								{hit ? "Delivered" : miss ? "Missed" : "Open: graded after the game"}
							</span>
							<a
								href={shareHref}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
							>
								<Share2 aria-hidden className="h-4 w-4" /> Share this flag
								<span className="sr-only"> (opens in a new tab)</span>
							</a>
							<Link href="/predictions#flags" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
								The full ledger <ArrowRight aria-hidden className="h-3.5 w-3.5" />
							</Link>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}
