"use client"

import * as React from "react"

import Link from "@/components/SiteLink"
import { usePolled } from "@/components/live/hooks"
import { type StripModel, stripDelay, stripFor } from "@/lib/liveStrip"
import type { LiveGameInfo } from "@/lib/live/types"

type Board = { games: LiveGameInfo[] }

function Score({ n, lead }: { n: number; lead: boolean }) {
	return (
		<span key={n} className={`lab-score font-mono text-2xl font-bold tabular-nums leading-none sm:text-3xl ${lead ? "text-foreground" : "text-muted-foreground"}`}>
			{n}
		</span>
	)
}

function Pill({ m }: { m: StripModel }) {
	const live = m.kind === "live"
	return (
		<span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]">
			{live && (
				<span className="relative flex h-2 w-2" aria-hidden>
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
					<span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
				</span>
			)}
			<span className={live ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}>{live ? "Live" : m.kind === "soon" ? "Next up" : "Final"}</span>
		</span>
	)
}

function Scores({ m }: { m: StripModel }) {
	return (
		<div className="flex min-w-0 items-center gap-3 sm:gap-4">
			<div className="flex items-baseline gap-2">
				<span className="text-xs font-bold uppercase tracking-wider sm:text-sm">
					<span className="sm:hidden">{m.raiders.abbr}</span>
					<span className="hidden sm:inline">{m.raiders.nick}</span>
				</span>
				<Score n={m.raiders.score} lead={m.ahead !== "opp"} />
			</div>
			<span className="text-muted-foreground" aria-hidden>
				&ndash;
			</span>
			<div className="flex items-baseline gap-2">
				<Score n={m.opp.score} lead={m.ahead !== "raiders"} />
				<span className="text-xs font-bold uppercase tracking-wider text-muted-foreground sm:text-sm">
					<span className="sm:hidden">{m.opp.abbr}</span>
					<span className="hidden sm:inline">{m.opp.nick}</span>
				</span>
			</div>
		</div>
	)
}

function Matchup({ m, withTime = true }: { m: StripModel; withTime?: boolean }) {
	return (
		<p className="min-w-0 truncate text-sm font-semibold sm:text-base">
			Raiders {m.atHome ? "vs." : "at"} {m.opp.nick}
			{withTime && <span className="font-normal text-muted-foreground"> · {m.status}</span>}
		</p>
	)
}

/** The clock, the kickoff time, or "Final/OT". A plain "Final" is already in the pill. */
function statusText(m: StripModel): string {
	return m.kind === "final" && m.status === "Final" ? "" : m.status
}

function Cta({ m, compact = false }: { m: StripModel; compact?: boolean }) {
	return (
		<span className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-full bg-foreground text-xs font-bold text-background transition-opacity group-hover:opacity-85 ${compact ? "h-9 min-w-[2.25rem] px-3" : "px-3.5 py-1.5 sm:text-sm"}`}>
			{m.cta}
			<span aria-hidden className="transition-transform group-hover:translate-x-0.5">
				&rarr;
			</span>
		</span>
	)
}

function WinProb({ m }: { m: StripModel }) {
	if (m.kind !== "live" || !m.wpText) return null
	return (
		<span className="shrink-0 text-xs font-semibold text-muted-foreground">
			<span className="tabular-nums text-foreground">{m.wpText}</span> <span className="sm:hidden">to win</span>
			<span className="hidden sm:inline">Raiders win probability</span>
		</span>
	)
}

function Body({ m }: { m: StripModel }) {
	const soon = m.kind === "soon"
	return (
		<>
			{/* Phone: a small line of facts over the score, with the button beside the score. */}
			<div className="flex flex-col gap-1.5 sm:hidden">
				<div className="flex items-center justify-between gap-3">
					<span className="inline-flex items-center gap-2.5">
						<Pill m={m} />
						<span className="text-xs font-semibold text-muted-foreground">{statusText(m)}</span>
					</span>
					<WinProb m={m} />
				</div>
				<div className="flex items-center justify-between gap-3">
					{soon ? <Matchup m={m} withTime={false} /> : <Scores m={m} />}
					<Cta m={m} compact />
				</div>
			</div>

			{/* Wider screens: everything on one line. */}
			<div className="hidden items-center justify-between gap-4 sm:flex">
				<div className="flex min-w-0 items-center gap-4">
					<Pill m={m} />
					{soon ? <Matchup m={m} /> : <Scores m={m} />}
					{!soon && statusText(m) && <span className="shrink-0 text-xs font-semibold text-muted-foreground">{statusText(m)}</span>}
				</div>
				<div className="flex shrink-0 items-center gap-3">
					<WinProb m={m} />
					<Cta m={m} />
				</div>
			</div>
		</>
	)
}

/**
 * A slim bar at the top of the homepage while the Raiders are playing (and for a few hours either side).
 * The server sends the week's scoreboard so the bar is in the first paint and nothing jumps; after that
 * it asks for fresh scores itself, quickly during the game and not at all once there is nothing to show.
 */
export default function LiveStrip({ initialBoard, serverNow }: { initialBoard: LiveGameInfo[] | null; serverNow: number }) {
	const seed: Board | null = initialBoard ? { games: initialBoard } : null
	const [now, setNow] = React.useState(serverNow)
	React.useEffect(() => {
		setNow(Date.now())
		const id = window.setInterval(() => setNow(Date.now()), 30_000)
		return () => window.clearInterval(id)
	}, [])

	const { data } = usePolled<Board>("/api/live/scoreboard", (d) => stripDelay(d?.games, Date.now()), seed)
	const games = data?.games ?? initialBoard
	const m = stripFor(games, now)
	if (!m) return null

	return (
		<Link
			href={m.href}
			aria-label={`${m.label} ${m.cta}.`}
			className="group mb-4 block rounded-xl border border-border bg-card px-3.5 py-2.5 text-card-foreground shadow-sm transition-colors hover:border-foreground/40 sm:px-5 sm:py-3"
		>
			<Body m={m} />
		</Link>
	)
}
