// The share cards for the game labs (1200x630), one pair per game:
//
//   the story card (the default): the final score, the Raiders' win probability as a curve across the whole
//   game with its lowest point and biggest swing marked, and the three numbers that sum the game up.
//
//   the drive card (`view=drive`): the Raiders' most important drive drawn on the field, play by play, with the
//   one play that moved the game most picked out.
//
// Colors follow the lab itself: the Raiders in silver, the opponent in its own team color (lifted to read on
// near-black, see lib/lab/colors.ts), every team named in text so color is never the only signal. The chart is
// one series on one axis; the labels are real text, not an image, so they stay sharp and can be tested.
//
// buildLabSpec turns a game into a small plain spec and renderLabCard turns the spec into JSX, so both can
// be tested and looked at without a network. Satori only understands a flexbox subset of CSS (no calc, no
// grid), so styling is inline and every element with more than one child is display:flex. Text inside an
// <svg> is not drawn by satori's renderer, so axis and marker labels are positioned divs over the svg.

import type { ReactElement } from "react"

import { TEAM_COLOR, opponentColors } from "../lab/colors"
import { type Frame, framesForDrive, resultLabel, yardLineName } from "../lab/drive"
import { labStory } from "../lab/story"
import type { Drive, LabGame, WpPoint } from "../lab/types"
import { clockAt, formatSwing, gameStory, kindLabel, pct, swingPoints, maxTime } from "../lab/wp"

const W = 1200
const H = 630

const BG = "#0b0d10"
const PANEL = "#12151a"
const WHITE = "#f1f3f6"
const SILVER = TEAM_COLOR.dark
const BRIGHT = "#cfd5dd"
const DIM = "#8a919b"
const LINE = "#2a2f37"
const TURF = "#12281c"

const caps = { textTransform: "uppercase" as const }

// ---- spec ------------------------------------------------------------------------------------

export type LabMarker = { el: number; p: number; title: string; value: string; sub: string }

export type LabDriveSpec = {
	n: number
	plays: number
	yards: number
	/** Quarter and clock when the drive started, "Q4 12:55". */
	when: string
	top: string | null
	result: string
	/** Win probability added over the drive, in points (the Raiders' perspective). */
	wpPoints: number
	startLabel: string
	frames: Frame[]
	/** Index into frames of the play that added the most win probability. */
	keyIndex: number
	keyLine: string
}

