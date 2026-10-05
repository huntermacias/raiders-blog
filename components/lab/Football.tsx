// The ball. A puck in the offense's color (so you can always find it) with a real football inside:
// a leather body, two white stripes and the laces. In a pass it spins about its long axis, in a kick it
// tumbles end over end. `spin` is the turn about the long axis in radians, `angle` the tilt on screen.

import * as React from "react"

import { LAB } from "@/lib/lab/theme"

export function Football({ x, y, scale, angle = 0, spin = 0, color, uid, halo = true }: { x: number; y: number; scale: number; angle?: number; spin?: number; color: string; uid: string; halo?: boolean }) {
	// Seen end-on the ball is rounder; side-on it is a long ellipse. The laces face us half of each turn.
	const c = Math.cos(spin)
	const ry = 5.4 + 3.4 * (1 - Math.abs(c))
	const laces = Math.max(0, c)
	return (
		<g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})`} style={{ pointerEvents: "none" }}>
			<defs>
				<radialGradient id={`${uid}-leather`} cx="0.38" cy="0.32" r="0.9">
					<stop offset="0%" style={{ stopColor: LAB.ball }} />
					<stop offset="100%" style={{ stopColor: LAB.ballDark }} />
				</radialGradient>
			</defs>
			{halo && <circle r={17} fill={LAB.surface} fillOpacity={0.78} stroke={color} strokeWidth={3} />}
			<g transform={`rotate(${angle.toFixed(1)})`}>
				<ellipse rx={11.5} ry={ry} fill={`url(#${uid}-leather)`} stroke={LAB.ballDark} strokeWidth={1} />
				<g fill="none" stroke={LAB.lace} strokeLinecap="round" opacity={0.55 + 0.45 * Math.abs(c)}>
					<path d={`M-6.2 ${-ry * 0.62} Q-7.4 0 -6.2 ${ry * 0.62}`} strokeWidth={1.3} />
					<path d={`M6.2 ${-ry * 0.62} Q7.4 0 6.2 ${ry * 0.62}`} strokeWidth={1.3} />
				</g>
				<g stroke={LAB.lace} strokeLinecap="round" opacity={laces}>
					<line x1={-3.4} y1={0} x2={3.4} y2={0} strokeWidth={1.4} />
					{[-2.4, -0.8, 0.8, 2.4].map((t) => (
						<line key={t} x1={t} y1={-ry * 0.34} x2={t} y2={ry * 0.34} strokeWidth={1.1} />
					))}
				</g>
			</g>
		</g>
	)
}
