// The stadium: turf, mowing stripes, painted numbers and end zones, the chain crew's markers, and the
// lighting over all of it. Pure drawing, in the same perspective as the routes. Nothing here depends on
// player positions: it is the field, plus the line of scrimmage and first-down line.

import * as React from "react"

import { HASH } from "@/lib/lab/drive"
import { DEPTH, FIELD_YARDS_WIDE, MAX_YARD, MIN_YARD, type Geom, type View } from "@/lib/lab/field"
import { LAB } from "@/lib/lab/theme"

type Pt = { x: number; y: number; s: number }

/** Font size for text painted flat on the turf: letters are laid out in "turf yards" and scaled per axis. */
const U = 100

/** Screen pixels per yard across the field and along it, at a yard line. */
function yardScale(view: View, g: Geom, yard: number) {
	const c = view.pt(yard, 0)
	const lat = (g.NEAR_W * c.s) / FIELD_YARDS_WIDE
	const along = Math.abs(view.pt(yard + 0.5, 0).y - view.pt(yard - 0.5, 0).y)
	return { lat, along, c }
}

/** Text painted on the turf: `size` is the letter height in yards across the field. */
function FlatText({ view, g, yard, u, size, rotate = 0, anchor = "middle", children, fill, opacity = 1, spacing }: {
	view: View
	g: Geom
	yard: number
	u: number
	size: number
	/** 0 reads across the field; -90 and 90 read along it, tops toward the left and right sideline. */
	rotate?: 0 | -90 | 90
	anchor?: "start" | "middle" | "end"
	children: React.ReactNode
	fill: string
	opacity?: number
	spacing?: string
}) {
	const { lat, along, c } = yardScale(view, g, yard)
	const p = view.pt(yard, u)
	// Rotated text: its advance runs along the field and its height across it.
	const sx = rotate === 0 ? lat : lat
	const sy = along
	return (
		<text
			transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(sx / U).toFixed(4)} ${(sy / U).toFixed(4)}) rotate(${rotate})`}
			fontSize={size * U}
			fontWeight={800}
			textAnchor={anchor}
			dominantBaseline="central"
			fill={fill}
			opacity={opacity * Math.min(1, Math.max(0, c.s * 1.6 - 0.2))}
			letterSpacing={spacing}
			style={{ pointerEvents: "none" }}
		>
			{children}
		</text>
	)
}

export function Turf({
	view,
	g,
	cam,
	depth = DEPTH,
	compact,
	uid,
	driveName,
	otherName,
	driveColor,
	otherColor,
	onDrive,
	onOther,
}: {
	view: View
	g: Geom
	cam: number
	depth?: number
	compact: boolean
	uid: string
	driveName: string
	otherName: string
	driveColor: string
	otherColor: string
	onDrive: string
	onOther: string
}) {
	const lo = Math.floor((cam - 4) / 5) * 5
	const hi = cam + depth + 10
	const inView = (a: number, b: number) => b >= cam - 3 && a <= cam + depth + 10
	const fromY = Math.max(MIN_YARD, lo)
	const toY = Math.min(MAX_YARD, hi)
	const poly = (y0: number, y1: number, u0: number, u1: number) =>
		[view.pt(y0, u0), view.pt(y1, u0), view.pt(y1, u1), view.pt(y0, u1)].map((q: Pt) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")

	// Fine mowing: every other yard a hair lighter, so the turf has grain as it slides by.
	const fine: number[] = []
	for (let y = Math.max(0, Math.ceil(cam - 3)); y <= Math.min(99, Math.floor(hi)); y += 2) fine.push(y)

	// Mowing stripes: every other five yards a little lighter.
	const stripes: number[] = []
	for (let k = 0; k < 100; k += 10) if (inView(k, k + 5)) stripes.push(k)

	const lines: number[] = []
	for (let y = Math.max(0, lo); y <= Math.min(100, hi); y += 5) lines.push(y)
	const showOwnEnd = inView(MIN_YARD, 0)
	const showFarEnd = inView(100, MAX_YARD)
	const redZone = inView(80, 100)

	// Short tick marks every yard along the sidelines and on both hash marks.
	const tickPaths = [-0.5, -HASH, HASH, 0.5].map((u) => {
		const edge = Math.abs(u) === 0.5
		const half = edge ? 0.012 : 0.014
		const from = edge ? u : u - half
		const to = edge ? u + (u < 0 ? 2 * half : -2 * half) : u + half
		let d = ""
		for (let y = Math.max(0, Math.ceil(cam - 3)); y <= Math.min(100, Math.floor(hi)); y++) {
			if (y % 5 === 0) continue
			const a = view.pt(y, from)
			const b = view.pt(y, to)
			d += `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`
		}
		return { key: u, d }
	})

	// Diagonal hatching in the end zones, drawn in turf coordinates so it foreshortens with the field.
	const hatch = (y0: number) => {
		let d = ""
		for (let t = -10; t <= 10; t += 2.5) {
			const a = view.pt(y0 + t, -0.5)
			const b = view.pt(y0 + t + 10, 0.5)
			d += `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`
		}
		return d
	}

	// Leave the bottom corners to the LEFT / MIDDLE / RIGHT labels.
	const numbers = lines.filter((y) => y % 10 === 0 && y > 0 && y < 100 && view.pt(y, 0).y < g.BOTTOM - 40)
	const bigName = compact ? 3.6 : 4.6

	return (
		<g>
			<defs>
				<radialGradient id={`${uid}-glow`} cx="0.5" cy="0.8" r="0.7">
					<stop offset="0%" style={{ stopColor: LAB.fieldGlow }} />
					<stop offset="100%" style={{ stopColor: LAB.fieldGlow, stopOpacity: 0 }} />
				</radialGradient>
				<linearGradient id={`${uid}-edges`} x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" style={{ stopColor: LAB.fieldShade }} />
					<stop offset="22%" style={{ stopColor: LAB.fieldShade, stopOpacity: 0 }} />
					<stop offset="78%" style={{ stopColor: LAB.fieldShade, stopOpacity: 0 }} />
					<stop offset="100%" style={{ stopColor: LAB.fieldShade }} />
				</linearGradient>
				<clipPath id={`${uid}-ez-own`}>
					<polygon points={poly(MIN_YARD, 0, -0.5, 0.5)} />
				</clipPath>
				<clipPath id={`${uid}-ez-far`}>
					<polygon points={poly(100, MAX_YARD, -0.5, 0.5)} />
				</clipPath>
			</defs>

			{/* the surroundings, then the turf and its mowing stripes */}
			<polygon points={poly(fromY, toY, -0.6, -0.5)} fill={LAB.fieldShade} opacity={0.4} />
			<polygon points={poly(fromY, toY, 0.5, 0.6)} fill={LAB.fieldShade} opacity={0.4} />
			<polygon points={poly(fromY, toY, -0.5, 0.5)} fill={LAB.field} />
			{stripes.map((k) => (
				<polygon key={k} points={poly(k, k + 5, -0.5, 0.5)} fill={LAB.fieldBand} />
			))}

			{/* the red zone, the last twenty yards before the goal line */}
			{redZone && <polygon points={poly(80, 100, -0.5, 0.5)} fill={LAB.bad} opacity={0.1} />}

			{/* end zones in team colors, hatched, with the name painted across */}
			{showOwnEnd && (
				<g>
					<polygon points={poly(MIN_YARD, 0, -0.5, 0.5)} fill={driveColor} opacity={0.92} />
					<path d={hatch(-10)} clipPath={`url(#${uid}-ez-own)`} stroke={onDrive} strokeOpacity={0.12} strokeWidth={Math.max(1.5, 5 * view.scale(-5))} fill="none" />
				</g>
			)}
			{showFarEnd && (
				<g>
					<polygon points={poly(100, MAX_YARD, -0.5, 0.5)} fill={otherColor} opacity={0.92} />
					<path d={hatch(100)} clipPath={`url(#${uid}-ez-far)`} stroke={onOther} strokeOpacity={0.12} strokeWidth={Math.max(1.5, 5 * view.scale(105))} fill="none" />
				</g>
			)}
			{showOwnEnd && (
				<FlatText view={view} g={g} yard={-5} u={0} size={bigName} fill={onDrive} opacity={0.82} spacing="0.22em">
					{driveName.toUpperCase()}
				</FlatText>
			)}
			{showFarEnd && (
				<FlatText view={view} g={g} yard={105} u={0} size={bigName} fill={onOther} opacity={0.82} spacing="0.22em">
					{otherName.toUpperCase()}
				</FlatText>
			)}

			{/* sidelines, yard lines, hash marks */}
			<polygon points={poly(fromY, toY, -0.512, -0.5)} fill={LAB.fieldLine} />
			<polygon points={poly(fromY, toY, 0.5, 0.512)} fill={LAB.fieldLine} />
			{lines.map((y) => {
				const a = view.pt(y, -0.5)
				const b = view.pt(y, 0.5)
				const goal = y === 0 || y === 100
				return <line key={y} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LAB.fieldLine} strokeWidth={(goal ? 3.4 : y % 10 === 0 ? 2.2 : 1.3) * a.s + 0.3} />
			})}
			{tickPaths.map((t) => (
				<path key={t.key} d={t.d} stroke={LAB.fieldLine} strokeOpacity={0.7} strokeWidth={1} fill="none" />
			))}

			{/* numbers painted flat on the turf, tops toward the nearest sideline */}
			{numbers.map((y) => {
				const num = y <= 50 ? y : 100 - y
				return (
					<g key={y}>
						<FlatText view={view} g={g} yard={y} u={-0.3} size={compact ? 3.1 : 2.8} rotate={-90} fill={LAB.fieldNum}>
							{num}
						</FlatText>
						<FlatText view={view} g={g} yard={y} u={0.3} size={compact ? 3.1 : 2.8} rotate={90} fill={LAB.fieldNum}>
							{num}
						</FlatText>
					</g>
				)
			})}

			{/* light from above the middle of the field, and the stands' shadow along both edges */}
			<polygon points={poly(fromY, toY, -0.5, 0.5)} fill={`url(#${uid}-glow)`} style={{ pointerEvents: "none" }} />
			<polygon points={poly(fromY, toY, -0.5, 0.5)} fill={`url(#${uid}-edges)`} style={{ pointerEvents: "none" }} />
		</g>
	)
}