export type LabCardSpec = {
	type: "lab"
	kind: "story" | "drive"
	week: number
	/** "Sep 27" */
	date: string
	home: boolean
	oppName: string
	oppAbbr: string
	oppColor: string
	result: "W" | "L" | "T"
	score: [number, number]
	series: WpPoint[]
	maxT: number
	low: LabMarker
	swing: LabMarker | null
	leadChanges: number
	headline: string
	drive: LabDriveSpec | null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const dateShort = (iso: string) => {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
	return m ? `${MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[3])}` : ""
}

const clockSeconds = (clock: string) => {
	const m = /^(\d+):(\d{2})$/.exec(clock)
	return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

/** The Raiders' drive that added the most win probability, or the one asked for by number. Null when there are none. */
export function pickDrive(game: LabGame, team: string, asked?: number | null): Drive | null {
	const mine = game.drives.filter((d) => d.team === team && d.plays.length > 0)
	if (asked != null) {
		const found = mine.find((d) => d.n === asked)
		if (found) return found
	}
	let best: Drive | null = null
	let bestW = -Infinity
	for (const d of mine) {
		const w = d.plays.reduce((s, p) => s + (p.wpa ?? 0), 0)
		if (w > bestW) {
			best = d
			bestW = w
		}
	}
	return best
}

function driveSpec(d: Drive): LabDriveSpec {
	const frames = framesForDrive(d)
	let keyIndex = 0
	let best = -Infinity
	frames.forEach((f, i) => {
		const w = f.wpa ?? 0
		if (w > best) {
			best = w
			keyIndex = i
		}
	})
	const key = frames[keyIndex]
	const wp = d.plays.reduce((s, p) => s + (p.wpa ?? 0), 0)
	const kind = key ? (key.type === "pass" ? "pass" : key.type === "run" ? "run" : "play") : "play"
	const keyLine = key
		? `${key.downLabel ? `${key.downLabel}: ` : ""}${key.outcome === "touchdown" ? "touchdown " : ""}${Math.abs(key.yards)}-yard ${kind}${key.wpa != null ? `, ${formatSwing(Math.round(key.wpa * 100))} win probability` : ""}`
		: ""
	return {
		n: d.n,
		plays: d.plays.length,
		yards: d.yards,
		when: `Q${d.q} ${d.clock}`,
		top: d.top,
		result: resultLabel(d.result),
		wpPoints: Math.round(wp * 100),
		startLabel: yardLineName(d.start),
		frames,
		keyIndex,
		keyLine,
	}
}

/** The card's numbers for one game, or null when the game has no win probability series. */
export function buildLabSpec(game: LabGame, team: string, opts: { view?: string | null; drive?: number | null } = {}): LabCardSpec | null {
	if (!game.wp.length) return null
	const story = gameStory(game.wp, game.keyPlays, game.scores)
	const low = clockAt(story.low.el)
	const sw = story.swing
	const swPts = sw ? swingPoints(sw) : null
	const swClock = sw ? clockAt(sw.el) : null
	const view = opts.view === "drive" ? "drive" : "story"
	const picked = view === "drive" ? pickDrive(game, team, opts.drive) : null
	const swingP = sw ? game.wp.reduce((a, b) => (Math.abs(b[0] - sw.el) < Math.abs(a[0] - sw.el) ? b : a))[1] : 0
	return {
		type: "lab",
		kind: view === "drive" && picked ? "drive" : "story",
		week: game.week,
		date: dateShort(game.date),
		home: game.home,
		oppName: game.oppName,
		oppAbbr: game.opp,
		oppColor: opponentColors(game.opp).dark,
		result: game.result,
		score: game.score,
		series: game.wp,
		maxT: maxTime(game.wp),
		low: { el: story.low.el, p: story.low.p, title: "Lowest point", value: pct(story.low.p), sub: `${low.q} ${low.clock}` },
		swing:
			sw && swClock && swPts != null
				? { el: sw.el, p: swingP, title: "Biggest swing", value: formatSwing(swPts), sub: `${swClock.q} · ${kindLabel(sw.kind)}` }
				: null,
		leadChanges: story.leadChanges,
		headline: labStory(game).headline,
		drive: picked ? driveSpec(picked) : null,
	}
}

// ---- geometry --------------------------------------------------------------------------------

export type Box = { x: number; y: number; w: number; h: number }

/** The plot area of the story card, in card pixels. */
export const CHART: Box = { x: 112, y: 268, w: 1024, h: 232 }

/** Where a point of the win probability series lands on the card. */
export function chartPoint(el: number, p: number, maxT: number, box: Box = CHART): { x: number; y: number } {
	return { x: box.x + (Math.min(Math.max(el, 0), maxT) / maxT) * box.w, y: box.y + (1 - Math.min(1, Math.max(0, p))) * box.h }
}

/** SVG path data for the curve and for the area between it and the 50% line, in the chart's own coordinates. */
export function curvePaths(series: WpPoint[], maxT: number, box: Box = CHART): { line: string; area: string; mid: number } {
	const pts = series.map(([el, p]) => {
		const q = chartPoint(el, p, maxT, box)
		return [q.x - box.x, q.y - box.y] as const
	})
	const mid = box.h / 2
	const f = (n: number) => n.toFixed(1)
	const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join(" ")
	const first = pts[0]
	const last = pts[pts.length - 1]
	const area = first && last ? `M${f(first[0])} ${f(mid)} ${pts.map(([x, y]) => `L${f(x)} ${f(y)}`).join(" ")} L${f(last[0])} ${f(mid)} Z` : ""
	return { line, area, mid }
}

const LABEL = { w: 156, h: 62 }

/**
 * Where the marker labels go. Each label is tried on six sides of its dot and takes the spot that covers the
 * least of the win-probability line (`avoid`, in card pixels), stays inside the chart and clears the labels
 * already placed. Returns top-left corners in card pixels, in the order given.
 */
export function placeLabels(dots: { x: number; y: number }[], box: Box = CHART, size = LABEL, avoid: { x: number; y: number }[] = []): { x: number; y: number }[] {
	const gap = 16
	const placed: { x: number; y: number }[] = []
	for (const d of dots) {
		const cands = [
			{ x: d.x + gap, y: d.y + gap * 0.6 },
			{ x: d.x - gap - size.w, y: d.y + gap * 0.6 },
			{ x: d.x + gap, y: d.y - gap * 0.6 - size.h },
			{ x: d.x - gap - size.w, y: d.y - gap * 0.6 - size.h },
			{ x: d.x - size.w / 2, y: d.y + gap },
			{ x: d.x - size.w / 2, y: d.y - gap - size.h },
		]
		let best = cands[0]
		let bestScore = Infinity
		cands.forEach((c, i) => {
			const x = Math.min(Math.max(c.x, box.x + 2), box.x + box.w - size.w - 2)
			const y = Math.min(Math.max(c.y, box.y + 2), box.y + box.h - size.h - 2)
			// Clamping can slide a box onto its own dot; that costs as much as sitting on the line.
			const onDot = d.x > x - 8 && d.x < x + size.w + 8 && d.y > y - 8 && d.y < y + size.h + 8 ? 400 : 0
			const hits = avoid.filter((q) => q.x > x - 3 && q.x < x + size.w + 3 && q.y > y - 3 && q.y < y + size.h + 3).length
			const clash = placed.some((o) => Math.abs(o.x - x) < size.w + 8 && Math.abs(o.y - y) < size.h + 8) ? 5000 : 0
			const score = hits * 4 + onDot + clash + i * 0.5
			if (score < bestScore) {
				bestScore = score
				best = { x, y }
			}
		})
		placed.push(best)
	}
	return placed
}

// ---- pieces ----------------------------------------------------------------------------------

function RRMark({ size }: { size: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, border: `${Math.max(2, Math.round(size / 40))}px solid ${SILVER}`, fontFamily: "Anton", fontSize: size * 0.56, color: WHITE, letterSpacing: 1 }}>RR</div>
	)
}

