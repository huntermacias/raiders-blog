"use client"

import * as React from "react"
import { Check, Link2, Pause, Play, RotateCcw } from "lucide-react"

import Tip from "@/components/lab/Tip"
import { LEGEND, SWING_HELP, SYMBOLS, WP_HELP } from "@/lib/lab/glossary"
import { LAB } from "@/lib/lab/theme"
import type { KeyPlay, WpPoint } from "@/lib/lab/types"
import {
	REGULATION,
	clockAt,
	formatSwing,
	kindLabel,
	kindTag,
	maxTime,
	pct,
	playAt,
	scoreAt,
	swingPoints,
	wpAt,
} from "@/lib/lab/wp"

/**
 * The chart is drawn at the pixel width it is shown at, so text and markers stay a readable
 * size on a phone instead of shrinking with the picture.
 */
function layout(width: number) {
	const W = Math.max(280, Math.round(width))
	const narrow = W < 560
	const H = narrow ? 360 : Math.min(460, Math.max(320, Math.round(W * 0.44)))
	const M = narrow ? { left: 36, right: 14, top: 28, bottom: 36 } : { left: 52, right: 22, top: 30, bottom: 42 }
	return { W, H, M, PLOT_W: W - M.left - M.right, PLOT_H: H - M.top - M.bottom, narrow }
}
/** Seconds a full game takes to replay at 1x. */
const REPLAY_SECONDS = 26
const SPEEDS = [1, 2, 4] as const

type Props = {
	series: WpPoint[]
	keyPlays: KeyPlay[]
	/** [seconds elapsed, team score, opponent score] each time the score changes. */
	scores: [number, number, number][]
	teamName: string
	oppName: string
	/** Final score, [team, opponent]. */
	finalScore: [number, number]
	/** Path used when sharing, e.g. "/lab/week-3". */
	sharePath: string
	shareText: string
	/** Tuck the full key-play list behind a "show all" toggle, for places where the replay is one block among many. */
	collapsePlays?: boolean
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

function Marker({
	cx,
	cy,
	play,
	selected,
	onSelect,
	onHover,
}: {
	cx: number
	cy: number
	play: KeyPlay
	selected: boolean
	onSelect: () => void
	onHover: (on: boolean) => void
}) {
	const swing = swingPoints(play)
	const good = (swing ?? 0) >= 0
	const fill = good ? LAB.team : LAB.opp
	const tag = kindTag(play.kind)
	const label = `${kindLabel(play.kind)}, ${clockAt(play.el).q} ${play.clock}. ${play.text}`
	const turnover = play.kind === "INT" || play.kind === "FUM"
	const big = play.kind === "BIG"
	return (
		<g
			role="button"
			tabIndex={0}
			aria-label={label}
			aria-pressed={selected}
			onClick={(e) => {
				e.stopPropagation()
				onSelect()
			}}
			onPointerDown={(e) => e.stopPropagation()}
			onPointerEnter={(e) => e.pointerType === "mouse" && onHover(true)}
			onPointerLeave={() => onHover(false)}
			onFocus={() => onHover(true)}
			onBlur={() => onHover(false)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					onSelect()
				}
			}}
			style={{ cursor: "pointer", outline: "none" }}
			className="group"
		>
			<circle cx={cx} cy={cy} r={19} fill="transparent" />
			{selected && <circle cx={cx} cy={cy} r={17} fill="none" stroke={LAB.ink} strokeWidth={2} opacity={0.9} />}
			{turnover ? (
				<rect
					x={cx - 10}
					y={cy - 10}
					width={20}
					height={20}
					rx={3}
					fill={fill}
					stroke={LAB.surface}
					strokeWidth={2}
					transform={`rotate(45 ${cx} ${cy})`}
				/>
			) : big ? (
				<circle cx={cx} cy={cy} r={10} fill={LAB.surface} stroke={fill} strokeWidth={3} />
			) : (
				<circle cx={cx} cy={cy} r={11} fill={fill} stroke={LAB.surface} strokeWidth={2} />
			)}
			<text
				x={cx}
				y={cy + 3.4}
				textAnchor="middle"
				fontSize={9}
				fontWeight={700}
				fill={big ? fill : good ? LAB.onTeam : LAB.onOpp}
				style={{ pointerEvents: "none", fontFamily: "var(--font-sans), system-ui, sans-serif" }}
			>
				{tag}
			</text>
			<circle
				cx={cx}
				cy={cy}
				r={16}
				fill="none"
				stroke={LAB.ink}
				strokeWidth={2}
				className="opacity-0 group-focus-visible:opacity-100"
			/>
		</g>
	)
}

