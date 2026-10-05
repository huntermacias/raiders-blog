// Small SVG charts for the Blogger vs. the Math page. Server-safe (no hooks), theme-aware through currentColor
// and the site's own tokens, and each one carries a plain-language label for screen readers.

import { oddsText } from "@/lib/math/format"
import type { TeamDetail } from "@/lib/math/report"

export { oddsText }

const W = 320
const H = 170
const PAD = { l: 26, r: 30, t: 12, b: 24 }

/** Rank by week for one team: mine (solid, filled) against the math's (dashed, ring), No. 1 at the top. */
export function RankHistory({ history, teams = 32 }: { history: TeamDetail["rankHistory"]; teams?: number }) {
	const weeks = history.map((h) => h.week)
	if (weeks.length === 0) return null
	const min = weeks[0]
	const max = weeks[weeks.length - 1]
	const x = (w: number) => PAD.l + (max === min ? (W - PAD.l - PAD.r) / 2 : ((w - min) / (max - min)) * (W - PAD.l - PAD.r))
	const y = (r: number) => PAD.t + ((r - 1) / (teams - 1)) * (H - PAD.t - PAD.b)
	const me = history.filter((h): h is typeof h & { me: number } => h.me != null)
	const line = (pts: { w: number; r: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.w).toFixed(1)} ${y(p.r).toFixed(1)}`).join(" ")
	const label = `Rank by week. ${history.map((h) => `Week ${h.week}: ${h.me != null ? `me No. ${h.me}, ` : ""}the math No. ${h.math}`).join(". ")}.`
	const last = history[history.length - 1]
	return (
		<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full text-foreground">
			{[1, 8, 16, 24, 32].map((r) => (
				<g key={r}>
					<line x1={PAD.l} x2={W - PAD.r} y1={y(r)} y2={y(r)} className="stroke-border" strokeWidth="1" strokeDasharray={r === 1 || r === 32 ? undefined : "2 4"} />
					<text x={PAD.l - 6} y={y(r) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="9">{r}</text>
				</g>
			))}
			{weeks.map((w) => (
				<text key={w} x={x(w)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="9">Wk {w}</text>
			))}
			<path d={line(history.map((h) => ({ w: h.week, r: h.math })))} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" opacity="0.75" />
			{me.length > 1 && <path d={line(me.map((h) => ({ w: h.week, r: h.me })))} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />}
			{history.map((h) => (
				<circle key={`m${h.week}`} cx={x(h.week)} cy={y(h.math)} r="4" className="fill-card" stroke="currentColor" strokeWidth="2" />
			))}
			{me.map((h) => (
				<circle key={`b${h.week}`} cx={x(h.week)} cy={y(h.me)} r="4.5" fill="currentColor" className="stroke-card" strokeWidth="1.5" />
			))}
			<text x={x(last.week) + 9} y={y(last.math) + (last.me != null && Math.abs(last.me - last.math) < 3 ? 12 : 3)} fontSize="10" className="fill-muted-foreground" fontWeight="600">{last.math}</text>
			{last.me != null && <text x={x(last.week) + 9} y={y(last.me) + (Math.abs(last.me - last.math) < 3 && last.me <= last.math ? -2 : 3)} fontSize="10" className="fill-foreground" fontWeight="700">{last.me}</text>}
		</svg>
	)
}

/** A sparkline of playoff odds by week, 0 to 100%, with the latest value written beside it. */
export function OddsSpark({ history, sims }: { history: { week: number; playoffs: number }[]; sims?: number }) {
	if (history.length === 0) return null
	const w = 120
	const h = 36
	const x = (i: number) => 3 + (history.length === 1 ? (w - 6) / 2 : (i / (history.length - 1)) * (w - 6))
	const y = (p: number) => 3 + (1 - p) * (h - 6)
	const d = history.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.playoffs).toFixed(1)}`).join(" ")
	const last = history[history.length - 1]
	const label = `Playoff odds by week: ${history.map((p) => `week ${p.week} ${oddsText(p.playoffs, sims)}`).join(", ")}.`
	return (
		<div className="flex items-center gap-2">
			<svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} className="text-foreground">
				<line x1="3" x2={w - 3} y1={y(0.5)} y2={y(0.5)} className="stroke-border" strokeDasharray="2 3" />
				<path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
				<circle cx={x(history.length - 1)} cy={y(last.playoffs)} r="3.5" fill="currentColor" className="stroke-card" strokeWidth="1.5" />
			</svg>
			<span className="font-serif text-lg font-bold tabular-nums">{oddsText(last.playoffs, sims)}</span>
		</div>
	)
}

/** How the team's final win total is spread across the simulations. Bars the team can still reach are solid. */
export function WinsChart({ dist, won, remaining, name }: { dist: number[]; won: number; remaining: number; name: string }) {
	const bw = 16
	const gap = 3
	const w = dist.length * (bw + gap)
	const h = 96
	const top = Math.max(...dist, 0.01)
	const label = `Chance of each final win total for the ${name}: ${dist.map((p, k) => (p >= 0.01 ? `${k} wins ${oddsText(p)}` : "")).filter(Boolean).join(", ")}.`
	return (
		<svg viewBox={`0 0 ${w} ${h + 16}`} role="img" aria-label={label} className="w-full text-zinc-50">
			{dist.map((p, k) => {
				const bh = Math.max(p > 0 ? 1.5 : 0, (p / top) * (h - 16))
				const reachable = k >= won && k <= won + remaining
				return (
					<g key={k}>
						<rect x={k * (bw + gap)} y={h - bh} width={bw} height={bh} rx="2" fill="currentColor" opacity={reachable ? 0.95 : 0.2} />
						{p >= 0.07 && (
							<text x={k * (bw + gap) + bw / 2} y={h - bh - 4} textAnchor="middle" fontSize="9" fill="currentColor" fontWeight="600">{Math.round(p * 100)}</text>
						)}
						<text x={k * (bw + gap) + bw / 2} y={h + 12} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">{k}</text>
					</g>
				)
			})}
		</svg>
	)
}
