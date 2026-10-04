import Link from "@/components/SiteLink"
import { ArrowRight, CalendarOff, Check, Clock, Minus, Tv, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { teamInfo } from "@/lib/nfl"
import type { ScheduleRow } from "@/lib/schedule"
import { PickPill } from "@/components/predictions/StatusPill"
import { TeamChip } from "@/components/predictions/TeamChip"

const TZ = "America/Los_Angeles"

export function kickoffText(iso?: string | null, withYear = false): string | null {
	if (!iso) return null
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return null
	const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: TZ })
	const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ, timeZoneName: "short" })
	return `${date} · ${time}`
}

function Outcome({ row }: { row: ScheduleRow }) {
	const o = row.outcome
	if (!o) {
		return (
			<span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
				<Clock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} /> Upcoming
			</span>
		)
	}
	const win = o.result === "W"
	const tie = o.result === "T"
	const Icon = tie ? Minus : win ? Check : X
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums",
				tie
					? "border-border bg-muted text-muted-foreground"
					: win
						? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-400"
						: "border-rose-600/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-400"
			)}
		>
			<Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
			{tie ? "T" : win ? "W" : "L"} {o.raiders}–{o.opponent}
		</span>
	)
}

export default function ScheduleList({ rows }: { rows: ScheduleRow[] }) {
	return (
		<ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label="Raiders schedule">
			{rows.map((r) => {
				if (r.bye) {
					return (
						<li key={r.week} className="flex items-center gap-4 px-4 py-4 text-muted-foreground">
							<span className="w-12 shrink-0 text-xs font-semibold uppercase tracking-widest">Wk {r.week}</span>
							<span className="inline-flex items-center gap-2 text-sm font-semibold">
								<CalendarOff aria-hidden className="h-4 w-4" /> Bye week
							</span>
						</li>
					)
				}

				const opp = teamInfo(r.opponent)
				const when = kickoffText(r.kickoff)
				const away = r.homeAway === "away"
				return (
					<li key={r.week} className="px-4 py-4">
						<div className="flex flex-wrap items-start gap-x-4 gap-y-2">
							<span className="w-12 shrink-0 pt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Wk {r.week}</span>

							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
									<span className="text-sm font-medium text-muted-foreground">{r.opponent ? (away ? "at" : "vs") : ""}</span>
									{r.opponent ? (
										<>
											<TeamChip team={r.opponent} />
											<span className="font-semibold">{opp.name}</span>
										</>
									) : (
										<span className="font-semibold text-muted-foreground">Opponent to be set</span>
									)}
								</div>
								<p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
									{when && <span>{when}</span>}
									{r.network && (
										<span className="inline-flex items-center gap-1">
											<Tv aria-hidden className="h-3.5 w-3.5" /> {r.network}
										</span>
									)}
								</p>
							</div>

							<div className="ml-auto shrink-0">
								<Outcome row={r} />
							</div>
						</div>

						{(r.pick || r.preview || r.report) && (
							<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-0 text-sm sm:pl-16">
								{r.pick && (
									<span className="inline-flex flex-wrap items-center gap-2">
										<span className="text-muted-foreground">
											My pick: <span className="font-semibold text-foreground tabular-nums">Raiders {r.pick.raiders}, {opp.nick} {r.pick.opponent}</span>
										</span>
										{r.outcome && <PickPill result={r.pick.result} />}
									</span>
								)}
								<span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold">
									{r.preview && (
										<Link href={`/post/${r.preview.slug}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
											Preview <ArrowRight aria-hidden className="h-3.5 w-3.5" />
										</Link>
									)}
									{r.report && (
										<Link href={`/games/${r.report.slug}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
											Recap <ArrowRight aria-hidden className="h-3.5 w-3.5" />
										</Link>
									)}
									{r.pick && !r.outcome && (
										<Link href={`/predictions/pick/${r.pick.id}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
											Vote on this game <ArrowRight aria-hidden className="h-3.5 w-3.5" />
										</Link>
									)}
								</span>
							</div>
						)}
					</li>
				)
			})}
		</ol>
	)
}
