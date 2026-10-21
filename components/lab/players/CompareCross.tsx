import type { Comparison } from "@/lib/lab/compareKit"

/**
 * The note that comes with a comparison between two positions: one line saying what is being compared, and underneath it (open on tap, and
 * readable with scripts off) what the numbers cannot tell you. Nothing here is a number; it only says how far the numbers above can be read.
 */
export default function CompareCross({ c }: { c: Comparison }) {
	const x = c.cross
	if (!x) return null
	const counted = c.options.length
	return (
		<aside className="mt-3 rounded-2xl border border-lab-line-strong bg-lab-surface px-4 py-3 sm:px-5" aria-label="About comparing two positions" data-testid="cross-note">
			<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">
				Different positions &middot; {x.tags.a} vs {x.tags.b} &middot; {x.title}
			</p>
			<p className="m-0 mt-1 text-sm leading-relaxed text-lab-soft">
				Compared on the {counted} {counted === 1 ? "stat" : "stats"} both positions are measured on the same way (style stats are listed, not scored), ranked on one scale among {x.pool}. Each number also shows where he ranks at his own position.
			</p>
			<details className="group mt-2">
				<summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 text-sm font-semibold text-lab-ink outline-none focus-visible:ring-2 focus-visible:ring-lab-ink [&::-webkit-details-marker]:hidden">
					What this cannot tell you
					<span aria-hidden="true" className="text-lab-muted transition group-open:rotate-180">
						&#9662;
					</span>
				</summary>
				<ul className="m-0 mb-1 mt-1 grid list-none gap-2 p-0 text-sm leading-relaxed text-lab-soft">
					{[...x.caveats, ...x.skipped].map((t) => (
						<li key={t} className="rounded-xl border border-lab-line bg-lab-tint px-3 py-2">
							{t}
						</li>
					))}
				</ul>
			</details>
		</aside>
	)
}
