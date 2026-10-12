import { ordinal, shownPct } from "@/lib/lab/playersKit"

export type TrailPoint = { w: number; pct: number | null }

/**
 * Where a player has ranked among his peers after each week of the season (100 is the best player in the league at his job, 50 is the
 * middle). The line is the story of the year; a rise means he has passed more players, not that he had one good game. The shaded stretch
 * is his team's recent games. Nothing here needs JavaScript.
 */
export default function ProgressLine({
	weeks,
	points,
	formWeeks,
	label,
	compact = false,
	second,
}: {
	weeks: number[]
	points: TrailPoint[]
	formWeeks: number[]
	label: string
	compact?: boolean
	/** A second player's line, for a comparison. */
	second?: { points: TrailPoint[]; color: string }
}) {
	const W = compact ? 140 : 360
	const H = compact ? 44 : 170
	const padL = compact ? 4 : 44
	const padR = compact ? 6 : 16
	const padT = compact ? 6 : 14
	const padB = compact ? 6 : 24
	const slots = Math.max(weeks.length, 4)
	const x = (w: number) => padL + (Math.max(0, weeks.indexOf(w)) / (slots - 1)) * (W - padL - padR)
	const y = (pct: number) => padT + (1 - pct / 100) * (H - padT - padB)
	const ranked = points.filter((p) => p.pct !== null && weeks.includes(p.w)) as { w: number; pct: number }[]
	const ranked2 = (second?.points ?? []).filter((p) => p.pct !== null && weeks.includes(p.w)) as { w: number; pct: number }[]
	if (!ranked.length && !ranked2.length) return null

	// A gap (a bye, a missed game, a week below the volume to rank) breaks the line instead of drawing across it.
	const split = (list: { w: number; pct: number }[]) => {
		const out: { w: number; pct: number }[][] = []
		let run: { w: number; pct: number }[] = []
		for (const w of weeks) {
			const p = list.find((r) => r.w === w)
			if (p) run.push(p)
			else if (run.length) {
				out.push(run)
				run = []
			}
		}
		if (run.length) out.push(run)
		return out
	}
	const segments = split(ranked)
	const segments2 = split(ranked2)

	const last = ranked[ranked.length - 1] ?? ranked2[ranked2.length - 1]
	const form = formWeeks.filter((w) => weeks.includes(w))
	const fx0 = form.length ? x(form[0]) - 10 : 0
	const fx1 = form.length ? x(form[form.length - 1]) + 10 : 0
	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label}>
			{compact ? null : (
				<>
					<rect x={padL} y={y(100)} width={W - padL - padR} height={y(75) - y(100)} fill="var(--lab-tint)" />
					{form.length ? <rect x={fx0} y={padT} width={fx1 - fx0} height={H - padT - padB} fill="var(--lab-hover)" /> : null}
					{[0, 50, 100].map((t) => (
						<g key={t}>
							<line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--lab-line-strong)" strokeDasharray={t === 50 ? "3 4" : undefined} strokeWidth={1} />
							<text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--lab-ink-muted)">
								{t === 100 ? "Best" : t === 50 ? "Middle" : "Worst"}
							</text>
						</g>
					))}
					{form.length ? (
						<text x={(fx0 + fx1) / 2} y={H - 12} textAnchor="middle" fontSize={8.5} fill="var(--lab-ink-muted)">
							recent
						</text>
					) : null}
					{weeks.map((w) => (
						<text key={w} x={x(w)} y={H - 2} textAnchor="middle" fontSize={9} fill="var(--lab-ink-muted)">
							{w}
						</text>
					))}
				</>
			)}
			{compact ? <line x1={padL} x2={W - padR} y1={y(50)} y2={y(50)} stroke="var(--lab-line-strong)" strokeDasharray="2 3" /> : null}
			{segments.map((seg, i) =>
				seg.length > 1 ? (
					<polyline key={i} points={seg.map((p) => `${x(p.w).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ")} fill="none" stroke="var(--pc-accent)" strokeWidth={compact ? 1.8 : 2.4} strokeLinejoin="round" strokeLinecap="round" />
				) : null,
			)}
			{segments2.map((seg, i) =>
				seg.length > 1 ? (
					<polyline key={`b${i}`} points={seg.map((p) => `${x(p.w).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ")} fill="none" stroke={second!.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 3" />
				) : null,
			)}
			{ranked2.map((p) => (
				<circle key={`b${p.w}`} cx={x(p.w)} cy={y(p.pct)} r={3.2} fill={second!.color} stroke="var(--lab-surface)" strokeWidth={1.5}>
					<title>{`Week ${p.w}: ${ordinal(shownPct(p.pct))} percentile`}</title>
				</circle>
			))}
			{ranked.map((p) => (
				<circle key={p.w} cx={x(p.w)} cy={y(p.pct)} r={p.w === last.w ? (compact ? 3 : 4.5) : compact ? 1.8 : 3} fill="var(--pc-accent)" stroke="var(--lab-surface)" strokeWidth={1.5}>
					<title>{`Week ${p.w}: ${ordinal(shownPct(p.pct))} percentile`}</title>
				</circle>
			))}
			{compact || second ? null : (
				<text x={Math.min(x(last.w), W - padR - 14)} y={Math.max(y(last.pct) - 9, 9)} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--lab-ink)">
					{ordinal(shownPct(last.pct))}
				</text>
			)}
		</svg>
	)
}