function Footer({ left }: { left: string }) {
	return (
		<div style={{ display: "flex", position: "absolute", left: 64, top: 556, width: 1072, height: 50, alignItems: "center", justifyContent: "space-between" }}>
			<div style={{ display: "flex", width: 700, fontFamily: "Oswald", fontWeight: 600, fontSize: 25, color: BRIGHT, lineHeight: 1.15 }}>{left}</div>
			<div style={{ display: "flex", alignItems: "center" }}>
				<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginRight: 16 }}>
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 21, letterSpacing: 4, color: SILVER, ...caps }}>raidersrundown.com/lab</div>
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 13, letterSpacing: 2, color: DIM, ...caps }}>Data: nflverse · CC BY 4.0</div>
				</div>
				<RRMark size={42} />
			</div>
		</div>
	)
}

function Frame({ spec, children }: { spec: LabCardSpec; children: ReactElement | (ReactElement | null)[] }) {
	return (
		<div style={{ display: "flex", position: "relative", width: W, height: H, backgroundColor: BG, backgroundImage: `radial-gradient(circle at 78% 52%, ${spec.oppColor}26 0%, #0b0d10 58%)`, color: WHITE }}>
			<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: 8, backgroundImage: `linear-gradient(90deg, ${SILVER} 0%, ${SILVER} 45%, ${spec.oppColor} 55%, ${spec.oppColor} 100%)` }} />
			{children}
		</div>
	)
}

function Eyebrow({ text }: { text: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 22, letterSpacing: 5, color: DIM, ...caps }}>{text}</div>
			<div style={{ display: "flex", width: 84, height: 3, marginTop: 12, backgroundColor: SILVER }} />
		</div>
	)
}

function Tile({ label, value, sub, width = 190, valueSize = 50 }: { label: string; value: string; sub: string; width?: number; valueSize?: number }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", width, height: 126, marginLeft: 12, padding: "14px 16px", backgroundColor: PANEL, border: `1px solid ${LINE}`, justifyContent: "space-between" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 14, letterSpacing: 2, color: DIM, ...caps }}>{label}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: valueSize, lineHeight: 1, color: WHITE }}>{value}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 15, color: DIM, height: 18 }}>{sub}</div>
		</div>
	)
}

