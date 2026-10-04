"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react"

import { framesForDrive, resultLabel, resultTone, type Frame, yardLineName } from "@/lib/lab/drive"
import { LAB } from "@/lib/lab/theme"
import type { Drive } from "@/lib/lab/types"

const W = 1000
const H = 300
const PAD = 20
const FIELD_W = W - PAD * 2
const FIELD_TOP = 34
const FIELD_H = 242
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

function Football({ x, y, angle }: { x: number; y: number; angle: number }) {
	return (
		<g transform={`translate(${x} ${y}) rotate(${angle})`} style={{ pointerEvents: "none" }}>
			<ellipse cx={0} cy={0} rx={17} ry={10} fill="#8a5528" stroke="#f3e2c8" strokeWidth={1.8} />
			<line x1={-6} y1={0} x2={6} y2={0} stroke="#f3e2c8" strokeWidth={1.8} strokeLinecap="round" />
			<line x1={-3.6} y1={-3} x2={-3.6} y2={3} stroke="#f3e2c8" strokeWidth={1.4} />
			<line x1={0} y1={-3} x2={0} y2={3} stroke="#f3e2c8" strokeWidth={1.4} />
			<line x1={3.6} y1={-3} x2={3.6} y2={3} stroke="#f3e2c8" strokeWidth={1.4} />
		</g>
	)
}

