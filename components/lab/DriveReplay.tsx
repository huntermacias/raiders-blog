"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react"

import { framesForDrive, resultLabel, resultTone, type Frame, yardLineName } from "@/lib/lab/drive"
import { LAB } from "@/lib/lab/theme"
import type { Drive } from "@/lib/lab/types"

const W = 1000
const H = 332
const PAD = 16
const FIELD_W = W - PAD * 2
const FIELD_TOP = 46
const FIELD_H = 248
const FIELD_BOTTOM = FIELD_TOP + FIELD_H
/** The line the ball travels along, a little below the middle so passes have room to arc. */
const BASE_Y = FIELD_TOP + FIELD_H * 0.64
const UNITS = 120 // 100 yards plus two 10-yard end zones
const SPEEDS = [1, 2] as const

type Props = {
	drives: Drive[]
	teamAbbr: string
	teamName: string
	oppName: string
}

const ux = (yard: number) => PAD + ((yard + 10) / UNITS) * FIELD_W

function easeOut(p: number) {
	return 1 - Math.pow(1 - p, 3)
}

function usePrefersReducedMotion() {
	const [reduced, setReduced] = React.useState(false)
	React.useEffect(() => {
		if (typeof window === "undefined" || !window.matchMedia) return
		const q = window.matchMedia("(prefers-reduced-motion: reduce)")
		setReduced(q.matches)
		const on = () => setReduced(q.matches)
		q.addEventListener?.("change", on)
		return () => q.removeEventListener?.("change", on)
	}, [])
	return reduced
}

function outcomeTag(f: Frame): string {
	switch (f.outcome) {
		case "touchdown":
			return "TOUCHDOWN"
		case "fieldgoal-good":
			return "FIELD GOAL IS GOOD"
		case "fieldgoal-miss":
			return "NO GOOD"
		case "punt":
			return "PUNT"
		case "incomplete":
			return "INCOMPLETE"
		case "penalty":
			return "PENALTY"
		case "turnover":
			return "TURNOVER"
		case "kneel":
			return "KNEEL"
		default:
			return f.yards === 0 ? "NO GAIN" : `${f.yards > 0 ? "+" : "−"}${Math.abs(f.yards)} YDS`
	}
}

/** How high a pass or kick arcs, in field pixels, by how far it travels. */
function arcHeight(f: Frame) {
	return Math.min(150, 40 + Math.abs(f.to - f.from) * 2.6)
}

/** The path one play draws on the field: a flat bar for runs, an arc for passes and kicks. */
function playPath(f: Frame): string {
	const x0 = ux(f.from)
	if (f.outcome === "incomplete") {
		const xe = ux(Math.min(100, f.from + 9))
		return `M${x0},${BASE_Y} Q${(x0 + xe) / 2},${BASE_Y - 46} ${xe},${BASE_Y}`
	}
	const x1 = ux(f.to)
	if (f.arc) return `M${x0},${BASE_Y} Q${(x0 + x1) / 2},${BASE_Y - arcHeight(f)} ${x1},${BASE_Y}`
	return `M${x0},${BASE_Y} L${x1},${BASE_Y}`
}

type Style = { width: number; dash?: string; opacity: number }
function playStyle(f: Frame): Style {
	if (f.outcome === "incomplete") return { width: 2.5, dash: "2 6", opacity: 0.75 }
	if (f.outcome === "loss" || f.outcome === "penalty") return { width: 5, dash: "9 7", opacity: 0.95 }
	if (f.arc) return { width: 3.5, opacity: 0.95 }
	return { width: 6, opacity: 0.95 }
}

