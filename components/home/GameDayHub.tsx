import Link from "next/link"
import { ArrowRight, CalendarDays, Check, Minus, Tv, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { teamInfo } from "@/lib/nfl"
import type { GamePrediction } from "@/lib/predictions"
import type { HubState } from "@/lib/home"
import { type ScheduleRow, recordText } from "@/lib/schedule"
import { kickoffText } from "@/components/schedule/ScheduleList"
import Countdown from "./Countdown"
import HeroVote from "./HeroVote"

type Props = {
	state: HubState
	/** Every graded-or-open pick for the season, so the hub can find this game's keys and votes. */
	picks: GamePrediction[]
	/** Finished Raiders games, oldest first. */
	played: ScheduleRow[]
	record: { w: number; l: number; t: number }
	/** The most recent game recap, linked from the bottom of the right column. */
	latestReport?: { slug: string; title: string } | null
}

function ResultChip({ row }: { row: ScheduleRow }) {
	const o = row.outcome
	if (!o) return null
	const opp = teamInfo(row.opponent)
	const win = o.result === "W"
	const tie = o.result === "T"
	const Icon = tie ? Minus : win ? Check : X
	const href = row.report?.slug ? `/games/${row.report.slug}` : "/schedule"
	return (
		<Link
			href={href}
			className="group flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
			title={`Week ${row.week} ${row.homeAway === "away" ? "at" : "vs"} ${opp.name}`}
		>
			<span
				className={cn(
					"inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
					tie
						? "border-zinc-600 bg-zinc-800 text-zinc-300"
						: win
							? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300"
							: "border-rose-400/40 bg-rose-400/15 text-rose-300"
				)}
			>
				<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
			</span>
			<span className="min-w-0 leading-tight">
				<span className="block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
					Wk {row.week} {row.homeAway === "away" ? "at" : "vs"} {opp.abbr}
				</span>
				<span className="block text-sm font-bold tabular-nums text-zinc-100">
					<span className="sr-only">{tie ? "Tie" : win ? "Win" : "Loss"} </span>
					{o.raiders}&ndash;{o.opponent}
				</span>
			</span>
		</Link>
	)
}

function PickScore({ game }: { game: ScheduleRow }) {
	if (!game.pick) return null
	const opp = teamInfo(game.opponent)
	const raidersWin = game.pick.raiders >= game.pick.opponent
	const side = (nick: string, score: number, wins: boolean) => (
		<div className={cn("min-w-0", !wins && "opacity-60")}>
			<p className="truncate text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{nick}</p>
			<p className="font-serif text-6xl font-bold leading-none tabular-nums md:text-7xl">{score}</p>
		</div>
	)
	return (
		<div>
			<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">My pick, on the record</p>
			<div className="flex items-end gap-5">
				{side("Raiders", game.pick.raiders, raidersWin)}
				<span aria-hidden className="pb-2 font-serif text-3xl text-zinc-600">
					&ndash;
				</span>
				{side(opp.nick, game.pick.opponent, !raidersWin)}
			</div>
		</div>
	)
}

export default function GameDayHub({ state, picks, played, record, latestReport }: Props) {
	const rec = recordText(record)
	const hasPlayed = played.length > 0
	const recent = played.slice(-4)

	const game = state.kind === "idle" ? null : state.game
	const opp = game ? teamInfo(game.opponent) : null
	const pick = game?.pick ? picks.find((p) => p._id === game.pick?.id) ?? null : null
	const keys = pick?.keys?.filter((k) => k?.text?.trim()) ?? []
	const when = game ? kickoffText(game.kickoff) : null
	const live = state.kind === "live"

	return (
		<section
			aria-label={game ? `Week ${game.week} game day` : "Season at a glance"}
			className="relative overflow-hidden rounded-2xl border border-[#27272a] bg-[#09090b] text-zinc-50 shadow-xl"
		>
			{/* Silver wash behind the numbers. Decorative. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(60% 80% at 100% 0%, rgba(161,161,170,0.14) 0%, rgba(9,9,11,0) 60%), radial-gradient(50% 60% at 0% 100%, rgba(63,63,70,0.28) 0%, rgba(9,9,11,0) 70%)",
				}}
			/>

			<div className="relative grid gap-px bg-[#27272a] lg:grid-cols-[1.45fr_1fr]">
				{/* LEFT: the game */}
				<div className="bg-[#09090b]/95 p-6 md:p-8">
					{game && opp ? (
						<>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
								<span className="rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#09090b]">
									Week {game.week}
								</span>
								<span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{live ? "Game day" : "Next game"}</span>
							</div>

							<h2 className="mt-4 font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
								Raiders <span className="text-zinc-500">{game.homeAway === "away" ? "at" : "vs."}</span> {opp.nick}
							</h2>

							<p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-300">
								{when && (
									<span className="inline-flex items-center gap-1.5">
										<CalendarDays aria-hidden className="h-4 w-4 text-zinc-400" /> {when}
									</span>
								)}
								{game.network && (
									<span className="inline-flex items-center gap-1.5">
										<Tv aria-hidden className="h-4 w-4 text-zinc-400" /> {game.network}
									</span>
								)}
							</p>

							{game.kickoff && (
								<div className="mt-6">
									<Countdown kickoff={game.kickoff} live={live} />
								</div>
							)}

							{game.pick ? (
								<div className="mt-8">
									<PickScore game={game} />
								</div>
							) : (
								<p className="mt-8 max-w-md text-sm text-zinc-400">
									My pick for this one goes on the record before kickoff.{" "}
									<Link href="/predictions" className="font-semibold text-zinc-100 underline-offset-4 hover:underline">
										See every pick so far
									</Link>
									.
								</p>
							)}

							{keys.length > 0 && (
								<div className="mt-8">
									<p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Keys to the game</p>
									<ol className="grid gap-2 sm:grid-cols-2">
										{keys.slice(0, 4).map((k, i) => (
											<li key={k._key ?? i} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
												<span aria-hidden className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-600 text-[11px] font-bold tabular-nums text-zinc-300">
													{i + 1}
												</span>
												<span className="text-sm font-medium leading-snug text-zinc-100">{k.text.trim()}</span>
											</li>
										))}
									</ol>
									<p className="mt-2 text-xs text-zinc-500">Each key is graded hit or miss after the final.</p>
								</div>
							)}

							<div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
								{pick?.preview?.slug && (
									<Link
										href={`/post/${pick.preview.slug}`}
										className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-bold text-[#09090b] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
									>
										Read the Week {game.week} preview <ArrowRight aria-hidden className="h-4 w-4" />
									</Link>
								)}
								<Link href="/predictions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline">
									Full scoreboard <ArrowRight aria-hidden className="h-3.5 w-3.5" />
								</Link>
								<Link href="/league#play" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline">
									Beat the Blogger <ArrowRight aria-hidden className="h-3.5 w-3.5" />
								</Link>
							</div>
						</>
					) : (
						<>
							<span className="rounded-full bg-zinc-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#09090b]">Season at a glance</span>
							<h2 className="mt-4 font-serif text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">Every pick on the record</h2>
							<p className="mt-4 max-w-xl text-lg text-zinc-300">
								Weekly game picks, win totals for all 32 teams, and power rankings, all graded in public.
							</p>
							<div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
								<Link
									href="/predictions"
									className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-bold text-[#09090b] hover:bg-white"
								>
									See the scoreboard <ArrowRight aria-hidden className="h-4 w-4" />
								</Link>
								<Link href="/rankings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline">
									Power rankings <ArrowRight aria-hidden className="h-3.5 w-3.5" />
								</Link>
							</div>
						</>
					)}
				</div>

				{/* RIGHT: vote + season so far */}
				<div className="flex flex-col gap-px bg-[#27272a]">
					{pick && game && (
						<div className="bg-[#09090b]/95 p-6 md:p-8">
							<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Your turn</p>
							<h3 className="mb-4 mt-1 font-serif text-2xl font-bold leading-tight">Who wins? Lock in your pick.</h3>
							<HeroVote
								pick={{
									_id: pick._id,
									week: pick.week,
									awayTeam: pick.awayTeam,
									homeTeam: pick.homeTeam,
									kickoff: pick.kickoff,
									readerVotesAway: pick.readerVotesAway,
									readerVotesHome: pick.readerVotesHome,
								}}
							/>
						</div>
					)}

					<div className="flex-1 bg-[#09090b]/95 p-6 md:p-8">
						<div className="flex items-end justify-between gap-4">
							<div>
								<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Raiders record</p>
								<p className="mt-1 font-serif text-5xl font-bold leading-none tabular-nums">{hasPlayed ? rec : "0–0"}</p>
							</div>
							<Link href="/schedule" className="inline-flex items-center gap-1 pb-1 text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-zinc-50 hover:underline">
								Schedule <ArrowRight aria-hidden className="h-3.5 w-3.5" />
							</Link>
						</div>

						{recent.length > 0 ? (
							<ul className="mt-5 grid grid-cols-2 gap-2">
								{recent
									.slice()
									.reverse()
									.map((r) => (
										<li key={r.week}>
											<ResultChip row={r} />
										</li>
									))}
							</ul>
						) : (
							<p className="mt-4 text-sm text-zinc-400">The season hasn&rsquo;t started. The first final score starts the clock.</p>
						)}

						{latestReport && (
							<Link
								href={`/games/${latestReport.slug}`}
								className="group mt-6 block rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-600 hover:bg-zinc-800/70"
							>
								<p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Latest recap</p>
								<p className="mt-1.5 line-clamp-2 font-serif text-base font-bold leading-snug text-zinc-50 group-hover:underline">{latestReport.title}</p>
								<span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-zinc-300">
									Read the recap <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
								</span>
							</Link>
						)}
					</div>
				</div>
			</div>
		</section>
	)
}
