"use client"

import { useMemo } from "react"

import { teamByAbbr } from "@/lib/nfl"
import { type ChartMetric, type Frame, METRICS, metricValue } from "@/lib/playoffs/timeline"
import type { Conference } from "@/lib/playoffs/types"

type Props = {
	frames: readonly Frame[]
	conference: Conference
	metric: ChartMetric
	/** The frame shown by the standings. */
	index: number
	/** Where the moving head is, between frames, while it glides. */
	pos: number
	/** The frame for today: everything after it is hypothetical. */
	nowIndex: number
	spotlight: ReadonlySet<string>
	hovered: string | null
	divisions: ReadonlySet<string> | null
	onHover: (team: string | null) => void
	onToggle: (team: string) => void
	reduced: boolean
	/** Draw for a narrow screen. */
	compact?: boolean
}

// A phone gets a taller, narrower drawing so the labels stay readable instead of shrinking with a wide one.
const WIDE = { W: 760, H: 440, PAD: { l: 46, r: 64, t: 18, b: 34 } }
const NARROW = { W: 400, H: 500, PAD: { l: 30, r: 42, t: 14, b: 30 } }

export default function TrajectoryChart({ frames, conference, metric, index, pos, nowIndex, spotlight, hovered, divisions, onHover, onToggle, reduced, compact = false }: Props) {
	const { W, H, PAD } = compact ? NARROW : WIDE
	const n = frames.length
	const teams = useMemo(() => (frames[0] ? Object.keys(frames[0].teams).filter((id) => frames[0].teams[id].conference === conference) : []), [frames, conference])
	const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (n - 1))

	// Rank and games-behind read "smaller is better", so the axis runs downward from the best value; win % runs the other way.
	const domain = useMemo(() => {
		if (metric === "rank") return { lo: 1, hi: teams.length || 16, flip: false }
		if (metric === "pct") return { lo: 0, hi: 1, flip: true }
		let lo = Infinity
		let hi = -Infinity
		for (const f of frames) for (const id of teams) {
			const v = metricValue(f, id, "behind")
			lo = Math.min(lo, v)
			hi = Math.max(hi, v)
		}
		return { lo: Math.floor(Math.min(lo, 0) - 0.5), hi: Math.ceil(Math.max(hi, 0) + 0.5), flip: false }
	}, [frames, teams, metric])
	const y = (v: number) => {
		const t = (v - domain.lo) / Math.max(1e-9, domain.hi - domain.lo)
		return PAD.t + (domain.flip ? 1 - t : t) * (H - PAD.t - PAD.b)
	}
	const lineY = metric === "rank" ? (y(7) + y(8)) / 2 : metric === "behind" ? y(0) : null

	const clamp = Math.max(0, Math.min(pos, n - 1))
	const lo = Math.floor(clamp)
	const frac = clamp - lo
	const point = (id: string, i: number) => [x(i), y(metricValue(frames[i], id, metric))] as const
	const head = (id: string) => {
		const [x0, y0] = point(id, lo)
		if (frac === 0 || lo + 1 >= n) return [x0, y0] as const
		const [x1, y1] = point(id, lo + 1)
		return [x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac] as const
	}
	const pathFor = (id: string) => {
		let d = ""
		for (let i = 0; i <= lo; i++) {
			const [px, py] = point(id, i)
			d += `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`
		}
		if (frac > 0 && lo + 1 < n) {
			const [hx, hy] = head(id)
			d += `L${hx.toFixed(1)},${hy.toFixed(1)}`
		}
		return d
	}

	const inField = (id: string) => frames[index].teams[id].seed !== null
	const visible = teams.filter((id) => !divisions || divisions.has(frames[0].teams[id].division))
	const opacityOf = (id: string) => (spotlight.has(id) || hovered === id ? 1 : spotlight.size || hovered ? (inField(id) ? 0.28 : 0.1) : inField(id) ? 0.7 : 0.2)
	// Draw dim lines first so spotlit lines sit on top.
	const ordered = [...visible].sort((a, b) => opacityOf(a) - opacityOf(b))
	const yTicks = metric === "rank" ? [1, 4, 7, 8, 12, 16] : metric === "pct" ? [0, 0.25, 0.5, 0.75, 1] : Array.from({ length: Math.min(7, domain.hi - domain.lo + 1) }, (_, k) => domain.lo + Math.round((k * (domain.hi - domain.lo)) / Math.min(6, domain.hi - domain.lo || 1)))
	const tickLabel = (v: number) => (metric === "pct" ? v.toFixed(2).replace(/^0/, "") : String(v))
	const info = METRICS.find((m) => m.id === metric)!

	return (
		<figure className="m-0">
			<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${conference} teams by ${info.label.toLowerCase()}, week by week. ${info.blurb} A table with the same numbers follows.`} className="h-auto w-full touch-manipulation select-none">
				{/* hypothetical region */}
				{nowIndex < n - 1 ? <rect x={x(nowIndex)} y={PAD.t} width={x(n - 1) - x(nowIndex)} height={H - PAD.t - PAD.b} className="fill-lab-tint" opacity={0.55} /> : null}
				{yTicks.map((v) => (
					<g key={v}>
						<line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-lab-line" strokeWidth={1} />
						<text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="fill-lab-muted font-mono text-[11px]">
							{tickLabel(v)}
						</text>
					</g>
				))}
				{frames.map((f, i) => (compact && i % 2 === 1 && i !== index ? null : (
					<text key={f.week} x={x(i)} y={H - 12} textAnchor="middle" className={`font-mono text-[11px] ${i === index ? "fill-lab-ink font-bold" : "fill-lab-muted"}`}>
						{f.week}
					</text>
				)))}
				<text x={PAD.l} y={H - 1} className="fill-lab-muted text-[10px] uppercase tracking-widest">
					Week
				</text>
				{lineY !== null ? (
					<g>
						<line x1={PAD.l} x2={W - PAD.r} y1={lineY} y2={lineY} className="stroke-lab-ink" strokeWidth={1.5} strokeDasharray="5 4" />
						<text x={PAD.l + 6} y={lineY - 5} className="fill-lab-ink text-[10px] font-semibold">
							Playoff line
						</text>
					</g>
				) : null}
				{nowIndex < n - 1 ? (
					<g>
						<line x1={x(nowIndex)} x2={x(nowIndex)} y1={PAD.t} y2={H - PAD.b} className="stroke-lab-line-strong" strokeWidth={1} strokeDasharray="2 3" />
						<text x={x(nowIndex) + 4} y={H - PAD.b - 6} className="fill-lab-muted text-[10px] font-semibold uppercase tracking-wider">
							Today
						</text>
					</g>
				) : null}
				<line x1={x(clamp)} x2={x(clamp)} y1={PAD.t} y2={H - PAD.b} className="stroke-lab-ink" strokeWidth={1} opacity={0.25} />

				{ordered.map((id) => {
					const color = teamByAbbr(id).color
					const [hx, hy] = head(id)
					const o = opacityOf(id)
					const bold = spotlight.has(id) || hovered === id
					return (
						<g key={id} opacity={o} style={{ transition: reduced ? undefined : "opacity 200ms" }}>
							<path d={pathFor(id)} fill="none" stroke={color} strokeWidth={bold ? 3.2 : 2} strokeLinejoin="round" strokeLinecap="round" />
							<g transform={`translate(${hx.toFixed(1)},${hy.toFixed(1)})`}>
								<circle r={bold ? 5.5 : 4} fill={color} className="stroke-lab-page" strokeWidth={1.5} />
								<text x={9} y={4} className={`fill-lab-ink stroke-lab-page font-mono text-[11px] ${bold ? "font-bold" : "font-semibold"}`} paintOrder="stroke" strokeWidth={3} strokeLinejoin="round">
									{id}
								</text>
							</g>
							{/* a wide invisible target to hover or tap a line */}
							<path d={pathFor(id)} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer" onPointerEnter={() => onHover(id)} onPointerLeave={() => onHover(null)} onClick={() => onToggle(id)} />
						</g>
					)
				})}
			</svg>
			<figcaption className="mt-1 text-xs text-lab-muted">
				<span className="font-semibold text-lab-soft">{info.label}.</span> {info.blurb} The shaded area is hypothetical: it comes from your picks and simulations.
			</figcaption>
		</figure>
	)
}
