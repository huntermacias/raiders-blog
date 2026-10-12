"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import PlayerSearch from "@/components/lab/players/PlayerSearch"
import { compareHref } from "@/lib/lab/playerView"
import type { SearchEntry } from "@/lib/lab/playersKit"

/** Two search boxes and a button. A pick fills a slot, and when both are filled the page reloads on the pair. */
export default function ComparePicker({ index, a, b }: { index: SearchEntry[]; a?: SearchEntry | null; b?: SearchEntry | null }) {
	const router = useRouter()
	const [left, setLeft] = React.useState<SearchEntry | null>(a ?? null)
	const [right, setRight] = React.useState<SearchEntry | null>(b ?? null)
	const go = (l: SearchEntry | null, r: SearchEntry | null) => {
		if (l && r) router.push(compareHref(l.slug, r.slug))
	}
	return (
		<form
			className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end"
			onSubmit={(e) => {
				e.preventDefault()
				go(left, right)
			}}
		>
			<div>
				<p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Player one</p>
				<PlayerSearch index={index} initial={a?.name ?? ""} label="First player" placeholder="Search a player" onPick={(e) => { setLeft(e); go(e, right) }} />
			</div>
			<p className="m-0 hidden pb-3 text-sm font-semibold text-lab-muted sm:block">vs</p>
			<div>
				<p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Player two</p>
				<PlayerSearch index={index} initial={b?.name ?? ""} label="Second player" placeholder="Search a player" onPick={(e) => { setRight(e); go(left, e) }} />
			</div>
			<button type="submit" className="rounded-xl border border-lab-ink bg-lab-ink px-4 py-2.5 text-sm font-semibold text-lab-page disabled:opacity-40 sm:col-span-3 sm:justify-self-start" disabled={!left || !right}>
				Compare
			</button>
		</form>
	)
}
