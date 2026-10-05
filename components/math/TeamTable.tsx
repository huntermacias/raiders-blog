"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

import { RAIDERS, teamByAbbr, teamInfo } from "@/lib/nfl"
import { cn } from "@/lib/utils"
import type { TeamDetail } from "@/lib/math/report"
import { TeamChip } from "@/components/predictions/TeamChip"
import { OddsSpark, RankHistory, oddsText } from "./charts"
import ShareMenu from "./ShareMenu"

const TEAMS_IN_LEAGUE = 32

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0")
const points = (n: number) => (n >= 0 ? `+${n.toFixed(1)}` : `−${Math.abs(n).toFixed(1)}`)
const at = (rank: number) => `${((rank - 1) / (TEAMS_IN_LEAGUE - 1)) * 100}%`
const recordText = (r: { w: number; l: number; t: number }) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ""}`

function gapWords(r: TeamDetail) {
	if (r.gap === 0) return "Same"
	return r.gap > 0 ? `I'm ${r.gap} higher` : `I'm ${-r.gap} lower`
}

function Stat({ label, value, foot }: { label: string; value: string; foot?: string }) {
	return (
		<div className="rounded-lg border border-border bg-background p-3">
			<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
			<p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums">{value}</p>
			{foot && <p className="mt-1 text-[11px] text-muted-foreground">{foot}</p>}
		</div>
	)
}

type View = { week: number; model: "full" | "season"; stamp?: number }

function UnderTheHood({ u }: { u: NonNullable<TeamDetail["under"]> }) {
	const gap = u.yardageMargin - u.margin
	const verdict = Math.abs(gap) < 2 ? "The box scores back up the results." : gap < 0 ? "Results have run ahead of the yardage, so the math is a little less sure of them." : "Results have run behind the yardage, so the math gives them a little extra credit."
	return (
		<div className="mt-4 rounded-lg border border-border bg-background p-3">
			<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Under the hood · {u.games} box score{u.games === 1 ? "" : "s"}</p>
			<dl className="mt-2 grid grid-cols-3 gap-2 text-center">
				<div>
					<dd className="font-serif text-xl font-bold tabular-nums">{points(u.margin)}</dd>
					<dt className="text-[11px] text-muted-foreground">Scoring margin per game</dt>
				</div>
				<div>
					<dd className="font-serif text-xl font-bold tabular-nums">{points(u.yardageMargin)}</dd>
					<dt className="text-[11px] text-muted-foreground">Margin by yards per play</dt>
				</div>
				<div>
					<dd className="font-serif text-xl font-bold tabular-nums">{points(u.turnoverMargin)}</dd>
					<dt className="text-[11px] text-muted-foreground">Turnover margin per game</dt>
				</div>
			</dl>
			<p className="mt-2 text-xs text-muted-foreground">
				{verdict} {u.adj !== 0 && <>That moved the rating {u.adj > 0 ? "up" : "down"} {Math.abs(Math.round(u.adj))} points. </>}Turnovers are shown but not used in the rating: they decide games but rarely repeat.
			</p>
		</div>
	)
}

function Detail({ t, sims, view }: { t: TeamDetail; sims: number; view: View }) {
	const o = t.odds
	return (
		<div className="grid gap-6 p-4 md:grid-cols-2 md:p-5">
			<div>
				<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Rank by week</h3>
				<div className="mt-2 max-w-sm">
					<RankHistory history={t.rankHistory} />
				</div>
				<p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
					<span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-foreground" /> Me</span>
					<span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-foreground bg-card" /> The math</span>
				</p>
				{t.note && (
					<blockquote className="mt-4 border-l-2 border-foreground/70 pl-3 text-sm">
						<span className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">What I wrote this week</span>
						{t.note}
					</blockquote>
				)}
			</div>

			<div>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					<Stat label="Math rating" value={Math.round(t.rating).toString()} foot={`${points(t.ratingChange)} this week`} />
					<Stat label="Record" value={recordText(t.record)} foot={o ? `${o.remaining} to play` : undefined} />
					{o ? (
						<>
							<Stat label="Make playoffs" value={oddsText(o.playoffs, sims)} foot={`Division ${oddsText(o.division, sims)}${o.plain ? ` · results alone ${oddsText(o.plain.playoffs, sims)}` : ""}`} />
							<Stat label="Projected wins" value={o.projWins.toFixed(1)} />
							<Stat label="No. 1 seed" value={oddsText(o.topSeed, sims)} />
							<Stat label="Schedule left" value={o.sosRank ? `No. ${o.sosRank}` : "n/a"} foot={o.sosRank ? "1 is hardest" : "No games left"} />
						</>
					) : null}
				</div>
				{o && o.history.length > 1 && (
					<div className="mt-3">
						<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Playoff odds by week</p>
						<OddsSpark history={o.history} sims={sims} />
					</div>
				)}
				{t.under && <UnderTheHood u={t.under} />}
				<div className="mt-4">
					<p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Share this card</p>
					<ShareMenu view={{ team: t.abbr, ...view }} stamp={view.stamp} text={`${t.nick}: I have them No. ${t.blogger}, the math has them No. ${t.math}.`} />
				</div>
			</div>

			<div>
				<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Results</h3>
				{t.results.length === 0 ? (
					<p className="mt-2 text-sm text-muted-foreground">No games yet.</p>
				) : (
					<ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-background text-sm">
						{t.results.map((g) => (
							<li key={g.week} className="flex items-center gap-3 px-3 py-2">
								<span className="w-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wk {g.week}</span>
								<span className="min-w-0 flex-1 truncate">
									{g.home ? "vs" : "at"} {teamByAbbr(g.opp).nick}
								</span>
								<span className="font-semibold tabular-nums">
									<span className="mr-1.5 inline-block w-4 text-center text-xs font-bold">{g.result}</span>
									{g.mine}&ndash;{g.theirs}
								</span>
								<span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
									<span aria-hidden>{points(g.shift)}</span>
									<span className="sr-only">{g.shift >= 0 ? "rating up" : "rating down"} {Math.abs(g.shift).toFixed(1)}</span>
								</span>
							</li>
						))}
					</ul>
				)}
				<p className="mt-1 text-[11px] text-muted-foreground">The last number is how far that game moved the math&rsquo;s rating.</p>
			</div>

			<div>
				<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Still to play</h3>
				{t.upcoming.length === 0 ? (
					<p className="mt-2 text-sm text-muted-foreground">No games left on the schedule.</p>
				) : (
					<ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-background text-sm">
						{t.upcoming.slice(0, 5).map((g) => (
							<li key={g.week} className="flex items-center gap-3 px-3 py-2">
								<span className="w-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wk {g.week}</span>
								<span className="min-w-0 flex-1 truncate">
									{g.home ? "vs" : "at"} {teamByAbbr(g.opp).nick}
								</span>
								<span className="flex w-28 items-center justify-end gap-2">
									<span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
										<span className="block h-full bg-foreground" style={{ width: `${Math.round(g.chance * 100)}%` }} />
									</span>
									<span className="w-9 text-right text-xs font-semibold tabular-nums">{Math.round(g.chance * 100)}%</span>
								</span>
							</li>
						))}
					</ul>
				)}
				{t.upcoming.length > 5 && <p className="mt-1 text-[11px] text-muted-foreground">+ {t.upcoming.length - 5} more. Percentages are the math&rsquo;s chance this team wins.</p>}
				{t.upcoming.length > 0 && t.upcoming.length <= 5 && <p className="mt-1 text-[11px] text-muted-foreground">Percentages are the math&rsquo;s chance this team wins.</p>}
			</div>
		</div>
	)
}

/**
 * All the teams, my rank beside the math's, each row opening into that team's rank history, results, upcoming
 * games and playoff odds. `#team-DEN` in the address opens a team, so a take is easy to link to.
 */
