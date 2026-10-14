import { GROUP_META } from "@/lib/lab/playersKit"
import { type PairResult, pairChance, threeWay, whyDiffer } from "@/lib/lab/v2/kit"
import type { V2Data, V2Row } from "@/lib/lab/v2/types"

const lastName = (p: V2Row) => p.name.split(" ").slice(-1)[0]

/**
 * Two players, three answers: who has played better this season (the lead), who has added more so far, and how the projections
 * compare. Each row names a leader only when the gap is bigger than the numbers' own uncertainty. A chance of beating the other over the
 * rest of the season appears only for two quarterbacks in the window it was checked on.
 */
export default function V2Compare({ data, a, b, colors }: { data: V2Data; a: V2Row; b: V2Row; colors: { a: string; b: string } }) {
	const rows = threeWay(data, a, b)
	const pair: PairResult = pairChance(data, a, b)
	const why = [whyDiffer(data, a), whyDiffer(data, b)].filter((x): x is string => Boolean(x))
	const meta = GROUP_META[a.group]
	const leads = rows.map((r) => r.lead)
	const disagree = new Set(leads.filter((l) => l !== null)).size > 1
	return (
		<section className="mt-6" aria-label="This season, contribution and projection" data-testid="v2-compare">
			<h2 className="m-0 font-serif text-2xl font-bold">Three questions about {lastName(a)} and {lastName(b)}</h2>
			<p className="m-0 mt-1 max-w-3xl text-sm text-lab-soft">Who is playing better right now, who has added more so far, and who the projection favors. These are different questions, so they can have different answers.</p>
			<div className="mt-4 grid gap-3 md:grid-cols-3">
				{rows.map((r) => (
					<div key={r.id} className={`rounded-2xl border bg-lab-surface p-4 ${r.id === "projection" ? "border-dashed border-lab-line-strong" : "border-lab-line"}`} data-testid={`v2-compare-${r.id}`}>
						<p className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{r.title}</p>
						<div className="mt-3 grid grid-cols-2 gap-3">
							{(["a", "b"] as const).map((s) => {
								const v = r[s]
								const p = s === "a" ? a : b
								return (
									<div key={s} className="min-w-0">
										<p className="m-0 truncate text-xs text-lab-muted">{lastName(p)}</p>
										{v ? (
											<>
												<p className="m-0 font-mono text-2xl font-bold tabular-nums leading-tight" style={{ color: r.lead === s ? colors[s] : undefined }}>{v.text}</p>
												<p className="m-0 text-[11px] leading-snug text-lab-muted">{v.sub}</p>
											</>
										) : (
											<p className="m-0 text-sm text-lab-muted">None</p>
										)}
									</div>
								)
							})}
						</div>
						<p className="m-0 mt-3 text-xs font-semibold text-lab-ink" data-testid={`v2-compare-${r.id}-lead`}>
							{r.lead ? `${lastName(r.lead === "a" ? a : b)} is ahead` : r.id === "contribution" ? "Shown, not scored: more plays add more points" : r.close ? "Too close to call" : "No call"}
						</p>
					</div>
				))}
			</div>
			{disagree ? (
				<p className="m-0 mt-3 max-w-3xl text-sm leading-relaxed text-lab-soft" data-testid="v2-compare-disagree">
					<span className="font-semibold text-lab-ink">They do not agree. </span>
					{why.length ? why.join(" ") : `The projection counts earlier seasons and this season's plays only count for part of it.`}
				</p>
			) : null}
			{pair.kind === "chance" || pair.kind === "toss-up" ? (
				<p className="m-0 mt-3 max-w-3xl rounded-xl border border-lab-line-strong bg-lab-tint px-4 py-3 text-sm leading-relaxed text-lab-soft" data-testid="v2-compare-chance">
					<span className="font-semibold text-lab-ink">Rest of the season. </span>
					{pair.text} This is the chance that his EPA per dropback in the games still to come is higher, luck included. It is not a chance that he is the better quarterback. Checked on past seasons; it is never shown above {Math.round((data.method.pairwise?.display.cap ?? 0.8) * 100)}%.
				</p>
			) : a.group === "qb" && b.group === "qb" ? (
				<p className="m-0 mt-3 max-w-3xl text-xs leading-relaxed text-lab-muted" data-testid="v2-compare-nochance">No chance is shown: {pair.text}</p>
			) : (
				<p className="m-0 mt-3 max-w-3xl text-xs leading-relaxed text-lab-muted" data-testid="v2-compare-nochance">No chance of beating the other is shown for {meta.peers}. {pair.text}</p>
			)}
		</section>
	)
}
