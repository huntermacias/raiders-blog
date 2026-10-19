"use client"

import * as React from "react"
import Link from "@/components/SiteLink"
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react"

import { Chip } from "@/components/lab/DriveBits"
import { SPEEDS, scoreStops } from "@/lib/live/replay"
import type { LivePlay } from "@/lib/live/types"

export type ReplayState = { k: number; playing: boolean; speed: number }

const btn =
	"inline-flex h-9 items-center gap-1.5 rounded-full border border-lab-line-strong px-3.5 text-sm font-semibold text-lab-ink transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink disabled:cursor-not-allowed disabled:opacity-40"

/** The start of a replay: one button under the score of a finished game, and a link to the Lab's replay when it has one. */
export function ReplayStart({ plays, onStart, labHref }: { plays: number; onStart: () => void; labHref: string | null }) {
	if (plays === 0) return null
	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
			<button type="button" onClick={onStart} className={btn + " bg-lab-ink !text-lab-surface hover:opacity-90"}>
				<Play aria-hidden className="h-4 w-4" />
				Replay this game
			</button>
			<span className="text-sm text-lab-muted">Watch it again play by play: the drive, the score and the win probability.</span>
			{labHref && (
				<Link href={labHref} className="text-sm font-semibold text-lab-ink underline underline-offset-4">
					Full Lab replay with drive maps &rarr;
				</Link>
			)}
		</div>
	)
}

/** Controls while a replay is on: play or pause, step, jump to the next score, speed, and a scrubber with the scores marked on it. */
export default function ReplayBar({
	plays,
	state,
	label,
	onChange,
	onNextScore,
	onExit,
}: {
	plays: LivePlay[]
	state: ReplayState
	/** "Q3 4:12" for the play on screen. */
	label: string
	onChange: (next: Partial<ReplayState>) => void
	onNextScore: () => void
	onExit: () => void
}) {
	const total = plays.length
	const atEnd = state.k >= total
	const stops = React.useMemo(() => scoreStops(plays), [plays])

	return (
		<section className="rounded-2xl border border-lab-line bg-lab-surface p-4 sm:p-5" aria-label="Replay controls">
			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					className={btn}
					onClick={() => (atEnd ? onChange({ k: 0, playing: true }) : onChange({ playing: !state.playing }))}
					aria-label={atEnd ? "Replay from the start" : state.playing ? "Pause" : "Play"}
				>
					{atEnd ? <RotateCcw aria-hidden className="h-4 w-4" /> : state.playing ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
					{atEnd ? "Again" : state.playing ? "Pause" : "Play"}
				</button>
				<button type="button" className={btn} onClick={() => onChange({ k: Math.max(0, state.k - 1), playing: false })} disabled={state.k <= 0} aria-label="Back one play">
					&lsaquo; Play
				</button>
				<button type="button" className={btn} onClick={() => onChange({ k: Math.min(total, state.k + 1), playing: false })} disabled={atEnd} aria-label="Forward one play">
					Play &rsaquo;
				</button>
				<button type="button" className={btn} onClick={onNextScore} disabled={atEnd} aria-label="Jump to the next score">
					<SkipForward aria-hidden className="h-4 w-4" />
					Next score
				</button>
				<div className="ml-auto flex items-center gap-1.5" role="group" aria-label="Replay speed">
					{SPEEDS.map((s) => (
						<Chip key={s} active={state.speed === s} onClick={() => onChange({ speed: s })}>
							{s}x
						</Chip>
					))}
				</div>
			</div>

			<div className="mt-4">
				<div className="relative">
					<input
						type="range"
						min={0}
						max={total}
						step={1}
						value={state.k}
						onChange={(e) => onChange({ k: Number(e.target.value), playing: false })}
						aria-label="Replay position"
						aria-valuetext={`Play ${state.k} of ${total}${label ? `, ${label}` : ""}`}
						className="block h-6 w-full cursor-pointer accent-[var(--lab-ink)]"
					/>
					<div className="pointer-events-none absolute inset-x-[7px] top-[19px] h-2" aria-hidden>
						{stops.map((s) => (
							<span key={s} className="absolute top-0 h-2 w-0.5 -translate-x-1/2 rounded bg-lab-muted" style={{ left: `${(s / total) * 100}%` }} />
						))}
					</div>
				</div>
				<div className="mt-1 flex items-center justify-between gap-3 font-mono text-xs tabular-nums text-lab-muted">
					<span>
						Play {state.k} of {total}
						{label ? ` · ${label}` : ""}
					</span>
					<button type="button" onClick={onExit} className="font-sans text-sm font-semibold text-lab-ink underline underline-offset-4">
						Back to the final
					</button>
				</div>
			</div>
		</section>
	)
}
