"use client"

import * as React from "react"

import { useCompact } from "@/components/live/hooks"
import { LAB } from "@/lib/lab/theme"
import type { Side } from "@/lib/live/colors"
import { clockAtElapsed, pct } from "@/lib/live/format"
import type { Swing } from "@/lib/live/series"
import type { LiveGameInfo, WpSample } from "@/lib/live/types"

/** Drawing sizes. A phone gets a narrower, taller chart so its text and the line stay readable. */
const WIDE = { W: 800, H: 250, L: 36, R: 14, T: 22, B: 26, font: 10 }
const TALL = { W: 480, H: 300, L: 40, R: 12, T: 26, B: 28, font: 15 }

/**
 * The win probability across the game, drawn for one team (the Raiders when they play, else the home
 * team). Above the middle line is that team ahead, below is the other. Hover or touch to read any
 * play. The numbers are our own estimate from score, clock, possession, field position and the
 * pregame line, so the card says so.
 */
export default function LiveWinChart({ info, series, swings, focus, other, live }: { info: LiveGameInfo; series: WpSample[]; swings: Swing[]; focus: Side; other: Side; live: boolean }) {
	const uid = React.useId().replace(/:/g, "")
	const compact = useCompact()
	const { W, H, L, R, T, B, font } = compact ? TALL : WIDE
	const focusIsHome = focus.abbr === info.home.abbr
	const pOf = (s: WpSample) => (focusIsHome ? s.home : 1 - s.home)
	const total = Math.max(3600, series[series.length - 1]?.el ?? 3600)
	const x = (el: number) => L + (el / total) * (W - L - R)
	const y = (p: number) => T + (1 - p) * (H - T - B)
	const mid = y(0.5)
	const [hover, setHover] = React.useState<number | null>(null)

	const pts = series.map((s) => ({ x: x(s.el), y: y(pOf(s)) }))
	const line = pts.length > 1 ? "M" + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L") : ""
	const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${mid} L${pts[0].x.toFixed(1)},${mid} Z` : ""

	const idx = hover ?? series.length - 1
	const cur = series[idx]
	const nowP = cur ? pOf(cur) : 0.5
	const focusName = focusIsHome ? info.home.abbr : info.away.abbr

	const scoreDots = series.flatMap((s, i) => (i > 0 && (s.away !== series[i - 1].away || s.homeScore !== series[i - 1].homeScore) ? [{ i, s }] : []))
	const quarters = [900, 1800, 2700].filter((q) => q < total)

	const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect()
		if (r.width <= 0 || series.length < 2) return
		const el = ((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * total
		let best = 0
		let bd = Infinity
		series.forEach((s, i) => {
			const d = Math.abs(s.el - el)
			if (d < bd) {
				bd = d
				best = i
			}
		})
		setHover(best)
	}

	const caption = series.length > 1 ? `${focusName} win probability across the game, now ${pct(nowP)}.` : "Pregame win probability. The line starts when the game does."

	return (
		<div>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">Win probability &middot; estimate</p>
					<p className="mt-1 font-mono text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: LAB.ink }}>
						<span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: focus.fill }} aria-hidden />
						{focusName} {pct(nowP)}
					</p>
				</div>
				<div className="max-w-[26rem] text-right text-xs leading-snug text-lab-muted">
					{cur && series.length > 1 ? (
						<>
							<span className="font-mono font-semibold text-lab-soft">
								{clockAtElapsed(cur.el)} &middot; {info.away.abbr} {cur.away}, {info.home.abbr} {cur.homeScore}
							</span>
							<span className="mt-0.5 block line-clamp-2">{cur.text}</span>
						</>
					) : (
						<span>Based on the pregame line{info.odds?.label ? ` (${info.odds.label})` : ""}.</span>
					)}
				</div>
			</div>

			{series.length <= 1 ? (
				<div className="mt-5" aria-label={caption} role="img">
					<div className="flex h-3 overflow-hidden rounded-full">
						<span style={{ width: `${nowP * 100}%`, background: focus.fill }} />
						<span style={{ width: `${(1 - nowP) * 100}%`, background: other.fill }} />
					</div>
					<div className="mt-2 flex justify-between font-mono text-xs font-bold tabular-nums text-lab-soft">
						<span>{focusName} {pct(nowP)}</span>
						<span>{other.abbr} {pct(1 - nowP)}</span>
					</div>
					<p className="mt-3 text-sm text-lab-soft">The line starts when the game does and moves with every play.</p>
				</div>
			) : (
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="mt-3 block h-auto w-full select-none"
				style={{ touchAction: "pan-y" }}
				role="img"
				aria-label={caption}
				onPointerMove={onMove}
				onPointerDown={onMove}
				onPointerLeave={() => setHover(null)}
			>
				<defs>
					<clipPath id={`${uid}-up`}>
						<rect x={L} y={T} width={W - L - R} height={mid - T} />
					</clipPath>
					<clipPath id={`${uid}-down`}>
						<rect x={L} y={mid} width={W - L - R} height={H - B - mid} />
					</clipPath>
				</defs>

				{[0, 0.25, 0.75, 1].map((g) => (
					<line key={g} x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke={LAB.grid} />
				))}
				{quarters.map((q, i) => (
					<g key={q}>
						<line x1={x(q)} x2={x(q)} y1={T} y2={H - B} stroke={LAB.grid} strokeDasharray="3 5" />
						<text x={x(q)} y={T - 8} textAnchor="middle" fontSize={font} fill={LAB.inkMuted}>{`Q${i + 2}`}</text>
					</g>
				))}
				<text x={x(0) + 2} y={T - 8} fontSize={font} fill={LAB.inkMuted}>Q1</text>
				<line x1={L} x2={W - R} y1={mid} y2={mid} stroke={LAB.axis} strokeWidth={1.25} />
				{[1, 0.5, 0].map((g) => (
					<text key={g} x={L - 6} y={y(g) + 3.5} textAnchor="end" fontSize={font} fill={LAB.inkMuted}>{`${g * 100}%`}</text>
				))}
				<text x={L + 4} y={T + 12} fontSize={font} fontWeight={700} fill={LAB.inkSoft}>{focusName} ahead</text>
				<text x={L + 4} y={H - B - 6} fontSize={font} fontWeight={700} fill={LAB.inkSoft}>{other.abbr} ahead</text>

				{area && (
					<>
						<path d={area} fill={focus.fill} opacity={0.38} clipPath={`url(#${uid}-up)`} />
						<path d={area} fill={other.fill} opacity={0.38} clipPath={`url(#${uid}-down)`} />
						<path d={line} fill="none" stroke={LAB.ink} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
					</>
				)}

				{scoreDots.map(({ i, s }) => (
					<circle key={i} cx={pts[i].x} cy={pts[i].y} r={3.4} fill={LAB.surface} stroke={LAB.ink} strokeWidth={1.6}>
						<title>{`${clockAtElapsed(s.el)}: ${info.away.abbr} ${s.away}, ${info.home.abbr} ${s.homeScore}`}</title>
					</circle>
				))}

				{pts.length > 0 && (
					<g>
						{hover != null && <line x1={pts[idx].x} x2={pts[idx].x} y1={T} y2={H - B} stroke={LAB.ink} strokeOpacity={0.45} />}
						<circle cx={pts[idx].x} cy={pts[idx].y} r={live && hover == null ? 5.5 : 4.5} fill={focus.fill} stroke={LAB.ink} strokeWidth={2}>
							{live && hover == null && <animate attributeName="r" values="5;8;5" dur="1.8s" repeatCount="indefinite" />}
						</circle>
					</g>
				)}
			</svg>
			)}

			{swings.length > 0 && series.length > 1 && (
				<div className="mt-4 border-t border-lab-line pt-3">
					<p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">Biggest swings so far</p>
					<ul className="mt-2 space-y-1.5">
						{swings.map((s) => {
							const d = focusIsHome ? s.delta : -s.delta
							const pts = Math.round(Math.abs(d) * 100)
							return (
								<li key={`${s.sample.el}-${s.sample.text}`} className="flex items-start gap-3 text-sm">
									<span className="w-14 shrink-0 font-mono text-xs font-bold tabular-nums" style={{ color: d >= 0 ? LAB.ink : LAB.bad }}>
										{d >= 0 ? "+" : "−"}{pts} pts
									</span>
									<span className="min-w-0 text-lab-soft">
										<span className="mr-2 font-mono text-xs text-lab-muted">{clockAtElapsed(s.sample.el)}</span>
										<span className="line-clamp-1">{s.sample.text}</span>
									</span>
								</li>
							)
						})}
					</ul>
				</div>
			)}

			<p className="mt-3 text-[11px] leading-snug text-lab-muted">
				Our own estimate from the score, clock, who has the ball and where, and the pregame line. It will not match other sites exactly.
			</p>
		</div>
	)
}