const eyebrowText = (spec: LabCardSpec, tail: string) => `The Lab · Week ${spec.week} · ${spec.home ? "vs" : "at"} ${spec.oppName}${spec.date ? ` · ${spec.date}` : ""}${tail}`

function ScoreLine({ spec }: { spec: LabCardSpec }) {
	const [mine, theirs] = spec.score
	const chip = spec.result === "W" ? "Win" : spec.result === "L" ? "Loss" : "Tie"
	const side = (label: string, n: number, color: string) => (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 118, lineHeight: 1, color }}>{String(n)}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 21, letterSpacing: 5, color: BRIGHT, ...caps }}>{label}</div>
		</div>
	)
	return (
		<div style={{ display: "flex", alignItems: "flex-start" }}>
			{side("Raiders", mine, SILVER)}
			<div style={{ display: "flex", margin: "30px 22px 0 22px", width: 28, height: 8, backgroundColor: DIM }} />
			{side(spec.oppName, theirs, spec.oppColor)}
			<div style={{ display: "flex", marginLeft: 30, marginTop: 8, padding: "6px 16px", border: `2px solid ${spec.result === "W" ? SILVER : DIM}`, fontFamily: "Oswald", fontWeight: 700, fontSize: 24, letterSpacing: 5, color: spec.result === "W" ? WHITE : BRIGHT, ...caps }}>{chip}</div>
		</div>
	)
}

// ---- the story card --------------------------------------------------------------------------

function MarkerLabel({ m, at, color }: { m: LabMarker; at: { x: number; y: number }; color: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", position: "absolute", left: at.x, top: at.y, width: LABEL.w, height: LABEL.h, padding: "7px 12px", backgroundColor: BG, border: `1px solid ${color}`, justifyContent: "space-between" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 14, letterSpacing: 2, color: DIM, ...caps }}>{m.title}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 28, lineHeight: 1, color: WHITE }}>{m.value}</div>
		</div>
	)
}

function Dot({ x, y, color }: { x: number; y: number; color: string }) {
	return <div style={{ display: "flex", position: "absolute", left: x - 11, top: y - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: BG, border: `4px solid ${color}` }} />
}

