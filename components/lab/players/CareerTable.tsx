import Link from "@/components/SiteLink"
import { type Career, careerLine } from "@/lib/lab/seasonKit"
import { type PlayerGroup, type PlayersData, ordinal, shownPct, statInfo } from "@/lib/lab/playersKit"

/**
 * A man's seasons side by side: team, games, Overall, and the job's main stats, each with where it ranked that season. Every season is
 * measured against that season's own league, so rows are comparable. The season being played is the last row and is marked, because
 * a few games is a small sample. Plain table, no script: it reads the same in a search result, a screen reader and a phone.
 */
export default function CareerTable({ career, group, name, data, usesHistory, selfHref = null }: { career: Career; group: PlayerGroup; name: string; data: PlayersData; usesHistory: boolean; selfHref?: { href: string; season: number } | null }) {
	const line = careerLine(career, data)
	const hasOverall = career.rows.some((r) => r.overall !== null)
	const rows = [...career.rows].reverse()
	return (
		<div data-testid="career">
			{line ? <p className="m-0 mb-4 max-w-3xl font-serif text-lg leading-snug text-lab-ink">{line}</p> : null}
			<div className="overflow-x-auto rounded-xl border border-lab-line bg-lab-surface">
				<table className="w-full min-w-[36rem] border-collapse text-left text-xs sm:text-sm">
					<caption className="sr-only">{name} season by season</caption>
					<thead>
						<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:text-[11px]">
							<th scope="col" className="sticky left-0 z-10 lab-solid-tint px-3 py-2">Season</th>
							<th scope="col" className="px-2 py-2">Team</th>
							<th scope="col" className="px-2 py-2 text-right">Games</th>
							{hasOverall ? <th scope="col" className="border-l border-lab-line px-2 py-2 text-right">Overall</th> : null}
							{career.keys.map((k) => (
								<th key={k} scope="col" className="whitespace-nowrap border-l border-lab-line px-2 py-2 text-right">{statInfo(group, k)?.short ?? k}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.season} className="border-t border-lab-line" data-testid="career-row" data-season={r.season} aria-current={r.current ? "true" : undefined} style={r.current ? { boxShadow: "inset 3px 0 0 var(--pc-accent)" } : undefined}>
								<th scope="row" className="sticky left-0 whitespace-nowrap bg-lab-surface px-3 py-2.5 text-left font-semibold">
									{r.season}
									{r.current ? <span className="ml-2 text-[11px] font-normal text-lab-muted">through Week {data.week}</span> : null}
								</th>
								<td className="px-2 py-2.5 font-mono">{r.team}</td>
								<td className="px-2 py-2.5 text-right font-mono tabular-nums">{r.games}</td>
								{hasOverall ? (
									<td className="border-l border-lab-line px-2 py-2.5 text-right">
										{r.overall === null ? (
											<span className="text-lab-muted">–</span>
										) : (
											<>
												<span className="font-mono text-base font-bold tabular-nums text-lab-ink">{r.overall}</span>
												{r.place ? <span className="block text-[11px] text-lab-muted">{ordinal(r.place.rank)} of {r.place.of}</span> : null}
											</>
										)}
									</td>
								) : null}
								{r.cells.map((c, i) => (
									<td key={career.keys[i]} className="border-l border-lab-line px-2 py-2.5 text-right">
										{c ? (
											<>
												<span className="font-mono tabular-nums text-lab-ink">{c.text}</span>
												{c.pct !== null ? (
													<>
														<span className="mt-1 ml-auto block h-1 w-12 overflow-hidden rounded-full bg-lab-line" aria-hidden="true">
															<span className="block h-full rounded-full" style={{ width: `${shownPct(c.pct)}%`, background: "var(--pc-accent)" }} />
														</span>
														<span className="block text-[11px] text-lab-muted">{c.rank !== null && c.of !== null ? `${ordinal(c.rank)} of ${c.of}` : `${ordinal(shownPct(c.pct))} pct`}</span>
													</>
												) : null}
											</>
										) : (
											<span className="text-lab-muted">–</span>
										)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="m-0 mt-3 max-w-3xl text-xs leading-relaxed text-lab-muted">
				Each season is measured against that season&apos;s own league, so a place here means the same thing in every row. Past seasons are full seasons; {data.season} is {data.week} {data.week === 1 ? "game" : "games"} in, so its numbers move more.
				{usesHistory ? ` The grades and places for ${data.season} start from the seasons above and move as this year's games come in; the raw numbers shown are this year's alone.` : ""}
			</p>
			{selfHref ? (
				<p className="m-0 mt-3">
					<Link href={selfHref.href} className="inline-flex min-h-[44px] items-center rounded-xl border border-lab-line-strong bg-lab-surface px-4 py-2 text-sm font-semibold text-lab-ink hover:border-lab-ink" data-testid="career-self">
						{name} in {selfHref.season} against {name} now
					</Link>
				</p>
			) : null}
		</div>
	)
}