/** The chain crew: the ground you still need, the two sideline stakes, and the chain between them. */
export function Chain({ view, g, los, fd, toGo }: { view: View; g: Geom; los: number; fd: number | null; toGo: number }) {
	const stake = (yard: number, side: -1 | 1, color: string) => {
		const base = view.pt(yard, side * 0.545)
		const top = view.pt(yard, side * 0.545, 34)
		return (
			<g key={`${yard}-${side}`}>
				<line x1={base.x} y1={base.y} x2={top.x} y2={top.y} stroke={color} strokeWidth={Math.max(2, 3.2 * base.s)} strokeLinecap="round" />
				<circle cx={top.x} cy={top.y} r={Math.max(2.5, 4.6 * base.s)} fill={color} stroke={LAB.casing} strokeWidth={1.5} />
			</g>
		)
	}
	const chain = (side: -1 | 1) => {
		if (fd == null) return null
		const a = view.pt(los, side * 0.545, 14)
		const b = view.pt(fd, side * 0.545, 14)
		return <line key={side} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LAB.fieldLine} strokeOpacity={0.7} strokeWidth={Math.max(1.2, 1.6 * a.s)} strokeDasharray="1 4" strokeLinecap="round" />
	}
	return (
		<g style={{ pointerEvents: "none" }}>
			{fd != null && fd <= 100 && (
				<g>
					<polygon
						points={[view.pt(los, -0.5), view.pt(fd, -0.5), view.pt(fd, 0.5), view.pt(los, 0.5)].map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}
						fill={LAB.firstDown}
						opacity={0.13}
					/>
					{toGo >= 4 && (
						<FlatText view={view} g={g} yard={(los + fd) / 2} u={0} size={toGo >= 8 ? 3 : 2.2} fill={LAB.fieldNum} opacity={1} spacing="0.12em">
							{`${toGo} TO GO`}
						</FlatText>
					)}
				</g>
			)}
			{chain(-1)}
			{chain(1)}
			{stake(los, -1, LAB.scrimmage)}
			{stake(los, 1, LAB.scrimmage)}
			{fd != null && fd <= 100 && stake(fd, -1, LAB.firstDown)}
			{fd != null && fd <= 100 && stake(fd, 1, LAB.firstDown)}
		</g>
	)
}

