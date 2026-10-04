"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react"

import { Chip, DriveSummary, FilterRow, PlayFilters, Scrubber } from "@/components/lab/DriveBits"
import { useTimeline } from "@/components/lab/useTimeline"
import {
	framesForDrive,
	HASH,
	isFiltering,
	matchesFilter,
	NO_FILTER,
	playFacts,
	playKind,
	resultLabel,
	resultTone,
	yardLineName,
	type Frame,
	type PlayFilter,
} from "@/lib/lab/drive"
import { COMPACT, DEPTH, MAX_YARD, MIN_YARD, WIDE, cameraFor, centerline, pathFor, pointAlong, ribbon, sliceTo, viewFrom, type Geom } from "@/lib/lab/field"
import { LAB } from "@/lib/lab/theme"
import { stateAt } from "@/lib/lab/timeline"
import type { Drive } from "@/lib/lab/types"

const SPEEDS = [1, 2] as const

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

/** Eases a number toward its target, so the camera glides instead of jumping. */
function useSmooth(target: number, reduced: boolean) {
	const [value, setValue] = React.useState(target)
	const current = React.useRef(target)
	React.useEffect(() => {
		if (reduced || typeof requestAnimationFrame === "undefined") {
			current.current = target
			setValue(target)
			return
		}
		let raf = 0
		let last = performance.now()
		const tick = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000)
			last = now
			current.current += (target - current.current) * (1 - Math.exp(-dt * 5))
			if (Math.abs(target - current.current) < 0.02) {
				current.current = target
				setValue(target)
				return
			}
			setValue(current.current)
			raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [target, reduced])
	return value
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
		default: {
			const gained = f.yards === 0 ? "NO GAIN" : `${f.yards > 0 ? "+" : "−"}${Math.abs(f.yards)} YDS`
			return f.lane && (f.type === "run" || f.type === "pass") ? `${gained} · ${LANE_NAME[f.lane]}` : gained
		}
	}
}

const LANE_NAME = { L: "LEFT", M: "MIDDLE", R: "RIGHT" } as const

type Style = { width: number; taper: boolean; dashed: boolean; opacity: number }
function ribbonStyle(f: Frame): Style {
	if (f.outcome === "incomplete") return { width: 7, taper: true, dashed: true, opacity: 0.5 }
	if (f.outcome === "loss" || f.outcome === "penalty") return { width: 13, taper: false, dashed: true, opacity: 0.45 }
	if (f.arc) return { width: 14, taper: true, dashed: false, opacity: 0.78 }
	return { width: 18, taper: false, dashed: false, opacity: 0.8 }
}

type View = ReturnType<typeof viewFrom>

function OutcomeTag({ text, x, y, k, g, opacity = 1 }: { text: string; x: number; y: number; k: number; g: Geom; opacity?: number }) {
	const w = Math.max(136 * k, text.length * 8.6 * k + 32 * k)
	const cx = Math.min(g.W - w / 2 - 8, Math.max(w / 2 + 8, x))
	return (
		<g transform={`translate(${cx} ${y})`} style={{ pointerEvents: "none" }} opacity={opacity}>
			<rect x={-w / 2} y={-15 * k} width={w} height={28 * k} rx={14 * k} fill={LAB.ink} />
			<text x={0} y={4.5 * k} textAnchor="middle" fontSize={12 * k} fontWeight={800} fill={LAB.surface} letterSpacing="0.05em">
				{text}
			</text>
		</g>
	)
}

