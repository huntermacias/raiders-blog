import Link from "next/link"

import { cn } from "@/lib/utils"
import { type BloggerLine, type StandingRow, oneDecimal, recordText, signed } from "@/lib/league"

const LIMIT = 100

function Rank({ n }: { n: number }) {
	return (
		<span
			className={cn(
				"inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums",
				n === 1 ? "bg-foreground text-background" : n <= 3 ? "border border-foreground/40 bg-muted text-foreground" : "text-muted-foreground"
			)}
		>
			{n}
		</span>
	)
}

/**
 * Standings table with the blogger pinned on top as the benchmark. Server
 * component: gets plain rows, links each handle to its profile.
 */
export default function Leaderboard({ rows, blogger, scope }: { rows: StandingRow[]; blogger: BloggerLine; scope: string }) {
	const shown = rows.slice(0, LIMIT)

	return (
		<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
			<div className="relative overflow-x-auto">
				<table className="w-full min-w-[20rem] text-left text-sm">
					<caption className="sr-only">{scope} standings</caption>
					<thead className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						<tr>
							<th scope="col" className="w-14 px-3 py-3 text-center">
								#
							</th>
							<th scope="col" className="px-3 py-3">
								Player
							</th>
							<th scope="col" className="px-3 py-3 text-right">
								Pts
							</th>
							<th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">
								Winners
							</th>
							<th scope="col" className="hidden px-3 py-3 text-right md:table-cell">
								Avg miss
							</th>
							<th scope="col" className="px-3 py-3 text-right">
								<span className="sr-only">Record against the blogger, </span>vs me
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						<tr className="bg-foreground text-background">
							<td className="px-3 py-3 text-center text-xs font-bold">—</td>
							<td className="px-3 py-3">
								<span className="whitespace-nowrap font-serif text-base font-bold">The Blogger</span>
								<span className="ml-2 hidden text-[11px] font-semibold uppercase tracking-widest text-background/60 sm:inline">benchmark</span>
							</td>
							<td className="px-3 py-3 text-right font-serif text-lg font-bold tabular-nums">{blogger.points}</td>
							<td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">
								{blogger.correct}/{blogger.games}
							</td>
							<td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">{oneDecimal(blogger.avgMarginError)}</td>
							<td className="px-3 py-3 text-right text-background/60">—</td>
						</tr>

						{shown.map((r) => (
							<tr key={r.lower} className="transition-colors hover:bg-muted/40">
								<td className="px-3 py-3 text-center">
									<Rank n={r.rank} />
								</td>
								<td className="px-3 py-3">
									<Link href={`/league/${r.handle}`} className="font-semibold underline-offset-4 hover:underline">
										{r.handle}
									</Link>
									<span className="ml-2 hidden text-xs tabular-nums text-muted-foreground sm:inline">{r.games} game{r.games === 1 ? "" : "s"}</span>
								</td>
								<td className="px-3 py-3 text-right font-serif text-lg font-bold tabular-nums">{r.points}</td>
								<td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">
									{r.correct}/{r.games}
								</td>
								<td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">{oneDecimal(r.avgMarginError)}</td>
								<td className="whitespace-nowrap px-3 py-3 text-right">
									<span className="font-semibold tabular-nums">{recordText(r.vsBlogger)}</span>
									<span
										className={cn(
											"block text-xs font-bold tabular-nums sm:ml-2 sm:inline-block sm:min-w-[2rem]",
											r.delta > 0 ? "text-emerald-700 dark:text-emerald-400" : r.delta < 0 ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"
										)}
									>
										{signed(r.delta)}
									</span>
								</td>
							</tr>
						))}

						{shown.length === 0 && (
							<tr>
								<td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
									Nobody is on the board yet. The first graded game puts the first names here.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			{rows.length > LIMIT && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Showing the top {LIMIT} of {rows.length}.</p>}
		</div>
	)
}