function StoryChart({ spec }: { spec: LabCardSpec }) {
	const { line, area, mid } = curvePaths(spec.series, spec.maxT)
	const dots = [spec.low, ...(spec.swing ? [spec.swing] : [])].map((m) => chartPoint(m.el, m.p, spec.maxT))
	const labels = placeLabels(dots, CHART, LABEL, spec.series.map(([el, p]) => chartPoint(el, p, spec.maxT)))
	const quarters = [0, 900, 1800, 2700].map((t, i) => ({ x: CHART.x + (t / spec.maxT) * CHART.w, label: `Q${i + 1}` }))
	if (spec.maxT > 3600) quarters.push({ x: CHART.x + (3600 / spec.maxT) * CHART.w, label: "OT" })
	return (
		<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H }}>
			<svg width={CHART.w} height={CHART.h} viewBox={`0 0 ${CHART.w} ${CHART.h}`} style={{ position: "absolute", left: CHART.x, top: CHART.y }}>
				<defs>
					<clipPath id="up">
						<rect x="0" y="0" width={CHART.w} height={mid} />
					</clipPath>
					<clipPath id="down">
						<rect x="0" y={mid} width={CHART.w} height={CHART.h - mid} />
					</clipPath>
					<linearGradient id="gUp" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={SILVER} stopOpacity="0.5" />
						<stop offset="100%" stopColor={SILVER} stopOpacity="0.08" />
					</linearGradient>
					<linearGradient id="gDown" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={spec.oppColor} stopOpacity="0.08" />
						<stop offset="100%" stopColor={spec.oppColor} stopOpacity="0.55" />
					</linearGradient>
				</defs>
				{quarters.map((q) => (
					<line key={q.label} x1={q.x - CHART.x} x2={q.x - CHART.x} y1="0" y2={CHART.h} stroke={LINE} strokeWidth="1" />
				))}
				<line x1="0" x2={CHART.w} y1="0" y2="0" stroke={LINE} strokeWidth="1" />
				<line x1="0" x2={CHART.w} y1={CHART.h} y2={CHART.h} stroke={LINE} strokeWidth="1" />
				<path d={area} fill="url(#gUp)" clipPath="url(#up)" />
				<path d={area} fill="url(#gDown)" clipPath="url(#down)" />
				<line x1="0" x2={CHART.w} y1={mid} y2={mid} stroke={DIM} strokeWidth="1.5" strokeDasharray="6 6" />
				<path d={line} fill="none" stroke={WHITE} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
			</svg>

			{/* axis and series labels */}
			{[
				{ t: "100%", y: CHART.y },
				{ t: "50%", y: CHART.y + CHART.h / 2 },
				{ t: "0%", y: CHART.y + CHART.h },
			].map((a) => (
				<div key={a.t} style={{ display: "flex", position: "absolute", left: 56, top: a.y - 11, width: 44, justifyContent: "flex-end", fontFamily: "Oswald", fontWeight: 500, fontSize: 17, color: DIM }}>
					{a.t}
				</div>
			))}
			{quarters.map((q) => (
				<div key={q.label} style={{ display: "flex", position: "absolute", left: q.x + 8, top: CHART.y + CHART.h + 8, fontFamily: "Oswald", fontWeight: 500, fontSize: 17, letterSpacing: 2, color: DIM }}>
					{q.label}
				</div>
			))}
			<div style={{ display: "flex", position: "absolute", left: CHART.x + CHART.w - 70, top: CHART.y + CHART.h + 8, width: 70, justifyContent: "flex-end", fontFamily: "Oswald", fontWeight: 500, fontSize: 17, letterSpacing: 2, color: DIM, ...caps }}>Final</div>
			<div style={{ display: "flex", position: "absolute", left: CHART.x + 14, top: CHART.y + 10, alignItems: "center", fontFamily: "Oswald", fontWeight: 600, fontSize: 16, letterSpacing: 3, color: BRIGHT, ...caps }}>
				<div style={{ display: "flex", width: 14, height: 14, backgroundColor: SILVER, marginRight: 10 }} />
				Raiders favored
			</div>
			<div style={{ display: "flex", position: "absolute", left: CHART.x + 14, top: CHART.y + CHART.h - 28, alignItems: "center", fontFamily: "Oswald", fontWeight: 600, fontSize: 16, letterSpacing: 3, color: BRIGHT, ...caps }}>
				<div style={{ display: "flex", width: 14, height: 14, backgroundColor: spec.oppColor, marginRight: 10 }} />
				{spec.oppName} favored
			</div>

			{dots.map((d, i) => (
				<Dot key={i} x={d.x} y={d.y} color={i === 0 ? WHITE : spec.oppColor === "" ? WHITE : SILVER} />
			))}
			<MarkerLabel m={spec.low} at={labels[0]} color={DIM} />
			{spec.swing && <MarkerLabel m={spec.swing} at={labels[1]} color={DIM} />}
		</div>
	)
}

function StoryCard({ spec }: { spec: LabCardSpec }) {
	return (
		<Frame spec={spec}>
			<div style={{ display: "flex", position: "absolute", left: 64, top: 40 }}>
				<Eyebrow text={eyebrowText(spec, "")} />
			</div>
			<div style={{ display: "flex", position: "absolute", left: 64, top: 96 }}>
				<ScoreLine spec={spec} />
			</div>
			<div style={{ display: "flex", position: "absolute", left: 600, top: 100 }}>
				<Tile label={spec.low.title} value={spec.low.value} sub={`${spec.low.sub}, chance to win`} width={176} />
				{spec.swing && <Tile label={spec.swing.title} value={spec.swing.value} sub={spec.swing.sub} width={206} />}
				<Tile label="Lead changes" value={String(spec.leadChanges)} sub="scoring plays only" width={150} />
			</div>
			<StoryChart spec={spec} />
			<Footer left={spec.headline} />
		</Frame>
	)
}

// ---- the drive card --------------------------------------------------------------------------

/** The field strip, in card pixels: 120 yards wide, 10 of them end zone at each end. */
export const FIELD: Box = { x: 64, y: 268, w: 1072, h: 232 }
const MIN_YARD = -10
const MAX_YARD = 110

