"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { GROUP_META, type SearchEntry, search } from "@/lib/lab/playersKit"
import { Headshot } from "@/components/lab/players/Media"
import { trackPlayers } from "@/lib/lab/track"
import { cardStyle, profileHref } from "@/lib/lab/playerView"

/**
 * Find any player in the league by name or team. Used on the hub, where a pick opens the player's page, and in the comparison, where a
 * pick fills a slot. Arrow keys move through the results and Enter opens the highlighted one.
 */
export default function PlayerSearch({
	index,
	onPick,
	placeholder = "Search any player",
	label = "Search players",
	initial = "",
	className = "",
	autoFocus = false,
}: {
	index: SearchEntry[]
	onPick?: (entry: SearchEntry) => void
	placeholder?: string
	label?: string
	initial?: string
	className?: string
	autoFocus?: boolean
}) {
	const router = useRouter()
	const id = React.useId()
	const [q, setQ] = React.useState(initial)
	const [open, setOpen] = React.useState(false)
	const [active, setActive] = React.useState(0)
	const results = React.useMemo(() => search(index, q), [index, q])

	const pick = (e: SearchEntry) => {
		setOpen(false)
		trackPlayers("player_search_pick", { slug: e.slug, group: e.group, team: e.team, where: onPick ? "compare" : "hub" })
		if (onPick) {
			setQ(e.name)
			onPick(e)
		} else {
			router.push(profileHref(e.slug))
		}
	}

	return (
		<div className={`relative ${className}`}>
			<label htmlFor={`${id}-q`} className="sr-only">
				{label}
			</label>
			<input
				id={`${id}-q`}
				type="search"
				autoComplete="off"
				autoFocus={autoFocus}
				value={q}
				placeholder={placeholder}
				role="combobox"
				aria-expanded={open && results.length > 0}
				aria-controls={`${id}-list`}
				aria-autocomplete="list"
				onChange={(e) => {
					setQ(e.target.value)
					setOpen(true)
					setActive(0)
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => setTimeout(() => setOpen(false), 120)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown") {
						e.preventDefault()
						setActive((a) => Math.min(a + 1, results.length - 1))
					} else if (e.key === "ArrowUp") {
						e.preventDefault()
						setActive((a) => Math.max(a - 1, 0))
					} else if (e.key === "Enter" && results[active]) {
						e.preventDefault()
						pick(results[active])
					} else if (e.key === "Escape") {
						setOpen(false)
					}
				}}
				className="w-full rounded-xl border border-lab-line-strong bg-lab-surface px-4 py-3 text-base text-lab-ink placeholder:text-lab-muted focus:border-lab-ink focus:outline-none"
			/>
			{open && results.length ? (
				<ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 m-0 mt-1 max-h-80 list-none overflow-auto rounded-xl border border-lab-line-strong bg-lab-surface p-1 shadow-lg">
					{results.map((r, i) => (
						<li key={r.slug} role="option" aria-selected={i === active} className="lab-opp" style={cardStyle(r.team)}>
							<button
								type="button"
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => pick(r)}
								className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === active ? "bg-lab-hover" : ""} hover:bg-lab-hover`}
							>
								<Headshot espn={r.espn} shot={r.shot} name={r.name} size={32} />
								<span className="min-w-0 flex-1 truncate font-semibold text-lab-ink">{r.name}</span>
								<span className="shrink-0 text-xs text-lab-muted">
									{r.team} &middot; {r.pos || GROUP_META[r.group].single}
								</span>
							</button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}
