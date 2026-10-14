"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeftRight } from "lucide-react"

import PlayerSearch from "@/components/lab/players/PlayerSearch"
import { type RangeId, compareUrl } from "@/lib/lab/compareKit"
import { trackPlayers } from "@/lib/lab/track"
import type { SearchEntry } from "@/lib/lab/playersKit"

/**
 * Two search boxes and a swap. A pick fills a slot, and when both are filled the page opens the pair. The stretch of games and the seasons carry over,
 * the chosen stats do not (a different job has different stats).
 */
export default function ComparePicker({ index, a, b, range = "season", sa = null, sb = null }: { index: SearchEntry[]; a?: SearchEntry | null; b?: SearchEntry | null; range?: RangeId; sa?: number | null; sb?: number | null }) {
	const router = useRouter()
	const [left, setLeft] = React.useState<SearchEntry | null>(a ?? null)
	const [right, setRight] = React.useState<SearchEntry | null>(b ?? null)
	// A search box keeps its own text, so a swap or a new pair is shown by remounting the boxes.
	const [epoch, setEpoch] = React.useState(0)
	const go = (l: SearchEntry | null, r: SearchEntry | null, flip = false) => {
		if (l && r) router.push(compareUrl({ a: l.slug, b: r.slug, range, metrics: null, group: null, sa: flip ? sb : sa, sb: flip ? sa : sb }))
	}
	const swap = () => {
		if (!left || !right) return
		trackPlayers("player_compare_swap", { a: left.slug, b: right.slug })
		setLeft(right)
		setRight(left)
		setEpoch((n) => n + 1)
		go(right, left, true)
	}
	return (
		<form
			className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end"
			onSubmit={(e) => {
				e.preventDefault()
				go(left, right)
			}}
			aria-label="Choose two players to compare"
		>
			<div>
				<p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Player one</p>
				<PlayerSearch key={`a${epoch}`} index={index} initial={left?.name ?? ""} label="First player" placeholder="Search a player" onPick={(e) => { setLeft(e); go(e, right) }} />
			</div>
			<button
				type="button"
				onClick={swap}
				disabled={!left || !right}
				aria-label="Swap the two players"
				title="Swap the two players"
				className="hidden h-11 w-11 items-center justify-center self-end rounded-full border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover hover:text-lab-ink disabled:opacity-40 sm:inline-flex"
			>
				<ArrowLeftRight className="h-4 w-4" aria-hidden />
			</button>
			<div>
				<p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Player two</p>
				<PlayerSearch key={`b${epoch}`} index={index} initial={right?.name ?? ""} label="Second player" placeholder="Search a player" onPick={(e) => { setRight(e); go(left, e) }} />
			</div>
			<div className="flex flex-wrap gap-2 sm:col-span-3">
				<button type="submit" className="min-h-[44px] rounded-xl border border-lab-ink bg-lab-ink px-5 py-2.5 text-sm font-semibold text-lab-page disabled:opacity-40" disabled={!left || !right}>
					Compare
				</button>
				<button type="button" onClick={swap} disabled={!left || !right} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-lab-line-strong px-4 py-2.5 text-sm font-semibold text-lab-soft disabled:opacity-40 sm:hidden">
					<ArrowLeftRight className="h-4 w-4" aria-hidden />
					Swap
				</button>
			</div>
		</form>
	)
}
