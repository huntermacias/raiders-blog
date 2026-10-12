import { type Bar, GROUP_META, type PlayerRow, type PlayersData, percentileBars, shownPct, tierOf, TIER_WORD } from "@/lib/lab/playersKit"

/**
 * Every graded stat on one screen, as a bar from the worst player at his job (left) to the best (right). The number in the bubble is the
 * percentile: 90 means better than nine in ten of them. A faded bar means the sample is still thin.
 */
export default function PercentileProfile({ data, player }: { data: PlayersData; player: PlayerRow }) {
	// Stats that are still mostly luck go last, drawn as an outline with no percentile: ranking players on them says little yet.
	const all: Bar[] = percentileBars(data, player)
	const bars = [...all.filter((b) => b.signal !== "luck"), ...all.filter((b) => b.signal === "luck")]
	if (!bars.length) return null
	const anyLuck = bars.some((b) => b.signal === "luck")
	return (
		<div className="rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-6" data-testid="percentile-profile">
			<div className="mb-2 hidden grid-cols-[12rem_1fr_7rem] gap-x-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted sm:grid" aria-hidden="true">
				<span />
				<span className="flex justify-between">
					<span>Worst</span>
					<span>Average</span>
					<span>Best</span>
				</span>
				<span />
			</div>
			<ul className="m-0 grid list-none gap-3.5 p-0">
					{bars.map((b) => {
						const luck = b.signal === "luck"
						return (
							<li key={b.k} className="grid grid-cols-[minmax(0,8rem)_1fr_5.5rem] items-center gap-x-3 gap-y-0.5 sm:grid-cols-[12rem_1fr_7rem]">
								<span className="text-xs font-semibold text-lab-ink sm:text-sm">{b.label}{b.unit ? <span className="block text-[10px] font-normal text-lab-muted">whole line&apos;s number</span> : null}</span>
								<span
									className={`relative block h-3.5 rounded-full ${luck ? "border border-dashed border-lab-line-strong bg-transparent" : "bg-lab-tint"}`}
									role="img"
									aria-label={luck ? `${b.label}: too early to rank, mostly luck so far` : `${b.label}: ${shownPct(b.pct)}th percentile, ${TIER_WORD[tierOf(b.pct)].toLowerCase()}${b.sure === "thin" ? ", small sample" : ""}`}
								>
									{luck ? (
										<span className="absolute inset-0 grid place-items-center text-[10px] font-semibold uppercase tracking-[0.08em] text-lab-muted" aria-hidden="true">
											<span className="bg-lab-surface px-2">Too early to rank</span>
										</span>
									) : (
										<>
											<span className="rr-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(4, b.pct)}%`, background: "var(--pc-accent)", opacity: b.sure === "thin" ? 0.6 : 1 }} aria-hidden="true" />
											<span className="absolute -inset-y-1 left-1/2 w-px bg-lab-line-strong" aria-hidden="true" />
											<span className="absolute -inset-y-0.5 left-1/4 w-px bg-lab-line" aria-hidden="true" />
											<span className="absolute -inset-y-0.5 left-3/4 w-px bg-lab-line" aria-hidden="true" />
											<span
												className="rr-bubble absolute top-1/2 grid h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-lab-surface px-1 font-mono text-[11px] font-bold leading-none tabular-nums"
												style={{ left: `${Math.min(94, Math.max(6, b.pct))}%`, background: "var(--pc-accent)", color: "var(--pc-on)" }}
												aria-hidden="true"
											>
												{shownPct(b.pct)}
											</span>
										</>
									)}
								</span>
								<span className="text-right font-mono text-xs font-bold tabular-nums text-lab-ink sm:text-sm">
									{b.value}
									<span className="block text-[10px] font-normal text-lab-muted">
										{luck ? "mostly luck so far" : b.rank}
										{b.sure === "thin" && !luck ? <span className="block">small sample</span> : null}
									</span>
								</span>
							</li>
						)
					})}
			</ul>
			<p className="m-0 mt-4 text-xs leading-relaxed text-lab-muted">
				Left is the worst at his job, right is the best, and the line down the middle is average. The bubble is his percentile: 90 means better than nine in ten qualifying {GROUP_META[player.group].peers}. Faded bars are still small samples.{anyLuck ? " Outlined bars are stats where, this early, the gaps between players are mostly luck, so they are not ranked yet." : ""}
			</p>
		</div>
	)
}
