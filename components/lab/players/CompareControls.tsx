"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import Link from "@/components/SiteLink"
import { type CompareConfig, type RangeId, compareUrl } from "@/lib/lab/compareKit"
import { trackPlayers } from "@/lib/lab/track"

export type RangeChoice = { id: RangeId; label: string; weeks: string; disabled?: boolean }
export type MetricChoice = { key: string; label: string; luck: boolean }

/**
 * What the reader can change about a comparison: the stretch of games (the season, the recent games, or the games before them) and which
 * stats are compared. Every choice is a link to the same page with the choice in its address, so a comparison is always shareable as it
 * stands, and the range switch works without scripts.
 */
export default function CompareControls({
	cfg,
	ranges,
	options,
	selected,
	defaults,
	max,
}: {
	cfg: CompareConfig
	ranges: RangeChoice[]
	options: MetricChoice[]
	selected: string[]
	defaults: string[]
	max: number
}) {
	const router = useRouter()
	const [pending, startTransition] = React.useTransition()
	const [chosen, setChosen] = React.useState<string[]>(selected)
	const selKey = selected.join(",")
	React.useEffect(() => setChosen(selKey ? selKey.split(",") : []), [selKey])

	const apply = (keys: string[]) => {
		setChosen(keys)
		const same = keys.length === defaults.length && keys.every((k, i) => k === defaults[i])
		trackPlayers("player_compare_metrics", { a: cfg.a, b: cfg.b, count: keys.length, custom: !same })
		startTransition(() => router.replace(compareUrl({ ...cfg, metrics: same ? null : keys }), { scroll: false }))
	}
	const toggle = (key: string) => {
		if (chosen.includes(key)) {
			if (chosen.length > 1) apply(chosen.filter((k) => k !== key))
		} else if (chosen.length < max) {
			// Keep the catalog's order so the rows and the radar read the same however the boxes were ticked.
			const order = options.map((o) => o.key)
			apply([...chosen, key].sort((x, y) => order.indexOf(x) - order.indexOf(y)))
		}
	}
	const isDefault = chosen.length === defaults.length && chosen.every((k, i) => k === defaults[i])

	return (
		<div className="grid gap-3" aria-busy={pending} data-testid="compare-controls">
			<nav aria-label="Stretch of games" className="grid grid-cols-3 gap-1 rounded-xl border border-lab-line bg-lab-tint p-1">
				{ranges.map((r) =>
					r.disabled ? (
						<span key={r.id} className="rounded-lg px-2 py-2 text-center text-xs text-lab-muted opacity-60 sm:text-sm" title="Not enough games yet">
							{r.label}
						</span>
					) : (
						<Link
							key={r.id}
							href={compareUrl({ ...cfg, range: r.id })}
							scroll={false}
							prefetch={false}
							onClick={() => trackPlayers("player_compare_range", { a: cfg.a, b: cfg.b, range: r.id })}
							aria-current={cfg.range === r.id ? "true" : undefined}
							className={`rounded-lg px-2 py-2 text-center transition ${cfg.range === r.id ? "bg-lab-ink text-lab-page shadow-sm" : "text-lab-soft hover:bg-lab-hover hover:text-lab-ink"}`}
						>
							<span className="block text-xs font-bold sm:text-sm">{r.label}</span>
							<span className={`block text-[10px] ${cfg.range === r.id ? "opacity-80" : "text-lab-muted"}`}>{r.weeks}</span>
						</Link>
					),
				)}
			</nav>

			<details className="group rounded-xl border border-lab-line bg-lab-surface">
				<summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold text-lab-ink outline-none focus-visible:ring-2 focus-visible:ring-lab-ink [&::-webkit-details-marker]:hidden">
					<span>
						Choose the stats <span className="font-normal text-lab-muted">({chosen.length} of {options.length}{isDefault ? ", default" : ", yours"})</span>
					</span>
					<span aria-hidden="true" className="text-lab-muted transition group-open:rotate-180">
						&#9662;
					</span>
				</summary>
				<div className="border-t border-lab-line px-4 py-4">
					<fieldset className="m-0 min-w-0 border-0 p-0">
						<legend className="sr-only">Stats to compare, up to {max}</legend>
						<ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
							{options.map((o) => {
								const on = chosen.includes(o.key)
								const blocked = !on && chosen.length >= max
								return (
									<li key={o.key}>
										<label className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${on ? "border-lab-ink bg-lab-hover" : "border-lab-line"} ${blocked ? "cursor-not-allowed opacity-50" : "hover:bg-lab-hover"}`}>
											<input type="checkbox" className="h-4 w-4 accent-[var(--lab-ink)]" checked={on} disabled={blocked || (on && chosen.length === 1)} onChange={() => toggle(o.key)} />
											<span className="min-w-0 flex-1 text-lab-ink">{o.label}</span>
											{o.luck ? <span className="shrink-0 rounded-full border border-lab-line-strong px-2 py-0.5 text-[10px] text-lab-muted">still mostly luck</span> : null}
										</label>
									</li>
								)
							})}
						</ul>
					</fieldset>
					<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-lab-muted">
						<span>Up to {max} stats. Stats that are still mostly luck are shown, never scored as a win.</span>
						{!isDefault ? (
							<button type="button" onClick={() => apply(defaults)} className="rounded-lg border border-lab-line-strong px-3 py-1.5 font-semibold text-lab-soft hover:bg-lab-hover hover:text-lab-ink">
								Reset to the default stats
							</button>
						) : null}
					</div>
				</div>
			</details>
		</div>
	)
}