/** The hover and focus card for a marker. Lives in HTML over the chart so it can wrap and use theme colors. */
function MarkerTip({ play, x, y, width, teamName, oppName }: { play: KeyPlay; x: number; y: number; width: number; teamName: string; oppName: string }) {
	const info = SYMBOLS[play.kind]
	const swing = swingPoints(play)
	const left = Math.min(width - 130, Math.max(130, x))
	const below = y < 150
	const c = clockAt(play.el)
	return (
		<div
			className="pointer-events-none absolute z-20 w-60 rounded-xl border border-lab-line-strong bg-lab-surface p-3 text-left shadow-[var(--lab-shadow)]"
			style={{ left, top: below ? y + 22 : y - 22, transform: below ? "translateX(-50%)" : "translate(-50%, -100%)" }}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-lab-ink">
					<span className="rounded bg-lab-ink px-1.5 py-0.5 text-[10px] text-lab-surface">{info.tag}</span>
					{info.title}
				</span>
				<span className="font-mono text-[11px] tabular-nums text-lab-muted">
					{c.q} {play.clock}
				</span>
			</div>
			<p className="mt-1.5 text-xs leading-snug text-lab-soft">{play.text}</p>
			{swing != null && (
				<p className="mt-1.5 font-mono text-xs font-semibold tabular-nums text-lab-ink">
					{formatSwing(swing)} <span className="font-sans font-normal text-lab-muted">for the {swing >= 0 ? teamName : oppName}</span>
				</p>
			)}
		</div>
	)
}

/** A marker shape, drawn small, for the legend. */
function Glyph({ kind }: { kind: keyof typeof SYMBOLS }) {
	const info = SYMBOLS[kind]
	const size = 22
	const mid = size / 2
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
			{info.shape === "diamond" ? (
				<rect x={mid - 7} y={mid - 7} width={14} height={14} rx={2} fill={LAB.inkMuted} transform={`rotate(45 ${mid} ${mid})`} />
			) : info.shape === "ring" ? (
				<circle cx={mid} cy={mid} r={7.5} fill="none" stroke={LAB.inkMuted} strokeWidth={2.5} />
			) : (
				<circle cx={mid} cy={mid} r={8} fill={LAB.inkMuted} />
			)}
			<text x={mid} y={mid + 3} textAnchor="middle" fontSize={info.shape === "ring" ? 9 : 7.5} fontWeight={800} fill={info.shape === "ring" ? LAB.inkMuted : LAB.surface}>
				{info.tag}
			</text>
		</svg>
	)
}

/** The key-play section: always open with a plain heading, or a "show all" disclosure when collapsed. */
function Plays({ collapse, count, children }: { collapse: boolean; count: number; children: React.ReactNode }) {
	if (!collapse) {
		return (
			<div className="border-t border-lab-line px-2 py-2 sm:px-4">
				<h3 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">Key plays</h3>
				{children}
			</div>
		)
	}
	return (
		<details className="group border-t border-lab-line px-2 py-2 sm:px-4">
			<summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm font-semibold text-lab-ink hover:bg-lab-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lab-line-strong [&::-webkit-details-marker]:hidden">
				<span>
					<span className="group-open:hidden">Show all {count} key plays</span>
					<span className="hidden group-open:inline">Hide the key plays</span>
				</span>
				<span aria-hidden className="text-lab-muted transition-transform group-open:rotate-180">&#9662;</span>
			</summary>
			<div className="pt-1">{children}</div>
		</details>
	)
}

