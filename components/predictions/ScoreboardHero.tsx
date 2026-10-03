import { Check, Flame, Minus, Snowflake, X } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Summary } from "@/lib/predictions"

function pct(n: number | null) {
	return n === null ? "—" : `${Math.round(n * 100)}%`
}

function record(hits: number, misses: number) {
	return `${hits}–${misses}`
}

/**
 * The headline board. It is deliberately a fixed dark "stadium scoreboard" in
 * both themes (same family as the header's eyebrow strip) so the numbers pop
 * and the status colors always sit on a surface they were chosen for.
 */
export default function ScoreboardHero({ summary, season }: { summary: Summary; season: number }) {
	const s = summary
	const hasGraded = s.graded > 0
	const decided = s.hits + s.misses
	const streakWord = s.streak.kind === "hit" ? "Hit streak" : s.streak.kind === "miss" ? "Miss streak" : "Streak"
	const StreakIcon = s.streak.kind === "miss" ? Snowflake : Flame

	const readerDecided = s.readers.hits + s.readers.misses

	return (
		<section
			aria-label="Prediction scoreboard summary"
			className="overflow-hidden rounded-xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-lg"
		>
			<div className="flex items-center justify-between gap-4 border-b border-[#27272a] px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
				<span>Prediction Board</span>
				<span>
					{season} season
					{s.throughWeek ? <> &middot; Through week {s.throughWeek}</> : null}
				</span>
			</div>

			<div className="grid grid-cols-2 gap-px bg-zinc-800 md:grid-cols-4">
				{/* Accuracy: the hero figure + a single-ratio meter */}
				<div className="col-span-2 bg-[#09090b] p-5 md:col-span-2 md:p-6">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Pick accuracy</p>
					<p className="mt-2 font-serif text-6xl font-bold leading-none tabular-nums md:text-7xl">{pct(s.accuracy)}</p>
					<div
						className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800"
						role="meter"
						aria-label="Pick accuracy"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={s.accuracy === null ? 0 : Math.round(s.accuracy * 100)}
					>
						<div
							className="h-full rounded-full bg-emerald-400 transition-all duration-700"
							style={{ width: `${s.accuracy === null ? 0 : Math.max(2, s.accuracy * 100)}%` }}
						/>
					</div>
					<p className="mt-2 text-xs text-zinc-400">
						{hasGraded
							? `${s.hits} of ${decided} graded pick${decided === 1 ? "" : "s"} picked the right winner`
							: "No graded picks yet. The first final score starts the clock."}
					</p>
				</div>

				<div className="bg-[#09090b] p-5 md:p-6">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Record</p>
					<p className="mt-2 font-serif text-4xl font-bold leading-none tabular-nums md:text-5xl">
						{hasGraded ? record(s.hits, s.misses) : "—"}
					</p>
					<p className="mt-2 text-xs text-zinc-400">
						Raiders games: {s.raiders.hits + s.raiders.misses > 0 ? record(s.raiders.hits, s.raiders.misses) : "—"}
					</p>
				</div>

				<div className="bg-[#09090b] p-5 md:p-6">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{streakWord}</p>
					<p className="mt-2 flex items-center gap-2 font-serif text-4xl font-bold leading-none tabular-nums md:text-5xl">
						{s.streak.kind ? (
							<>
								<StreakIcon aria-hidden className={cn("h-7 w-7", s.streak.kind === "hit" ? "text-amber-400" : "text-sky-300")} />
								{s.streak.length}
							</>
						) : (
							"—"
						)}
					</p>
					<p className="mt-2 text-xs text-zinc-400">
						{s.avgMarginError === null ? "Margin miss: —" : `Avg margin miss: ${s.avgMarginError.toFixed(1)} pts`}
					</p>
				</div>
			</div>

			{/* Last 12 graded picks, oldest -> newest. Shape + icon + label, never color alone. */}
			{s.recent.length > 0 && (
				<div className="border-t border-[#27272a] px-5 py-4">
					<div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
						<span>Last {s.recent.length} graded</span>
						<span className="normal-case tracking-normal text-zinc-500">oldest &rarr; newest</span>
					</div>
					<ul className="flex flex-wrap gap-2">
						{s.recent.map((r) => (
							<li key={r.id} className="flex flex-col items-center gap-1">
								<span
									title={`Week ${r.week} · ${r.opponentLabel}: ${r.result === "hit" ? "called it" : r.result === "miss" ? "missed" : "push"}`}
									aria-label={`Week ${r.week}, ${r.opponentLabel}: ${r.result === "hit" ? "called it" : r.result === "miss" ? "missed" : "push"}`}
									className={cn(
										"flex h-8 w-8 items-center justify-center rounded-md border",
										r.result === "hit" && "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
										r.result === "miss" && "border-rose-400/40 bg-rose-400/15 text-rose-300",
										r.result === "push" && "border-zinc-600 bg-zinc-800 text-zinc-300"
									)}
								>
									{r.result === "hit" ? (
										<Check className="h-4 w-4" strokeWidth={3} />
									) : r.result === "miss" ? (
										<X className="h-4 w-4" strokeWidth={3} />
									) : (
										<Minus className="h-4 w-4" strokeWidth={3} />
									)}
								</span>
								<span className="text-[10px] font-semibold tabular-nums text-zinc-500">W{r.week}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{readerDecided > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-[#27272a] bg-zinc-900/60 px-5 py-3 text-sm">
					<span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">You vs. the readers</span>
					<span className="tabular-nums text-zinc-200">
						Me <strong className="font-bold text-zinc-50">{record(s.readers.meHits, s.readers.meMisses)}</strong>
						<span className="mx-2 text-zinc-600">|</span>
						Readers <strong className="font-bold text-zinc-50">{record(s.readers.hits, s.readers.misses)}</strong>
						<span className="ml-2 text-xs text-zinc-500">(same games, where readers had a clear favorite)</span>
					</span>
				</div>
			)}
		</section>
	)
}
