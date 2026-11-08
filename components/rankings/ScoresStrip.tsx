"use client"

import Link from "@/components/SiteLink"
import { ArrowRight } from "lucide-react"

import { TeamLogo } from "@/components/lab/players/Media"
import { cn } from "@/lib/utils"
import { teamByAbbr } from "@/lib/nfl"
import { accentOnDark } from "@/lib/teamAccent"
import { type TeamGame, gameShareText, gamesByTeam, stripGames } from "@/lib/rankingsLive"
import type { LiveGameInfo } from "@/lib/live/types"
import { statusFor } from "@/lib/liveStrip"
import GameShare from "./GameShare"
import { LiveDot } from "./GameChip"

function Side({ abbr, score, rank, lead, show }: { abbr: string; score: number; rank?: number; lead: boolean; show: boolean }) {
	const t = teamByAbbr(abbr)
	const accent = accentOnDark(t.color, t.abbr)
	return (
		<div className="flex items-center gap-2.5" style={{ "--pc-accent": accent, "--pc-on": "#09090b" } as React.CSSProperties}>
			<TeamLogo team={t.abbr} size={28} className="h-7 w-7" />
			<div className="min-w-0 flex-1">
				<p className={cn("truncate text-sm leading-tight", lead ? "font-bold text-white" : "font-medium text-zinc-300")}>{t.nick}</p>
				{rank ? <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">No. {rank}</p> : null}
			</div>
			{show && (
				<span key={score} className={cn("lab-score font-mono text-2xl font-bold tabular-nums leading-none", lead ? "text-white" : "text-zinc-500")}>
					{score}
				</span>
			)}
		</div>
	)
}

function Card({ g, ranks, now }: { g: LiveGameInfo; ranks: Record<string, number | undefined>; now: number }) {
	const status = statusFor(g)
	const live = g.state === "in"
	const started = g.state !== "pre"
	const awayLead = started && g.away.score >= g.home.score
	const homeLead = started && g.home.score >= g.away.score
	const byTeam = gamesByTeam([g], now)
	const mine: TeamGame | undefined = byTeam[g.home.abbr]
	const label = `${teamByAbbr(g.away.abbr).nick} at ${teamByAbbr(g.home.abbr).nick}`
	return (
		<li
			className={cn(
				"flex w-[17.5rem] shrink-0 snap-start flex-col gap-3 rounded-2xl border p-4",
				live ? "border-red-500/40 bg-gradient-to-b from-red-500/10 to-white/[0.02]" : "border-white/10 bg-white/[0.04]"
			)}
		>
			<div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em]">
				{live ? (
					<span className="inline-flex items-center gap-1.5 text-red-400">
						<LiveDot /> Live
					</span>
				) : (
					<span className="text-zinc-400">{g.state === "post" ? "Final" : "Kickoff"}</span>
				)}
				<span className="text-zinc-400">{g.state === "post" ? (g.period > 4 ? "OT" : "") : status}</span>
			</div>
			<div className="space-y-2.5">
				<Side abbr={g.away.abbr} score={g.away.score} rank={ranks[g.away.abbr]} lead={awayLead} show={started} />
				<Side abbr={g.home.abbr} score={g.home.score} rank={ranks[g.home.abbr]} lead={homeLead} show={started} />
			</div>
			<div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
				{mine ? <GameShare gameId={g.id} text={gameShareText(mine, ranks)} label={label} tone="dark" /> : <span />}
				<Link href={`/live?game=${g.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-300 hover:text-white">
					{live ? "Follow live" : g.state === "post" ? "Replay" : "Game center"} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
				</Link>
			</div>
		</li>
	)
}

/**
 * This week's games as a row of scorecards, live ones first, each with both teams' power-ranking numbers and a Share button. Rendered inside the
 * dark masthead. `updatedAt` says how fresh the numbers are while a game is on.
 */
export default function ScoresStrip({
	games,
	ranks,
	now,
	liveNow,
	updatedAt,
}: {
	games: LiveGameInfo[]
	ranks: Record<string, number | undefined>
	now: number
	liveNow: number
	updatedAt: number | null
}) {
	const list = stripGames(games, now).slice(0, 16)
	if (list.length === 0) return null
	return (
		<section aria-label={liveNow > 0 ? "Scores right now" : "This week's scores"} data-testid="scores-strip">
			<div className="mb-3 flex items-end justify-between gap-3">
				<h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
					{liveNow > 0 ? (
						<>
							<LiveDot /> <span className="text-red-400">{liveNow} {liveNow === 1 ? "game" : "games"} live</span>
							<span className="hidden text-zinc-500 sm:inline">· scores update on their own</span>
						</>
					) : (
						"This week's scores"
					)}
				</h2>
				{liveNow > 0 && updatedAt ? (
					<span className="hidden text-[11px] text-zinc-500 sm:block" aria-hidden>
						Updated {new Date(updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Los_Angeles" })} PT
					</span>
				) : null}
			</div>
			<ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" tabIndex={0} aria-label="Scores, scroll sideways">
				{list.map((g) => (
					<Card key={g.id} g={g} ranks={ranks} now={now} />
				))}
			</ul>
		</section>
	)
}
