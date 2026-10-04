"use client"

import * as React from "react"

import type { Frame } from "@/lib/lab/drive"
import { segmentsFor } from "@/lib/lab/field"
import { LAB } from "@/lib/lab/theme"

const W = 1000
const X0 = 24
const X1 = 976
const MIN = -10
const MAX = 110
const FIELD_TOP = 8

/** Heights of the map. A phone gets a taller one so the routes and labels stay readable. */
type Geo = { H: number; fieldH: number; mid: number; text: number }
const geoFor = (tall: boolean): Geo => {
	const fieldH = tall ? 150 : 78
	return { H: FIELD_TOP + fieldH + 28, fieldH, mid: FIELD_TOP + fieldH / 2, text: tall ? 1.5 : 1 }
}

const xOf = (yard: number) => X0 + ((yard - MIN) / (MAX - MIN)) * (X1 - X0)
const yOf = (u: number, geo: Geo) => geo.mid + u * (geo.fieldH - 8)

/** One play as a path on the map: a straight run, or a throw bowed upward and a run after the catch. */
function pathOf(f: Frame, geo: Geo): string {
	return segmentsFor(f)
		.map((seg, i) => {
			const a = { x: xOf(seg.a.yard), y: yOf(seg.a.u, geo) }
			const b = { x: xOf(seg.b.yard), y: yOf(seg.b.u, geo) }
			const move = i === 0 ? `M${a.x.toFixed(1)},${a.y.toFixed(1)}` : ""
			if (seg.kind === "arc") {
				const bow = Math.min(22, 6 + Math.abs(b.x - a.x) * 0.18)
				return `${move}Q${((a.x + b.x) / 2).toFixed(1)},${(Math.min(a.y, b.y) - bow).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
			}
			return `${move}L${b.x.toFixed(1)},${b.y.toFixed(1)}`
		})
		.join(" ")
}

/**
 * The whole field from above, with the drive's shape on it. The offense moves left to right, so its
 * left is the top of the map. The dashed frame is what the main view is showing. Click to jump to the
 * play that ended nearest that yard line.
 */
export default function DriveMap({
	frames,
	done,
	moving,
	ball,
	camFrom,
	camTo,
	color,
	otherColor,
	onSeek,
	dim,
	compact,
}: {
	frames: Frame[]
	done: number
	moving: number | null
	ball: { yard: number; u: number }
	camFrom: number
	camTo: number
	color: string
	otherColor: string
	onSeek: (to: number) => void
	dim: (i: number) => number
	compact: boolean
}) {
	const geo = geoFor(compact)
	const { H, fieldH: FIELD_H } = geo
	const click = (e: React.PointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect()
		if (r.width <= 0 || frames.length === 0) return
		const yard = MIN + (((e.clientX - r.left) / r.width) * W - X0) / (X1 - X0) * (MAX - MIN)
		let best = 0
		let bestD = Infinity
		frames.forEach((f, i) => {
			const d = Math.abs(f.to - yard)
			if (d < bestD) {
				bestD = d
				best = i
			}
		})
		onSeek(best + 1)
	}

	const stripes: number[] = []
	for (let k = 0; k < 100; k += 10) stripes.push(k)

	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full cursor-pointer select-none" aria-hidden onPointerDown={click}>
			{/* turf, end zones, red zone */}
			<rect x={xOf(0)} y={FIELD_TOP} width={xOf(100) - xOf(0)} height={FIELD_H} fill={LAB.field} />
			{stripes.map((k) => (
				<rect key={k} x={xOf(k)} y={FIELD_TOP} width={xOf(k + 5) - xOf(k)} height={FIELD_H} fill={LAB.fieldBand} />
			))}
			<rect x={xOf(80)} y={FIELD_TOP} width={xOf(100) - xOf(80)} height={FIELD_H} fill={LAB.bad} opacity={0.12} />
			<rect x={xOf(MIN)} y={FIELD_TOP} width={xOf(0) - xOf(MIN)} height={FIELD_H} fill={color} opacity={0.9} />
			<rect x={xOf(100)} y={FIELD_TOP} width={xOf(MAX) - xOf(100)} height={FIELD_H} fill={otherColor} opacity={0.9} />
			{[...Array(11)].map((_, i) => (
				<line key={i} x1={xOf(i * 10)} y1={FIELD_TOP} x2={xOf(i * 10)} y2={FIELD_TOP + FIELD_H} stroke={LAB.fieldLine} strokeWidth={i === 0 || i === 10 ? 2 : 1} opacity={0.8} />
			))}
			<rect x={xOf(0)} y={FIELD_TOP} width={xOf(100) - xOf(0)} height={FIELD_H} fill="none" stroke={LAB.fieldLine} strokeWidth={1.5} />
			<g fill={LAB.inkMuted} fontSize={11 * geo.text} fontWeight={600} textAnchor="middle">
				{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
					<text key={i} x={xOf(i * 10)} y={H - 8}>
						{i <= 5 ? i * 10 : (10 - i) * 10}
					</text>
				))}
				<text x={xOf(90)} y={FIELD_TOP + 14 * geo.text} fill={LAB.fieldNum} fontSize={10 * geo.text} letterSpacing="0.14em">
					RED ZONE
				</text>
			</g>

			{/* the window the main view is showing */}
			<rect
				x={xOf(Math.max(MIN, camFrom))}
				y={FIELD_TOP - 3}
				width={Math.max(8, xOf(Math.min(MAX, camTo)) - xOf(Math.max(MIN, camFrom)))}
				height={FIELD_H + 6}
				rx={4}
				fill={LAB.ink}
				fillOpacity={0.07}
				stroke={LAB.ink}
				strokeOpacity={0.55}
				strokeDasharray="5 4"
				strokeWidth={1.5}
			/>

			{/* the whole drive, faint, so its shape shows before it is played */}
			{frames.map((f, i) =>
				i >= done ? <path key={`f${f.n}`} d={pathOf(f, geo)} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" /> : null
			)}
			{/* plays already run */}
			{frames.slice(0, done).map((f, i) => {
				const dashed = f.outcome === "incomplete" || f.outcome === "loss" || f.outcome === "penalty"
				return (
					<g key={f.n} opacity={dim(i)}>
						<path d={pathOf(f, geo)} fill="none" stroke={LAB.casing} strokeWidth={6 * geo.text} strokeLinecap="round" strokeLinejoin="round" />
						<path d={pathOf(f, geo)} fill="none" stroke={color} strokeWidth={3.4 * geo.text} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "2 5" : undefined} />
						<circle cx={xOf(f.to)} cy={yOf(f.y1, geo)} r={4.2 * geo.text} fill={f.outcome === "incomplete" ? LAB.field : color} stroke={f.outcome === "incomplete" ? LAB.ink : LAB.surface} strokeWidth={1.8} />
					</g>
				)
			})}
			{moving != null && frames[moving] && <path d={pathOf(frames[moving], geo)} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.5} strokeLinecap="round" />}

			{/* where the ball is */}
			<circle cx={xOf(ball.yard)} cy={yOf(ball.u, geo)} r={7 * geo.text} fill={LAB.surface} stroke={LAB.ink} strokeWidth={2.5} />
			<circle cx={xOf(ball.yard)} cy={yOf(ball.u, geo)} r={2.5 * geo.text} fill={LAB.ink} />
		</svg>
	)
}
