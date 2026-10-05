// Geometry for the drive replay: a field seen from behind the offense, running away from you,
// like a broadcast pass chart. Pure, so it can be tested.
//
// Across the field: the play log says left, middle or right (and the gap for runs), so a play is
// drawn toward that lane. These are zones, not tracked positions. The offense moves up the
// screen, so its left is the left of the picture.

import type { Frame } from "./drive"

/** The size of the picture and where the field sits in it. */
export type Geom = {
	W: number
	H: number
	/** Screen y of the far and near edges of the visible stretch of field. */
	TOP: number
	BOTTOM: number
	/** Width of the field in pixels at the near edge. */
	NEAR_W: number
	/** Room above the far edge, for the goalposts and for kicks that climb out of the field. */
	HEAD: number
}

/** Wide and short, for desktop and tablet. */
export const WIDE: Geom = { W: 1000, H: 560, TOP: 22, BOTTOM: 538, NEAR_W: 880, HEAD: 84 }
/** Narrower and taller, so the field and its labels stay big enough to read on a phone. */
export const COMPACT: Geom = { W: 600, H: 680, TOP: 22, BOTTOM: 640, NEAR_W: 556, HEAD: 70 }

export const { W, H, TOP, BOTTOM, NEAR_W } = WIDE
/** Yards of field in view at once. */
export const DEPTH = 60
/** How hard the field narrows with distance. The far edge is 1 / (1 + A) as wide as the near edge. */
export const A = 1.15
/** The field is 53 1/3 yards wide. */
export const FIELD_YARDS_WIDE = 53.3
export const MIN_YARD = -10
export const MAX_YARD = 110

const FAR_SCALE = 1 / (1 + A)

export type View = {
	/** Screen point for a spot on the field. `lift` raises it off the ground (pixels at the near edge). */
	pt: (yard: number, u: number, lift?: number) => { x: number; y: number; s: number }
	/** Scale at a yard line: 1 at the near edge, smaller further away. */
	scale: (yard: number) => number
}

/** The view from a camera standing `cam` yards down the field. */
export function viewFrom(cam: number, g: Geom = WIDE, depth: number = DEPTH): View {
	const scale = (yard: number) => 1 / (1 + A * Math.max(-0.2, (yard - cam) / depth))
	return {
		scale,
		pt: (yard, u, lift = 0) => {
			const s = scale(yard)
			const y = g.BOTTOM - (g.BOTTOM - g.TOP) * ((1 - s) / (1 - FAR_SCALE))
			return { x: g.W / 2 + u * g.NEAR_W * s, y: y - lift * s, s }
		},
	}
}

/** Where the camera stands to show a given yard line: a little behind it, kept inside the field. */
export function cameraFor(focus: number, depth: number = DEPTH): number {
	return Math.min(MAX_YARD - depth, Math.max(MIN_YARD, focus - 0.27 * depth))
}

/** Near the goal line the camera pushes in, so the end zone, the goalposts and the finish are big enough to enjoy. */
export function goalZoom(focus: number): number {
	const t = Math.min(1, Math.max(0, (focus - 70) / 22))
	return 1 + 0.4 * t * t * (3 - 2 * t)
}

type Spot = { yard: number; u: number }
type Seg = { kind: "arc" | "line"; a: Spot; b: Spot; lift: number; /** The ball is still this high (near-edge pixels) when the arc ends, as it is over the crossbar. */ endLift?: number }

/** The goalposts stand on the back line of the far end zone. */
export const POST_YARD = 110
/** Half the gap between the uprights, as a fraction of the field's width (18 ft 6 in of 160 ft). */
export const UPRIGHT_U = 0.058
/** How high the crossbar is drawn, in near-edge pixels. */
export const BAR_LIFT = 58
/** How far the uprights rise above the crossbar, in near-edge pixels. */
export const UPRIGHT_LIFT = 92

/** How high a throw or kick rises, in near-edge pixels, by how far it travels in yards. */
export function arcLift(yards: number): number {
	return Math.min(120, 20 + Math.abs(yards) * 2.4)
}

/** A punt or field goal climbs higher than a throw of the same length. */
export function kickLift(yards: number): number {
	return Math.min(200, 56 + Math.abs(yards) * 2.6)
}

