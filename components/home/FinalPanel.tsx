import Link from "@/components/SiteLink"
import { ArrowRight, CalendarDays, Check, Minus, Tv, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { pickMarginError } from "@/lib/home"
import { teamInfo } from "@/lib/nfl"
import type { ScheduleRow } from "@/lib/schedule"
import { kickoffText } from "@/components/schedule/ScheduleList"
import { TeamLogo } from "@/components/lab/players/Media"
import ReportShare from "@/components/report/ReportShare"
import type { QuarterCell } from "@/lib/report/story"
import Countdown from "./Countdown"

/** What the page works out for a finished game beyond the schedule row: the real score from the Lab's play-by-play, the line score, and the share stamp. */
export type FinalExtra = { score: [number, number]; quarters: QuarterCell[]; halftime: string | null; stamp: number }

/**
 * The left side of the hub for the days after a game: the score, how the pick graded, where to read about it, and what is next.
 * Server component; only the little countdown to the next kickoff ticks in the browser.
 */

function Side({ nick, code, score, wins }: { nick: string; code: string; score: number; wins: boolean }) {
	return (
		<div className={cn("flex min-w-0 items-center gap-2 sm:gap-4", !wins && "opacity-60")}>
			<TeamLogo team={code} size={64} className="h-9 w-9 sm:h-16 sm:w-16" />
			<div className="min-w-0">
				<p className="truncate text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{nick}</p>
				<p className="font-sans text-5xl font-extrabold leading-none tabular-nums sm:text-7xl md:text-8xl">{score}</p>
			</div>
		</div>
	)
}

function Quarters({ quarters, oppCode }: { quarters: QuarterCell[]; oppCode: string }) {
	if (quarters.length === 0) return null
	const rows = [
		{ code: "LV", pick: (q: QuarterCell) => q.me },
		{ code: oppCode, pick: (q: QuarterCell) => q.opp },
	]
	return (
		<table className="mt-5 w-full max-w-xs border-separate border-spacing-y-0.5 text-center text-sm tabular-nums text-zinc-300" aria-label="Score by quarter">
			<thead>
				<tr className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
					<th scope="col" className="w-1/4 text-left font-semibold"><span className="sr-only">Team</span></th>
					{quarters.map((q) => (
						<th key={q.label} scope="col" className="font-semibold">{q.label}</th>
					))}
					<th scope="col" className="font-semibold text-zinc-400">T</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.code}>
						<th scope="row" className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">{row.code}</th>
						{quarters.map((q) => (
							<td key={q.label}>{row.pick(q)}</td>
						))}
						<td className="font-bold text-zinc-50">{quarters.reduce((a, q) => a + row.pick(q), 0)}</td>
					</tr>
				))}
			</tbody>
		</table>
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

export default function FinalPanel({ game, next, recap, extra }: { game: ScheduleRow; next: ScheduleRow | null; recap: { slug: string; title: string } | null; extra?: FinalExtra | null }) {
	const base = game.outcome
	if (!base) return null
	// The Lab's play-by-play score wins over the one typed into Studio, so a score entered the wrong way round never turns a loss into a win here.
	const o = extra ? { raiders: extra.score[0], opponent: extra.score[1], result: (extra.score[0] > extra.score[1] ? "W" : extra.score[0] < extra.score[1] ? "L" : "T") as "W" | "L" | "T" } : base
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
			<div className="mt-5 flex items-end gap-2 sm:gap-6" aria-hidden>
				<Side nick="Raiders" code="LV" score={o.raiders} wins={o.raiders >= o.opponent} />
				<span className="pb-2 font-sans text-3xl text-zinc-600 sm:pb-3">&ndash;</span>
				<Side nick={opp.nick} code={opp.abbr} score={o.opponent} wins={o.opponent >= o.raiders} />
			</div>
			{extra && extra.quarters.length > 0 && (
				<div aria-hidden={false}>
					<Quarters quarters={extra.quarters} oppCode={opp.abbr} />
					{extra.halftime && <p className="mt-2 text-xs text-zinc-500">{extra.halftime}</p>}
				</div>
			)}

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
				{recap && extra && (
					<ReportShare slug={recap.slug} kind="final" stamp={extra.stamp} text={`Raiders ${o.raiders}, ${opp.nick} ${o.opponent}: ${recap.title}`} alt={`Week ${game.week} final score card`} label="Share the final" tone="dark" />
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
