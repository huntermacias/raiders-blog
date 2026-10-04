"use client"

import * as React from "react"

import { useCompact, useReducedMotion, useSmooth } from "@/components/live/hooks"
import { Chain, Turf } from "@/components/lab/FieldTurf"
import { COMPACT, DEPTH, WIDE, cameraFor, ribbon, viewFrom, type View } from "@/lib/lab/field"
import { LAB } from "@/lib/lab/theme"
import type { Side } from "@/lib/live/colors"
import { clockText, countdown, downText, kickoffLabel, periodName, spotName } from "@/lib/live/format"
import { currentDrive } from "@/lib/live/series"
import type { LiveGame } from "@/lib/live/types"

export type Banner = { id: string; label: string; text: string; tone: "score" | "turnover" | "big" }

/** The ball: a clean puck in the offense's color with a small football inside. */
function Ball({ x, y, scale, color }: { x: number; y: number; scale: number; color: string }) {
	return (
		<g transform={`translate(${x} ${y}) scale(${scale})`} style={{ pointerEvents: "none" }}>
			<circle r={16} fill={LAB.surface} stroke={color} strokeWidth={3.5} />
			<g transform="rotate(-18)" fill="none" stroke={LAB.ink} strokeLinecap="round">
				<ellipse rx={8.5} ry={5} strokeWidth={1.7} />
				<line x1={-3} y1={0} x2={3} y2={0} strokeWidth={1.5} />
				<line x1={-1.6} y1={-1.7} x2={-1.6} y2={1.7} strokeWidth={1.2} />
				<line x1={1.6} y1={-1.7} x2={1.6} y2={1.7} strokeWidth={1.2} />
			</g>
		</g>
	)
}

/** A line across the field: line of scrimmage or first down, labelled inside the sidelines. */
function Line({ view, yard, color, label }: { view: View; yard: number; color: string; label: string }) {
	const a = view.pt(yard, -0.53)
	const b = view.pt(yard, 0.53)
	const size = Math.max(14, 20 * a.s)
	return (
		<g style={{ pointerEvents: "none" }}>
			<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeOpacity={0.25} strokeWidth={12 * a.s} />
			<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={Math.max(2, 4 * a.s)} />
			<text x={view.pt(yard, -0.47).x} y={a.y - size * 0.35} fill={color} fontSize={size} fontWeight={800} letterSpacing="0.05em">
				{label}
			</text>
		</g>
	)
}

/**
 * The current drive on the same stadium turf as the Lab, seen from behind the offense. It follows the
 * live feed: the ball sits where the last play ended, the chain shows what is still needed, and the
 * glowing ribbon traces the drive so far. The feed has no player positions, so none are drawn.
 */
