// Effects drawn on the field around a play: goalposts, speed streaks behind a runner, the ring where a
// pass is caught, and what happens where a play ends (dust, a tackle ring, confetti, a first-down flash).
// Pure drawing in the same perspective as the routes; every effect is a function of the play, so scrubbing
// and replaying always show the same thing. No players are drawn.

import * as React from "react"

import type { Frame } from "@/lib/lab/drive"
import { BAR_LIFT, POST_YARD, UPRIGHT_LIFT, UPRIGHT_U, type FramePath, type View } from "@/lib/lab/field"
import { LAB } from "@/lib/lab/theme"

/** A repeatable pseudo-random number from 0 to 1, so the same play always throws the same dust. */
export function rand(seed: number, i: number): number {
	const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
	return x - Math.floor(x)
}

/** The uprights and crossbar on the back line of the far end zone. `state` lights them up after a kick. */
export function Goalposts({ view, state, k }: { view: View; state: "good" | "miss" | null; k: number }) {
	const base = view.pt(POST_YARD, 0)
	const barL = view.pt(POST_YARD, -UPRIGHT_U, BAR_LIFT)
	const barR = view.pt(POST_YARD, UPRIGHT_U, BAR_LIFT)
	const topL = view.pt(POST_YARD, -UPRIGHT_U, BAR_LIFT + UPRIGHT_LIFT)
	const topR = view.pt(POST_YARD, UPRIGHT_U, BAR_LIFT + UPRIGHT_LIFT)
	const neck = view.pt(POST_YARD, 0, BAR_LIFT)
	const w = Math.max(2, 3.6 * base.s) * (k > 1 ? 0.9 : 1)
	const d = `M${neck.x},${base.y} L${neck.x},${neck.y} M${barL.x},${barL.y} L${barR.x},${barR.y} M${barL.x},${barL.y} L${topL.x},${topL.y} M${barR.x},${barR.y} L${topR.x},${topR.y}`
	const lit = state === "good" ? LAB.post : state === "miss" ? LAB.bad : null
	return (
		<g style={{ pointerEvents: "none" }}>
			<path d={d} fill="none" stroke={LAB.casing} strokeWidth={w + 3} strokeLinecap="round" />
			<path d={d} fill="none" stroke={LAB.post} strokeWidth={w} strokeLinecap="round" />
			{lit && <path key={state} d={d} fill="none" stroke={lit} strokeWidth={w * 3.2} strokeLinecap="round" className="lab-flash" />}
		</g>
	)
}

/** Three speed streaks trailing a runner, along the direction he came from. */
export function Streaks({ view, path, p, color, k }: { view: View; path: FramePath; p: number; color: string; k: number }) {
	if (p < 0.04 || p > 0.97) return null
	const at = (q: number) => {
		const t = Math.max(0, q) * path.total
		let i = 0
		while (i < path.samples.length - 1 && path.samples[i + 1].at < t) i++
		const a = path.samples[i]
		const b = path.samples[Math.min(path.samples.length - 1, i + 1)]
		const f = b.at > a.at ? (t - a.at) / (b.at - a.at) : 0
		return view.pt(a.yard + (b.yard - a.yard) * f, a.u + (b.u - a.u) * f, a.lift + (b.lift - a.lift) * f)
	}
	const head = at(p)
	const tail = at(p - 0.16)
	const dx = tail.x - head.x
	const dy = tail.y - head.y
	const len = Math.hypot(dx, dy)
	if (len < 4) return null
	const ux = dx / len
	const uy = dy / len
	const nx = -uy
	const ny = ux
	const lines = [
		{ off: -9, scale: 0.7, o: 0.35 },
		{ off: 0, scale: 1, o: 0.55 },
		{ off: 9, scale: 0.7, o: 0.35 },
	]
	return (
		<g style={{ pointerEvents: "none" }} strokeLinecap="round">
			{lines.map((l) => {
				const o = l.off * head.s * k
				const x0 = head.x + nx * o + ux * 14 * head.s * k
				const y0 = head.y + ny * o + uy * 14 * head.s * k
				const x1 = head.x + nx * o + ux * Math.min(len, 70 * head.s * k) * l.scale + ux * 14 * head.s * k
				const y1 = head.y + ny * o + uy * Math.min(len, 70 * head.s * k) * l.scale + uy * 14 * head.s * k
				return <line key={l.off} x1={x0} y1={y0} x2={x1} y2={y1} stroke={color} strokeOpacity={l.o} strokeWidth={Math.max(1.5, 3.2 * head.s * k)} />
			})}
		</g>
	)
}

/** The ring that opens where a pass is caught. */
export function CatchRing({ view, yard, u, k, color }: { view: View; yard: number; u: number; k: number; color: string }) {
	const p = view.pt(yard, u)
	const r = (10 * p.s + 6) * k
	return (
		<g style={{ pointerEvents: "none" }}>
			<circle className="lab-ring" cx={p.x} cy={p.y} r={r} fill="none" stroke={color} strokeWidth={3} />
			<circle className="lab-ring" cx={p.x} cy={p.y} r={r * 0.6} fill={color} fillOpacity={0.25} stroke="none" style={{ animationDelay: "0.05s" }} />
		</g>
	)
}

