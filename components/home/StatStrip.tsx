import Link from "next/link"
import { ArrowUpRight, Flame, Minus, Snowflake, TrendingDown, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"
import type { KeysSummary, Summary } from "@/lib/predictions"
import { movementWords, noLabel } from "@/lib/rankings"

export type HomeRank = {
	rank: number
	/** Positive = moved up. null = no earlier week to compare to. */
	change: number | null
	week: number
	/** Rank by week, oldest first. */
	history: (number | null)[]
}

type Props = {
	rank: HomeRank | null
	summary: Summary
	keys: KeysSummary
}

/** Rank history. No. 1 is at the top, so a line going up means rising. */
function Spark({ history }: { history: (number | null)[] }) {
	const real = history.map((r, i) => (r === null ? null : { i, r })).filter((p): p is { i: number; r: number } => p !== null)
	if (real.length < 2) return null
	const width = 88
	const height = 28
	const pad = 3
	const x = (i: number) => pad + (i / Math.max(1, history.length - 1)) * (width - pad * 2)
	const y = (r: number) => pad + ((r - 1) / 31) * (height - pad * 2)
	const d = real.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.r).toFixed(1)}`).join(" ")
	const last = real[real.length - 1]
	return (
		<svg role="img" aria-label={`Rank by week: ${history.map((r) => (r === null ? "unranked" : r)).join(", ")}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="overflow-visible text-foreground">
			<path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
			<circle cx={x(last.i)} cy={y(last.r)} r={2.75} fill="currentColor" />
		</svg>
	)
}

function Tile({ href, label, children, foot }: { href: string; label: string; children: React.ReactNode; foot?: React.ReactNode }) {
	return (
		<Link
			href={href}
			className="group flex h-full flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<div className="flex items-start justify-between gap-2">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
				<ArrowUpRight aria-hidden className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
			</div>
			<div className="mt-3">{children}</div>
			{foot && <div className="mt-2 text-xs text-muted-foreground">{foot}</div>}
		</Link>
	)
}

export default function StatStrip({ rank, summary, keys }: Props) {
	const decided = summary.hits + summary.misses
	const keysDecided = keys.hit + keys.miss

	const Move = rank?.change == null ? null : rank.change > 0 ? TrendingUp : rank.change < 0 ? TrendingDown : Minus

	return (
		<section aria-label="Season at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{rank ? (
				<Tile
					href="/rankings"
					label={`Power rank · Week ${rank.week}`}
					foot={rank.change === null ? "First rankings of the season" : `${movementWords(rank.change)} from last week`}
				>
					<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
						<p className="flex items-center gap-2 whitespace-nowrap font-serif text-3xl font-bold leading-none tabular-nums sm:text-4xl">
							{noLabel(rank.rank)}
							{Move && (
								<span
									className={cn(
										"inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-sans text-xs font-bold",
										rank.change! > 0 && "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400",
										rank.change! < 0 && "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400",
										rank.change === 0 && "border-border bg-muted text-muted-foreground"
									)}
								>
									<Move aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
									{rank.change === 0 ? "—" : Math.abs(rank.change!)}
									<span className="sr-only"> {movementWords(rank.change)}</span>
								</span>
							)}
						</p>
						<Spark history={rank.history} />
					</div>
				</Tile>
			) : (
				<Tile href="/rankings" label="Power rankings" foot="All 32 teams, every week">
					<p className="font-serif text-2xl font-bold leading-tight">See the board</p>
				</Tile>
			)}

			<Tile
				href="/predictions"
				label="Pick accuracy"
				foot={decided > 0 ? `${summary.hits}–${summary.misses} on the winner${summary.avgMarginError !== null ? ` · ${summary.avgMarginError.toFixed(1)} pt avg miss` : ""}` : "First final starts the clock"}
			>
				<p className="font-serif text-3xl font-bold leading-none tabular-nums sm:text-4xl">{summary.accuracy === null ? "—" : `${Math.round(summary.accuracy * 100)}%`}</p>
			</Tile>

			<Tile
				href="/predictions"
				label={summary.streak.kind === "miss" ? "Miss streak" : "Hit streak"}
				foot={summary.streak.kind ? `${summary.streak.length} pick${summary.streak.length === 1 ? "" : "s"} in a row` : "Starts with the first final"}
			>
				<p className="flex items-center gap-2 font-serif text-3xl font-bold leading-none tabular-nums sm:text-4xl">
					{summary.streak.kind ? (
						<>
							{summary.streak.kind === "miss" ? <Snowflake aria-hidden className="h-6 w-6 text-sky-500" /> : <Flame aria-hidden className="h-6 w-6 text-amber-500" />}
							{summary.streak.length}
						</>
					) : (
						"—"
					)}
				</p>
			</Tile>

			<Tile
				href="/predictions#weekly-picks"
				label="Keys to the game"
				foot={keysDecided > 0 ? `${keys.hit} of ${keysDecided} hit across ${keys.games} game${keys.games === 1 ? "" : "s"}` : "Graded after each final"}
			>
				<p className="font-serif text-3xl font-bold leading-none tabular-nums sm:text-4xl">{keys.rate === null ? "—" : `${Math.round(keys.rate * 100)}%`}</p>
			</Tile>
		</section>
	)
}
