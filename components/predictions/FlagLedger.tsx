import Link from "@/components/SiteLink"
import { ArrowRight, Share2 } from "lucide-react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { type FlagPlant, summarizeFlags } from "@/lib/predictions"
import { PickPill } from "./StatusPill"

function shareUrl(flag: FlagPlant, pageUrl: string) {
	const lead = flag.result === "hit" ? "Called it" : flag.result === "miss" ? "Swung and missed" : "Flag planted"
	const text = `${lead}: ${flag.text}`
	const params = new URLSearchParams({ text, url: `${pageUrl}#flag-${flag._id}` })
	return `https://twitter.com/intent/tweet?${params.toString()}`
}

/**
 * The flag-plant ledger: bold, specific calls that go on the record before the
 * game and get graded after. Open calls first, then graded ones, newest first.
 */
export default function FlagLedger({ flags, pageUrl }: { flags: FlagPlant[]; pageUrl: string }) {
	const summary = summarizeFlags(flags)
	const decided = summary.hit + summary.miss

	const sorted = [...flags].sort((a, b) => {
		const aOpen = a.result ? 1 : 0
		const bOpen = b.result ? 1 : 0
		if (aOpen !== bOpen) return aOpen - bOpen
		return b.week - a.week
	})

	return (
		<div>
			<p className="mb-5 text-sm text-muted-foreground">
				<strong className="font-serif text-2xl font-bold tabular-nums text-foreground">
					{summary.hit}&ndash;{summary.miss}
				</strong>{" "}
				<span className="ml-1">
					{decided > 0 ? `on graded flags` : "no flags graded yet"}
					{summary.open > 0 ? ` · ${summary.open} open` : ""}
				</span>
			</p>

			<ul className="grid gap-4 md:grid-cols-2">
				{sorted.map((f) => (
					<li key={f._id} id={`flag-${f._id}`} className="scroll-mt-24">
						<Card className={cn("flex h-full flex-col border-border/70 p-5", f.result === undefined || f.result === null ? "" : "bg-card")}>
							<div className="mb-3 flex items-center justify-between gap-3">
								<span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Week {f.week}</span>
								<PickPill result={f.result === "hit" ? "hit" : f.result === "miss" ? "miss" : "pending"} />
							</div>

							<p className="font-serif text-xl font-bold leading-snug tracking-tight">{f.text}</p>
							{f.detail && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.detail}</p>}

							{f.result && f.resultNote && (
								<p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
									<strong className="text-foreground">What happened:</strong> {f.resultNote}
								</p>
							)}

							<div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4 text-sm">
								{f.post?.slug ? (
									<Link href={`/post/${f.post.slug}`} className="inline-flex items-center gap-1 font-semibold hover:underline">
										Where I planted it <ArrowRight aria-hidden className="h-3.5 w-3.5" />
									</Link>
								) : (
									<span />
								)}
								<a
									href={shareUrl(f, pageUrl)}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline"
								>
									<Share2 aria-hidden className="h-3.5 w-3.5" /> Share on X
									<span className="sr-only"> (opens in a new tab)</span>
								</a>
							</div>
						</Card>
					</li>
				))}
			</ul>
		</div>
	)
}
