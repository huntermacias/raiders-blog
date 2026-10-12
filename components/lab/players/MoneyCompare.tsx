import { type MoneyRow } from "@/lib/lab/contractsKit"

/** The money rows of a comparison: both numbers in words, and, for dollar amounts, two bars to the same scale. */
export default function MoneyCompare({ rows, aName, bName, colorB }: { rows: MoneyRow[]; aName: string; bName: string; colorB: string }) {
	return (
		<div className="overflow-hidden rounded-xl border border-lab-line" data-testid="money-compare">
			<ul className="m-0 list-none p-0">
				{rows.map((r) => {
					const max = Math.max(r.an ?? 0, r.bn ?? 0)
					const w = (v: number | null) => (r.bars && v !== null && max > 0 ? Math.max(2, (v / max) * 100) : 0)
					return (
						<li key={r.key} className="border-t border-lab-line px-4 py-3 first:border-t-0" data-testid="money-row">
							<h3 className="m-0 text-sm font-semibold text-lab-ink">{r.label}</h3>
							<div className="mt-2 grid gap-1.5">
								<div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_6.5rem]">
									<span className="hidden truncate text-xs text-lab-muted sm:block">{aName}</span>
									<span className="relative h-2.5 rounded-full bg-lab-line" aria-hidden="true">
										{r.bars ? <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w(r.an)}%`, background: "var(--pc-accent)" }} /> : null}
									</span>
									<span className="font-mono text-sm font-bold tabular-nums text-lab-ink">
										<span className="mr-1 text-lab-muted sm:hidden">A</span>
										{r.a}
									</span>
								</div>
								<div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_6.5rem]">
									<span className="hidden truncate text-xs text-lab-muted sm:block">{bName}</span>
									<span className="relative h-2.5 rounded-full bg-lab-line" aria-hidden="true">
										{r.bars ? <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w(r.bn)}%`, background: colorB }} /> : null}
									</span>
									<span className="font-mono text-sm font-bold tabular-nums text-lab-ink">
										<span className="mr-1 text-lab-muted sm:hidden">B</span>
										{r.b}
									</span>
								</div>
							</div>
							{r.note ? <p className="m-0 mt-1.5 text-xs text-lab-muted">{r.note}</p> : null}
						</li>
					)
				})}
			</ul>
		</div>
	)
}