export const fieldX = (yard: number) => FIELD.x + ((yard - MIN_YARD) / (MAX_YARD - MIN_YARD)) * FIELD.w
/** `f` is the across-the-field fraction from a Frame: negative is the offense's left, which is up the screen. */
export const fieldY = (f: number) => FIELD.y + FIELD.h / 2 + f * FIELD.h

/** SVG path data for one play in the field's own coordinates (origin at the field's top-left). */
export function playPath(f: Frame): { d: string; dashed: boolean; end: { x: number; y: number } } {
	const X = (y: number) => fieldX(y) - FIELD.x
	const Y = (v: number) => fieldY(v) - FIELD.y
	const n = (v: number) => v.toFixed(1)
	const sx = X(f.from)
	const sy = Y(f.y0)
	if (f.outcome === "punt" || f.outcome === "fieldgoal-good" || f.outcome === "fieldgoal-miss") {
		const ex = X(f.to)
		const ey = Y(0)
		const mx = (sx + ex) / 2
		return { d: `M${n(sx)} ${n(sy)} Q${n(mx)} ${n(Math.min(sy, ey) - 70)} ${n(ex)} ${n(ey)}`, dashed: true, end: { x: ex, y: ey } }
	}
	if (f.outcome === "incomplete") {
		const tx = X(f.incompleteTo ?? f.from + 6)
		const ty = Y(f.yc)
		return { d: `M${n(sx)} ${n(sy)} Q${n((sx + tx) / 2)} ${n(Math.min(sy, ty) - 34)} ${n(tx)} ${n(ty)}`, dashed: true, end: { x: tx, y: ty } }
	}
	if (f.catchAt != null) {
		const cx = X(f.catchAt)
		const cy = Y(f.yc)
		const ex = X(f.to)
		const ey = Y(f.y1)
		const air = `M${n(sx)} ${n(sy)} Q${n((sx + cx) / 2)} ${n(Math.min(sy, cy) - 38)} ${n(cx)} ${n(cy)}`
		return { d: Math.abs(ex - cx) > 2 ? `${air} L${n(ex)} ${n(ey)}` : air, dashed: false, end: { x: ex, y: ey } }
	}
	const ex = X(f.to)
	const ey = Y(f.y1)
	return { d: `M${n(sx)} ${n(sy)} L${n(ex)} ${n(ey)}`, dashed: false, end: { x: ex, y: ey } }
}