/** Corner of a quad in screen coordinates, as an SVG points string. */
const pts = (list: Array<{ x: number; y: number }>) => list.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")

/**
 * The stadium around the turf: stands rising behind both sidelines and the far end zone, the LED boards
 * along the wall, and floodlights. The lights are fixed to the stadium, so they stay put on screen while the
 * field slides under them as the camera follows the ball. Pure drawing; nothing here is data.
 */
export function Stadium({ view, g, cam, depth = DEPTH, uid, driveColor, otherColor, driveName, otherName, compact }: { view: View; g: Geom; cam: number; depth?: number; uid: string; driveColor: string; otherColor: string; driveName: string; otherName: string; compact: boolean }) {
	const y0 = Math.floor((cam - 12) / 10) * 10
	const y1 = cam + depth + 36
	const endVisible = cam + depth >= 96
	const wallU = 0.585
	const boardH = 34
	const standU1 = 2.1
	const standH1 = 380
	const side = (sgn: -1 | 1) => {
		const surface = [view.pt(y0, sgn * wallU, boardH), view.pt(y1, sgn * wallU, boardH), view.pt(y1, sgn * standU1, standH1), view.pt(y0, sgn * standU1, standH1)]
		// Tier lines: bands of seating, drawn along the length of the stands.
		const tiers = [0.2, 0.42, 0.66].map((t) => {
			const h = boardH + t * (standH1 - boardH)
			const u = wallU + t * (standU1 - wallU)
			const a = view.pt(y0, sgn * u, h)
			const b = view.pt(y1, sgn * u, h)
			return `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`
		})
		// Phone flashes and bright seats: a few fixed bright spots on the stands.
		const specks: Array<{ x: number; y: number; r: number; d: number }> = []
		for (let i = 0; i < 22; i++) {
			const yard = y0 + ((i * 37 + (sgn > 0 ? 11 : 0)) % Math.max(1, y1 - y0))
			const t = ((i * 53 + 17) % 100) / 100
			const p = view.pt(yard, sgn * (wallU + t * (standU1 - wallU) * 0.7), boardH + t * (standH1 - boardH) * 0.7)
			specks.push({ x: p.x, y: p.y, r: Math.max(0.9, 1.7 * p.s), d: (i * 0.37) % 3 })
		}
		const panels: Array<{ k: number; a: Array<{ x: number; y: number }>; mine: boolean }> = []
		for (let k = Math.max(y0, -10); k < Math.min(y1, 110); k += 10) {
			panels.push({ k, mine: ((k / 10) | 0) % 2 === 0, a: [view.pt(k, sgn * wallU, 0), view.pt(k + 10, sgn * wallU, 0), view.pt(k + 10, sgn * wallU, boardH), view.pt(k, sgn * wallU, boardH)] })
		}
		return { surface, tiers, specks, panels }
	}
	const sides = [side(-1), side(1)]
	const back = [view.pt(114, -standU1, 22), view.pt(114, standU1, 22), view.pt(114, standU1, standH1), view.pt(114, -standU1, standH1)]
	const runoff = [view.pt(110, -wallU, 0), view.pt(110, wallU, 0), view.pt(114, wallU, 0), view.pt(114, -wallU, 0)]
	return (
		<g style={{ pointerEvents: "none" }}>
			<defs>
				<linearGradient id={`${uid}-standfade`} x1="0" x2="0" y1={-g.HEAD} y2={g.H} gradientUnits="userSpaceOnUse">
					<stop offset="0%" style={{ stopColor: LAB.surface, stopOpacity: 0.55 }} />
					<stop offset="45%" style={{ stopColor: LAB.surface, stopOpacity: 0 }} />
				</linearGradient>
				<pattern id={`${uid}-crowd`} width="11" height="8" patternUnits="userSpaceOnUse">
					<circle cx="1.8" cy="1.7" r="1.15" fill={LAB.lace} opacity="0.34" />
					<circle cx="6.4" cy="3.2" r="1.15" fill={driveColor} opacity="0.5" />
					<circle cx="9.3" cy="6.3" r="1.1" fill={otherColor} opacity="0.5" />
					<circle cx="4.2" cy="6.6" r="1" fill={LAB.inkMuted} opacity="0.4" />
				</pattern>
				<radialGradient id={`${uid}-bloomL`} cx="0.12" cy="0" r="0.6" gradientUnits="objectBoundingBox">
					<stop offset="0%" style={{ stopColor: LAB.lightPool, stopOpacity: 1 }} />
					<stop offset="100%" style={{ stopColor: LAB.lightPool, stopOpacity: 0 }} />
				</radialGradient>
				<radialGradient id={`${uid}-bloomR`} cx="0.88" cy="0" r="0.6" gradientUnits="objectBoundingBox">
					<stop offset="0%" style={{ stopColor: LAB.lightPool, stopOpacity: 1 }} />
					<stop offset="100%" style={{ stopColor: LAB.lightPool, stopOpacity: 0 }} />
				</radialGradient>
			</defs>
			{/* the sky and the bowl */}
			<rect x={0} y={-g.HEAD} width={g.W} height={g.H + g.HEAD} fill={LAB.sky} />
			{/* the far side of the stadium, always on the horizon */}
			<rect x={0} y={-g.HEAD} width={g.W} height={g.HEAD + 40} fill={LAB.stand} opacity={0.9} />
			<rect x={0} y={-g.HEAD} width={g.W} height={g.HEAD + 40} fill={`url(#${uid}-crowd)`} />
			{endVisible && (
				<g>
					<polygon points={pts(back)} fill={LAB.stand} />
					<polygon points={pts(back)} fill={`url(#${uid}-crowd)`} />
					<polygon points={pts(runoff)} fill={LAB.board} />
				</g>
			)}
			{[-1, 1].map((sg) => (
				<polygon key={`apron${sg}`} points={pts([view.pt(y0, sg * 0.5, 0), view.pt(y1, sg * 0.5, 0), view.pt(y1, sg * wallU, 0), view.pt(y0, sg * wallU, 0)])} fill={LAB.field} />
			))}
			{sides.map((s, i) => (
				<g key={i}>
					<polygon points={pts(s.surface)} fill={LAB.stand} />
					<polygon points={pts(s.surface)} fill={`url(#${uid}-crowd)`} />
					<path d={s.tiers.join("")} stroke={LAB.board} strokeOpacity={0.7} strokeWidth={2.2} fill="none" />
					{s.specks.map((q, j) => (
						<circle key={j} cx={q.x} cy={q.y} r={q.r} fill={LAB.lace} opacity={0.35 + 0.5 * ((q.d / 3) % 1)} />
					))}
					{/* the LED ribbon along the wall: panels in the two team colors with a lit top edge */}
					{s.panels.map((p) => (
						<g key={p.k}>
							<polygon points={pts(p.a)} fill={p.mine ? driveColor : otherColor} opacity={0.88} />
							<polygon points={pts(p.a)} fill={LAB.board} opacity={0.22} />
						</g>
					))}
					{s.panels.length > 0 && (
						<path
							d={`M${s.panels[0].a[3].x.toFixed(1)},${s.panels[0].a[3].y.toFixed(1)}` + s.panels.map((p) => `L${p.a[2].x.toFixed(1)},${p.a[2].y.toFixed(1)}`).join("")}
							stroke={LAB.boardLine}
							strokeWidth={1.4}
							fill="none"
						/>
					)}
				</g>
			))}
			{/* a haze from the top, so the far end of the stadium recedes */}
			<rect x={0} y={-g.HEAD} width={g.W} height={g.H + g.HEAD} fill={`url(#${uid}-standfade)`} />
			{/* the floodlights */}
			<rect x={0} y={-g.HEAD} width={g.W} height={g.H * 0.8} fill={`url(#${uid}-bloomL)`} />
			<rect x={0} y={-g.HEAD} width={g.W} height={g.H * 0.8} fill={`url(#${uid}-bloomR)`} />
			{/* the names of the two teams on the boards, so the stadium says who is playing */}
			<WallLabels view={view} cam={cam} depth={depth} sides={[-1, 1]} wallU={wallU} boardH={boardH} a={driveName} b={otherName} compact={compact} />
		</g>
	)
}

