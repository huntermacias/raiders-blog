"use client"

import { useMemo } from "react"
import { Redo2, RotateCcw, Undo2 } from "lucide-react"

import { diffScenarios } from "@/lib/playoffs/compare"
import { simulateSeason } from "@/lib/playoffs/simulator"
import type { Game, Predictions } from "@/lib/playoffs/types"
import ShareCard from "@/components/lab/ShareCard"
import { btn } from "./ui"

type Props = {
	games: readonly Game[]
	throughWeek: number
	picked: number
	simulated: number
	undo: { label: string } | null
	redo: { label: string } | null
	lastChange: { before: Predictions; label: string } | null
	picks: Predictions
	onUndo: () => void
	onRedo: () => void
	onReset: () => void
	share: { query: string; stamp: number; text: string; alt: string; file: string; onAction: (method: string) => void; sharePath: string }
}

/** Always visible: which scenario this is, whether it is real or hypothetical, how to get back, and what the last change did. */
export default function ScenarioBar({ games, throughWeek, picked, simulated, undo, redo, lastChange, picks, onUndo, onRedo, onReset, share }: Props) {
	const changes = useMemo(() => {
		if (!lastChange || lastChange.label !== "pick") return []
		const before = simulateSeason({ games, predictions: lastChange.before })
		const after = simulateSeason({ games, predictions: picks })
		return diffScenarios(games, lastChange.before, picks, before, after).lines.slice(0, 3)
	}, [games, lastChange, picks])

	const hypothetical = picked > 0
	return (
		<div className="sticky top-16 z-20 -mx-4 border-b border-lab-line bg-lab-page/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-lab-surface">
			<div className="flex flex-wrap items-center gap-2">
				<p className="m-0 mr-auto flex min-w-0 items-center gap-2 text-sm">
					<span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${hypothetical ? "bg-lab-ink text-lab-page" : "border border-lab-line-strong text-lab-soft"}`}>
						{hypothetical ? "Hypothetical" : "Real results"}
					</span>
					<span className="truncate text-lab-soft">
						{hypothetical ? [picked - simulated > 0 ? `${picked - simulated} picked by you` : "", simulated ? `${simulated} simulated` : ""].filter(Boolean).join(", ") : `Played through Week ${throughWeek}`}
					</span>
				</p>
				<button type="button" onClick={onUndo} disabled={!undo} className={`${btn} !min-h-[40px] !px-3`} aria-label={undo ? `Undo ${undo.label}` : "Undo"} title={undo ? `Undo ${undo.label}` : "Nothing to undo"}>
					<Undo2 className="h-4 w-4" aria-hidden="true" />
					<span className="hidden sm:inline">Undo</span>
				</button>
				<button type="button" onClick={onRedo} disabled={!redo} className={`${btn} !min-h-[40px] !px-3`} aria-label={redo ? `Redo ${redo.label}` : "Redo"} title={redo ? `Redo ${redo.label}` : "Nothing to redo"}>
					<Redo2 className="h-4 w-4" aria-hidden="true" />
					<span className="hidden sm:inline">Redo</span>
				</button>
				<button type="button" onClick={onReset} disabled={!hypothetical} className={`${btn} !min-h-[40px] !px-3`}>
					<RotateCcw className="h-4 w-4" aria-hidden="true" />
					<span className="hidden sm:inline">Back to real results</span>
					<span className="sm:hidden">Reset</span>
				</button>
				<ShareCard
					target={{ type: "playoffs", query: share.query, sharePath: share.sharePath, name: "Playoff scenario", file: share.file }}
					stamp={share.stamp}
					text={share.text}
					alt={share.alt}
					className="!min-h-[40px] !rounded-lg !border-lab-line !text-sm !font-semibold !normal-case !tracking-normal"
					onAction={share.onAction}
				/>
			</div>
			{changes.length ? (
				<p role="status" className="m-0 mt-2 text-xs text-lab-soft">
					<span className="font-bold text-lab-ink">That pick changed: </span>
					{changes.join(" · ")}
				</p>
			) : null}
		</div>
	)
}
