"use client"

import * as React from "react"

import { useNow } from "@/components/live/hooks"
import type { Side } from "@/lib/live/colors"
import { clockText, countdown, downText, kickoffLabel, periodName, spotName, spreadText } from "@/lib/live/format"
import type { LiveGameInfo, LiveTeam } from "@/lib/live/types"

function TeamBlock({ team, side, ball, align }: { team: LiveTeam; side: Side; ball: boolean; align: "left" | "right" }) {
	return (
		<div className={`flex min-w-0 flex-1 items-center gap-3 sm:gap-5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
			<span
				className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full text-base font-extrabold tracking-wide sm:flex"
				style={{ background: side.fill, color: side.on }}
				aria-hidden
			>
				{team.abbr}
			</span>
			<div className="min-w-0">
				<p className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-lab-muted">
					<span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle sm:hidden" style={{ background: side.fill }} aria-hidden />
					<span className="sm:hidden">{team.name.split(" ").slice(-1)[0]}</span>
					<span className="hidden sm:inline">{team.name}</span>
					{ball && (
						<span className="ml-2 rounded bg-lab-ink px-1.5 py-0.5 align-middle text-[9px] font-bold tracking-[0.12em] text-lab-surface" title="Has the ball">
							BALL
						</span>
					)}
				</p>
				<p
					key={team.score}
					className="lab-score font-mono text-5xl font-bold leading-none tabular-nums sm:text-7xl"
				>
					{team.score}
				</p>
				{team.record && <p className="mt-1 text-xs text-lab-muted">{team.record}</p>}
			</div>
		</div>
	)
}

/** The scoreboard bug: both teams and scores, the clock, who has the ball, down and distance, and the line. */
export default function ScoreBug({ info, away, home }: { info: LiveGameInfo; away: Side; home: Side }) {
	const now = useNow(1000)
	const live = info.state === "in"
	const sit = info.situation
	const offense = info.possession
	const defense = offense === info.home.abbr ? info.away.abbr : info.home.abbr
	const dd = live ? downText(sit?.down ?? null, sit?.distance ?? null, sit?.yardsToGoal ?? null) : ""
	const where = live && offense && sit?.yardsToGoal != null ? spotName(offense, defense, 100 - sit.yardsToGoal) : ""
	const untilKickoff = info.state === "pre" && info.kickoff && now != null ? countdown(new Date(info.kickoff).getTime() - now) : ""
	const spread = spreadText(info)

	return (
		<section className="rounded-2xl border border-lab-line bg-lab-surface p-4 shadow-[var(--lab-shadow)] sm:p-6" aria-label="Score">
			<div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">
				<span>{info.venue ?? "NFL"}{info.network ? ` · ${info.network}` : ""}</span>
				{live ? (
					<span className="inline-flex items-center gap-2 text-lab-ink">
						<span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
						Live
					</span>
				) : info.state === "post" ? (
					<span className="text-lab-ink">Final</span>
				) : (
					<span>Pregame</span>
				)}
			</div>

			<div className="mt-4 flex items-center justify-between gap-3 sm:gap-6">
				<TeamBlock team={info.away} side={away} ball={live && offense === info.away.abbr} align="left" />
				<div className="shrink-0 text-center">
					{live ? (
						<>
							<p className="font-mono text-xl font-bold tabular-nums sm:text-3xl">{periodName(info.period)}</p>
							<p className="font-mono text-base tabular-nums text-lab-soft sm:text-xl">{clockText(info.clockSeconds)}</p>
						</>
					) : info.state === "post" ? (
						<p className="font-mono text-xl font-bold sm:text-3xl">FINAL</p>
					) : (
						<>
							<p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lab-muted">Kickoff in</p>
							<p className="min-h-[1.75rem] font-mono text-xl font-bold tabular-nums sm:text-3xl">{untilKickoff || "Soon"}</p>
						</>
					)}
				</div>
				<TeamBlock team={info.home} side={home} ball={live && offense === info.home.abbr} align="right" />
			</div>

			<div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 border-t border-lab-line pt-4 text-sm text-lab-soft">
				{live && dd ? (
					<span>
						<span className="rounded bg-lab-ink px-2 py-0.5 font-mono text-xs font-bold text-lab-surface">{dd}</span>
						{where && <span className="ml-2">{offense} ball at {where}</span>}
					</span>
				) : live && offense ? (
					<span>{offense} has the ball</span>
				) : info.state === "post" ? (
					<span>{info.detail}</span>
				) : (
					<span>Kickoff {kickoffLabel(info.kickoff)}</span>
				)}
				{spread && <span className="text-lab-muted">Line: {spread}{info.odds?.overUnder ? ` · O/U ${info.odds.overUnder}` : ""}</span>}
			</div>
		</section>
	)
}