/** The ball: a clean puck in the offense's color with a small football inside. */
function Ball({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
	return (
		<g transform={`translate(${x} ${y})`} style={{ pointerEvents: "none" }}>
			<circle r={16} fill={LAB.surface} stroke={color} strokeWidth={3.5} />
			<g transform={`rotate(${angle})`} fill="none" stroke={LAB.ink} strokeLinecap="round">
				<ellipse rx={8.5} ry={5} strokeWidth={1.7} />
				<line x1={-3} y1={0} x2={3} y2={0} strokeWidth={1.5} />
				<line x1={-1.6} y1={-1.7} x2={-1.6} y2={1.7} strokeWidth={1.2} />
				<line x1={1.6} y1={-1.7} x2={1.6} y2={1.7} strokeWidth={1.2} />
			</g>
		</g>
	)
}

export default function DriveReplay({ drives, teamAbbr, teamName, oppName }: Props) {
	const reduced = usePrefersReducedMotion()
	const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "")
	const [driveIdx, setDriveIdx] = React.useState(() => Math.max(0, drives.findIndex((d) => d.team === teamAbbr)))
	const [cursor, setCursor] = React.useState(0) // plays completed
	const [playing, setPlaying] = React.useState(false)
	const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1)
	// While a play is animating: progress 0..1 of frames[cursor].
	const [progress, setProgress] = React.useState<number | null>(null)
	const fieldRef = React.useRef<HTMLDivElement>(null)

	const drive = drives[driveIdx]
	const frames = React.useMemo(() => (drive ? framesForDrive(drive) : []), [drive])
	const n = frames.length
	const isTeam = drive?.team === teamAbbr
	const driveColor = isTeam ? LAB.team : LAB.opp
	const otherColor = isTeam ? LAB.opp : LAB.team
	const onDrive = isTeam ? LAB.onTeam : LAB.onOpp
	const onOther = isTeam ? LAB.onOpp : LAB.onTeam
	const driveName = isTeam ? teamName : oppName
	const otherName = isTeam ? oppName : teamName

	// New drive: back to the start, not playing.
	React.useEffect(() => {
		setCursor(0)
		setProgress(null)
		setPlaying(false)
	}, [driveIdx])

	// Autoplay: set the snap, move the ball, hold, next play.
	React.useEffect(() => {
		if (!playing) return
		if (cursor >= n) {
			setPlaying(false)
			return
		}
		if (reduced) {
			const id = window.setTimeout(() => setCursor((c) => c + 1), 1100 / speed)
			return () => window.clearTimeout(id)
		}
		let raf = 0
		const timers: number[] = []
		const moveMs = 750 / speed
		const holdMs = 1150 / speed
		const setMs = 520 / speed
		timers.push(
			window.setTimeout(() => {
				const start = performance.now()
				const tick = (now: number) => {
					const p = Math.min(1, (now - start) / moveMs)
					setProgress(p)
					if (p < 1) raf = requestAnimationFrame(tick)
					else {
						timers.push(
							window.setTimeout(() => {
								setProgress(null)
								setCursor((c) => c + 1)
							}, holdMs)
						)
					}
				}
				raf = requestAnimationFrame(tick)
			}, setMs)
		)
		return () => {
			cancelAnimationFrame(raf)
			timers.forEach((t) => window.clearTimeout(t))
		}
	}, [playing, cursor, n, speed, reduced])

	// On a phone the field is wider than the screen and scrolls sideways; keep the ball in view.
	React.useEffect(() => {
		const el = fieldRef.current
		if (!el || el.scrollWidth <= el.clientWidth + 2 || frames.length === 0) return
		const done = progress === 1 ? cursor + 1 : cursor
		const f = frames[cursor]
		let yard: number
		if (progress != null && progress < 1 && f) yard = f.from + (f.to - f.from) * progress
		else if (done > 0) yard = frames[Math.min(done, frames.length) - 1].to
		else yard = frames[0].from
		el.scrollLeft = ((yard + 10) / UNITS) * el.scrollWidth - el.clientWidth / 2
	}, [progress, cursor, frames])

	if (!drive || n === 0) return null

	// When the ball has finished moving but the hold timer has not yet advanced the
	// cursor, the play counts as done: show its result right away.
	const eff = progress === 1 ? cursor + 1 : cursor
	const upcoming = frames[Math.min(eff, n - 1)]
	const last = eff > 0 ? frames[eff - 1] : null
	const finished = eff >= n
	const animating = progress != null && progress < 1 && cursor < n

	// Ball position, how high it is in the air, and which way it points.
	let ballYard: number
	let lift = 0
	let angle = 0
	if (animating) {
		const f = frames[cursor]
		const p = progress!
		const e = f.arc ? p : easeOut(p)
		ballYard = f.from + (f.to - f.from) * e
		if (f.arc) {
			const hc = arcHeight(f)
			lift = 2 * hc * p * (1 - p)
			const dx = ((f.to - f.from) / UNITS) * FIELD_W
			const dy = -2 * hc * (1 - 2 * p)
			const deg = (Math.atan2(dx >= 0 ? dy : -dy, Math.abs(dx) || 1) * 180) / Math.PI
			angle = Math.max(-40, Math.min(40, deg))
		}
	} else if (last) {
		ballYard = last.to
	} else {
		ballYard = frames[0].from
	}
	const ballY = BASE_Y - lift

	const losYard = finished ? frames[n - 1].to : upcoming.from
	const fdYard = finished ? null : upcoming.firstDownAt
	const trail = frames.slice(0, eff)

	const status = finished
		? { head: resultLabel(drive.result).toUpperCase(), sub: `${n} plays, ${drive.yards} yards${drive.top ? `, ${drive.top}` : ""}` }
		: { head: upcoming.downLabel || "Kick", sub: yardLineName(upcoming.from) }

	const shownText = animating ? null : last?.text ?? `${driveName} start at ${yardLineName(frames[0].from)}.`
	const tone = resultTone(drive.result)

	const go = (i: number) => {
		setPlaying(false)
		setProgress(null)
		setCursor(Math.max(0, Math.min(n, i)))
	}
	const toggle = () => {
		if (playing) return setPlaying(false)
		if (eff >= n) setCursor(0)
		setPlaying(true)
	}

	const yardNumbers = [10, 20, 30, 40, 50, 60, 70, 80, 90]

	return (
		<div className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface text-lab-ink shadow-[var(--lab-shadow)]">
			{/* drive picker */}
			<div className="border-b border-lab-line px-2 py-3 sm:px-4">
				<div className="flex gap-2 overflow-x-auto px-2 pb-1" role="tablist" aria-label="Drives">
					{drives.map((d, i) => {
						const mine = d.team === teamAbbr
						const active = i === driveIdx
						const t = resultTone(d.result)
						return (
							<button
								key={d.n}
								type="button"
								role="tab"
								aria-selected={active}
								onClick={() => setDriveIdx(i)}
								className={
									"shrink-0 rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink " +
									(active ? "border-lab-ink bg-lab-hover" : "border-lab-line hover:bg-lab-hover")
								}
							>
								<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-lab-muted">
									<span className="inline-block h-2 w-2 rounded-full" style={{ background: mine ? LAB.team : LAB.opp }} aria-hidden />
									{mine ? teamName : oppName} &middot; Q{d.q} {d.clock}
								</div>
								<div className={"mt-0.5 text-sm font-semibold " + (t === "score" ? "text-lab-ink" : "text-lab-soft")}>
									{resultLabel(d.result)}
									<span className="ml-1.5 font-normal text-lab-muted">
										{d.plays.length} {d.plays.length === 1 ? "play" : "plays"} &middot; {d.yards} yds
									</span>
								</div>
							</button>
						)
					})}
				</div>
			</div>

			{/* down and distance bug */}
			<div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
				<div className="flex items-center gap-3">
					<span className="rounded bg-lab-ink px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-lab-surface">{status.head}</span>
					<span className="text-sm text-lab-muted">{finished ? status.sub : `at ${status.sub}`}</span>
				</div>
				<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">
					{driveName} drive {drive.n} &middot; Q{drive.q} {drive.clock}
				</div>
			</div>

			{/* the field */}
			<div ref={fieldRef} className="overflow-x-auto px-2 pt-3 sm:px-4">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					className="block h-auto w-full min-w-[760px]"
					role="img"
					aria-label={`${driveName} drive ${drive.n}, ${n} plays, ${drive.yards} yards, ending in ${resultLabel(drive.result).toLowerCase()}.`}
				>
					<defs>
						<clipPath id={`${uid}-field`}>
							<rect x={PAD} y={FIELD_TOP} width={FIELD_W} height={FIELD_H} rx={12} />
						</clipPath>
						<linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" style={{ stopColor: LAB.ink, stopOpacity: 0.05 }} />
							<stop offset="100%" style={{ stopColor: LAB.ink, stopOpacity: 0 }} />
						</linearGradient>
					</defs>

					<g clipPath={`url(#${uid}-field)`}>
						{/* surface, with a faint band every ten yards */}
						<rect x={PAD} y={FIELD_TOP} width={FIELD_W} height={FIELD_H} fill={LAB.field} />
						{Array.from({ length: 10 }).map((_, i) => (
							<rect key={i} x={ux(i * 10)} y={FIELD_TOP} width={(10 / UNITS) * FIELD_W} height={FIELD_H} fill={LAB.fieldBand} opacity={i % 2 ? 1 : 0} />
						))}
						<rect x={PAD} y={FIELD_TOP} width={FIELD_W} height={FIELD_H} fill={`url(#${uid}-sheen)`} />

						{/* end zones in team colors: the offense's own on the left, the one it attacks on the right */}
						<rect x={PAD} y={FIELD_TOP} width={(10 / UNITS) * FIELD_W} height={FIELD_H} fill={driveColor} opacity={0.92} />
						<rect x={ux(100)} y={FIELD_TOP} width={(10 / UNITS) * FIELD_W} height={FIELD_H} fill={otherColor} opacity={0.92} />
						<text
							transform={`translate(${ux(-5)} ${FIELD_TOP + FIELD_H / 2}) rotate(-90)`}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={21}
							fontWeight={800}
							letterSpacing="0.32em"
							fill={onDrive}
						>
							{driveName.toUpperCase()}
						</text>
						<text
							transform={`translate(${ux(105)} ${FIELD_TOP + FIELD_H / 2}) rotate(90)`}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={21}
							fontWeight={800}
							letterSpacing="0.32em"
							fill={onOther}
						>
							{otherName.toUpperCase()}
						</text>

						{/* yard lines, hash marks and numbers */}
						{Array.from({ length: 21 }).map((_, i) => {
							const yard = i * 5
							const goal = yard === 0 || yard === 100
							return (
								<line
									key={yard}
									x1={ux(yard)}
									x2={ux(yard)}
									y1={FIELD_TOP}
									y2={FIELD_BOTTOM}
									stroke={LAB.fieldLine}
									strokeOpacity={goal ? 1 : yard % 10 === 0 ? 0.9 : 0.45}
									strokeWidth={goal ? 3 : yard === 50 ? 2 : 1.25}
								/>
							)
						})}
						{Array.from({ length: 101 }).map((_, i) =>
							i % 5 === 0 ? null : (
								<g key={i} stroke={LAB.fieldLine} strokeOpacity={0.55}>
									<line x1={ux(i)} x2={ux(i)} y1={FIELD_TOP + FIELD_H * 0.4} y2={FIELD_TOP + FIELD_H * 0.4 + 5} />
									<line x1={ux(i)} x2={ux(i)} y1={FIELD_TOP + FIELD_H * 0.86 - 5} y2={FIELD_TOP + FIELD_H * 0.86} />
								</g>
							)
						)}
						{yardNumbers.map((yard) => {
							const num = yard <= 50 ? yard : 100 - yard
							return (
								<g key={yard} fill={LAB.fieldNum} fontSize={14} fontWeight={700} textAnchor="middle" className="tabular-nums">
									<text x={ux(yard)} y={FIELD_TOP + 22}>{num}</text>
									<text x={ux(yard)} y={FIELD_BOTTOM - 12}>{num}</text>
								</g>
							)
						})}

						{/* how far the drive has come */}
						{trail.length > 0 && (
							<line
								x1={ux(frames[0].from)}
								x2={ux(trail[trail.length - 1].to)}
								y1={BASE_Y}
								y2={BASE_Y}
								stroke={driveColor}
								strokeOpacity={0.14}
								strokeWidth={18}
								strokeLinecap="round"
							/>
						)}

						{/* line of scrimmage and first-down marker, under the ball */}
						{fdYard != null && fdYard <= 100 && (
							<g style={{ pointerEvents: "none" }}>
								<line x1={ux(fdYard)} x2={ux(fdYard)} y1={FIELD_TOP} y2={FIELD_BOTTOM} stroke={LAB.firstDown} strokeOpacity={0.2} strokeWidth={10} />
								<line x1={ux(fdYard)} x2={ux(fdYard)} y1={FIELD_TOP} y2={FIELD_BOTTOM} stroke={LAB.firstDown} strokeWidth={2.5} />
							</g>
						)}
						{!finished && (
							<g style={{ pointerEvents: "none" }}>
								<line x1={ux(losYard)} x2={ux(losYard)} y1={FIELD_TOP} y2={FIELD_BOTTOM} stroke={LAB.scrimmage} strokeOpacity={0.2} strokeWidth={10} />
								<line x1={ux(losYard)} x2={ux(losYard)} y1={FIELD_TOP} y2={FIELD_BOTTOM} stroke={LAB.scrimmage} strokeWidth={2.5} />
							</g>
						)}

						{/* every play so far, as a bar (run) or arc (pass, punt, kick) */}
						<g fill="none" style={{ pointerEvents: "none" }}>
							{trail.map((f) => {
								const st = playStyle(f)
								return (
									<g key={f.n}>
										<path d={playPath(f)} stroke={driveColor} strokeOpacity={st.opacity} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" />
										<circle cx={ux(f.outcome === "incomplete" ? Math.min(100, f.from + 9) : f.to)} cy={BASE_Y} r={4.5} fill={LAB.surface} stroke={driveColor} strokeWidth={2.5} />
										{f.outcome === "incomplete" && (
											<g stroke={LAB.inkMuted} strokeWidth={2} strokeLinecap="round" transform={`translate(${ux(Math.min(100, f.from + 9))} ${BASE_Y - 14})`}>
												<line x1={-4} y1={-4} x2={4} y2={4} />
												<line x1={-4} y1={4} x2={4} y2={-4} />
											</g>
										)}
									</g>
								)
							})}
							{/* the play being drawn right now */}
							{animating &&
								(() => {
									const f = frames[cursor]
									const st = playStyle(f)
									return (
										<path
											d={playPath(f)}
											pathLength={1}
											stroke={driveColor}
											strokeOpacity={st.dash ? progress! * st.opacity : st.opacity}
											strokeWidth={st.width}
											strokeDasharray={st.dash ?? "1"}
											strokeDashoffset={st.dash ? undefined : 1 - progress!}
											strokeLinecap="round"
										/>
									)
								})()}
						</g>

						{/* ball, shadow and the burst when a drive ends in points */}
						<ellipse cx={ux(ballYard)} cy={BASE_Y + 22} rx={Math.max(6, 15 - lift / 10)} ry={3.5} fill={LAB.ink} opacity={0.16} />
						{!animating && last && (last.outcome === "touchdown" || last.outcome === "fieldgoal-good") && (
							<circle key={`burst-${driveIdx}-${eff}`} className="lab-burst" cx={ux(ballYard)} cy={BASE_Y} r={30} fill="none" stroke={driveColor} strokeWidth={3} />
						)}
						<Ball x={ux(ballYard)} y={ballY} angle={angle} color={driveColor} />

						{/* outcome tag once the play is over */}
						{!animating && last && (
							<g transform={`translate(${Math.min(W - PAD - 80, Math.max(PAD + 80, ux(ballYard)))} ${FIELD_TOP + 56})`} style={{ pointerEvents: "none" }}>
								<rect x={-68} y={-15} width={136} height={28} rx={14} fill={LAB.ink} />
								<text x={0} y={4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill={LAB.surface} letterSpacing="0.05em">
									{outcomeTag(last)}
								</text>
							</g>
						)}
					</g>

					{/* sideline frame */}
					<rect x={PAD} y={FIELD_TOP} width={FIELD_W} height={FIELD_H} rx={12} fill="none" stroke={LAB.fieldLine} strokeWidth={1.5} />

					{/* flags for the two lines, outside the field so nothing covers them */}
					{fdYard != null && fdYard <= 100 && (
						<g style={{ pointerEvents: "none" }}>
							<rect x={ux(fdYard) - 38} y={FIELD_TOP - 28} width={76} height={21} rx={10.5} fill={LAB.firstDown} />
							<text x={ux(fdYard)} y={FIELD_TOP - 13.5} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#14171c" letterSpacing="0.05em">
								1ST DOWN
							</text>
						</g>
					)}
					{!finished && (
						<g style={{ pointerEvents: "none" }}>
							<rect x={Math.min(W - PAD - 62, Math.max(PAD, ux(losYard) - 62))} y={FIELD_BOTTOM + 8} width={124} height={21} rx={10.5} fill={LAB.scrimmage} />
							<text x={Math.min(W - PAD - 62, Math.max(PAD, ux(losYard) - 62)) + 62} y={FIELD_BOTTOM + 22.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#ffffff" letterSpacing="0.05em">
								LINE OF SCRIMMAGE
							</text>
						</g>
					)}
				</svg>
			</div>

			{/* what the marks on the field are */}
			<ul className="flex flex-wrap gap-x-5 gap-y-2 px-4 pt-2 text-xs text-lab-soft sm:px-6" aria-label="Field legend">
				<li className="inline-flex items-center gap-2">
					<span className="h-3.5 w-1 rounded-full" style={{ background: LAB.scrimmage }} aria-hidden />
					Line of scrimmage
				</li>
				<li className="inline-flex items-center gap-2">
					<span className="h-3.5 w-1 rounded-full" style={{ background: LAB.firstDown }} aria-hidden />
					First-down marker
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="30" height="14" viewBox="0 0 30 14" aria-hidden>
						<path d="M2 12 Q15 -4 28 12" fill="none" stroke={LAB.inkSoft} strokeWidth="2.5" strokeLinecap="round" />
					</svg>
					Pass or kick
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="30" height="14" viewBox="0 0 30 14" aria-hidden>
						<line x1="3" y1="7" x2="27" y2="7" stroke={LAB.inkSoft} strokeWidth="5" strokeLinecap="round" />
					</svg>
					Run
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="30" height="14" viewBox="0 0 30 14" aria-hidden>
						<line x1="3" y1="7" x2="27" y2="7" stroke={LAB.inkSoft} strokeWidth="4" strokeLinecap="round" strokeDasharray="7 5" />
					</svg>
					Loss or penalty
				</li>
			</ul>

			{/* transport */}
			<div className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-2 sm:px-6">
				<button
					type="button"
					onClick={toggle}
					className="inline-flex h-10 items-center gap-2 rounded-full bg-lab-ink px-4 text-sm font-semibold text-lab-surface transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"
					aria-label={playing ? "Pause drive" : finished ? "Replay drive" : "Play drive"}
				>
					{playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
					{playing ? "Pause" : finished ? "Replay" : "Play drive"}
				</button>
				<button
					type="button"
					onClick={() => go(eff - 1)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					aria-label="Previous play"
				>
					<ChevronLeft className="h-4 w-4" aria-hidden />
				</button>
				<button
					type="button"
					onClick={() => go(eff + 1)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					aria-label="Next play"
				>
					<ChevronRight className="h-4 w-4" aria-hidden />
				</button>
				<button
					type="button"
					onClick={() => go(0)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					aria-label="Restart drive"
				>
					<RotateCcw className="h-4 w-4" aria-hidden />
				</button>
				<div className="inline-flex overflow-hidden rounded-full border border-lab-line-strong" role="group" aria-label="Replay speed">
					{SPEEDS.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setSpeed(s)}
							aria-pressed={speed === s}
							className={
								"h-10 px-3 text-xs font-semibold tabular-nums transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink " +
								(speed === s ? "bg-lab-ink text-lab-surface" : "text-lab-muted hover:text-lab-ink")
							}
						>
							{s}x
						</button>
					))}
				</div>
				<span className="ml-auto font-mono text-xs tabular-nums text-lab-muted">
					Play {Math.min(eff + (finished ? 0 : 1), n)} of {n}
				</span>
			</div>

			{/* what just happened */}
			<div className="border-t border-lab-line bg-lab-tint px-4 py-4 sm:px-6" aria-live="polite">
				<p className="min-h-[2.75rem] text-sm leading-relaxed text-lab-ink sm:text-base">
					{shownText ?? " "}
				</p>
				{finished && (
					<p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: tone === "score" ? LAB.ink : LAB.inkMuted }}>
						{resultLabel(drive.result)}
					</p>
				)}
			</div>

			{/* every play in the drive */}
			<div className="border-t border-lab-line px-2 py-2 sm:px-4">
				<h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">Play by play</h3>
				<ol className="divide-y divide-lab-line">
					{frames.map((f, i) => (
						<li key={f.n}>
							<button
								type="button"
								onClick={() => go(i + 1)}
								aria-current={eff === i + 1 ? "true" : undefined}
								className={
									"flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink " +
									(eff === i + 1 ? "bg-lab-hover" : "")
								}
							>
								<span className="w-20 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-lab-muted">{f.downLabel || "Kick"}</span>
								<span className="min-w-0 flex-1 text-sm leading-snug text-lab-ink">{f.text}</span>
								<span className="shrink-0 pt-0.5 font-mono text-xs font-semibold tabular-nums text-lab-soft">
									{f.outcome === "gain" || f.outcome === "loss" ? `${f.yards > 0 ? "+" : f.yards < 0 ? "−" : ""}${Math.abs(f.yards)}` : ""}
								</span>
							</button>
						</li>
					))}
				</ol>
			</div>
		</div>
	)
}