export default function WinProbabilityReplay({
	series,
	keyPlays,
	scores,
	teamName,
	oppName,
	finalScore,
	sharePath,
	shareText,
	collapsePlays = false,
}: Props) {
	const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "")
	const max = React.useMemo(() => maxTime(series), [series])
	const reduced = usePrefersReducedMotion()
	const rootRef = React.useRef<HTMLDivElement>(null)
	const svgRef = React.useRef<SVGSVGElement>(null)
	const wrapRef = React.useRef<HTMLDivElement>(null)
	const [width, setWidth] = React.useState(1000)
	const { W, H, M, PLOT_W, PLOT_H, narrow } = layout(width)

	React.useEffect(() => {
		const el = wrapRef.current
		if (!el) return
		const measure = () => setWidth(el.clientWidth || 1000)
		measure()
		if (typeof ResizeObserver === "undefined") return
		const ro = new ResizeObserver(measure)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	// Start fully drawn so the page is complete without JavaScript and in screenshots.
	const [t, setT] = React.useState(max)
	const [playing, setPlaying] = React.useState(false)
	const [speed, setSpeed] = React.useState<(typeof SPEEDS)[number]>(1)
	const [pinned, setPinned] = React.useState<number | null>(null)
	const [hovered, setHovered] = React.useState<number | null>(null)
	const [copied, setCopied] = React.useState(false)
	const startedRef = React.useRef(false)
	const tRef = React.useRef(t)
	tRef.current = t

	const x = (s: number) => M.left + (s / max) * PLOT_W
	const y = (p: number) => M.top + (1 - p) * PLOT_H

	// Play the replay once when it scrolls into view, unless the reader asked for less motion
	// or followed a link to a specific moment (#t=1234).
	React.useEffect(() => {
		const hash = typeof window !== "undefined" ? /(?:^#|&)t=(\d+)/.exec(window.location.hash) : null
		if (hash) {
			const s = Math.min(max, Number(hash[1]))
			setT(s)
			const idx = keyPlays.findIndex((k) => Math.abs(k.el - s) <= 1)
			if (idx >= 0) setPinned(idx)
			startedRef.current = true
			return
		}
		if (reduced || !rootRef.current || startedRef.current) return
		const el = rootRef.current
		if (typeof IntersectionObserver === "undefined") return
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting) && !startedRef.current) {
					startedRef.current = true
					setT(0)
					setPlaying(true)
					io.disconnect()
				}
			},
			{ threshold: 0.35 }
		)
		io.observe(el)
		return () => io.disconnect()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [reduced, max])

	// The animation clock.
	React.useEffect(() => {
		if (!playing) return
		let raf = 0
		let last = performance.now()
		const tick = (now: number) => {
			const dt = (now - last) / 1000
			last = now
			const next = tRef.current + dt * (max / REPLAY_SECONDS) * speed
			if (next >= max) {
				setT(max)
				setPlaying(false)
				return
			}
			setT(next)
			raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(raf)
	}, [playing, speed, max])

	const pause = () => setPlaying(false)

	const jumpTo = (seconds: number, play?: number) => {
		pause()
		let target = seconds
		if (play != null) {
			// Land just after the play, where the win probability already reflects it, so the
			// big number matches the marker and the "before to after" on the card.
			const after = series.find(([s]) => s > seconds)
			if (after) target = after[0]
		}
		setT(Math.min(max, Math.max(0, target)))
		setPinned(play ?? null)
	}

	const togglePlay = () => {
		if (playing) return pause()
		if (tRef.current >= max - 0.5) setT(0)
		setPinned(null)
		setPlaying(true)
	}

	const restart = () => {
		setPinned(null)
		setT(0)
		setPlaying(!reduced)
	}

	const scrubFromPointer = (clientX: number) => {
		const svg = svgRef.current
		if (!svg) return
		const r = svg.getBoundingClientRect()
		const px = ((clientX - r.left) / r.width) * W
		const s = ((px - M.left) / PLOT_W) * max
		pause()
		setPinned(null)
		setT(Math.min(max, Math.max(0, s)))
	}
	const dragging = React.useRef(false)

	const score = scoreAt(scores, t)
	const prob = wpAt(series, t)
	const clock = clockAt(t, { overtime: max > REGULATION })
	const latest = playAt(keyPlays, t)
	const shownPlay = pinned != null ? keyPlays[pinned] : latest
	const shownIdx = pinned != null ? pinned : latest ? keyPlays.indexOf(latest) : -1
	const done = t >= max - 0.5

	const pts = series.map(([s, p]) => `${x(s).toFixed(1)},${y(p).toFixed(1)}`)
	const linePath = pts.length ? `M${pts.join(" L")}` : ""
	const mid = y(0.5)
	const areaPath = pts.length ? `M${x(series[0][0]).toFixed(1)},${mid} L${pts.join(" L")} L${x(series[series.length - 1][0]).toFixed(1)},${mid} Z` : ""
	const revealX = x(t)

	const quarterLines = [900, 1800, 2700].map((s) => ({ s, label: s === 1800 ? "Half" : "" }))
	const quarterLabels = [
		{ s: 450, label: "Q1" },
		{ s: 1350, label: "Q2" },
		{ s: 2250, label: "Q3" },
		{ s: 3150, label: "Q4" },
	]
	const regOnly = max <= 3600
	const curWp = y(prob)
	const bubbleX = Math.min(W - M.right - 30, Math.max(M.left + 30, revealX))

	const shareUrl = () => `${window.location.origin}${sharePath}`
	const copyLink = async () => {
		const url = `${shareUrl()}#t=${Math.round(tRef.current)}`
		try {
			await navigator.clipboard.writeText(url)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1800)
		} catch {
			window.prompt("Copy this link", url)
		}
	}
	const postOnX = () => {
		const url = `${shareUrl()}?utm_source=x&utm_medium=social&utm_campaign=lab_share`
		const href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`
		window.open(href, "_blank", "noopener,noreferrer")
	}

	const swingNow = shownPlay ? swingPoints(shownPlay) : null

	return (
		<div
			ref={rootRef}
			className="overflow-hidden rounded-2xl border border-lab-line bg-lab-surface text-lab-ink shadow-[var(--lab-shadow)]"
		>
			{/* scorebug */}
			<div className="flex flex-wrap items-center justify-between gap-4 border-b border-lab-line bg-lab-tint px-4 py-3 sm:px-6">
				<div className="flex items-center gap-4 sm:gap-6">
					<div className="flex items-stretch gap-2.5">
						<span className="w-1.5 rounded-full" style={{ background: LAB.team }} aria-hidden />
						<div>
							<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lab-muted">{teamName}</div>
							<div className="font-mono text-3xl font-bold tabular-nums leading-none sm:text-4xl">{score[0]}</div>
						</div>
					</div>
					<div className="flex flex-col items-center leading-tight">
						<span className="rounded bg-lab-hover px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
							{done ? "FINAL" : `${clock.q} ${clock.clock}`}
						</span>
					</div>
					<div className="flex items-stretch gap-2.5">
						<span className="w-1.5 rounded-full" style={{ background: LAB.opp }} aria-hidden />
						<div>
							<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lab-muted">{oppName}</div>
							<div className="font-mono text-3xl font-bold tabular-nums leading-none sm:text-4xl">{score[1]}</div>
						</div>
					</div>
				</div>
				<div className="text-right">
					<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-lab-muted">
						<Tip text={WP_HELP} align="end" side="bottom">
							<span className="border-b border-dotted border-lab-line-strong">{teamName} win probability</span>
						</Tip>
					</div>
					<div className="font-mono text-3xl font-bold tabular-nums leading-none sm:text-4xl" aria-live="off">
						{pct(prob)}
					</div>
				</div>
			</div>

			{/* chart */}
			<div className="px-2 pt-3 sm:px-4">
				<div ref={wrapRef} className="relative">
				<svg
					ref={svgRef}
					viewBox={`0 0 ${W} ${H}`}
					className="block h-auto w-full touch-pan-y select-none"
					role="img"
					aria-label={`${teamName} win probability through the game, ending at ${pct(series[series.length - 1]?.[1] ?? 0.5)}. Final score ${teamName} ${finalScore[0]}, ${oppName} ${finalScore[1]}.`}
					onPointerDown={(e) => {
						dragging.current = true
						;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
						scrubFromPointer(e.clientX)
					}}
					onPointerMove={(e) => {
						if (dragging.current) scrubFromPointer(e.clientX)
					}}
					onPointerUp={() => {
						dragging.current = false
					}}
					onPointerCancel={() => {
						dragging.current = false
					}}
					style={{ cursor: "ew-resize" }}
				>
					<defs>
						<clipPath id={`${uid}-reveal`}>
							<rect x={M.left - 2} y={0} width={Math.max(0, revealX - M.left + 2)} height={H} />
						</clipPath>
						<clipPath id={`${uid}-above`}>
							<rect x={M.left} y={M.top} width={PLOT_W} height={mid - M.top} />
						</clipPath>
						<clipPath id={`${uid}-below`}>
							<rect x={M.left} y={mid} width={PLOT_W} height={M.top + PLOT_H - mid} />
						</clipPath>
						<linearGradient id={`${uid}-gteam`} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" style={{ stopColor: LAB.team, stopOpacity: 0.42 }} />
							<stop offset="100%" style={{ stopColor: LAB.team, stopOpacity: 0.04 }} />
						</linearGradient>
						<linearGradient id={`${uid}-gopp`} x1="0" y1="1" x2="0" y2="0">
							<stop offset="0%" style={{ stopColor: LAB.opp, stopOpacity: 0.5 }} />
							<stop offset="100%" style={{ stopColor: LAB.opp, stopOpacity: 0.05 }} />
						</linearGradient>
					</defs>

					{/* grid */}
					{[0, 0.25, 0.75, 1].map((p) => (
						<line key={p} x1={M.left} x2={W - M.right} y1={y(p)} y2={y(p)} stroke={LAB.grid} />
					))}
					{quarterLines.map((q) => (
						<line key={q.s} x1={x(q.s)} x2={x(q.s)} y1={M.top} y2={M.top + PLOT_H} stroke={LAB.grid} strokeDasharray={q.label ? "0" : "3 5"} />
					))}
					{!regOnly && <line x1={x(3600)} x2={x(3600)} y1={M.top} y2={M.top + PLOT_H} stroke={LAB.grid} />}
					<line x1={M.left} x2={W - M.right} y1={mid} y2={mid} stroke={LAB.axis} strokeWidth={1.25} />

					{/* axis labels */}
					{[
						{ p: 1, t: "100%" },
						{ p: 0.75, t: "75" },
						{ p: 0.5, t: "50" },
						{ p: 0.25, t: "25" },
						{ p: 0, t: "0%" },
					].map((a) => (
						<text key={a.p} x={M.left - 8} y={y(a.p) + 4} textAnchor="end" fontSize={11} fill={LAB.inkMuted} className="tabular-nums">
							{a.t}
						</text>
					))}
					{quarterLabels.map((q) => (
						<text key={q.label} x={x(q.s)} y={H - 16} textAnchor="middle" fontSize={11} fontWeight={600} fill={LAB.inkMuted} letterSpacing="0.08em">
							{q.label}
						</text>
					))}
					{!regOnly && (
						<text x={x(3600 + (max - 3600) / 2)} y={H - 16} textAnchor="middle" fontSize={11} fontWeight={600} fill={LAB.inkMuted} letterSpacing="0.08em">
							OT
						</text>
					)}

					{/* side labels, so color is never the only cue */}
					<rect x={M.left + 10} y={M.top + 7} width={9} height={9} rx={2} fill={LAB.team} />
					<text x={M.left + 25} y={M.top + 16} fontSize={11} fontWeight={700} letterSpacing="0.14em" fill={LAB.inkSoft}>
						{narrow ? teamName.toUpperCase() : `${teamName.toUpperCase()} AHEAD`}
					</text>
					<rect x={M.left + 10} y={M.top + PLOT_H - 18} width={9} height={9} rx={2} fill={LAB.opp} />
					<text x={M.left + 25} y={M.top + PLOT_H - 9} fontSize={11} fontWeight={700} letterSpacing="0.14em" fill={LAB.inkSoft}>
						{narrow ? oppName.toUpperCase() : `${oppName.toUpperCase()} AHEAD`}
					</text>

					{/* the drawn line and its fills, revealed left to right */}
					<g clipPath={`url(#${uid}-reveal)`}>
						<g clipPath={`url(#${uid}-above)`}>
							<path d={areaPath} fill={`url(#${uid}-gteam)`} />
						</g>
						<g clipPath={`url(#${uid}-below)`}>
							<path d={areaPath} fill={`url(#${uid}-gopp)`} />
						</g>
						<path d={linePath} fill="none" stroke={LAB.ink} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
					</g>

					{/* key plays that have happened by now */}
					{keyPlays.map((k, i) => {
						if (k.el > t + 0.001) return null
						const py = y(k.wpAfter ?? wpAt(series, k.el))
						return (
							<Marker
								key={`${k.el}-${i}`}
								cx={x(k.el)}
								cy={py}
								play={k}
								selected={shownIdx === i && (pinned != null || playing)}
								onSelect={() => jumpTo(k.el, i)}
								onHover={(on) => setHovered((h) => (on ? i : h === i ? null : h))}
							/>
						)
					})}

					{/* playhead */}
					{!done || pinned != null ? (
						<g style={{ pointerEvents: "none" }}>
							<line x1={revealX} x2={revealX} y1={M.top} y2={M.top + PLOT_H} stroke={LAB.ink} strokeOpacity={0.55} strokeWidth={1.25} strokeDasharray="4 4" />
							<circle cx={revealX} cy={curWp} r={6} fill={LAB.ink} stroke={LAB.surface} strokeWidth={2.5} />
							<g transform={`translate(${bubbleX}, ${Math.max(M.top + 12, curWp - 26)})`}>
								<rect x={-24} y={-13} width={48} height={22} rx={5} fill={LAB.ink} />
								<text x={0} y={3} textAnchor="middle" fontSize={12} fontWeight={700} fill={LAB.surface} className="tabular-nums">
									{pct(prob)}
								</text>
							</g>
						</g>
					) : null}
				</svg>
				{hovered != null && keyPlays[hovered] && keyPlays[hovered].el <= t + 0.001 && (
					<MarkerTip
						play={keyPlays[hovered]}
						x={x(keyPlays[hovered].el)}
						y={y(keyPlays[hovered].wpAfter ?? wpAt(series, keyPlays[hovered].el))}
						width={W}
						teamName={teamName}
						oppName={oppName}
					/>
				)}
				</div>
			</div>

			{/* transport */}
			<div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-1 sm:px-6">
				<button
					type="button"
					onClick={togglePlay}
					className="inline-flex h-10 items-center gap-2 rounded-full bg-lab-ink px-4 text-sm font-semibold text-lab-surface transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lab-ink"
					aria-label={playing ? "Pause replay" : done ? "Replay from the start" : "Play replay"}
				>
					{playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
					{playing ? "Pause" : done ? "Replay" : "Play"}
				</button>
				<button
					type="button"
					onClick={restart}
					className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-lab-line-strong text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					aria-label="Restart replay"
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
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={copyLink}
						className="inline-flex h-10 items-center gap-2 rounded-full border border-lab-line-strong px-3 text-xs font-semibold text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					>
						{copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
						{copied ? "Copied" : "Link to this moment"}
					</button>
					<button
						type="button"
						onClick={postOnX}
						className="inline-flex h-10 items-center rounded-full border border-lab-line-strong px-3 text-xs font-semibold text-lab-soft transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink"
					>
						Post on X
					</button>
				</div>
			</div>
			<div className="px-4 pb-4 sm:px-6">
				<label htmlFor={`${uid}-scrub`} className="sr-only">
					Game time
				</label>
				<input
					id={`${uid}-scrub`}
					type="range"
					min={0}
					max={Math.round(max)}
					step={1}
					value={Math.round(t)}
					onChange={(e) => jumpTo(Number(e.target.value))}
					aria-valuetext={`${clock.q} ${clock.clock}, ${pct(prob)} ${teamName} win probability`}
					className="h-2 w-full cursor-pointer accent-lab-ink"
				/>
			</div>

			{/* the play on screen */}
			<div className="border-t border-lab-line bg-lab-tint px-4 py-4 sm:px-6" aria-live="polite">
				{shownPlay ? (
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-0 flex-1">
							<div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-lab-muted">
								<span>
									{kindLabel(shownPlay.kind)} &middot; {clockAt(shownPlay.el).q} {shownPlay.clock}
								</span>
							</div>
							<p className="text-sm leading-relaxed text-lab-ink sm:text-base">{shownPlay.text}</p>
						</div>
						<div className="text-right">
							<div className="font-mono text-2xl font-bold tabular-nums">
								<Tip text={SWING_HELP} align="end" side="bottom">
									<span className="border-b-[3px] pb-0.5" style={{ borderColor: (swingNow ?? 0) >= 0 ? LAB.team : LAB.opp }}>
										{formatSwing(swingNow)}
									</span>
								</Tip>
							</div>
							<div className="text-[11px] text-lab-muted">
								{shownPlay.wpBefore != null && shownPlay.wpAfter != null
									? `${pct(shownPlay.wpBefore)} to ${pct(shownPlay.wpAfter)}`
									: ""}
							</div>
						</div>
					</div>
				) : (
					<p className="text-sm text-lab-muted">Press play, or drag across the chart to move through the game.</p>
				)}
			</div>

			{/* every key play, as a list people can jump through */}
			<Plays collapse={collapsePlays} count={keyPlays.length}>
				<ol className="divide-y divide-lab-line" aria-label="Key plays">
					{keyPlays.map((k, i) => {
						const s = swingPoints(k)
						const active = shownIdx === i && pinned === i
						return (
							<li key={`${k.el}-${i}`}>
								<button
									type="button"
									onClick={() => jumpTo(k.el, i)}
									aria-current={active ? "true" : undefined}
									className={
										"flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-lab-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-lab-ink " +
										(active ? "bg-lab-hover" : "")
									}
								>
									<span className="w-14 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-lab-muted">
										{clockAt(k.el).q} {k.clock}
									</span>
									<Tip
										focusable={false}
										align="start"
										text={
											<>
												<strong className="font-semibold">{SYMBOLS[k.kind].title}.</strong> {SYMBOLS[k.kind].body}
											</>
										}
										className="mt-0.5 shrink-0"
									>
										<span
											className="inline-flex h-5 min-w-[2rem] items-center justify-center rounded px-1 text-[10px] font-bold"
											style={{
												background: (s ?? 0) >= 0 ? LAB.team : LAB.opp,
												color: (s ?? 0) >= 0 ? LAB.onTeam : LAB.onOpp,
											}}
											aria-hidden
										>
											{kindTag(k.kind)}
										</span>
									</Tip>
									<span className="sr-only">{kindLabel(k.kind)}: </span>
									<span className="min-w-0 flex-1 text-sm leading-snug text-lab-ink">{k.text}</span>
									<span className="shrink-0 pt-0.5 font-mono text-xs font-semibold tabular-nums text-lab-ink">
										<span className="border-b-2 pb-px" style={{ borderColor: (s ?? 0) >= 0 ? LAB.team : LAB.opp }}>
											{formatSwing(s)}
										</span>
									</span>
								</button>
							</li>
						)
					})}
				</ol>
				<div className="border-t border-lab-line px-2 pb-2 pt-3">
					<h4 className="pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-lab-muted">What the symbols mean</h4>
					<ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Symbol legend">
						{LEGEND.map((kind) => (
							<li key={kind}>
								<Tip
									align="start"
									text={
										<>
											<strong className="font-semibold">{SYMBOLS[kind].title}.</strong> {SYMBOLS[kind].body}
										</>
									}
								>
									<span className="inline-flex items-center gap-1.5 text-xs text-lab-soft">
										<Glyph kind={kind} />
										{SYMBOLS[kind].title}
									</span>
								</Tip>
							</li>
						))}
					</ul>
					<p className="pt-3 text-[11px] leading-relaxed text-lab-muted">
						Circles are scores, diamonds are turnovers, outlined circles are big swings that were neither. A marker wears the color of the team the play helped: {teamName} or {oppName}.
					</p>
				</div>
			</Plays>
		</div>
	)
}
