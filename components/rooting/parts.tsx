import { inkOn } from "@/lib/lab/colors"
import { teamByAbbr } from "@/lib/nfl"
import { pctText } from "@/lib/rooting/guide"

/** A team's mark: a round badge in its color with its abbreviation (the site has no logo files, so this is the stand-in). */
export function TeamBadge({ abbr, size = 36 }: { abbr: string; size?: number }) {
	const info = teamByAbbr(abbr)
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full font-serif font-bold leading-none ring-1 ring-black/10"
			style={{ width: size, height: size, background: info.color, color: inkOn(info.color), fontSize: Math.round(size * (abbr.length > 2 ? 0.32 : 0.4)) }}
			aria-hidden="true"
		>
			{abbr}
		</span>
	)
}

/**
 * A team's chance at its goal as a line from 0 to 100%: the span between the worst and the best outcome of a game, and a tick where the
 * team stands now. The numbers are also written out, so the picture is never the only way to read it.
 */
export function OddsRange({ worst, best, baseline, color, label }: { worst: number; best: number; baseline: number; color: string; label: string }) {
	const pc = (v: number) => `${Math.max(0, Math.min(100, v * 100))}%`
	return (
		<div role="img" aria-label={label} className="relative h-6 w-full">
			<div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-lab-tint" />
			<div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: pc(worst), width: `${Math.max(0.8, (best - worst) * 100)}%`, background: color, opacity: 0.9 }} />
			<div className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-lab-ink" style={{ left: pc(baseline) }} title={`Now ${pctText(baseline)}`} />
			<div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lab-page" style={{ left: pc(worst), background: color, opacity: 0.55 }} />
			<div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lab-page" style={{ left: pc(best), background: color }} />
		</div>
	)
}
