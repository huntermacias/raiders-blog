"use client"

import Link from "@/components/SiteLink"
import { type CompareConfig, compareUrl } from "@/lib/lab/compareKit"
import { trackPlayers } from "@/lib/lab/track"

export type SeasonSide = {
	name: string
	/** Every season he has a line in for this job, oldest first, the one being played included. */
	seasons: number[]
	/** The season he is shown in now. */
	shown: number
}

/**
 * Which season each player is looked at in. The usual choice is one season for both ("2025: how did they compare that year"); under
 * it, a disclosure lets each man have his own, so a player can be set against himself two years ago. A season the current one is
 * written as no season at all in the address, so a plain comparison keeps a short link. Every choice is a link.
 */
export default function CompareSeasons({ cfg, current, a, b }: { cfg: CompareConfig; current: number; a: SeasonSide; b: SeasonSide }) {
	const both = a.seasons.filter((s) => b.seasons.includes(s))
	// Nothing to choose when the only season either man has is the current one.
	if (a.seasons.length <= 1 && b.seasons.length <= 1) return null
	const val = (s: number) => (s === current ? null : s)
	const label = (s: number) => (s === current ? `${s} so far` : String(s))
	const same = a.shown === b.shown
	const pill = (on: boolean) => `rounded-lg px-3 py-2 text-center text-xs font-bold transition sm:text-sm ${on ? "bg-lab-ink text-lab-page shadow-sm" : "text-lab-soft hover:bg-lab-hover hover:text-lab-ink"}`
	const hit = (kind: "both" | "a" | "b", season: number) => trackPlayers("player_compare_season", { a: cfg.a, b: cfg.b, season, kind })

	return (
		<div className="grid gap-2" data-testid="compare-seasons">
			{both.length > 1 ? (
			<nav aria-label="Season" className="flex flex-wrap items-center gap-1 rounded-xl border border-lab-line bg-lab-tint p-1">
				<span className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-muted">Season</span>
				{both.map((s) => (
					<Link
						key={s}
						href={compareUrl({ ...cfg, sa: val(s), sb: val(s) })}
						rel="nofollow"
						scroll={false}
						prefetch={false}
						onClick={() => hit("both", s)}
						aria-current={same && a.shown === s ? "true" : undefined}
						className={pill(same && a.shown === s)}
					>
						{label(s)}
					</Link>
				))}
			</nav>
			) : null}

			<details className="group rounded-xl border border-lab-line bg-lab-surface" open={!same}>
				<summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-semibold text-lab-ink outline-none focus-visible:ring-2 focus-visible:ring-lab-ink [&::-webkit-details-marker]:hidden">
					<span>
						A different season for each player <span className="font-normal text-lab-muted">({same ? "same for both" : `${a.shown} and ${b.shown}`})</span>
					</span>
					<span aria-hidden="true" className="text-lab-muted transition group-open:rotate-180">
						&#9662;
					</span>
				</summary>
				<div className="grid gap-3 border-t border-lab-line px-4 py-4">
					{([["a", a], ["b", b]] as const).map(([side, who]) => (
						<nav key={side} aria-label={`Season for ${who.name}`} className="flex flex-wrap items-center gap-1">
							<span className="mr-1 min-w-[7rem] text-sm font-semibold text-lab-ink">{who.name}</span>
							{who.seasons.map((s) => (
								<Link
									key={s}
									href={compareUrl({ ...cfg, ...(side === "a" ? { sa: val(s) } : { sb: val(s) }) })}
									rel="nofollow"
									scroll={false}
									prefetch={false}
									onClick={() => hit(side, s)}
									aria-current={who.shown === s ? "true" : undefined}
									className={`${pill(who.shown === s)} border border-lab-line`}
								>
									{label(s)}
								</Link>
							))}
						</nav>
					))}
					<p className="m-0 text-xs leading-relaxed text-lab-muted">Each season is measured against that season&apos;s league, so a 2023 number is ranked among the 2023 players. Only the season being played has recent-games ranges.</p>
				</div>
			</details>
		</div>
	)
}