/** Names painted on the LED boards along the sidelines, skewed into the same perspective as the wall. */
function WallLabels({ view, cam, depth, sides, wallU, boardH, a, b, compact }: { view: View; cam: number; depth: number; sides: Array<-1 | 1>; wallU: number; boardH: number; a: string; b: string; compact: boolean }) {
	const out: React.ReactNode[] = []
	const first = Math.max(0, Math.ceil((cam - 4) / 20) * 20)
	for (const sgn of sides) {
		for (let k = first; k <= cam + depth + 6 && k < 100; k += 20) {
			const label = (k / 20) % 2 === 0 ? a : b
			const p0 = view.pt(k + 1, sgn * wallU, 0)
			const p1 = view.pt(k + 9, sgn * wallU, 0)
			const up = view.pt(k + 5, sgn * wallU, boardH)
			const mid = view.pt(k + 5, sgn * wallU, 0)
			const height = mid.y - up.y
			const lenX = p1.x - p0.x
			const lenY = p1.y - p0.y
			if (p0.s < 0.5 || height < 5) continue
			const units = 100
			const L = Math.hypot(lenX, lenY)
			const scaleX = L / (label.length * 62 + (label.length - 1) * 12)
			const matrix = `matrix(${((lenX / L) * scaleX).toFixed(4)} ${((lenY / L) * scaleX).toFixed(4)} 0 ${((height * 0.55) / units).toFixed(4)} ${p0.x.toFixed(1)} ${(p0.y - height * 0.2).toFixed(1)})`
			out.push(
				<text key={`${sgn}-${k}`} transform={matrix} fontSize={units} fontWeight={800} letterSpacing="0.12em" fill={LAB.lace} opacity={compact ? 0.7 : 0.82} dominantBaseline="alphabetic">
					{label.toUpperCase()}
				</text>,
			)
		}
	}
	return <g>{out}</g>
}
