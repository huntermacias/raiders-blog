import Link from "@/components/SiteLink"

import type { NflBoardRow, NflWeekView } from "@/lib/league2/view/nfl"
import { cn } from "@/lib/utils"

function Board({ rows, caption, empty }: { rows: NflBoardRow[]; caption: string; empty: string }) {
	if (rows.length === 0) return <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">{empty}</p>
	return (
		<div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
			<table className="w-full text-sm">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						<th scope="col" className="px-3 py-2.5">Rank</th>
						<th scope="col" className="px-3 py-2.5">Player</th>
						<th scope="col" className="px-3 py-2.5 text-right">Correct</th>
						<th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">Picks</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.playerId} className={cn("border-b border-border/60 last:border-0", r.isMe && "bg-muted/60 font-semibold")} aria-current={r.isMe ? "true" : undefined}>
							<td className="px-3 py-2.5 tabular-nums">{r.rank}</td>
							<td className="px-3 py-2.5">
								<Link href={`/league/${r.handle}`} className="underline-offset-4 hover:underline">
									{r.handle}
								</Link>
								{r.isMe && <span className="ml-2 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">You</span>}
							</td>
							<td className="px-3 py-2.5 text-right tabular-nums">{r.points}</td>
							<td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{r.games}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

export function Boards({ view }: { view: NflWeekView }) {
	return (
		<div className="grid gap-6 lg:grid-cols-2">
			<section aria-labelledby="wk-board">
				<h3 id="wk-board" className="mb-2 font-serif text-xl font-bold">
					Week {view.week}
				</h3>
				<Board rows={view.weekBoard.rows} caption={`Week ${view.week} standings`} empty="Standings appear once the first game of the week is final." />
				{view.weekBoard.total > view.weekBoard.rows.length && <p className="mt-2 text-xs text-muted-foreground">Top {view.weekBoard.rows.length} of {view.weekBoard.total} players.</p>}
			</section>
			<section aria-labelledby="ssn-board">
				<h3 id="ssn-board" className="mb-2 font-serif text-xl font-bold">
					Season
				</h3>
				<Board rows={view.seasonBoard.rows} caption={`${view.season} season standings`} empty="Season standings start with the first graded week." />
				{view.seasonBoard.total > view.seasonBoard.rows.length && <p className="mt-2 text-xs text-muted-foreground">Top {view.seasonBoard.rows.length} of {view.seasonBoard.total} players.</p>}
			</section>
		</div>
	)
}
