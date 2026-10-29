import { Flame, Minus, Snowflake, TrendingDown, TrendingUp } from "lucide-react"

import ShareCard from "@/components/lab/ShareCard"
import { cn } from "@/lib/utils"
import { homeQuery } from "@/lib/og/homeCard"
import type { KeysSummary, Summary } from "@/lib/predictions"
import { movementWords, noLabel } from "@/lib/rankings"
import { type ScheduleRow, recordText } from "@/lib/schedule"
import type { RootingSnapshot } from "@/lib/homeLab"
import { type HomeRank } from "./StatStrip"
import { Spark, Tile } from "./StatStrip"

type Props = {
	record: { w: number; l: number; t: number }
	/** Finished Raiders games, oldest first. */
	played: ScheduleRow[]
	odds: RootingSnapshot | null
	rank: HomeRank | null
	summary: Summary
	keys: KeysSummary
	/** Changes when the numbers do, so a shared card is fetched fresh. */
	stamp: number
}

/** The playoff odds as numbers the share card can carry: percent, and the move since last week in points. */
export function oddsNumbers(s: RootingSnapshot | null): { pct: number; delta: number | null } | null {
	if (!s || s.status !== "live") return null
	const pct = Math.round(s.baseline * 100)
	if (!s.change) return { pct, delta: null }
	const n = Number(/\d+/.exec(s.change.text)?.[0] ?? "0")
	return { pct, delta: s.change.dir === "up" ? n : s.change.dir === "down" ? -n : 0 }
}

function Chip({ dir, children }: { dir: "up" | "down" | "flat"; children: React.ReactNode }) {
	const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 font-sans text-xs font-bold",
				dir === "up" && "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400",
				dir === "down" && "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400",
				dir === "flat" && "border-border bg-muted text-muted-foreground"
			)}
		>
			<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
			{children}
		</span>
	)
}

/**
 * The season in four numbers: the record game by game, the playoff odds, the power rank and how the picks have done. Each tile opens the page
 * behind it, and one Share button makes a card of all four.
 */
export default function SeasonGlance({ record, played, odds, rank, summary, keys, stamp }: Props) {
	const decided = summary.hits + summary.misses
	const keysDecided = keys.hit + keys.miss
	const oddsN = oddsNumbers(odds)
	const week = played.length ? played[played.length - 1].week : 0
	const results = played.map((r) => r.outcome!.result)
	const n = Math.max(1, played.length)
	const pfTotal = played.reduce((a, r) => a + r.outcome!.raiders, 0)
	const paTotal = played.reduce((a, r) => a + r.outcome!.opponent, 0)
	const margin = (pfTotal - paTotal) / n
	const scoring = {
		pf: (pfTotal / n).toFixed(1),
		pa: (paTotal / n).toFixed(1),
		diff: `${margin > 0 ? "+" : margin < 0 ? "\u2212" : ""}${Math.abs(margin).toFixed(1)}`,
		dir: (margin > 0.05 ? "up" : margin < -0.05 ? "down" : "flat") as "up" | "down" | "flat",
	}
	const streak = summary.streak.kind ? { kind: summary.streak.kind === "miss" ? ("miss" as const) : ("hit" as const), length: summary.streak.length } : null
	const query = homeQuery({
		week,
		record,
		results,
		odds: oddsN,
		rank: rank ? { n: rank.rank, change: rank.change } : null,
		picks: decided > 0 ? { hits: summary.hits, misses: summary.misses, pct: Math.round((summary.accuracy ?? 0) * 100) } : null,
		streak,
	})

	return (
		<section id="season" aria-label="The season so far" className="scroll-mt-32">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="min-w-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">The season so far</h2>
				{played.length > 0 && (
					<ShareCard
						sizes={["wide"]}
						stamp={stamp}
						text={`The Raiders are ${recordText(record)} after Week ${week}.`}
						alt={`The Raiders' season so far: ${recordText(record)}`}
						label="Share the season"
						className="min-h-[36px] shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-foreground/40 hover:text-foreground"
						target={{ type: "home", query, linkQuery: "", sharePath: "/", name: "The Raiders' season so far", file: "raiders-rundown-season-so-far", campaign: "home_share" }}
					/>
				)}
			</div>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Tile href="/schedule" label="Points per game" foot={played.length ? `${scoring.pf} for · ${scoring.pa} against` : "The season hasn’t started"}>
					<p className="flex items-center gap-2 font-sans text-4xl font-extrabold leading-none tabular-nums sm:text-5xl">
						{played.length ? scoring.diff : "—"}
											</p>
					<p className="mt-3 text-xs text-muted-foreground">{played.length ? "Average scoring margin, after Week " + week : ""}</p>
				</Tile>

				{odds && odds.status === "live" ? (
					<Tile href={odds.href} label="Playoff odds" foot={odds.change ? odds.change.since : "A model estimate"}>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<p className="font-sans text-4xl font-extrabold leading-none tabular-nums sm:text-5xl">{odds.pct}</p>
							{odds.change && <Chip dir={odds.change.dir}>{odds.change.text}</Chip>}
						</div>
						<div role="img" aria-label={`${Math.round(odds.baseline * 100)} percent`} className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
							<div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(odds.baseline * 100, 1.5)}%` }} />
						</div>
					</Tile>
				) : (
					<Tile href="/lab/rooting-guide" label="Playoff odds" foot="The Rooting Guide">
						<p className="font-sans text-2xl font-extrabold leading-tight">{odds ? odds.pct : "See the picture"}</p>
					</Tile>
				)}

				{rank ? (
					<Tile href="/rankings" label={`Power rank · Week ${rank.week}`} foot={rank.change === null ? "First rankings of the season" : `${movementWords(rank.change)} from last week`}>
						<div className="flex flex-col items-start gap-3">
							<p className="flex items-center gap-1.5 whitespace-nowrap font-sans text-3xl font-extrabold leading-none tabular-nums sm:gap-2 sm:text-5xl">
								{noLabel(rank.rank)}
								{rank.change != null && rank.change !== 0 && (
									<Chip dir={rank.change > 0 ? "up" : "down"}>
										{Math.abs(rank.change)}
										<span className="sr-only"> {movementWords(rank.change)}</span>
									</Chip>
								)}
							</p>
							<Spark history={rank.history} />
						</div>
					</Tile>
				) : (
					<Tile href="/rankings" label="Power rankings" foot="All 32 teams, every week">
						<p className="font-sans text-2xl font-extrabold leading-tight">See the board</p>
					</Tile>
				)}

				<Tile
					href="/predictions"
					label="Pick accuracy"
					foot={
						decided > 0
							? `${summary.hits}–${summary.misses} on the winner${keysDecided > 0 ? ` · keys ${keys.hit}/${keysDecided}` : ""}`
							: "First final starts the clock"
					}
				>
					<div className="flex items-center gap-3">
						<p className="font-sans text-4xl font-extrabold leading-none tabular-nums sm:text-5xl">{summary.accuracy === null ? "—" : `${Math.round(summary.accuracy * 100)}%`}</p>
						{summary.streak.kind && (
							<span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
								{summary.streak.kind === "miss" ? <Snowflake aria-hidden className="h-3.5 w-3.5 text-sky-500" /> : <Flame aria-hidden className="h-3.5 w-3.5 text-amber-500" />}
								{summary.streak.length}
								<span className="sr-only"> {summary.streak.kind === "miss" ? "miss streak" : "hit streak"}</span>
							</span>
						)}
					</div>
				</Tile>
			</div>
		</section>
	)
}