/** The pieces a play is drawn as: a bar for a run, an arc for a throw or kick, an arc then a bar for a catch and run. */
export function segmentsFor(f: Frame): Seg[] {
	const start: Spot = { yard: f.from, u: f.y0 }
	if (f.outcome === "incomplete") {
		const to = f.incompleteTo ?? Math.min(100, f.from + 9)
		return [{ kind: "arc", a: start, b: { yard: to, u: f.yc }, lift: arcLift(to - f.from) }]
	}
	if (f.outcome === "punt") return [{ kind: "arc", a: start, b: { yard: f.to, u: f.y1 }, lift: kickLift(f.to - f.from) }]
	if (f.outcome === "fieldgoal-good" || f.outcome === "fieldgoal-miss") {
		// Through, wide of, or short of the uprights at the back of the end zone.
		const sideSign = f.miss === "right" ? 1 : -1
		let b: Spot = { yard: POST_YARD, u: 0 }
		let endLift = BAR_LIFT + 26
		if (f.outcome === "fieldgoal-miss") {
			if (f.miss === "short") {
				b = { yard: Math.max(f.from + 6, Math.min(POST_YARD - 5, f.from + (f.kickYards ?? 40) - 12)), u: 0 }
				endLift = 0
			} else if (f.miss === "blocked") {
				b = { yard: Math.min(100, f.from + 4), u: 0 }
				endLift = 0
			} else if (f.upright) b = { yard: POST_YARD, u: sideSign * UPRIGHT_U }
			else b = { yard: POST_YARD, u: sideSign * (UPRIGHT_U + 0.07) }
		}
		return [{ kind: "arc", a: start, b, lift: kickLift(b.yard - f.from), endLift }]
	}
	if (f.type === "pass" && f.catchAt != null) {
		const catchSpot: Spot = { yard: f.catchAt, u: f.yc }
		const segs: Seg[] = [{ kind: "arc", a: start, b: catchSpot, lift: arcLift(f.catchAt - f.from) }]
		// The run after the catch, unless the ball was picked off.
		if (f.outcome !== "turnover" && Math.abs(f.to - f.catchAt) >= 1.5) segs.push({ kind: "line", a: catchSpot, b: { yard: f.to, u: f.y1 }, lift: 0 })
		return segs
	}
	return [{ kind: "line", a: start, b: { yard: f.to, u: f.y1 }, lift: 0 }]
}

export type Sample = { yard: number; u: number; lift: number; at: number }
export type FramePath = {
	samples: Sample[]
	/** Length along the field in yards, so the ball moves at a steady pace. */
	total: number
	start: Spot
	end: Spot
	/** Where a pass was caught, when there was a run after it. */
	catchSpot: Spot | null
}

const STEPS = 30

/** The route of a play, sampled in field coordinates so it can be drawn from any camera. */
export function pathFor(f: Frame): FramePath {
	const segs = segmentsFor(f)
	const samples: Sample[] = []
	let total = 0
	let prev: Sample | null = null
	for (const s of segs) {
		for (let i = 0; i <= STEPS; i++) {
			if (i === 0 && prev) continue
			const t = i / STEPS
			const cur: Sample = {
				yard: s.a.yard + (s.b.yard - s.a.yard) * t,
				u: s.a.u + (s.b.u - s.a.u) * t,
				lift: s.kind === "arc" ? 4 * s.lift * t * (1 - t) + (s.endLift ?? 0) * t : 0,
				at: total,
			}
			if (prev) {
				total += Math.hypot(cur.yard - prev.yard, (cur.u - prev.u) * FIELD_YARDS_WIDE)
				cur.at = total
			}
			samples.push(cur)
			prev = cur
		}
	}
	const catchSpot = segs.length > 1 ? segs[0].b : null
	return { samples, total: Math.max(total, 0.001), start: segs[0].a, end: segs[segs.length - 1].b, catchSpot }
}

/** Samples of a path up to a fraction p, ending exactly at p. */
export function sliceTo(path: FramePath, p: number): Sample[] {
	if (p >= 1) return path.samples
	const target = Math.max(0, p) * path.total
	const out: Sample[] = []
	for (let i = 0; i < path.samples.length; i++) {
		const s = path.samples[i]
		if (s.at <= target) {
			out.push(s)
			continue
		}
		const a = path.samples[i - 1] ?? s
		const t = (target - a.at) / (s.at - a.at || 1)
		out.push({ yard: a.yard + (s.yard - a.yard) * t, u: a.u + (s.u - a.u) * t, lift: a.lift + (s.lift - a.lift) * t, at: target })
		break
	}
	return out.length ? out : [path.samples[0]]
}

/** Where the ball is a fraction p of the way along the path. */
export function pointAlong(path: FramePath, p: number): Sample {
	const part = sliceTo(path, p)
	return part[part.length - 1]
}

/** A tapered ribbon along a run of samples, as an SVG polygon. `width` is in near-edge pixels. */
export function ribbon(samples: Sample[], view: View, width: number, taper = false): string {
	if (samples.length < 2) return ""
	const pts = samples.map((s, i) => {
		const p = view.pt(s.yard, s.u, s.lift)
		const grow = taper ? 0.3 + 0.7 * (i / (samples.length - 1)) : 1
		return { x: p.x, y: p.y, w: (width * p.s * grow) / 2 }
	})
	const left: string[] = []
	const right: string[] = []
	pts.forEach((q, i) => {
		const a = pts[Math.max(0, i - 1)]
		const b = pts[Math.min(pts.length - 1, i + 1)]
		let tx = b.x - a.x
		let ty = b.y - a.y
		const len = Math.hypot(tx, ty) || 1
		tx /= len
		ty /= len
		left.push(`${(q.x - ty * q.w).toFixed(1)},${(q.y + tx * q.w).toFixed(1)}`)
		right.push(`${(q.x + ty * q.w).toFixed(1)},${(q.y - tx * q.w).toFixed(1)}`)
	})
	return `M${left.join(" L")} L${right.reverse().join(" L")} Z`
}

/** The centerline of a run of samples, for dashed strokes and hit areas. */
export function centerline(samples: Sample[], view: View): string {
	return "M" + samples.map((s) => {
		const p = view.pt(s.yard, s.u, s.lift)
		return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
	}).join(" L")
}
