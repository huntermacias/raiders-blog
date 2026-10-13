import type { ReactNode } from "react"

/**
 * The overall as a ring: the arc runs from the bottom of the scouting scale (20) to the top (80), or from last to first among his peers when given `pct`, so a full ring is a player at the
 * ceiling of what the scale usually shows and a ring half full is an average one. The number sits in the middle, so the arc is
 * decoration and nothing depends on seeing it.
 */
export default function GradeRing({ grade, pct, size = 148, children }: { grade: number | null; pct?: number | null; size?: number; children?: ReactNode }) {
	// `pct` (1 to 99) fills the ring by his Overall score; without it the ring is the scouting grade, 20 to 80.
	const fill = pct !== undefined ? (pct === null ? 0 : Math.max(0, Math.min(100, pct))) : grade === null ? 0 : Math.max(0, Math.min(100, ((grade - 20) / 60) * 100))
	return (
		<div className="relative grid place-items-center" style={{ width: size, height: size }} data-testid="grade-ring">
			<svg viewBox="0 0 120 120" width={size} height={size} className="absolute inset-0" aria-hidden="true">
				<circle cx="60" cy="60" r="52" fill="none" stroke="var(--lab-line)" strokeWidth="9" />
				<circle cx="60" cy="60" r="52" fill="none" stroke="var(--lab-line-strong)" strokeWidth="1" strokeDasharray="1 5.5" opacity="0.6" />
				<circle
					className="rr-ring-arc"
					cx="60"
					cy="60"
					r="52"
					fill="none"
					stroke="var(--pc-accent)"
					strokeWidth="9"
					strokeLinecap="round"
					pathLength={100}
					strokeDasharray="100"
					strokeDashoffset={100 - fill}
					transform="rotate(-90 60 60)"
				/>
			</svg>
			<div className="relative text-center">{children}</div>
		</div>
	)
}
