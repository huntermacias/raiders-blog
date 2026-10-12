"use client"

import * as React from "react"

import { trackPlayers } from "@/lib/lab/track"
import ProgressLine from "@/components/lab/players/ProgressLine"
import {
	type LogPoint,
	type PlayerGroup,
	GROUP_META,
	formatStat,
	ordinal,
	shownPct,
	statInfo,
	trailLine,
} from "@/lib/lab/playersKit"

export type ExplorerStat = { k: string; label: string; graded: boolean; lower: boolean }

/**
 * The year so far for one player, one stat at a time. The line is where he has ranked among his peers after each week; the table under
 * it is every game on its own, because a rank built on a season can hide a great game and a bad one.
 */
export default function ProgressExplorer({
	group,
	name,
	stats,
	trails,
	weeks,
	formWeeks,
	opp,
	initial,
	per,
}: {
	group: PlayerGroup
	name: string
	stats: ExplorerStat[]
	trails: Record<string, LogPoint[]>
	weeks: number[]
	formWeeks: number[]
	/** The opponent by week for each week he played, already resolved for his team that week. */
	opp: Record<string, string>
	initial: string
	per: Record<string, string>
}) {
	const [key, setKey] = React.useState(initial)
	const stat = stats.find((s) => s.k === key) ?? stats[0]
	if (!stat) return null
	const pts = trails[stat.k] ?? []
	const info = statInfo(group, stat.k)
	const line = stat.graded ? trailLine(pts) : ""
	return (
		<div>
			<div role="tablist" aria-label="Pick a stat" className="flex flex-wrap gap-1.5">
				{stats.map((s) => (
					<button
						key={s.k}
						type="button"
						role="tab"
						aria-selected={s.k === stat.k}
						onClick={() => {
							setKey(s.k)
							trackPlayers("player_stat_tab", { player: name, group, stat: s.k })
						}}
						className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${s.k === stat.k ? "border-lab-ink bg-lab-ink text-lab-page" : "border-lab-line-strong text-lab-soft hover:border-lab-ink hover:text-lab-ink"}`}
					>
						{s.label}
					</button>
				))}
			</div>

			{stat.graded ? (
				<div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
					<ProgressLine weeks={weeks} points={pts.map((p) => ({ w: p[0], pct: p[3] }))} formWeeks={formWeeks} label={`${name}, ${stat.label}: where he ranked among his peers after each week. ${line}`} />
					<div>
						<p className="m-0 text-sm font-semibold text-lab-ink">{line || "Not enough games yet to draw a line."}</p>
						<p className="m-0 mt-2 text-xs leading-relaxed text-lab-muted">
							The line is his season-to-date rank among players at his position after each week, from 99 (the best in the league) down to 1 (the worst). It rises when he passes other players, not when he has one big game. Early weeks are noisier because fewer plays are behind them. The shaded weeks are the recent stretch.
						</p>
					</div>
				</div>
			) : (
				<p className="m-0 mt-4 text-sm text-lab-soft">This is a style stat, so it has no better or worse. The table shows how it has changed game to game.</p>
			)}

			<div className="mt-4 overflow-x-auto rounded-xl border border-lab-line">
				<table className="w-full border-collapse text-left text-xs sm:text-sm">
					<caption className="sr-only">{stat.label} game by game</caption>
					<thead>
						<tr className="bg-lab-tint text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted sm:text-[11px]">
							<th scope="col" className="px-3 py-2">Week</th>
							<th scope="col" className="px-2 py-2">Opponent</th>
							<th scope="col" className="px-2 py-2 text-right">That game</th>
							<th scope="col" className="px-2 py-2 text-right">{info?.per ?? "Plays"}</th>
							{stat.graded ? <th scope="col" className="px-3 py-2 text-right">Season rank after</th> : null}
						</tr>
					</thead>
					<tbody>
						{pts.map((p) => (
							<tr key={p[0]} className={`border-t border-lab-line ${formWeeks.includes(p[0]) ? "bg-lab-hover" : ""}`}>
								<th scope="row" className="px-3 py-2 font-semibold text-lab-ink">{p[0]}</th>
								<td className="px-2 py-2 text-lab-soft">{opp[String(p[0])] ? `vs ${opp[String(p[0])]}` : ""}</td>
								<td className="px-2 py-2 text-right font-mono tabular-nums text-lab-ink">{formatStat(group, stat.k, p[1])}</td>
								<td className="px-2 py-2 text-right font-mono tabular-nums text-lab-muted">{Math.round(p[2])}</td>
								{stat.graded ? <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{p[3] === null ? <span className="text-lab-muted" title="Too few plays behind his season so far to rank him fairly">Not yet</span> : `${ordinal(shownPct(p[3]))} pct`}</td> : null}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{stat.graded && pts.some((p) => p[3] === null) ? (
				<p className="m-0 mt-2 text-[11px] leading-relaxed text-lab-muted" data-testid="not-yet-note">
					&ldquo;Not yet&rdquo; means too little of the season was behind him to rank him fairly against {GROUP_META[group].peers}. A week-by-week rank needs most of the {GROUP_META[group].need} that grade a full season, so early weeks stay blank for players who see few plays, like kickers. It says nothing about how he played.
				</p>
			) : null}
			<p className="m-0 mt-2 text-[11px] leading-relaxed text-lab-muted">
				{stat.lower ? "Lower is better for this stat. " : ""}
				One game is a small sample: a single stat over {pts.length ? Math.round(pts.reduce((a, p) => a + p[2], 0) / pts.length) : 0} {per[stat.k] ?? "plays"} can swing on a handful of plays. Shaded rows are the recent stretch.
			</p>
		</div>
	)
}
