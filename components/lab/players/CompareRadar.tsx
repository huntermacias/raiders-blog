import type { RadarAxis } from "@/lib/lab/compareKit"
import { shownPct } from "@/lib/lab/playersKit"

const S = 520
const C = S / 2
const R = 140

/**
 * Each player's shape: a point on every spoke for his percentile on that stat (center is the worst in the league at his job, the outer
 * ring the best, the middle ring average). The bigger shape wins on balance, the lopsided one has a specialty. Drawn as SVG on the server
 * with a table of the same numbers for screen readers.
 */
export default function CompareRadar({ axes, aName, bName, colorA, colorB }: { axes: RadarAxis[]; aName: string; bName: string; colorA: string; colorB: string }) {
	const n = axes.length
	if (n < 3) return null
	const ang = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180)
	const at = (i: number, pct: number, r = R) => [C + r * (Math.max(2, pct) / 100) * Math.cos(ang(i)), C + r * (Math.max(2, pct) / 100) * Math.sin(ang(i))] as const
	const poly = (get: (a: RadarAxis) => number) => axes.map((a, i) => at(i, get(a)).map((v) => v.toFixed(1)).join(",")).join(" ")
	const ring = (pct: number) => axes.map((_, i) => at(i, pct).map((v) => v.toFixed(1)).join(",")).join(" ")
	return (
		<figure className="m-0" data-testid="compare-radar">
			<svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={`Radar chart: ${aName} against ${bName} on ${n} stats, each as a percentile among players at the same job.`} className="mx-auto block h-auto w-full max-w-[520px] overflow-visible">
				{[25, 50, 75, 100].map((p) => (
					<polygon key={p} points={ring(p)} fill={p === 50 ? "var(--lab-tint)" : "none"} stroke={p === 100 ? "var(--lab-line-strong)" : "var(--lab-grid)"} strokeWidth={p === 100 ? 1.5 : 1} strokeDasharray={p === 50 ? "3 4" : undefined} />
				))}
				{axes.map((_, i) => {
					const [x, y] = at(i, 100)
					return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--lab-grid)" strokeWidth={1} />
				})}
				<polygon className="rr-radar-shape" points={poly((a) => a.b)} fill={colorB} fillOpacity={0.2} stroke={colorB} strokeWidth={2.5} strokeLinejoin="round" />
				<polygon className="rr-radar-shape" points={poly((a) => a.a)} fill={colorA} fillOpacity={0.22} stroke={colorA} strokeWidth={2.5} strokeLinejoin="round" />
				{axes.map((a, i) => {
					const [bx, by] = at(i, a.b)
					const [ax, ay] = at(i, a.a)
					return (
						<g key={a.key}>
							<circle cx={bx} cy={by} r={4.5} fill={colorB} stroke="var(--lab-surface)" strokeWidth={1.5}>
								<title>{`${bName}: ${shownPct(a.b)}th percentile in ${a.label}`}</title>
							</circle>
							<circle cx={ax} cy={ay} r={4.5} fill={colorA} stroke="var(--lab-surface)" strokeWidth={1.5}>
								<title>{`${aName}: ${shownPct(a.a)}th percentile in ${a.label}`}</title>
							</circle>
						</g>
					)
				})}
				{axes.map((a, i) => {
					const [x, y] = at(i, 100, R + 22)
					const cos = Math.cos(ang(i))
					const anchor = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end"
					return (
						<text key={a.key} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={17} fontWeight={600} fill="var(--lab-ink-soft)" aria-hidden="true">
							{a.short}
						</text>
					)
				})}
			</svg>
			<figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-lab-soft">
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorA }} />
					{aName}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorB }} />
					{bName}
				</span>
				<span className="text-lab-muted">Farther out is better. Dotted ring is average.</span>
			</figcaption>
			<div className="sr-only">
			<table>
				<caption>Percentile among players at the same job, 100 is the best</caption>
				<thead>
					<tr>
						<th scope="col">Stat</th>
						<th scope="col">{aName}</th>
						<th scope="col">{bName}</th>
					</tr>
				</thead>
				<tbody>
					{axes.map((a) => (
						<tr key={a.key}>
							<th scope="row">{a.label}</th>
							<td>{shownPct(a.a)}</td>
							<td>{shownPct(a.b)}</td>
						</tr>
					))}
				</tbody>
			</table>
			</div>
		</figure>
	)
}
