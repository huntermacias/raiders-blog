import { type PlayerGroup, type PlayerRow, type PlayersData, formatStat, statInfo, HEADLINE } from "@/lib/lab/playersKit"

/**
 * One bar per game for the stat a player's card follows. The games in his recent stretch are drawn in the Lab's team color and the
 * earlier ones in a quieter line color, so the shape of "he got better" reads without a legend. A game with too few plays to
 * measure is a dot on the baseline. No JavaScript; the numbers are in each bar's title and in the label for screen readers.
 */
export default function WeekBars({ data, player, className = "" }: { data: PlayersData; player: PlayerRow; className?: string }) {
	const key = HEADLINE[player.group as PlayerGroup]
	const info = statInfo(player.group, key)
	const recent = new Set(player.group === "rush" || player.group === "rund" || player.group === "cov" ? data.defFormWeeks : data.formWeeks)
	const pts = player.weekly
	if (!info || !pts.length) return null
	const vals = pts.map((p) => p.v).filter((v): v is number => v !== null)
	if (!vals.length) return null

	const W = 200
	const H = 56
	const top = 6
	const bottom = 14
	const lo = Math.min(0, ...vals)
	const hi = Math.max(0, ...vals)
	const span = hi - lo || 1
	const y = (v: number) => top + (1 - (v - lo) / span) * (H - top - bottom)
	const base = y(0)
	const slot = W / pts.length
	const barW = Math.min(22, slot * 0.58)
	const defense = player.group === "rush" || player.group === "rund" || player.group === "cov"
	const missing = (w: number) => (defense && w > data.defWeek ? "not posted yet" : "too few plays")
	const label = `${info.label}${info.higher === false ? " (lower is better)" : ""}, by game: ${pts.map((p) => `week ${p.w} against ${p.opp} ${p.v === null ? missing(p.w) : formatStat(player.group, key, p.v)}`).join("; ")}.`

	return (
		<svg viewBox={`0 0 ${W} ${H}`} className={`block h-auto w-full ${className}`} role="img" aria-label={label}>
			<line x1={0} x2={W} y1={base} y2={base} stroke="var(--lab-line-strong)" strokeWidth={1} />
			{pts.map((p, i) => {
				const cx = slot * i + slot / 2
				const hot = recent.has(p.w)
				const text = `Week ${p.w} vs ${p.opp}: ${p.v === null ? (missing(p.w) === "too few plays" ? "too few plays to measure" : "defensive numbers not posted yet") : `${formatStat(player.group, key, p.v)} (${Math.round(p.n)} ${info.per})`}`
				return (
					<g key={p.w}>
						<title>{text}</title>
						{p.v === null ? (
							<circle cx={cx} cy={base} r={2.2} fill="var(--lab-ink-muted)" />
						) : (
							<rect
								x={cx - barW / 2}
								y={Math.min(y(p.v), base)}
								width={barW}
								height={Math.max(1.5, Math.abs(y(p.v) - base))}
								rx={2}
								fill={hot ? "var(--lab-team)" : "var(--lab-line-strong)"}
							/>
						)}
						<text x={cx} y={H - 3} textAnchor="middle" fontSize={9} fill="var(--lab-ink-muted)" fontFamily="inherit">
							{p.w}
						</text>
					</g>
				)
			})}
		</svg>
	)
}
