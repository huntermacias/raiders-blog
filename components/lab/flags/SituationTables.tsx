import { type Matrix, type MixRow, pctText } from "@/lib/lab/flagsSituations"

const BAD = "text-rose-700 dark:text-rose-400"
const th = "py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted"

const indexText = (i: number | null): string => (i == null ? "n/a" : `${i.toFixed(1)}x`)

/** One dimension of the game as a table: how often flags come in each spot, what each cost, and how that compares with the league (when the rows are a team's). */
export function MixTable({ rows, caption, showIndex }: { rows: MixRow[]; caption: string; showIndex: boolean }) {
	const max = Math.max(0.01, ...rows.map((r) => r.share))
	return (
		<div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto [contain:paint]">
			<table className="w-full min-w-[34rem] border-collapse text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="text-left">
						<th scope="col" className={`${th} pr-2`}>
							Spot
						</th>
						<th scope="col" className={`${th} px-2 text-right`}>
							Flags
						</th>
						<th scope="col" className={`${th} px-2`}>
							Share of flags
						</th>
						<th scope="col" className={`${th} px-2 text-right`}>
							Cost each
						</th>
						{showIndex ? (
							<th scope="col" className={`${th} px-2 text-right`}>
								Vs league
							</th>
						) : null}
						<th scope="col" className={`${th} pl-2`}>
							Most often
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.id} className="border-t border-lab-line align-middle">
							<th scope="row" className="py-2 pr-2 text-left font-semibold text-lab-ink">
								{r.label}
							</th>
							<td className="px-2 py-2 text-right font-mono tabular-nums">{r.flags}</td>
							<td className="min-w-[8rem] px-2 py-2">
								<span className="flex items-center gap-2">
									<span aria-hidden="true" className="block h-1.5 flex-1 rounded-full bg-lab-tint">
										<span className="block h-full rounded-full bg-lab-ink/70" style={{ width: `${Math.round((r.share / max) * 100)}%` }} />
									</span>
									<span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-lab-soft">{pctText(Math.round(r.share * 1000), 1000)}</span>
								</span>
							</td>
							<td className={`px-2 py-2 text-right font-mono tabular-nums ${r.avg >= 1.5 ? BAD : ""}`}>{r.flags ? r.avg.toFixed(1) : "n/a"}</td>
							{showIndex ? <td className={`px-2 py-2 text-right font-mono tabular-nums ${r.index != null && r.index >= 1.3 ? BAD : "text-lab-soft"}`}>{indexText(r.index)}</td> : null}
							<td className="py-2 pl-2 text-xs text-lab-soft">{r.top.length ? r.top.map((t) => `${t.type} (${t.flags})`).join(", ") : "n/a"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

/** The most common penalties against the spots of one dimension: how many of each came where. The biggest number in each row is bold. */
export function MatrixTable({ m, caption }: { m: Matrix; caption: string }) {
	return (
		<div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto [contain:paint]">
			<table className="w-full min-w-[34rem] border-collapse text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="text-left">
						<th scope="col" className={`${th} pr-2`}>
							Penalty
						</th>
						{m.buckets.map((b) => (
							<th key={b.id} scope="col" className={`${th} px-2 text-right`}>
								{b.short}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{m.types.map((t, i) => {
						const top = Math.max(...m.cells[i])
						return (
							<tr key={t} className="border-t border-lab-line">
								<th scope="row" className="py-2 pr-2 text-left font-semibold text-lab-ink">
									{t}
								</th>
								{m.cells[i].map((n, j) => (
									<td key={m.buckets[j].id} className={`px-2 py-2 text-right font-mono tabular-nums ${n && n === top ? "font-bold text-lab-ink" : n ? "text-lab-soft" : "text-lab-muted"}`}>
										{n}
									</td>
								))}
							</tr>
						)
					})}
					<tr className="border-t border-lab-line-strong">
						<th scope="row" className="py-2 pr-2 text-left text-xs font-semibold uppercase tracking-[0.1em] text-lab-muted">
							All flags
						</th>
						{m.totals.map((n, j) => (
							<td key={m.buckets[j].id} className="px-2 py-2 text-right font-mono tabular-nums text-lab-muted">
								{n}
							</td>
						))}
					</tr>
				</tbody>
			</table>
		</div>
	)
}