export default function LiveField({ game, away, home, banner }: { game: LiveGame; away: Side; home: Side; banner: Banner | null }) {
	const { info } = game
	const reduced = useReducedMotion()
	const compact = useCompact()
	const g = compact ? COMPACT : WIDE
	const uid = React.useId().replace(/:/g, "")

	const drive = currentDrive(game)
	const live = info.state === "in"
	const offenseAbbr = drive?.team ?? info.possession ?? info.away.abbr
	const offIsHome = offenseAbbr === info.home.abbr
	const off = offIsHome ? home : away
	const def = offIsHome ? away : home
	const offTeam = offIsHome ? info.home : info.away
	const defTeam = offIsHome ? info.away : info.home

	const plays = (drive?.plays ?? []).filter((p) => p.from != null)
	const sit = info.situation
	const sitValid = live && info.possession === offenseAbbr && sit?.yardsToGoal != null
	const lastTo = [...plays].reverse().find((p) => p.to != null)?.to ?? null
	const losRaw = sitValid ? 100 - (sit?.yardsToGoal as number) : lastTo ?? plays[0]?.from ?? 25
	const los = Math.min(100, Math.max(0, losRaw))
	const showChain = sitValid && sit?.down != null && sit?.distance != null
	const toGo = sit?.distance ?? 0
	const fd = showChain ? Math.min(100, los + toGo) : null

	const camTarget = cameraFor(los)
	const cam = useSmooth(camTarget, reduced)
	const view = React.useMemo(() => viewFrom(cam, g, DEPTH), [cam, g])

	// The ribbon through every spot the drive has been, along the middle of the field.
	const spots = [plays[0]?.from, ...plays.map((p) => p.to)].filter((v): v is number => v != null)
	const samples = spots.map((yard, i) => ({ yard, u: 0, lift: 0, at: i }))
	const route = samples.length >= 2 ? ribbon(samples, view, compact ? 20 : 17) : ""
	const ball = view.pt(los, 0)

	const dd = showChain ? downText(sit?.down ?? null, sit?.distance ?? null, sit?.yardsToGoal ?? null) : ""
	const label = live
		? `${offTeam.abbr} has the ball${dd ? `, ${dd}` : ""} at ${spotName(offTeam.abbr, defTeam.abbr, los)}.`
		: info.state === "post"
			? `Final: ${info.away.abbr} ${info.away.score}, ${info.home.abbr} ${info.home.score}.`
			: `${info.away.abbr} at ${info.home.abbr}, kickoff ${kickoffLabel(info.kickoff)}.`

	return (
		<div className="relative mx-auto w-full max-w-[920px]">
			<svg viewBox={`0 0 ${g.W} ${g.H}`} className="block h-auto w-full" role="img" aria-label={label}>
				<defs>
					<linearGradient id={`${uid}-fog`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" style={{ stopColor: LAB.surface, stopOpacity: 1 }} />
						<stop offset="100%" style={{ stopColor: LAB.surface, stopOpacity: 0 }} />
					</linearGradient>
					<filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
						<feGaussianBlur stdDeviation={compact ? 4 : 5} />
					</filter>
				</defs>

				<Turf
					view={view}
					g={g}
					cam={cam}
					depth={DEPTH}
					compact={compact}
					uid={uid}
					driveName={offTeam.name.split(" ").slice(-1)[0].toUpperCase()}
					otherName={defTeam.name.split(" ").slice(-1)[0].toUpperCase()}
					driveColor={off.fill}
					otherColor={def.fill}
					onDrive={off.on}
					onOther={def.on}
				/>
				<rect x={0} y={0} width={g.W} height={g.H * 0.42} fill={`url(#${uid}-fog)`} style={{ pointerEvents: "none" }} />

				{showChain && <Chain view={view} g={g} los={los} fd={fd} toGo={toGo} />}
				{fd != null && fd <= 100 && <Line view={view} yard={fd} color={LAB.firstDown} label="1ST" />}
				{showChain && <Line view={view} yard={los} color={LAB.scrimmage} label="LOS" />}

				{route && (
					<g style={{ pointerEvents: "none" }}>
						<path d={route} fill={off.fill} opacity={0.5} filter={`url(#${uid}-glow)`} />
						<path d={route} fill={off.fill} opacity={0.9} stroke={LAB.casing} strokeWidth={2.4} strokeLinejoin="round" paintOrder="stroke" />
					</g>
				)}

				{(live || info.state === "post") && plays.length > 0 && (
					<g key={`${drive?.id}-${plays.length}`} className="lab-fade">
						<Ball x={ball.x} y={ball.y - 10 * ball.s} scale={ball.s * (compact ? 1.15 : 0.95)} color={off.fill} />
					</g>
				)}
			</svg>

			{live && (
				<div className="pointer-events-none absolute left-3 top-3 rounded-md bg-lab-surface/85 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-lab-ink backdrop-blur sm:left-5 sm:top-5">
					<span className="mr-2 inline-block h-2 w-3 rounded-[50%] align-middle" style={{ background: off.fill }} aria-hidden />
					{offTeam.abbr} ball{dd ? ` · ${dd}` : ""}
					<span className="ml-2 font-normal normal-case tracking-normal text-lab-soft">
						{periodName(info.period)} {clockText(info.clockSeconds)}
					</span>
				</div>
			)}

			{info.state === "pre" && <PregameOverlay kickoff={info.kickoff} />}

			{banner && (
				<div key={banner.id} className="lab-banner pointer-events-none absolute inset-x-0 top-[34%] flex justify-center px-4" aria-hidden>
					<div
						className="max-w-[92%] rounded-xl px-5 py-3 text-center shadow-lg"
						style={{ background: banner.tone === "turnover" ? LAB.bad : off.fill, color: banner.tone === "turnover" ? "#fff" : off.on }}
					>
						<p className="text-2xl font-black uppercase tracking-[0.12em] sm:text-4xl">{banner.label}</p>
						<p className="mt-0.5 line-clamp-2 text-xs font-medium opacity-90 sm:text-sm">{banner.text}</p>
					</div>
				</div>
			)}
		</div>
	)
}

function PregameOverlay({ kickoff }: { kickoff: string | null }) {
	const [now, setNow] = React.useState<number | null>(null)
	React.useEffect(() => {
		setNow(Date.now())
		const id = window.setInterval(() => setNow(Date.now()), 1000)
		return () => window.clearInterval(id)
	}, [])
	const left = kickoff && now != null ? countdown(new Date(kickoff).getTime() - now) : ""
	return (
		<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
			<div className="rounded-xl bg-lab-surface/85 px-6 py-4 text-center backdrop-blur">
				<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-lab-muted">Pregame</p>
				<p className="mt-1 font-mono text-2xl font-bold tabular-nums sm:text-4xl">{left ? left : "Kickoff soon"}</p>
				<p className="mt-1 text-xs text-lab-soft">The drive tracker starts with the opening kickoff.</p>
			</div>
		</div>
	)
}
