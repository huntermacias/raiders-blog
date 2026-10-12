/**
 * A player's share of his team's snaps, game by game. A game he did not play is drawn as an empty box marked "out", so a reader can see
 * the difference between a player who plays less and one who missed games. The shaded games are his team's recent stretch.
 */
export default function SnapStrip({
	weeks,
	shares,
	formWeeks,
	opp,
	className = "",
}: {
	/** Every game his team has finished. */
	weeks: number[]
	/** [week, share of snaps] for the games that have snap counts. */
	shares: [number, number][]
	formWeeks: number[]
	/** Opponent by week, for the labels. */
	opp?: Record<string, string>
	className?: string
}) {
	const by = new Map(shares)
	const text = weeks
		.map((w) => {
			const s = by.get(w)
			return `Week ${w}${opp?.[String(w)] ? ` against ${opp[String(w)]}` : ""}: ${s === undefined ? "snap counts not posted yet" : s === 0 ? "did not play" : `${Math.round(s * 100)}% of snaps`}`
		})
		.join("; ")
	return (
		<div className={className}>
			<ol className="m-0 flex list-none items-end gap-1.5 p-0" role="img" aria-label={text}>
				{weeks.map((w) => {
					const s = by.get(w)
					const recent = formWeeks.includes(w)
					return (
						<li key={w} className={`flex min-w-0 flex-1 flex-col items-stretch gap-1 rounded-md px-0.5 pb-1 pt-1 ${recent ? "bg-lab-hover" : ""}`} title={`Week ${w}${opp?.[String(w)] ? ` vs ${opp[String(w)]}` : ""}`}>
							<span className="text-center font-mono text-[10px] font-bold tabular-nums text-lab-ink">{s === undefined ? "" : s === 0 ? "" : `${Math.round(s * 100)}%`}</span>
							<div className="relative flex h-14 items-end">
								{s === undefined ? (
									<div className="h-full w-full rounded border border-dashed border-lab-line text-center text-[9px] leading-[3.5rem] text-lab-muted">?</div>
								) : s === 0 ? (
									<div className="flex h-full w-full items-center justify-center rounded border border-dashed border-lab-line-strong text-[10px] font-semibold uppercase tracking-[0.08em] text-lab-muted">out</div>
								) : (
									<div className="w-full rounded-sm" style={{ height: `${Math.max(6, s * 100)}%`, background: "var(--pc-accent)" }} />
								)}
							</div>
							<span className="text-center text-[10px] text-lab-muted">{opp?.[String(w)] ? opp[String(w)] : `Wk ${w}`}</span>
						</li>
					)
				})}
			</ol>
		</div>
	)
}
