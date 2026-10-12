import { UP, DOWN } from "@/components/lab/players/Bits"
import { BOX, type LogRow, type PlayerGroup, formatBox, formatStat, isCore, snapText, statInfo } from "@/lib/lab/playersKit"

/**
 * Game by game: who it was against, how it ended for his team, his playing time, the box score and the advanced numbers of that game.
 * A single game is a handful of plays, so the advanced columns are labeled as one game's numbers, not his level.
 */
export default function GameLog({ name, group, rows, boxKeys, statKeys, snaps }: { name: string; group: PlayerGroup; rows: LogRow[]; boxKeys: string[]; statKeys: string[]; snaps: boolean }) {
	if (!rows.length) return null
	const cols = statKeys.filter((k) => rows.some((r) => r.cells[`s:${k}`] !== null && r.cells[`s:${k}`] !== undefined))
	const boxes = boxKeys.filter((k) => rows.some((r) => r.cells[`b:${k}`] !== null && r.cells[`b:${k}`] !== undefined))
	return (
		<div className="overflow-x-auto rounded-xl border border-lab-line bg-lab-surface" data-testid="game-log">
			<table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-sm">
				<caption className="sr-only">{name} game by game</caption>
				<thead>
					<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.1em] text-lab-muted sm:text-[11px]">
						<th scope="col" className="sticky left-0 bg-lab-tint px-3 py-2">Game</th>
						<th scope="col" className="px-2 py-2">Result</th>
						{snaps ? <th scope="col" className="px-2 py-2 text-right">Snaps</th> : null}
						{boxes.map((k) => (
							<th key={k} scope="col" className="px-2 py-2 text-right">{BOX[group][k].short}</th>
						))}
						{cols.map((k) => (
							<th key={k} scope="col" className="whitespace-nowrap border-l border-lab-line px-2 py-2 text-right">{statInfo(group, k)?.short ?? k}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.week} className="border-t border-lab-line">
							<th scope="row" className="sticky left-0 whitespace-nowrap bg-lab-surface px-3 py-2 text-left font-normal">
								<span className="font-mono font-bold">Wk {r.week}</span> <span className="text-lab-muted">{r.opp ? `vs ${r.opp}` : ""}</span>
							</th>
							<td className="whitespace-nowrap px-2 py-2">
								{r.result ? (
									<span className={`font-mono font-semibold ${r.won === true ? UP : r.won === false ? DOWN : "text-lab-soft"}`}>{r.result}</span>
								) : (
									<span className="text-lab-muted">–</span>
								)}
							</td>
							{snaps ? <td className="px-2 py-2 text-right font-mono tabular-nums">{r.snap === null ? "–" : r.snap === 0 ? <span className="text-lab-muted">Out</span> : snapText(r.snap)}</td> : null}
							{boxes.map((k) => {
								const v = r.cells[`b:${k}`]
								return (
									<td key={k} className="px-2 py-2 text-right font-mono tabular-nums">
										{v === null || v === undefined ? "–" : formatBox(group, k, v)}
									</td>
								)
							})}
							{cols.map((k) => {
								const v = r.cells[`s:${k}`]
								return (
									<td key={k} className={`border-l border-lab-line px-2 py-2 text-right font-mono tabular-nums ${isCore(group, k) ? "" : "text-lab-soft"}`}>
										{v === null || v === undefined ? "–" : formatStat(group, k, v)}
									</td>
								)
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
