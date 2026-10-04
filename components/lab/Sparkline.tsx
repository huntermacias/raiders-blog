import { LAB } from "@/lib/lab/theme"
import type { WpPoint } from "@/lib/lab/types"
import { maxTime } from "@/lib/lab/wp"

// A tiny static win-probability chart for the cards on /lab. No JavaScript.
export default function Sparkline({ id, series, label }: { id: string; series: WpPoint[]; label: string }) {
	const W = 320
	const H = 84
	const max = maxTime(series)
	const x = (s: number) => (s / max) * W
	const y = (p: number) => 4 + (1 - p) * (H - 8)
	const mid = y(0.5)
	const pts = series.map(([s, p]) => `${x(s).toFixed(1)},${y(p).toFixed(1)}`)
	const line = `M${pts.join(" L")}`
	const area = `M0,${mid} L${pts.join(" L")} L${W},${mid} Z`
	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label}>
			<defs>
				<clipPath id={`${id}-a`}>
					<rect x={0} y={0} width={W} height={mid} />
				</clipPath>
				<clipPath id={`${id}-b`}>
					<rect x={0} y={mid} width={W} height={H - mid} />
				</clipPath>
			</defs>
			<g clipPath={`url(#${id}-a)`}>
				<path d={area} fill={LAB.team} opacity={0.32} />
			</g>
			<g clipPath={`url(#${id}-b)`}>
				<path d={area} fill={LAB.opp} opacity={0.4} />
			</g>
			<line x1={0} x2={W} y1={mid} y2={mid} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 4" />
			<path d={line} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	)
}
