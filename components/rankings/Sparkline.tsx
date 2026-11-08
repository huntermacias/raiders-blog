import { cn } from "@/lib/utils"

/** Rank history. No. 1 is at the top, so a line going up means a team rising. */
export default function Sparkline({
	history,
	width = 72,
	height = 24,
	color = "currentColor",
	className,
}: {
	history: (number | null)[]
	width?: number
	height?: number
	color?: string
	className?: string
}) {
	const real = history.map((r, i) => (r === null ? null : { i, r })).filter((p): p is { i: number; r: number } => p !== null)
	if (real.length < 2) return null

	const pad = 3
	const x = (i: number) => pad + (i / Math.max(1, history.length - 1)) * (width - pad * 2)
	const y = (r: number) => pad + ((r - 1) / 31) * (height - pad * 2)

	const d = real.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.r).toFixed(1)}`).join(" ")
	const last = real[real.length - 1]
	const label = `Rank by week: ${history.map((r) => (r === null ? "unranked" : r)).join(", ")}`

	return (
		<svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn("overflow-visible", className)} style={{ color }}>
			<path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
			<circle cx={x(last.i)} cy={y(last.r)} r={2.75} fill="currentColor" />
		</svg>
	)
}