function DriveField({ spec }: { spec: LabCardSpec }) {
	const d = spec.drive as LabDriveSpec
	const key = d.frames[d.keyIndex]
	const ez = (FIELD.w * 10) / 120
	const yardLines: ReactElement[] = []
	for (let yd = 0; yd <= 100; yd += 5) {
		const x = fieldX(yd) - FIELD.x
		yardLines.push(<line key={`y${yd}`} x1={x} x2={x} y1="0" y2={FIELD.h} stroke="#ffffff" strokeOpacity={yd % 10 === 0 ? 0.2 : 0.08} strokeWidth={yd % 10 === 0 ? 2 : 1} />)
	}
	const hashes: ReactElement[] = []
	for (let yd = 1; yd < 100; yd++) {
		const x = fieldX(yd) - FIELD.x
		for (const f of [-0.11, 0.11]) {
			const y = fieldY(f) - FIELD.y
			hashes.push(<line key={`h${yd}${f}`} x1={x} x2={x} y1={y - 5} y2={y + 5} stroke="#ffffff" strokeOpacity="0.16" strokeWidth="1" />)
		}
	}
	const paths = d.frames.map((f, i) => ({ f, i, ...playPath(f) }))
	return (
		<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: H }}>
			<svg width={FIELD.w} height={FIELD.h} viewBox={`0 0 ${FIELD.w} ${FIELD.h}`} style={{ position: "absolute", left: FIELD.x, top: FIELD.y }}>
				<rect x="0" y="0" width={FIELD.w} height={FIELD.h} fill={TURF} />
				<rect x="0" y="0" width={ez} height={FIELD.h} fill={SILVER} fillOpacity="0.16" />
				<rect x={FIELD.w - ez} y="0" width={ez} height={FIELD.h} fill={spec.oppColor} fillOpacity="0.4" />
				{yardLines}
				{hashes}
				{paths.map(({ f, i, d: dd, dashed }) => {
					const isKey = i === d.keyIndex
					const dim = f.outcome === "penalty" || f.outcome === "kneel"
					return (
						<path
							key={i}
							d={dd}
							fill="none"
							stroke={isKey ? WHITE : SILVER}
							strokeOpacity={isKey ? 1 : dim ? 0.3 : 0.66}
							strokeWidth={isKey ? 8 : 5}
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeDasharray={dashed ? "2 9" : undefined}
						/>
					)
				})}
				{paths.map(({ f, i }) => (
					<circle key={`s${i}`} cx={fieldX(f.from) - FIELD.x} cy={fieldY(f.y0) - FIELD.y} r={i === d.keyIndex ? 8 : 5} fill={TURF} stroke={i === d.keyIndex ? WHITE : SILVER} strokeWidth="3" />
				))}
			</svg>
			{[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
				<div key={yd} style={{ display: "flex", position: "absolute", left: fieldX(yd) - 20, top: FIELD.y + FIELD.h + 8, width: 40, justifyContent: "center", fontFamily: "Oswald", fontWeight: 500, fontSize: 17, color: DIM }}>
					{yd <= 50 ? String(yd) : String(100 - yd)}
				</div>
			))}
			<div style={{ display: "flex", position: "absolute", left: FIELD.x + 8, top: FIELD.y + FIELD.h / 2 - 12, width: ez - 16, justifyContent: "center", fontFamily: "Oswald", fontWeight: 700, fontSize: 15, letterSpacing: 3, color: BRIGHT, ...caps, transform: "rotate(-90deg)" }}>Raiders</div>
			<div style={{ display: "flex", position: "absolute", left: FIELD.x + FIELD.w - ez + 8, top: FIELD.y + FIELD.h / 2 - 12, width: ez - 16, justifyContent: "center", fontFamily: "Oswald", fontWeight: 700, fontSize: 15, letterSpacing: 3, color: WHITE, ...caps, transform: "rotate(90deg)" }}>
				{spec.oppName.length > 8 ? spec.oppAbbr : spec.oppName}
			</div>
			{key && (
				<div style={{ display: "flex", position: "absolute", left: Math.min(Math.max(fieldX(key.from) - 52, FIELD.x + 8), FIELD.x + FIELD.w - 112), top: FIELD.y - 34, width: 104, justifyContent: "center", padding: "3px 0", backgroundColor: WHITE, color: BG, fontFamily: "Oswald", fontWeight: 700, fontSize: 15, letterSpacing: 3, ...caps }}>Key play</div>
			)}
		</div>
	)
}

function DriveCard({ spec }: { spec: LabCardSpec }) {
	const d = spec.drive as LabDriveSpec
	return (
		<Frame spec={spec}>
			<div style={{ display: "flex", position: "absolute", left: 64, top: 40 }}>
				<Eyebrow text={eyebrowText(spec, " · Best drive")} />
			</div>
			<div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 64, top: 100 }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: 86, lineHeight: 1, color: WHITE, ...caps }}>{`${d.plays} plays, ${d.yards} yards`}</div>
				<div style={{ display: "flex", marginTop: 10, fontFamily: "Oswald", fontWeight: 600, fontSize: 28, letterSpacing: 3, color: SILVER, ...caps }}>{`${d.when}  ·  ${d.result}`}</div>
			</div>
			<div style={{ display: "flex", position: "absolute", left: 706, top: 100 }}>
				<Tile label="Win prob added" value={formatSwing(d.wpPoints)} sub="the Raiders' chance to win" width={196} />
				<Tile label="Time" value={d.top ?? "n/a"} sub="of possession" width={130} />
				<Tile label="Started at" value={d.startLabel.replace("own ", "OWN ").replace("opp ", "OPP ")} sub="yard line" width={150} valueSize={38} />
			</div>
			<DriveField spec={spec} />
			<Footer left={d.keyLine ? `Key play: ${d.keyLine}` : spec.headline} />
		</Frame>
	)
}

export function renderLabCard(spec: LabCardSpec): ReactElement {
	return spec.kind === "drive" && spec.drive ? <DriveCard spec={spec} /> : <StoryCard spec={spec} />
}
