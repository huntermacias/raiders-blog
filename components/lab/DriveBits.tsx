"use client"

import * as React from "react"

import { driveStats, isFiltering, kindLetter, type Frame, type PlayFilter } from "@/lib/lab/drive"
import { LAB } from "@/lib/lab/theme"
import { posAtScrub, scrubValue, type TimelineState } from "@/lib/lab/timeline"
import type { Drive } from "@/lib/lab/types"

/** A small toggle button used by every filter row. */
export function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={
				"h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink disabled:cursor-not-allowed disabled:opacity-40 " +
				(active ? "border-lab-ink bg-lab-ink text-lab-surface" : "border-lab-line-strong text-lab-soft hover:bg-lab-hover")
			}
		>
			{children}
		</button>
	)
}

export function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2">
			<span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{label}</span>
			<div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label={label}>
				{children}
			</div>
		</div>
	)
}

const KINDS: { id: PlayFilter["kind"]; label: string }[] = [
	{ id: "all", label: "All plays" },
	{ id: "run", label: "Runs" },
	{ id: "pass", label: "Passes" },
	{ id: "kick", label: "Kicks" },
]
const DOWNS = [0, 1, 2, 3, 4] as const
const ORD = ["Any", "1st", "2nd", "3rd", "4th"]

/** Highlights plays on the field, the scrubber and the list. Nothing is hidden. */
export function PlayFilters({ filter, onChange, shown, total }: { filter: PlayFilter; onChange: (f: PlayFilter) => void; shown: number; total: number }) {
	const on = isFiltering(filter)
	return (
		<div className="space-y-2 px-4 pt-3 sm:px-6" aria-label="Highlight plays" role="region">
			<FilterRow label="Type">
				{KINDS.map((k) => (
					<Chip key={k.id} active={filter.kind === k.id} onClick={() => onChange({ ...filter, kind: k.id })}>
						{k.label}
					</Chip>
				))}
			</FilterRow>
			<FilterRow label="Down">
				{DOWNS.map((d) => (
					<Chip key={d} active={filter.down === d} onClick={() => onChange({ ...filter, down: d })}>
						{ORD[d]}
					</Chip>
				))}
			</FilterRow>
			{on && (
				<p className="flex items-center gap-3 text-xs text-lab-muted" aria-live="polite">
					<span>
						Highlighting {shown} of {total} {total === 1 ? "play" : "plays"}
					</span>
					<button type="button" onClick={() => onChange({ kind: "all", down: 0 })} className="font-semibold text-lab-ink underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink">
						Clear
					</button>
				</p>
			)}
		</div>
	)
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
	return (
		<div className="min-w-0 rounded-lg border border-lab-line px-3 py-2">
			<dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">{label}</dt>
			<dd className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-lab-ink">
				{value}
				{note && <span className="ml-1.5 font-sans text-[11px] font-normal text-lab-muted">{note}</span>}
			</dd>
		</div>
	)
}

