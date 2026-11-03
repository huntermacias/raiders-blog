import Link from "@/components/SiteLink"
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react"

import { TeamLogo } from "@/components/lab/players/Media"
import { RAIDERS, teamInfo } from "@/lib/nfl"
import { type RankRow, movementWords, noLabel } from "@/lib/rankings"

function Move({ change }: { change: number | null }) {
	if (change === null || change === 0) return <span className="text-xs text-muted-foreground">{change === 0 ? "even" : ""}</span>
	const up = change > 0
	return (
		<span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
			{up ? <ArrowUp aria-hidden className="h-3 w-3" /> : <ArrowDown aria-hidden className="h-3 w-3" />}
			<span className="sr-only">{movementWords(change)}</span>
			{Math.abs(change)}
		</span>
	)
}

function Row({ row }: { row: RankRow }) {
	const t = teamInfo(row.team)
	return (
		<li className="flex items-center gap-3 py-2" style={{ "--pc-accent": t.color, "--pc-on": "#ffffff" } as React.CSSProperties}>
			<span className="w-6 text-right font-sans text-lg font-extrabold tabular-nums">{row.rank}</span>
			<TeamLogo team={t.abbr} size={28} className="h-7 w-7" />
			<span className={`min-w-0 flex-1 truncate text-sm ${row.team === RAIDERS ? "font-bold" : "font-medium"}`}>{t.nick}</span>
			<Move change={row.change} />
		</li>
	)
}

/**
 * The top of that week's power rankings on a power-rankings story, with where the Raiders landed. It reads the Power Rankings documents
 * the Rankings page uses, so the numbers are the same everywhere.
 */
export default function RankingsStrip({ rows, week }: { rows: RankRow[]; week?: number }) {
	if (!rows?.length) return null
	const top = rows.slice(0, 5)
	const mine = rows.find((r) => r.team === RAIDERS)
	const showMine = mine && mine.rank > 5
	return (
		<section aria-label={week ? `Power rankings after week ${week}` : "Power rankings"} className="mb-10 overflow-hidden rounded-2xl border border-border/70 bg-card" data-testid="rankings-strip">
			<h2 className="flex items-center justify-between border-b border-border/70 bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
				<span>{week ? `The top five · after Week ${week}` : "The top five"}</span>
				<Link href="/rankings" className="inline-flex items-center gap-1 normal-case tracking-normal hover:text-foreground">
					All 32 <ArrowRight aria-hidden className="h-3.5 w-3.5" />
				</Link>
			</h2>
			<ol className="divide-y divide-border/50 px-5">
				{top.map((r) => (
					<Row key={r.team} row={r} />
				))}
			</ol>
			{showMine && mine && (
				<p className="flex items-center justify-between border-t border-border/70 bg-muted/30 px-5 py-2.5 text-sm">
					<span>
						<span className="font-semibold">Raiders:</span> {noLabel(mine.rank)}
					</span>
					<Move change={mine.change} />
				</p>
			)}
		</section>
	)
}