export default function DriveReplay({ drives, teamAbbr, teamName, oppName }: Props) {
	const reduced = usePrefersReducedMotion()
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

	// Ball position and lift.
	let ballYard: number
	let lift = 0
	if (animating) {
		const f = frames[cursor]
		const p = f.arc ? progress! : easeOut(progress!)
		ballYard = f.from + (f.to - f.from) * p
		if (f.arc) lift = Math.sin(Math.PI * progress!) * Math.min(70, 26 + Math.abs(f.to - f.from) * 1.1)
	} else if (last) {
		ballYard = last.to
	} else {
		ballYard = frames[0].from
	}
	const ballY = FIELD_TOP + FIELD_H / 2 - lift
	const angle = animating && frames[cursor].arc ? -18 + 36 * (progress ?? 0) : 0

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
		<div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d10] text-white shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)]">
			{/* drive picker */}
			<div className="border-b border-white/10 px-2 py-3 sm:px-4">
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
									"shrink-0 rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
									(active ? "border-white/50 bg-white/10" : "border-white/10 hover:bg-white/[0.06]")
								}
							>
								<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
									<span className="inline-block h-2 w-2 rounded-full" style={{ background: mine ? LAB.team : LAB.opp }} aria-hidden />
									{mine ? teamName : oppName} &middot; Q{d.q} {d.clock}
								</div>
								<div className="mt-0.5 text-sm font-semibold" style={{ color: t === "score" ? "#fff" : "rgba(255,255,255,0.7)" }}>
									{resultLabel(d.result)}
									<span className="ml-1.5 font-normal text-white/45">
										{d.plays.length}p, {d.yards}y
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
					<span className="rounded bg-white px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-[#0b0d10]">{status.head}</span>
					<span className="text-sm text-white/60">{finished ? status.sub : `at ${status.sub}`}</span>
				</div>
				<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
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
					{/* turf */}
					<rect x={PAD} y={FIELD_TOP} width={FIELD_W} height={FIELD_H} rx={6} fill="#0d1a14" />
					{Array.from({ length: 10 }).map((_, i) => (
						<rect key={i} x={ux(i * 10)} y={FIELD_TOP} width={(10 / UNITS) * FIELD_W} height={FIELD_H} fill="#fff" opacity={i % 2 ? 0.025 : 0} />
					))}
					{/* end zones */}
					<rect x={PAD} y={FIELD_TOP} width={(10 / UNITS) * FIELD_W} height={FIELD_H} fill={driveColor} opacity={0.22} />
					<rect x={ux(100)} y={FIELD_TOP} width={(10 / UNITS) * FIELD_W} height={FIELD_H} fill={otherColor} opacity={0.22} />
					<text
						transform={`translate(${ux(-5)} ${FIELD_TOP + FIELD_H / 2}) rotate(-90)`}
						textAnchor="middle"
						fontSize={22}
						fontWeight={800}
						letterSpacing="0.3em"
						fill={driveColor}
						opacity={0.85}
					>
						{driveName.toUpperCase()}
					</text>
					<text
						transform={`translate(${ux(105)} ${FIELD_TOP + FIELD_H / 2}) rotate(90)`}
						textAnchor="middle"
						fontSize={22}
						fontWeight={800}
						letterSpacing="0.3em"
						fill={otherColor}
						opacity={0.85}
					>
						{otherName.toUpperCase()}
					</text>

					{/* yard lines */}
					{Array.from({ length: 21 }).map((_, i) => {
						const yard = i * 5
						return (
							<line
								key={yard}
								x1={ux(yard)}
								x2={ux(yard)}
								y1={FIELD_TOP}
								y2={FIELD_TOP + FIELD_H}
								stroke={LAB.yardLine}
								strokeOpacity={yard % 10 === 0 ? (yard === 0 || yard === 100 ? 0.8 : 0.4) : 0.16}
								strokeWidth={yard === 0 || yard === 100 ? 2.5 : 1.25}
							/>
						)
					})}
					{Array.from({ length: 101 }).map((_, i) =>
						i % 5 === 0 ? null : (
							<g key={i} stroke={LAB.yardLine} strokeOpacity={0.14}>
								<line x1={ux(i)} x2={ux(i)} y1={FIELD_TOP + FIELD_H * 0.36} y2={FIELD_TOP + FIELD_H * 0.36 + 5} />
								<line x1={ux(i)} x2={ux(i)} y1={FIELD_TOP + FIELD_H * 0.64 - 5} y2={FIELD_TOP + FIELD_H * 0.64} />
							</g>
						)
					)}
					{yardNumbers.map((yard) => {
						const num = yard <= 50 ? yard : 100 - yard
						return (
							<g key={yard} fill={LAB.yardLine} fillOpacity={0.55} stroke="#0d1a14" strokeWidth={6} paintOrder="stroke" fontSize={17} fontWeight={700} textAnchor="middle" className="tabular-nums">
								<text x={ux(yard)} y={FIELD_TOP + 30}>{num}</text>
								<text x={ux(yard)} y={FIELD_TOP + FIELD_H - 16}>{num}</text>
							</g>
						)
					})}

					{/* trail of the drive so far */}
					{trail.length > 0 && (
						<g style={{ pointerEvents: "none" }}>
							<polyline
								points={[frames[0].from, ...trail.map((f) => f.to)].map((v) => `${ux(v)},${FIELD_TOP + FIELD_H / 2}`).join(" ")}
								fill="none"
								stroke={driveColor}
								strokeOpacity={0.55}
								strokeWidth={5}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							{trail.map((f) => (
								<circle key={f.n} cx={ux(f.to)} cy={FIELD_TOP + FIELD_H / 2} r={4.5} fill={driveColor} stroke="#0d1a14" strokeWidth={1.5} />
							))}
						</g>
					)}

					{/* line of scrimmage and first-down marker */}
					<g style={{ pointerEvents: "none" }}>
						{fdYard != null && fdYard <= 100 && (
							<g>
								<line x1={ux(fdYard)} x2={ux(fdYard)} y1={FIELD_TOP} y2={FIELD_TOP + FIELD_H} stroke={LAB.firstDown} strokeWidth={3} />
								<rect x={ux(fdYard) - 36} y={FIELD_TOP - 24} width={72} height={19} rx={4} fill={LAB.firstDown} />
								<text x={ux(fdYard)} y={FIELD_TOP - 10} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#111" letterSpacing="0.04em">
									1ST DOWN
								</text>
							</g>
						)}
						{!finished && (
							<line x1={ux(losYard)} x2={ux(losYard)} y1={FIELD_TOP} y2={FIELD_TOP + FIELD_H} stroke={LAB.scrimmage} strokeWidth={3} />
						)}
					</g>

					{/* ball shadow and ball */}
					<ellipse cx={ux(ballYard)} cy={FIELD_TOP + FIELD_H / 2 + 16} rx={Math.max(5, 14 - lift / 12)} ry={3.5} fill="#000" opacity={0.4} />
					<Football x={ux(ballYard)} y={ballY} angle={angle} />

					{/* outcome tag once the play is over */}
					{!animating && last && (
						<g transform={`translate(${Math.min(W - PAD - 70, Math.max(PAD + 70, ux(ballYard)))} ${FIELD_TOP + FIELD_H / 2 - 52})`} style={{ pointerEvents: "none" }}>
							<rect x={-64} y={-14} width={128} height={26} rx={6} fill="#fff" />
							<text x={0} y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#0b0d10" letterSpacing="0.04em">
								{outcomeTag(last)}
							</text>
						</g>
					)}
				</svg>
			</div>

			{/* transport */}
			<div className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-2 sm:px-6">
				<button
					type="button"
					onClick={toggle}
					className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#0b0d10] transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
					aria-label={playing ? "Pause drive" : finished ? "Replay drive" : "Play drive"}
				>
					{playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
					{playing ? "Pause" : finished ? "Replay" : "Play drive"}
				</button>
				<button
					type="button"
					onClick={() => go(eff - 1)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
					aria-label="Previous play"
				>
					<ChevronLeft className="h-4 w-4" aria-hidden />
				</button>
				<button
					type="button"
					onClick={() => go(eff + 1)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
					aria-label="Next play"
				>
					<ChevronRight className="h-4 w-4" aria-hidden />
				</button>
				<button
					type="button"
					onClick={() => go(0)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
					aria-label="Restart drive"
				>
					<RotateCcw className="h-4 w-4" aria-hidden />
				</button>
				<div className="inline-flex overflow-hidden rounded-full border border-white/15" role="group" aria-label="Replay speed">
					{SPEEDS.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setSpeed(s)}
							aria-pressed={speed === s}
							className={
								"h-10 px-3 text-xs font-semibold tabular-nums transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
								(speed === s ? "bg-white/15 text-white" : "text-white/60 hover:text-white")
							}
						>
							{s}x
						</button>
					))}
				</div>
				<span className="ml-auto font-mono text-xs tabular-nums text-white/50">
					Play {Math.min(eff + (finished ? 0 : 1), n)} of {n}
				</span>
			</div>

			{/* what just happened */}
			<div className="border-t border-white/10 bg-white/[0.03] px-4 py-4 sm:px-6" aria-live="polite">
				<p className="min-h-[2.75rem] text-sm leading-relaxed text-white/90 sm:text-base">
					{shownText ?? " "}
				</p>
				{finished && (
					<p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: tone === "score" ? "#fff" : "rgba(255,255,255,0.55)" }}>
						{resultLabel(drive.result)}
					</p>
				)}
			</div>

			{/* every play in the drive */}
			<div className="border-t border-white/10 px-2 py-2 sm:px-4">
				<h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Play by play</h3>
				<ol className="divide-y divide-white/5">
					{frames.map((f, i) => (
						<li key={f.n}>
							<button
								type="button"
								onClick={() => go(i + 1)}
								aria-current={eff === i + 1 ? "true" : undefined}
								className={
									"flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " +
									(eff === i + 1 ? "bg-white/[0.08]" : "")
								}
							>
								<span className="w-20 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-white/50">{f.downLabel || "Kick"}</span>
								<span className="min-w-0 flex-1 text-sm leading-snug text-white/85">{f.text}</span>
								<span className="shrink-0 pt-0.5 font-mono text-xs font-semibold tabular-nums text-white/70">
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