/** A band across the field at the first-down line that flashes when a play gets there. */
export function FirstDownFlash({ view, yard }: { view: View; yard: number }) {
	const pts = [view.pt(yard - 0.5, -0.5), view.pt(yard + 0.5, -0.5), view.pt(yard + 0.5, 0.5), view.pt(yard - 0.5, 0.5)].map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")
	return <polygon className="lab-flash" points={pts} fill={LAB.firstDown} style={{ pointerEvents: "none" }} />
}

type Burst = "dust" | "tackle" | "turnover" | "score" | "kick"

/** What kind of finish to draw for a play. */
export function burstFor(f: Frame): Burst {
	if (f.outcome === "touchdown" || f.outcome === "fieldgoal-good") return "score"
	if (f.outcome === "turnover") return "turnover"
	if (f.outcome === "loss" || f.sack) return "tackle"
	if (f.outcome === "punt" || f.outcome === "fieldgoal-miss") return "kick"
	return "dust"
}

/** The finish of a play, at the spot where it ended. Keyed by the caller so it plays once per play. */
export function Impact({ view, f, yard, u, k, color, seed }: { view: View; f: Frame; yard: number; u: number; k: number; color: string; seed: number }) {
	const kind = burstFor(f)
	// A kick that ends out of sight, in the net, has nothing to splash.
	const raw = view.pt(yard, u)
	// Far from the camera everything is small; keep the finish big enough to read.
	const p = { ...raw, s: Math.max(0.72, raw.s) }
	const r = (9 * p.s + 4) * k
	if (kind === "dust" || kind === "kick" || kind === "tackle") {
		const puffs = kind === "kick" ? 6 : 8
		return (
			<g style={{ pointerEvents: "none" }}>
				{kind === "tackle" && <circle className="lab-ring" cx={p.x} cy={p.y} r={r * 1.6} fill="none" stroke={LAB.bad} strokeWidth={3.5} />}
				{Array.from({ length: puffs }, (_, i) => {
					const a = rand(seed, i) * Math.PI * 2
					const dist = (14 + 22 * rand(seed, i + 40)) * p.s * k
					const rad = (2.6 + 4.2 * rand(seed, i + 80)) * p.s * k + 1
					return (
						<circle
							key={i}
							className="lab-puff"
							cx={p.x}
							cy={p.y}
							r={rad}
							fill={LAB.fieldLine}
							style={{ ["--dx" as string]: `${(Math.cos(a) * dist).toFixed(1)}px`, ["--dy" as string]: `${(Math.sin(a) * dist * 0.55 - 6 * p.s * k).toFixed(1)}px`, animationDelay: `${(rand(seed, i + 120) * 0.08).toFixed(2)}s` }}
						/>
					)
				})}
			</g>
		)
	}
	if (kind === "turnover") {
		return (
			<g style={{ pointerEvents: "none" }}>
				<circle className="lab-ring" cx={p.x} cy={p.y} r={r * 2} fill="none" stroke={LAB.bad} strokeWidth={4} />
				<circle className="lab-ring" cx={p.x} cy={p.y} r={r * 1.2} fill={LAB.bad} fillOpacity={0.3} style={{ animationDelay: "0.06s" }} />
			</g>
		)
	}
	// A score: rings in the team color, and confetti.
	const palette = [color, LAB.firstDown, LAB.ink, color]
	return (
		<g style={{ pointerEvents: "none" }}>
			<circle className="lab-ring" cx={p.x} cy={p.y} r={r * 2.2} fill="none" stroke={color} strokeWidth={4} />
			<circle className="lab-ring" cx={p.x} cy={p.y} r={r * 1.4} fill={color} fillOpacity={0.28} style={{ animationDelay: "0.08s" }} />
			{Array.from({ length: 26 }, (_, i) => {
				const a = -Math.PI / 2 + (rand(seed, i) - 0.5) * Math.PI * 1.3
				const dist = (60 + 120 * rand(seed, i + 30)) * p.s * k
				const w = (3 + 4 * rand(seed, i + 60)) * Math.max(0.6, p.s) * k
				return (
					<rect
						key={i}
						className="lab-confetti"
						x={p.x - w / 2}
						y={p.y - w / 4}
						width={w}
						height={w / 2}
						rx={0.6}
						fill={palette[i % palette.length]}
						style={{
							["--dx" as string]: `${(Math.cos(a) * dist).toFixed(1)}px`,
							["--dy" as string]: `${(Math.sin(a) * dist + 70 * p.s * k * rand(seed, i + 90)).toFixed(1)}px`,
							["--rot" as string]: `${Math.round((rand(seed, i + 150) - 0.5) * 900)}deg`,
							animationDelay: `${(rand(seed, i + 200) * 0.12).toFixed(2)}s`,
						}}
					/>
				)
			})}
		</g>
	)
}

/** A touchdown lights up the end zone in the scoring team's color. */
export function EndZoneFlash({ view, color }: { view: View; color: string }) {
	const pts = [view.pt(100, -0.5), view.pt(110, -0.5), view.pt(110, 0.5), view.pt(100, 0.5)].map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")
	return <polygon className="lab-flash" points={pts} fill={color} style={{ pointerEvents: "none" }} />
}
