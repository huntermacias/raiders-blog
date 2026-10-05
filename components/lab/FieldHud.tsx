// The broadcast-style overlay on the field: the score and clock, and the Raiders' chance to win with
// how far the last play moved it. Decorative: the same facts are in the text under the field.

import * as React from "react"

import type { Score } from "@/lib/lab/hud"
import { LAB } from "@/lib/lab/theme"

const glass = { background: "color-mix(in srgb, var(--lab-surface) 84%, transparent)", backdropFilter: "blur(6px)" } as const

export type HudProps = {
	teamName: string
	oppName: string
	/** Null when the game has no score data (the score bug is then left out). */
	score: Score | null
	clock: string
	/** The Raiders' chance to win, 0 to 1, and the change from the last play. Null when the log has none. */
	wp: number | null
	delta: number | null
	deltaKey: string
	compact: boolean
	/** Which side has the ball, to mark it in the score bug. */
	teamHasBall: boolean
}

function Row({ name, score, color, ball, big }: { name: string; score: number; color: string; ball: boolean; big: boolean }) {
	return (
		<div className="flex items-center gap-2">
			<span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
			<span className={"w-[4.9rem] truncate font-semibold uppercase tracking-[0.1em] " + (big ? "text-[11px]" : "text-[10px]")}>{name}</span>
			<span className={"ml-auto font-mono font-bold tabular-nums " + (big ? "text-lg" : "text-base")}>{score}</span>
			<span className="w-2 text-[9px]" style={{ color: LAB.firstDown }} aria-hidden>
				{ball ? "●" : ""}
			</span>
		</div>
	)
}

export default function FieldHud({ teamName, oppName, score, clock, wp, delta, deltaKey, compact, teamHasBall }: HudProps) {
	if (!score && wp == null) return null
	const pct = wp == null ? null : Math.round(wp * 100)
	const pts = delta == null ? null : Math.round(delta * 1000) / 10
	return (
		<div className={"pointer-events-none flex items-start justify-between gap-2 " + (compact ? "mb-2" : "absolute inset-x-5 top-3 z-10")} aria-hidden="true">
			{score ? (
				<div className="min-w-[10.5rem] rounded-lg border border-lab-line px-2.5 py-1.5 text-lab-ink shadow-[var(--lab-shadow)]" style={glass}>
					<Row name={teamName} score={score[0]} color={LAB.team} ball={teamHasBall} big={!compact} />
					<Row name={oppName} score={score[1]} color={LAB.opp} ball={!teamHasBall} big={!compact} />
					{clock && <div className="mt-1 border-t border-lab-line pt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{clock}</div>}
				</div>
			) : (
				<span />
			)}
			{pct != null && (
				<div className="w-[8.6rem] rounded-lg border border-lab-line px-2.5 py-1.5 text-lab-ink shadow-[var(--lab-shadow)] sm:w-40" style={glass}>
					<div className="flex items-baseline justify-between gap-1">
						<span className="whitespace-nowrap text-[9px] font-semibold uppercase leading-tight tracking-[0.14em] text-lab-muted">Win chance</span>
						{pts != null && Math.abs(pts) >= 0.1 && (
							<span key={deltaKey} className="lab-delta whitespace-nowrap font-mono text-[11px] font-bold tabular-nums" style={{ color: pts > 0 ? LAB.ink : LAB.bad }}>
								{pts > 0 ? "▲" : "▼"} {Math.abs(pts).toFixed(1)}
							</span>
						)}
					</div>
					<div className="mt-0.5 flex items-baseline gap-1.5 font-mono text-xl font-bold leading-none tabular-nums">
						{pct}%<span className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-lab-muted">{teamName}</span>
					</div>
					<div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: LAB.opp, opacity: 0.95 }}>
						<div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: LAB.team, transition: "width 700ms cubic-bezier(0.2, 0.8, 0.2, 1)" }} />
						<div className="absolute inset-y-0 left-1/2 w-px" style={{ background: LAB.surface, opacity: 0.8 }} />
					</div>
				</div>
			)}
		</div>
	)
}