export default function TeamTable({ teams, hot, sims, week, model = "full", stamp }: { teams: TeamDetail[]; hot: number; sims: number; week: number; model?: "full" | "season"; stamp?: number }) {
	const [open, setOpen] = useState<string | null>(null)

	const fromHash = useCallback(() => {
		// `#team-DEN` opens a team, and so does a shared `?team=DEN` or `?take=DEN` link.
		const m = /^#team-([A-Za-z]{2,3})$/.exec(window.location.hash)
		const q = new URLSearchParams(window.location.search)
		const asked = m ? m[1] : q.get("team") ?? q.get("take")
		const abbr = asked && /^[A-Za-z]{2,3}$/.test(asked) ? asked.toUpperCase() : null
		if (abbr && teams.some((t) => t.abbr === abbr)) {
			setOpen(abbr)
			window.setTimeout(() => document.getElementById(`team-${abbr}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50)
		}
	}, [teams])

	useEffect(() => {
		fromHash()
		window.addEventListener("hashchange", fromHash)
		return () => window.removeEventListener("hashchange", fromHash)
	}, [fromHash])

	const toggle = (abbr: string) => {
		const next = open === abbr ? null : abbr
		setOpen(next)
		try {
			window.history.replaceState(null, "", next ? `#team-${next}` : window.location.pathname + window.location.search)
		} catch {
			// A sandboxed frame may refuse to touch the address; the panel still opens.
		}
	}

	return (
		<div>
			<p className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
				<span className="inline-flex items-center gap-1.5" aria-hidden><span className="h-3 w-3 rounded-full bg-foreground" /> My rank</span>
				<span className="inline-flex items-center gap-1.5" aria-hidden><span className="h-3 w-3 rounded-full border-2 border-foreground bg-card" /> The math&rsquo;s rank</span>
				<span aria-hidden>Left is No. 1</span>
				<span>Gap: + means I rank them higher than the math</span>
				<span className="font-semibold text-foreground">Tap a team for its story.</span>
			</p>
			<div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
				<table className="w-full text-left text-sm">
					<caption className="sr-only">My power rankings next to the math&rsquo;s ranking for all {teams.length} teams, with the gap between them. Each team opens a panel with its details.</caption>
					<thead className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
						<tr>
							<th scope="col" className="px-3 py-3 text-right">Me</th>
							<th scope="col" className="px-3 py-3">Team</th>
							<th scope="col" className="hidden w-[34%] px-3 py-3 md:table-cell"><span className="sr-only">Where each ranks</span></th>
							<th scope="col" className="px-3 py-3 text-right">Math</th>
							<th scope="col" className="px-3 py-3 text-right">Gap</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{teams.map((r) => {
							const t = teamInfo(r.team)
							const isLV = r.team === RAIDERS
							const big = Math.abs(r.gap) >= hot
							const lo = Math.min(r.blogger, r.math)
							const hi = Math.max(r.blogger, r.math)
							const isOpen = open === r.abbr
							const panel = `panel-${r.abbr}`
							return (
								<Fragment key={r.team}>
									<tr id={`team-${r.abbr}`} className={cn("scroll-mt-24", isLV && "bg-muted/60", isOpen && "bg-muted/40")}>
										<td className="px-3 py-2.5 text-right font-serif text-lg font-bold tabular-nums">{r.blogger}</td>
										<td className="px-3 py-2.5">
											<button
												type="button"
												onClick={() => toggle(r.abbr)}
												aria-expanded={isOpen}
												aria-controls={panel}
												className="group -m-1 flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md p-1 text-left hover:bg-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground"
											>
												<TeamChip team={r.team} />
												<span className={cn("font-semibold", isLV && "font-extrabold")}>{t.nick}</span>
												<ChevronDown aria-hidden className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform md:ml-1", isOpen && "rotate-180")} />
											</button>
										</td>
										<td className="hidden px-3 py-2.5 md:table-cell" aria-hidden>
											<div className="relative mx-2 h-6">
												<div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-border/70" />
												<div className={cn("absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full", big ? "bg-foreground" : "bg-muted-foreground/50")} style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} />
												<span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: at(r.math) }} />
												<span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-card" style={{ left: at(r.blogger) }} />
											</div>
										</td>
										<td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.math}</td>
										<td className="px-3 py-2.5 text-right">
											<span className={cn("inline-block whitespace-nowrap text-xs tabular-nums", big ? "font-bold text-foreground" : "text-muted-foreground")}>
												<span aria-hidden>{signed(r.gap)}</span>
												<span className="sr-only">{gapWords(r)}</span>
											</span>
										</td>
									</tr>
									{isOpen && (
										<tr id={panel} className="bg-muted/20">
											<td colSpan={5} className="p-0">
												<Detail t={r} sims={sims} view={{ week, model, stamp }} />
											</td>
										</tr>
									)}
								</Fragment>
							)
						})}
					</tbody>
				</table>
			</div>
		</div>
	)
}