/** The ball: a clean puck in the offense's color with a small football inside. */
function Ball({ x, y, scale, angle, color }: { x: number; y: number; scale: number; angle: number; color: string }) {
	return (
		<g transform={`translate(${x} ${y}) scale(${scale})`} style={{ pointerEvents: "none" }}>
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

function EndZoneName({ view, yard, name, color, compact }: { view: View; yard: number; name: string; color: string; compact: boolean }) {
	const c = view.pt(yard, 0)
	const size = Math.max(compact ? 22 : 0, 30 * c.s)
	return (
		<text x={c.x} y={c.y + size * 0.3} textAnchor="middle" fontSize={size} fontWeight={800} letterSpacing="0.3em" fill={color} style={{ pointerEvents: "none" }}>
			{name.toUpperCase()}
		</text>
	)
}

/** A line across the field (line of scrimmage, first down). Its label sits outside the sidelines, or inside on a phone. */
function Line({ view, yard, color, label, compact }: { view: View; yard: number; color: string; label: string; compact: boolean }) {
	const a = view.pt(yard, -0.53)
	const b = view.pt(yard, 0.53)
	const size = Math.max(compact ? 17 : 0, 22 * a.s)
	return (
		<g style={{ pointerEvents: "none" }}>
			<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeOpacity={0.25} strokeWidth={12 * a.s} />
			<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={Math.max(2, 4 * a.s)} />
			<g fill={color} fontSize={size} fontWeight={800} letterSpacing="0.05em">
				{compact ? (
					<text x={view.pt(yard, -0.47).x} y={a.y - size * 0.35} textAnchor="start">
						{label}
					</text>
				) : (
					<>
						<text x={view.pt(yard, -0.585).x} y={a.y + size * 0.35} textAnchor="end">{label}</text>
						<text x={view.pt(yard, 0.585).x} y={a.y + size * 0.35} textAnchor="start">{label}</text>
					</>
				)}
			</g>
		</g>
	)
}

/** The mark where a play ended: a filled ring, a hollow ring for an incompletion, a diamond for a turnover. */
function EndMarker({ x, y, s, k, f, color }: { x: number; y: number; s: number; k: number; f: Frame; color: string }) {
	const r = (7 * s + 3) * k
	if (f.outcome === "incomplete") {
		return (
			<g>
				<circle cx={x} cy={y} r={r} fill="none" stroke={LAB.ink} strokeWidth={2.5} />
				<g stroke={LAB.ink} strokeWidth={2} strokeLinecap="round">
					<line x1={x - r * 0.4} y1={y - r * 0.4} x2={x + r * 0.4} y2={y + r * 0.4} />
					<line x1={x - r * 0.4} y1={y + r * 0.4} x2={x + r * 0.4} y2={y - r * 0.4} />
				</g>
			</g>
		)
	}
	if (f.outcome === "turnover") {
		return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={2} fill={LAB.bad} stroke={LAB.surface} strokeWidth={2} transform={`rotate(45 ${x} ${y})`} />
	}
	return (
		<g>
			{f.outcome === "touchdown" && <circle cx={x} cy={y} r={r + 6} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />}
			<circle cx={x} cy={y} r={r} fill={color} stroke={LAB.surface} strokeWidth={2.5} />
		</g>
	)
}

/** True once the field is narrow enough that the phone layout (taller, bigger labels) reads better. */
function useCompact() {
	const ref = React.useRef<HTMLDivElement>(null)
	const [compact, setCompact] = React.useState(false)
	const useLayout = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect
	useLayout(() => {
		const el = ref.current
		if (!el) return
		const measure = () => {
			const w = el.getBoundingClientRect().width
			setCompact(w > 0 && w < 640)
		}
		measure()
		if (typeof ResizeObserver === "undefined") return
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])
	return { ref, compact }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type Spot = { yard: number; u: number }

type Props = { drives: Drive[]; teamAbbr: string; teamName: string; oppName: string }

export default function DriveReplay({ drives, teamAbbr, teamName, oppName }: Props) {
	const [who, setWho] = React.useState<"all" | "team" | "opp">("all")
	const [quarter, setQuarter] = React.useState(0)
	const [filter, setFilter] = React.useState<PlayFilter>(NO_FILTER)
	const [driveIdx, setDriveIdx] = React.useState(() => Math.max(0, drives.findIndex((d) => d.team === teamAbbr)))

	const qOf = (d: Drive) => Math.min(5, d.q)
	const fits = (d: Drive, w: typeof who, q: number) => (w === "all" || (w === "team") === (d.team === teamAbbr)) && (q === 0 || qOf(d) === q)
	const quarters = React.useMemo(() => Array.from(new Set(drives.map((d) => Math.min(5, d.q)))).sort((a, b) => a - b), [drives])
	const visible = drives.map((d, i) => ({ d, i })).filter(({ d }) => fits(d, who, quarter))

	const applyFilters = (w: typeof who, q: number) => {
		// A combination with no drives falls back to all quarters.
		const qq = drives.some((d) => fits(d, w, q)) ? q : 0
		setWho(w)
		setQuarter(qq)
		const vis = drives.map((d, i) => ({ d, i })).filter(({ d }) => fits(d, w, qq))
		if (vis.length && !vis.some((v) => v.i === driveIdx)) setDriveIdx(vis[0].i)
	}

	const drive = drives[driveIdx]
	if (!drive) return null

	return (
		<div className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface text-lab-ink shadow-[var(--lab-shadow)]">
			{/* drive picker */}
			<div className="space-y-2 border-b border-lab-line px-2 py-3 sm:px-4">
				{drives.length > 4 && (
					<div className="space-y-2 px-2">
						<FilterRow label="Offense">
							<Chip active={who === "all"} onClick={() => applyFilters("all", quarter)}>
								Both
							</Chip>
							<Chip active={who === "team"} onClick={() => applyFilters("team", quarter)}>
								{teamName}
							</Chip>
							<Chip active={who === "opp"} onClick={() => applyFilters("opp", quarter)}>
								{oppName}
							</Chip>
						</FilterRow>
						{quarters.length > 1 && (
							<FilterRow label="Quarter">
								<Chip active={quarter === 0} onClick={() => applyFilters(who, 0)}>
									All
								</Chip>
								{quarters.map((q) => (
									<Chip key={q} active={quarter === q} disabled={!drives.some((d) => fits(d, who, q))} onClick={() => applyFilters(who, q)}>
										{q === 5 ? "OT" : `Q${q}`}
									</Chip>
								))}
							</FilterRow>
						)}
					</div>
				)}
				<div className="flex gap-2 overflow-x-auto px-2 pb-1" role="tablist" aria-label="Drives">
					{visible.map(({ d, i }) => {
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

			<DriveStage key={driveIdx} drive={drive} teamAbbr={teamAbbr} teamName={teamName} oppName={oppName} filter={filter} onFilter={setFilter} />
		</div>
	)
}

type StageProps = {
	drive: Drive
	teamAbbr: string
	teamName: string
	oppName: string
	filter: PlayFilter
	onFilter: (f: PlayFilter) => void
}

/** One drive: the field, the scrubber, and everything under it. Remounts for each drive, so it always starts at the snap. */
function DriveStage({ drive, teamAbbr, teamName, oppName, filter, onFilter }: StageProps) {
	const reduced = usePrefersReducedMotion()
	const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "")
	const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1)
	const [hover, setHover] = React.useState<number | null>(null)
	const { ref: fieldRef, compact } = useCompact()
	const g = compact ? COMPACT : WIDE
	const k = compact ? 1.45 : 1

	const frames = React.useMemo(() => framesForDrive(drive), [drive])
	const paths = React.useMemo(() => frames.map(pathFor), [frames])
	const n = frames.length
	const tl = useTimeline(n, reduced, speed)
	const st = stateAt(tl.pos, n)
	const eff = st.done
	const animating = st.moving != null
	const mi = st.moving ?? 0
	const finished = eff >= n

	const matches = React.useMemo(() => frames.map((f) => matchesFilter(f, filter)), [frames, filter])
	const filtering = isFiltering(filter)
	const shown = matches.filter(Boolean).length

	const isTeam = drive.team === teamAbbr
	const driveColor = isTeam ? LAB.team : LAB.opp
	const otherColor = isTeam ? LAB.opp : LAB.team
	const onDrive = isTeam ? LAB.onTeam : LAB.onOpp
	const onOther = isTeam ? LAB.onOpp : LAB.onTeam
	const driveName = isTeam ? teamName : oppName
	const otherName = isTeam ? oppName : teamName

	// The camera follows the ball down the field.
	const animP = (i: number) => (frames[i].arc ? st.progress : easeOut(st.progress))
	let focus = 0
	if (n > 0) {
		if (animating) focus = pointAlong(paths[mi], animP(mi)).yard
		else if (eff >= n) focus = paths[n - 1].end.yard
		else if (eff > 0) focus = lerp(paths[eff - 1].end.yard, paths[eff].start.yard, st.settle)
		else focus = paths[0].start.yard
	}
	const cam = useSmooth(cameraFor(focus), reduced)

	if (n === 0) return null

	const upcoming = frames[Math.min(eff, n - 1)]
	const last = eff > 0 ? frames[eff - 1] : null
	const shownIdx = animating ? mi : eff > 0 ? eff - 1 : null
	const shownFrame = shownIdx != null ? frames[shownIdx] : null

	// Where the ball is, how high it is in the air, and which way it points.
	const view = viewFrom(cam, g)
	let ballSpot: { yard: number; u: number; lift: number }
	let angle = 0
	if (animating) {
		const f = frames[mi]
		const at = (p: number) => pointAlong(paths[mi], f.arc ? p : easeOut(p))
		ballSpot = at(st.progress)
		const a0 = at(Math.max(0, st.progress - 0.04))
		const p0 = view.pt(a0.yard, a0.u, a0.lift)
		const p1 = view.pt(ballSpot.yard, ballSpot.u, ballSpot.lift)
		if (f.arc) angle = Math.max(-40, Math.min(40, (Math.atan2(p1.y - p0.y, Math.max(0.5, p1.x - p0.x) * 3) * 180) / Math.PI))
	} else {
		let rest: Spot
		if (eff <= 0) rest = paths[0].start
		else if (eff >= n) rest = paths[n - 1].end
		else {
			// Spot the ball for the next snap: it eases from where the last play ended to the next line of scrimmage.
			const a = paths[eff - 1].end
			const b = paths[eff].start
			rest = { yard: lerp(a.yard, b.yard, st.settle), u: lerp(a.u, b.u, st.settle) }
		}
		ballSpot = { yard: rest.yard, u: rest.u, lift: 0 }
	}
	const ball = view.pt(ballSpot.yard, ballSpot.u, ballSpot.lift)
	const ground = view.pt(ballSpot.yard, ballSpot.u)

	const losYard = finished ? frames[n - 1].to : upcoming.from
	const fdYard = finished ? null : upcoming.firstDownAt
	const trail = frames.slice(0, eff)

	const status = finished
		? { head: resultLabel(drive.result).toUpperCase(), sub: `${n} plays, ${drive.yards} yards${drive.top ? `, ${drive.top}` : ""}` }
		: { head: upcoming.downLabel || "Kick", sub: yardLineName(upcoming.from) }

	const shownText = animating ? null : last?.text ?? `${driveName} start at ${yardLineName(frames[0].from)}.`
	const tone = resultTone(drive.result)

	// How strongly each play's route is drawn: the latest in full, the rest softer; a filter or a hover overrides that.
	const dimFor = (i: number) => {
		if (filtering) return matches[i] ? 1 : 0.14
		if (hover != null) return i === hover ? 1 : 0.32
		return i === shownIdx ? 1 : 0.62
	}

	const step = (delta: number) => {
		const base = tl.targetRef.current ?? eff
		tl.seek(Math.max(0, Math.min(n, Math.round(base) + delta)))
	}
	const toggle = () => (tl.playing ? tl.pause() : tl.play())

	// What is in view.
	const lo = Math.floor((cam - 4) / 5) * 5
	const hi = cam + DEPTH + 10
	const inView = (a: number, b: number) => b >= cam - 3 && a <= cam + DEPTH + 10
	const bands: number[] = []
	for (let b = 0; b < 100; b += 10) if ((b / 10) % 2 === 1 && inView(b, b + 10)) bands.push(b)
	const lines: number[] = []
	for (let y = Math.max(0, lo); y <= Math.min(100, hi); y += 5) lines.push(y)
	const showOwnEnd = inView(MIN_YARD, 0)
	const showFarEnd = inView(100, MAX_YARD)
	const poly = (y0: number, y1: number, u0: number, u1: number) =>
		[view.pt(y0, u0), view.pt(y1, u0), view.pt(y1, u1), view.pt(y0, u1)].map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")
	// Short tick marks every yard along the sidelines and the hash marks.
	const tickPaths = [-0.5, -HASH, HASH, 0.5].map((u) => {
		const edge = Math.abs(u) === 0.5
		const half = edge ? 0.012 : 0.014
		// Along a sideline the tick points inward; on a hash mark it is centered.
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

	// Routes: soft glow under every ribbon, drawn as one blurred layer so it stays cheap.
	const wk = compact ? 0.85 : 1
	const routes: { key: string; d: string; dash: string | null; style: Style; dim: number }[] = []
	const addRoute = (key: string, samples: ReturnType<typeof sliceTo>, f: Frame, dim: number) => {
		const style = ribbonStyle(f)
		const d = ribbon(samples, view, style.width * wk, style.taper)
		if (d) routes.push({ key, d, dash: style.dashed ? centerline(samples, view) : null, style, dim })
	}
	trail.forEach((f, i) => addRoute(`t${f.n}`, paths[i].samples, f, dimFor(i)))
	if (animating) addRoute("live", sliceTo(paths[mi], animP(mi)), frames[mi], filtering ? (matches[mi] ? 1 : 0.14) : 1)

	const hoverFrame = hover != null && hover < eff ? frames[hover] : null
	const hoverAt = hoverFrame ? view.pt(paths[hover!].end.yard, paths[hover!].end.u) : null

	return (
		<>
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

			<DriveSummary drive={drive} frames={frames} />

			{/* the field, seen from behind the offense and looking down the field */}
			<div ref={fieldRef} className="mx-auto w-full max-w-[920px] px-2 pt-3 sm:px-4">
				<svg
					viewBox={`0 0 ${g.W} ${g.H}`}
					className="block h-auto w-full"
					role="img"
					aria-label={`${driveName} drive ${drive.n}, ${n} plays, ${drive.yards} yards, ending in ${resultLabel(drive.result).toLowerCase()}. The offense moves up the screen toward the ${otherName} end zone.`}
				>
					<defs>
						<linearGradient id={`${uid}-fog`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" style={{ stopColor: LAB.surface, stopOpacity: 1 }} />
							<stop offset="100%" style={{ stopColor: LAB.surface, stopOpacity: 0 }} />
						</linearGradient>
						<filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
							<feGaussianBlur stdDeviation={compact ? 4 : 5} />
						</filter>
					</defs>

					{/* surface, bands every ten yards, end zones in team colors */}
					<polygon points={poly(Math.max(MIN_YARD, lo), Math.min(MAX_YARD, hi), -0.5, 0.5)} fill={LAB.field} />
					{bands.map((b) => (
						<polygon key={b} points={poly(b, b + 10, -0.5, 0.5)} fill={LAB.fieldBand} />
					))}
					{showOwnEnd && <polygon points={poly(MIN_YARD, 0, -0.5, 0.5)} fill={driveColor} opacity={0.9} />}
					{showFarEnd && <polygon points={poly(100, MAX_YARD, -0.5, 0.5)} fill={otherColor} opacity={0.9} />}
					{showOwnEnd && <EndZoneName view={view} yard={-5} name={driveName} color={onDrive} compact={compact} />}
					{showFarEnd && <EndZoneName view={view} yard={105} name={otherName} color={onOther} compact={compact} />}

					{/* sidelines */}
					<polygon points={poly(Math.max(MIN_YARD, lo), Math.min(MAX_YARD, hi), -0.56, -0.5)} fill={LAB.fieldLine} opacity={0.55} />
					<polygon points={poly(Math.max(MIN_YARD, lo), Math.min(MAX_YARD, hi), 0.5, 0.56)} fill={LAB.fieldLine} opacity={0.55} />

					{/* yard lines and numbers */}
					{lines.map((y) => {
						const a = view.pt(y, -0.5)
						const b = view.pt(y, 0.5)
						const goal = y === 0 || y === 100
						return <line key={y} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LAB.fieldLine} strokeWidth={(goal ? 3.2 : y % 10 === 0 ? 2 : 1.2) * a.s + 0.3} />
					})}
					{lines
						.filter((y) => y % 10 === 0 && y > 0 && y < 100)
						// On a phone, leave the bottom corners to the LEFT / RIGHT labels.
						.filter((y) => !compact || view.pt(y, 0).y < g.BOTTOM - 30)
						.map((y) => {
							// Outside the sidelines on a wide field; painted on the turf on a phone, where there is no room outside.
							const l = view.pt(y, compact ? -0.46 : -0.58)
							const r = view.pt(y, compact ? 0.46 : 0.58)
							const num = y <= 50 ? y : 100 - y
							const size = Math.max(compact ? 20 : 0, 30 * l.s)
							return (
								<g key={y} fill={LAB.fieldNum} fontSize={size} fontWeight={700} className="tabular-nums" style={{ pointerEvents: "none" }}>
									<text x={l.x} y={l.y + size * 0.35} textAnchor={compact ? "start" : "end"}>{num}</text>
									<text x={r.x} y={r.y + size * 0.35} textAnchor={compact ? "end" : "start"}>{num}</text>
								</g>
							)
						})}
					{tickPaths.map((t) => (
						<path key={t.key} d={t.d} stroke={LAB.fieldLine} strokeOpacity={0.7} strokeWidth={1} fill="none" />
					))}

					{/* far end of the field fades into the card */}
					<rect x={0} y={0} width={g.W} height={g.H * 0.42} fill={`url(#${uid}-fog)`} style={{ pointerEvents: "none" }} />

					{/* first-down marker and line of scrimmage */}
					{fdYard != null && fdYard <= 100 && <Line view={view} yard={fdYard} color={LAB.firstDown} label="1ST" compact={compact} />}
					{!finished && <Line view={view} yard={losYard} color={LAB.scrimmage} label="LOS" compact={compact} />}

					{/* every play so far: a glowing ribbon for the route */}
					<g style={{ pointerEvents: "none" }}>
						<g filter={`url(#${uid}-glow)`}>
							{routes.map((r) => (
								<path key={r.key} d={r.d} fill={driveColor} opacity={r.style.opacity * 0.7 * r.dim} />
							))}
						</g>
						{routes.map((r) => (
							<g key={r.key} opacity={r.dim}>
								<path d={r.d} fill={driveColor} opacity={r.style.opacity} />
								{r.dash && <path d={r.dash} fill="none" stroke={driveColor} strokeWidth={2.5} strokeDasharray="2 7" strokeLinecap="round" />}
							</g>
						))}
					</g>

					{/* where each play ended. Tap or click one to jump to that play. */}
					{trail.map((f, i) => {
						const path = paths[i]
						const r = view.pt(path.end.yard, path.end.u)
						const c = path.catchSpot ? view.pt(path.catchSpot.yard, path.catchSpot.u) : null
						return (
							<g
								key={f.n}
								opacity={dimFor(i)}
								className="cursor-pointer"
								aria-hidden
								onPointerEnter={(e) => e.pointerType === "mouse" && setHover(i)}
								onPointerLeave={() => setHover((h) => (h === i ? null : h))}
								onClick={() => {
									setHover(null)
									tl.seek(i + 1)
								}}
							>
								{c && <circle cx={c.x} cy={c.y} r={(3.5 * c.s + 1.5) * k} fill={driveColor} />}
								<circle cx={r.x} cy={r.y} r={(7 * r.s + 3) * k + 10} fill="transparent" />
								<g className="lab-pop">
									<EndMarker x={r.x} y={r.y} s={r.s} k={k} f={f} color={driveColor} />
								</g>
							</g>
						)
					})}

					{/* ball, shadow and the burst when a drive ends in points */}
					<ellipse cx={ground.x} cy={ground.y + 6 * ground.s * k} rx={Math.max(5, 16 * ground.s * k - ballSpot.lift * 0.05)} ry={4 * ground.s * k} fill={LAB.ink} opacity={0.18} />
					{!animating && last && (last.outcome === "touchdown" || last.outcome === "fieldgoal-good") && (
						<circle key={`burst-${eff}`} className="lab-burst" cx={ball.x} cy={ball.y} r={30 * ball.s * k} fill="none" stroke={driveColor} strokeWidth={3} />
					)}
					<Ball x={ball.x} y={ball.y} scale={Math.max(0.7, ball.s) * k} angle={angle} color={driveColor} />

					{/* outcome tag once the play is over, fading as the ball is spotted for the next snap */}
					{!animating && last && !hoverFrame && (
						<g key={`tag-${eff}`} className="lab-fade">
							<OutcomeTag
								text={outcomeTag(last)}
								x={ball.x}
								y={ball.y > 120 * k ? ball.y - (52 * ball.s + 8) * k : ball.y + (52 * ball.s + 8) * k}
								k={k}
								g={g}
								opacity={1 - st.settle}
							/>
						</g>
					)}
					{hoverFrame && hoverAt && (
						<OutcomeTag
							text={`${hoverFrame.downLabel || "Kick"} · ${outcomeTag(hoverFrame)}`}
							x={hoverAt.x}
							y={hoverAt.y > 120 * k ? hoverAt.y - (24 * hoverAt.s + 16) * k : hoverAt.y + (24 * hoverAt.s + 16) * k}
							k={k}
							g={g}
						/>
					)}

					{/* which side is which, from the offense's point of view */}
					<g fill={LAB.fieldNum} fontSize={11 * k} fontWeight={700} letterSpacing="0.16em" textAnchor="middle" style={{ pointerEvents: "none" }}>
						<text x={g.W / 2 - 0.36 * g.NEAR_W} y={g.BOTTOM + 12 + 6 * k}>LEFT</text>
						<text x={g.W / 2} y={g.BOTTOM + 12 + 6 * k}>MIDDLE</text>
						<text x={g.W / 2 + 0.36 * g.NEAR_W} y={g.BOTTOM + 12 + 6 * k}>RIGHT</text>
					</g>
				</svg>
			</div>

			{/* what the marks on the field are */}
			<ul className="flex flex-wrap gap-x-5 gap-y-2 px-4 pt-2 text-xs text-lab-soft sm:px-6" aria-label="Field legend">
				<li className="inline-flex items-center gap-2">
					<span className="h-1 w-5 rounded-full" style={{ background: LAB.scrimmage }} aria-hidden />
					Line of scrimmage
				</li>
				<li className="inline-flex items-center gap-2">
					<span className="h-1 w-5 rounded-full" style={{ background: LAB.firstDown }} aria-hidden />
					First-down marker
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="30" height="16" viewBox="0 0 30 16" aria-hidden>
						<path d="M2 14 Q15 -6 28 14" fill="none" stroke={LAB.inkSoft} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
					</svg>
					Pass or kick
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="30" height="16" viewBox="0 0 30 16" aria-hidden>
						<line x1="3" y1="8" x2="27" y2="8" stroke={LAB.inkSoft} strokeWidth="7" strokeLinecap="round" opacity="0.7" />
					</svg>
					Run
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="30" height="16" viewBox="0 0 30 16" aria-hidden>
						<line x1="3" y1="8" x2="27" y2="8" stroke={LAB.inkSoft} strokeWidth="3" strokeLinecap="round" strokeDasharray="6 5" />
					</svg>
					Loss or penalty
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
						<circle cx="8" cy="8" r="5.5" fill={LAB.inkSoft} stroke={LAB.surface} strokeWidth="2" />
					</svg>
					Where the play ended
				</li>
				<li className="inline-flex items-center gap-2">
					<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
						<circle cx="8" cy="8" r="6" fill="none" stroke={LAB.ink} strokeWidth="2" />
					</svg>
					Incomplete
				</li>
			</ul>
			<p className="px-4 pt-2 text-[11px] leading-relaxed text-lab-muted sm:px-6">
				The offense moves up the screen, so left and right are the offense&rsquo;s left and right. Each play is drawn toward the side it went. The official log records left, middle or
				right (and the gap on runs), not exact positions, so the lane is a good guide and the exact spot is not. Tap a ring to jump to that play.
			</p>

			{/* scrubber */}
			<Scrubber frames={frames} state={st} matches={matches} color={driveColor} onScrub={tl.scrub} onSeek={tl.seek} onStep={step} />

			{/* transport */}
			<div className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-3 sm:px-6">
				<button
					type="button"
					onClick={toggle}
					className="inline-flex h-10 items-center gap-2 rounded-full bg-lab-ink px-4 text-sm font-semibold text-lab-surface transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"
					aria-label={tl.playing ? "Pause drive" : finished ? "Replay drive" : "Play drive"}
				>
					{tl.playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
					{tl.playing ? "Pause" : finished ? "Replay" : "Play drive"}
				</button>
				<button
					type="button"
					onClick={() => step(-1)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					aria-label="Previous play"
				>
					<ChevronLeft className="h-4 w-4" aria-hidden />
				</button>
				<button
					type="button"
					onClick={() => step(1)}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					aria-label="Next play"
				>
					<ChevronRight className="h-4 w-4" aria-hidden />
				</button>
				<button
					type="button"
					onClick={() => tl.seek(0)}
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
			<div className="border-t border-lab-line bg-lab-tint px-4 py-4 sm:px-6">
				{shownFrame && shownIdx != null && (
					<div className="mb-2 flex flex-wrap items-center gap-1.5">
						<span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">{playKind(shownFrame)}</span>
						{playFacts(shownFrame).map((fact) => (
							<span key={fact} className="rounded-full border border-lab-line-strong bg-lab-surface px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-lab-soft">
								{fact}
							</span>
						))}
					</div>
				)}
				<p className="min-h-[2.75rem] text-sm leading-relaxed text-lab-ink sm:text-base" aria-live="polite">
					{shownText ?? " "}
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
				<PlayFilters filter={filter} onChange={onFilter} shown={shown} total={n} />
				<ol className="mt-2 divide-y divide-lab-line">
					{frames.map((f, i) => (
						<li key={f.n} style={{ opacity: matches[i] ? 1 : 0.4 }} onPointerEnter={(e) => e.pointerType === "mouse" && setHover(i)} onPointerLeave={() => setHover((h) => (h === i ? null : h))}>
							<button
								type="button"
								onClick={() => tl.seek(i + 1)}
								aria-current={eff === i + 1 ? "true" : undefined}
								className={
									"flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink " +
									(eff === i + 1 ? "bg-lab-hover" : "")
								}
							>
								<span className="w-20 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-lab-muted">{f.downLabel || "Kick"}</span>
								<span className="min-w-0 flex-1 text-sm leading-snug text-lab-ink">
									{f.text}
									<span className="mt-0.5 block text-[11px] text-lab-muted">{playKind(f)}</span>
								</span>
								<span className="shrink-0 pt-0.5 font-mono text-xs font-semibold tabular-nums text-lab-soft">
									{f.outcome === "gain" || f.outcome === "loss" ? `${f.yards > 0 ? "+" : f.yards < 0 ? "−" : ""}${Math.abs(f.yards)}` : ""}
								</span>
							</button>
						</li>
					))}
				</ol>
			</div>
		</>
	)
}
