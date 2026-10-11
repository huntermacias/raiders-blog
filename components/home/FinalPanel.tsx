import Link from "@/components/SiteLink"
import { ArrowRight, CalendarDays, Check, Minus, Tv, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { pickMarginError } from "@/lib/home"
import { teamInfo } from "@/lib/nfl"
import type { ScheduleRow } from "@/lib/schedule"
import { kickoffText } from "@/components/schedule/ScheduleList"
import Countdown from "./Countdown"

/**
 * The left side of the hub for the days after a game: the score, how the pick graded, where to read about it, and what is next.
 * Server component; only the little countdown to the next kickoff ticks in the browser.
 */

function Side({ nick, score, wins, align = "left" }: { nick: string; score: number; wins: boolean; align?: "left" | "right" }) {
	return (
		<div className={cn("min-w-0", !wins && "opacity-60", align === "right" && "text-right")}>
			<p className="truncate text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{nick}</p>
			<p className="font-serif text-6xl font-bold leading-none tabular-nums sm:text-7xl md:text-8xl">{score}</p>
		</div>
	)
}

function PickGrade({ game }: { game: ScheduleRow }) {
	const pick = game.pick
	const out = game.outcome
	if (!pick || !out) return null
	const opp = teamInfo(game.opponent)
	const err = pickMarginError(game)
	const result = pick.result
	const hit = result === "hit"
	const push = result === "push"
	const Icon = push ? Minus : hit ? Check : X
	const headline = push ? "It ended in a tie, so the pick is a push." : hit ? "Called the winner." : "Missed the winner."
	return (
		<div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
			<span
				className={cn(
					"mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
					push ? "border-zinc-600 bg-zinc-800 text-zinc-300" : hit ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" : "border-rose-400/40 bg-rose-400/15 text-rose-300"
				)}
			>
				<Icon aria-hidden className="h-4 w-4" strokeWidth={3} />
			</span>
			<div className="min-w-0">
				<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">My pick, graded</p>
				<p className="mt-1 text-sm leading-snug text-zinc-100">
					<span className="font-semibold">{headline}</span>{" "}
					<span className="text-zinc-300">
						I had the Raiders {pick.raiders}, {opp.nick} {pick.opponent}
						{err === null || push ? "" : err === 0 ? ", and had the margin exactly" : `, off by ${err} on the margin`}.
					</span>
				</p>
			</div>
		</div>
	)
}

export default function FinalPanel({ game, next, recap }: { game: ScheduleRow; next: ScheduleRow | null; recap: { slug: string; title: string } | null }) {
	const o = game.outcome
	if (!o) return null
	const opp = teamInfo(game.opponent)
	const win = o.result === "W"
	const tie = o.result === "T"
	const when = kickoffText(game.kickoff)
	const nextOpp = next ? teamInfo(next.opponent) : null
	const nextWhen = next ? kickoffText(next.kickoff) : null
	const away = game.homeAway === "away"

	return (
		<>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<span className="rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#09090b]">Week {game.week}</span>
				<span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Final</span>
				<span
					className={cn(
						"rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest",
						tie ? "border-zinc-600 text-zinc-300" : win ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-rose-400/40 bg-rose-400/10 text-rose-300"
					)}
				>
					{tie ? "Tie" : win ? "Win" : "Loss"}
				</span>
			</div>

			<h2 className="sr-only">
				Raiders {o.raiders}, {opp.nick} {o.opponent}, final
			</h2>
			<div className="mt-5 flex items-end gap-4 sm:gap-6" aria-hidden>
				<Side nick="Raiders" score={o.raiders} wins={o.raiders >= o.opponent} />
				<span className="pb-2 font-serif text-3xl text-zinc-600 sm:pb-3">&ndash;</span>
				<Side nick={opp.nick} score={o.opponent} wins={o.opponent >= o.raiders} />
			</div>

			<p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
				<span>
					{away ? "At" : "vs."} {opp.name}
				</span>
				{when && (
					<span className="inline-flex items-center gap-1.5">
						<CalendarDays aria-hidden className="h-4 w-4 text-zinc-400" /> {when}
					</span>
				)}
			</p>

			{game.pick && (
				<div className="mt-6 max-w-xl">
					<PickGrade game={game} />
				</div>
			)}

			<div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
				{recap ? (
					<Link
						href={`/games/${recap.slug}`}
						className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b] sm:w-auto"
					>
						Read the Week {game.week} recap <ArrowRight aria-hidden className="h-4 w-4" />
					</Link>
				) : (
					<Link
						href="/predictions"
						className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white sm:w-auto"
					>
						See every pick graded <ArrowRight aria-hidden className="h-4 w-4" />
					</Link>
				)}
				<Link href="/lab/rooting-guide" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline">
					What it did to the playoff race <ArrowRight aria-hidden className="h-3.5 w-3.5" />
				</Link>
			</div>

			{next && nextOpp && (
				<div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
					<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
						<div className="min-w-0">
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Up next · Week {next.week}</p>
							<p className="mt-1 font-serif text-xl font-bold leading-tight">
								Raiders <span className="text-zinc-500">{next.homeAway === "away" ? "at" : "vs."}</span> {nextOpp.nick}
							</p>
							<p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
								{nextWhen && <span>{nextWhen}</span>}
								{next.network && (
									<span className="inline-flex items-center gap-1">
										<Tv aria-hidden className="h-3.5 w-3.5" /> {next.network}
									</span>
								)}
							</p>
						</div>
						{next.kickoff && <Countdown kickoff={next.kickoff} compact />}
					</div>
				</div>
			)}
		</>
	)
}