/** Totals for the drive: how it was moved and how it was kept alive. */
export function DriveSummary({ drive, frames }: { drive: Drive; frames: Frame[] }) {
	const s = React.useMemo(() => driveStats(frames), [frames])
	const perPlay = s.plays > 0 ? (drive.yards / s.plays).toFixed(1) : "0.0"
	const conv = (c: { att: number; conv: number }) => (c.att === 0 ? "–" : `${c.conv} of ${c.att}`)
	return (
		<dl className="grid grid-cols-2 gap-2 px-4 pt-3 sm:grid-cols-4 sm:px-6" aria-label="Drive summary">
			<Stat label="Plays" value={String(s.plays)} note={drive.top ? drive.top : undefined} />
			<Stat label="Yards" value={String(drive.yards)} note={`${perPlay} per play`} />
			<Stat label="Rushing" value={`${s.runs.n} for ${s.runs.yds}`} note="yds" />
			<Stat label="Passing" value={`${s.passes.comp}/${s.passes.att} for ${s.passes.yds}`} note={s.sacks ? `${s.sacks} ${s.sacks === 1 ? "sack" : "sacks"}` : "yds"} />
			<Stat label="First downs" value={String(s.firstDowns)} />
			<Stat label="3rd down" value={conv(s.thirdDowns)} />
			<Stat label="4th down" value={conv(s.fourthDowns)} />
			<Stat label="Starts at" value={drive.start <= 50 ? `own ${drive.start}` : `opp ${100 - drive.start}`} />
		</dl>
	)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * One segment per play. Click a segment to jump to the end of that play, or drag anywhere along
 * the bar to move the ball through the drive. Arrow keys step play by play.
 */
export function Scrubber({
	frames,
	state,
	matches,
	color,
	onScrub,
	onSeek,
	onStep,
}: {
	frames: Frame[]
	state: TimelineState
	matches: boolean[]
	color: string
	onScrub: (pos: number) => void
	onSeek: (to: number) => void
	onStep: (delta: number) => void
}) {
	const n = frames.length
	const track = React.useRef<HTMLDivElement>(null)
	const drag = React.useRef<{ x: number; moved: boolean } | null>(null)
	const value = scrubValue(state)

	const valueAt = (clientX: number) => {
		const r = track.current?.getBoundingClientRect()
		if (!r || r.width <= 0) return null
		return clamp01((clientX - r.left) / r.width) * n
	}

	const down = (e: React.PointerEvent) => {
		if (e.button !== 0 && e.pointerType === "mouse") return
		drag.current = { x: e.clientX, moved: false }
		try {
			e.currentTarget.setPointerCapture(e.pointerId)
		} catch {
			// not every environment supports capture
		}
	}
	const move = (e: React.PointerEvent) => {
		const d = drag.current
		if (!d) return
		if (!d.moved && Math.abs(e.clientX - d.x) < 5) return
		d.moved = true
		const v = valueAt(e.clientX)
		if (v != null) onScrub(posAtScrub(v, n))
	}
	const up = (e: React.PointerEvent) => {
		const d = drag.current
		drag.current = null
		if (!d || d.moved) return
		const v = valueAt(e.clientX)
		if (v != null) onSeek(Math.min(n, Math.floor(v) + 1))
	}
	const key = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowRight" || e.key === "ArrowUp") onStep(1)
		else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onStep(-1)
		else if (e.key === "Home") onSeek(0)
		else if (e.key === "End") onSeek(n)
		else return
		e.preventDefault()
	}

	return (
		<div className="px-4 pt-3 sm:px-6">
			<div
				ref={track}
				role="slider"
				tabIndex={0}
				aria-label="Drive position"
				aria-orientation="horizontal"
				aria-valuemin={0}
				aria-valuemax={n}
				aria-valuenow={state.done}
				aria-valuetext={state.done === 0 ? `Before play 1 of ${n}` : `After play ${state.done} of ${n}`}
				onPointerDown={down}
				onPointerMove={move}
				onPointerUp={up}
				onPointerCancel={() => (drag.current = null)}
				onKeyDown={key}
				className="relative cursor-pointer touch-pan-y select-none rounded-md py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"
			>
				<div className="relative flex h-3 overflow-hidden rounded-full bg-lab-tint">
					{frames.map((f, i) => {
						const fill = i < state.done ? 1 : i === state.moving ? state.progress : 0
						return (
							<div key={f.n} className="relative h-full flex-1 border-r-2 border-lab-surface last:border-r-0" style={{ opacity: matches[i] ? 1 : 0.3 }}>
								<div className="absolute inset-y-0 left-0" style={{ width: `${fill * 100}%`, background: color }} />
							</div>
						)
					})}
				</div>
				<div
					className="pointer-events-none absolute top-2 h-3 w-0"
					style={{ left: `${n > 0 ? (value / n) * 100 : 0}%` }}
					aria-hidden
				>
					<span className="absolute left-0 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-lab-surface shadow-[var(--lab-shadow)]" style={{ borderColor: LAB.ink }} />
				</div>
				<div className="mt-1.5 flex" aria-hidden>
					{frames.map((f, i) => (
						<span key={f.n} className="flex-1 text-center text-[10px] font-semibold text-lab-muted" style={{ opacity: matches[i] ? 1 : 0.35 }}>
							{kindLetter(f)}
						</span>
					))}
				</div>
			</div>
			<p className="text-[11px] text-lab-muted">
				<span className="font-semibold">R</span> run &middot; <span className="font-semibold">P</span> pass &middot; <span className="font-semibold">K</span> kick &middot; <span className="font-semibold">X</span> other. Tap a play or drag to move the ball through the drive.
			</p>
		</div>
	)
}
