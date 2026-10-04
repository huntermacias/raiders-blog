"use client"

import * as React from "react"

import { Chip } from "@/components/lab/DriveBits"
import type { Side } from "@/lib/live/colors"
import { downText, periodName, signed } from "@/lib/live/format"
import type { LiveDrive, LiveGame, LivePlay } from "@/lib/live/types"

type Mode = "all" | "big" | "scores"

const MODES: { id: Mode; label: string }[] = [
	{ id: "all", label: "All plays" },
	{ id: "big", label: "Big plays" },
	{ id: "scores", label: "Scoring" },
]

function tag(p: LivePlay): { text: string; tone: "ink" | "bad" | "muted" } | null {
	if (p.touchdown) return { text: "TD", tone: "ink" }
	if (p.scoring) return { text: p.kind === "fg" ? "FG" : "PTS", tone: "ink" }
	if (p.turnover) return { text: "TO", tone: "bad" }
	if (p.penalty) return { text: "FLAG", tone: "muted" }
	if (p.kind === "run" || p.kind === "pass" || p.kind === "sack") return { text: signed(p.yards), tone: p.yards < 0 ? "bad" : "muted" }
	return null
}

function Row({ p, side }: { p: LivePlay; side: Side | null }) {
	const dd = downText(p.down, p.distance, p.from != null ? 100 - p.from : null)
	const t = tag(p)
	return (
		<li
			className={"grid grid-cols-[3.4rem_1fr_auto] items-start gap-x-3 border-l-2 py-2 pl-3 pr-2 " + (p.big ? "bg-lab-tint" : "")}
			style={{ borderLeftColor: p.turnover ? "var(--lab-bad)" : p.scoring ? (side?.fill ?? "var(--lab-ink)") : p.big ? "var(--lab-line-strong)" : "transparent" }}
		>
			<span className="pt-0.5 font-mono text-[11px] tabular-nums text-lab-muted">
				{periodName(p.period)}
				<br />
				{p.clock}
			</span>
			<span className={"min-w-0 text-sm leading-snug " + (p.big ? "font-semibold text-lab-ink" : "text-lab-soft")}>
				{dd && <span className="mr-1.5 font-mono text-[11px] font-bold text-lab-muted">{dd}</span>}
				{p.text}
			</span>
			{t && (
				<span
					className="mt-0.5 min-w-[2.25rem] rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
					style={t.tone === "ink" ? { background: "var(--lab-ink)", color: "var(--lab-surface)" } : t.tone === "bad" ? { background: "var(--lab-bad)", color: "#fff" } : { border: "1px solid var(--lab-line-strong)", color: "var(--lab-ink-soft)" }}
				>
					{t.text}
				</span>
			)}
		</li>
	)
}

/** The play-by-play, newest first and grouped by drive, with filters for the plays worth reading. */
export default function PlayFeed({ game, sides }: { game: LiveGame; sides: { away: Side; home: Side } }) {
	const [mode, setMode] = React.useState<Mode>("all")
	const [open, setOpen] = React.useState<Record<string, boolean>>({})
	const sideOf = (abbr: string | null): Side | null => (abbr === game.info.home.abbr ? sides.home : abbr === game.info.away.abbr ? sides.away : null)

	const drives = game.drives.slice().reverse()
	const keep = (p: LivePlay) => (mode === "all" ? true : mode === "big" ? p.big : p.scoring)
	const groups = drives.map((d, i) => ({ d, i, plays: d.plays.filter(keep).slice().reverse() })).filter((g) => g.plays.length > 0)
	const total = game.drives.reduce((n, d) => n + d.plays.length, 0)

	const isOpen = (d: LiveDrive, i: number) => open[d.id] ?? i < 2

	return (
		<div>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">Play by play</p>
				<div className="flex gap-1.5" role="group" aria-label="Filter plays">
					{MODES.map((m) => (
						<Chip key={m.id} active={mode === m.id} onClick={() => setMode(m.id)}>
							{m.label}
						</Chip>
					))}
				</div>
			</div>

			{total === 0 ? (
				<p className="mt-4 text-sm text-lab-muted">Plays show up here as soon as the game starts.</p>
			) : groups.length === 0 ? (
				<p className="mt-4 text-sm text-lab-muted">Nothing like that yet.</p>
			) : (
				<div className="mt-3 max-h-[640px] space-y-3 overflow-y-auto pr-1" aria-live="off">
					{groups.map(({ d, i, plays }) => {
						const side = sideOf(d.team)
						const expanded = mode !== "all" || isOpen(d, i)
						return (
							<section key={d.id}>
								<button
									type="button"
									onClick={() => setOpen((o) => ({ ...o, [d.id]: !isOpen(d, i) }))}
									aria-expanded={expanded}
									disabled={mode !== "all"}
									className="flex w-full items-center gap-2 rounded-md bg-lab-hover px-2.5 py-1.5 text-left text-xs font-semibold text-lab-ink disabled:cursor-default"
								>
									<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: side?.fill ?? "var(--lab-ink-muted)" }} aria-hidden />
									<span className="uppercase tracking-[0.12em]">{d.team ?? "Drive"}</span>
									<span className="min-w-0 flex-1 truncate font-normal text-lab-muted">{d.description}</span>
									{d.result && <span className="shrink-0 rounded bg-lab-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-lab-soft">{d.result}</span>}
								</button>
								{expanded && (
									<ul className="mt-1 divide-y divide-lab-line">
										{plays.map((p) => (
											<Row key={p.id} p={p} side={side} />
										))}
									</ul>
								)}
							</section>
						)
					})}
				</div>
			)}
		</div>
	)
}
