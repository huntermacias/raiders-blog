// The win-probability story as a short clip: the Raiders' chance to win drawn across the game, the head of the
// line carrying a running clock, score and win chance, pausing on the lowest point and the biggest swing, then
// holding on the final score. Three sizes (landscape, vertical, square) for the places people post.
//
// This file only plans and draws frames. planFrames() says what each frame shows and for how long;
// renderClipFrame() turns one of them into JSX that satori can draw. scripts/clips/render.tsx draws them to
// PNG and hands them to ffmpeg. Everything here is a pure function of the game, so it is tested without ffmpeg.
//
// Satori notes (see lib/og/kit.tsx): inline styles only, every element with more than one child is
// display:flex, and text is a positioned div over the svg because satori does not draw text inside an svg.

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import { clockAt } from "../lab/wp"
import type { LabGame, WpPoint } from "../lab/types"
import { type Box, type LabCardSpec, buildLabSpec, placeLabels } from "../og/labCard"
import { BRIGHT, DIM, HIT, LINE, MISS, SILVER, WHITE, accent, caps, rgba } from "../og/kit"

export type ClipKind = "landscape" | "vertical" | "square"
export const CLIP_SIZES: Record<ClipKind, { w: number; h: number }> = {
	landscape: { w: 1280, h: 720 },
	vertical: { w: 720, h: 1280 },
	square: { w: 720, h: 720 },
}

export const FPS = 24
const BG = "#0b0d10"
const PANEL = "#12151a"

/** What one frame shows. `hold` is how long it stays on screen, in seconds. */
export type ClipFrame = {
	phase: "intro" | "play" | "end"
	/** Game time shown, in seconds from kickoff. */
	el: number
	/** Seconds this frame stays on screen. */
	hold: number
}

export type ClipPlan = { frames: ClipFrame[]; seconds: number }

const INTRO = 1.4
const PLAY = 7.2
const POP = 1.5
const OUTRO = 3.2

/**
 * The frames of a clip. The head of the line moves at an even pace, stopping for POP seconds on each marker
 * (the lowest point and the biggest swing) so its label can be read, then holds on the final score.
 */
export function planFrames(spec: Pick<LabCardSpec, "maxT" | "low" | "swing">): ClipPlan {
	const stops = [spec.low.el, ...(spec.swing ? [spec.swing.el] : [])]
		.filter((t) => t > 0 && t < spec.maxT)
		.sort((a, b) => a - b)
		.filter((t, i, a) => i === 0 || t - a[i - 1] > 60)
	const steps = Math.round(PLAY * FPS)
	const frames: ClipFrame[] = [{ phase: "intro", el: 0, hold: INTRO }]
	let stop = 0
	for (let i = 1; i <= steps; i++) {
		const el = (spec.maxT * i) / steps
		while (stop < stops.length && stops[stop] <= el) {
			// Land exactly on the marker, hold, and carry on from there.
			frames.push({ phase: "play", el: stops[stop], hold: POP })
			stop++
		}
		frames.push({ phase: "play", el, hold: 1 / FPS })
	}
	frames.push({ phase: "end", el: spec.maxT, hold: OUTRO })
	return { frames, seconds: frames.reduce((n, f) => n + f.hold, 0) }
}

// ---- geometry ------------------------------------------------------------------------------------------------

type Layout = {
	w: number
	h: number
	pad: number
	chart: Box
	label: { w: number; h: number }
	fonts: { eyebrow: number; title: number; big: number; mid: number; small: number; tag: number; label: number }
	/** Top of the readout row (clock, score, win chance). */
	readoutY: number
	footY: number
	titleLines: 1 | 2
}

export function layoutFor(kind: ClipKind): Layout {
	const { w, h } = CLIP_SIZES[kind]
	if (kind === "landscape") {
		return { w, h, pad: 56, chart: { x: 100, y: 346, w: 1124, h: 262 }, label: { w: 210, h: 92 }, fonts: { eyebrow: 22, title: 62, big: 62, mid: 34, small: 18, tag: 18, label: 22 }, readoutY: 164, footY: 650, titleLines: 1 }
	}
	if (kind === "vertical") {
		return { w, h, pad: 48, chart: { x: 76, y: 676, w: 596, h: 376 }, label: { w: 196, h: 86 }, fonts: { eyebrow: 22, title: 84, big: 104, mid: 36, small: 18, tag: 17, label: 20 }, readoutY: 322, footY: 1190, titleLines: 2 }
	}
	return { w, h, pad: 40, chart: { x: 78, y: 318, w: 604, h: 270 }, label: { w: 196, h: 86 }, fonts: { eyebrow: 19, title: 50, big: 54, mid: 28, small: 16, tag: 15, label: 20 }, readoutY: 142, footY: 640, titleLines: 1 }
}

const chartX = (el: number, maxT: number, b: Box) => b.x + (Math.min(Math.max(el, 0), maxT) / maxT) * b.w
const chartY = (p: number, b: Box) => b.y + (1 - Math.min(1, Math.max(0, p))) * b.h

/** The series up to `el`, ending on an interpolated point exactly at `el`. */
export function seriesUpTo(series: WpPoint[], el: number): WpPoint[] {
	const out: WpPoint[] = []
	for (let i = 0; i < series.length; i++) {
		const [t, p] = series[i]
		if (t <= el) {
			out.push([t, p])
			continue
		}
		if (i > 0) {
			const [t0, p0] = series[i - 1]
			const k = t === t0 ? 1 : (el - t0) / (t - t0)
			if (el > t0) out.push([el, p0 + (p - p0) * k])
		}
		break
	}
	return out
}

/** The win probability at `el`, interpolated. */
export function wpAt(series: WpPoint[], el: number): number {
	const s = seriesUpTo(series, el)
	return s.length ? s[s.length - 1][1] : 0.5
}

/** The running score at `el`, from the [time, raiders, opponent] changes. */
export function scoreAt(scores: [number, number, number][], el: number): [number, number] {
	let out: [number, number] = [0, 0]
	for (const [t, a, b] of scores) {
		if (t > el) break
		out = [a, b]
	}
	return out
}

type Seg = { pts: { x: number; y: number }[]; raiders: boolean }

/** The curve cut wherever it crosses 50%, so the Raiders' stretches and the opponent's can be colored apart. */
export function segments(series: WpPoint[], maxT: number, b: Box): Seg[] {
	const out: Seg[] = []
	let cur: Seg | null = null
	const at = (el: number, p: number) => ({ x: chartX(el, maxT, b), y: chartY(p, b) })
	for (let i = 0; i < series.length; i++) {
		const [t, p] = series[i]
		const raiders = p >= 0.5
		if (i > 0) {
			const [t0, p0] = series[i - 1]
			if (p0 !== p && (p0 >= 0.5) !== raiders) {
				const k = (0.5 - p0) / (p - p0)
				const cross = at(t0 + (t - t0) * k, 0.5)
				cur?.pts.push(cross)
				cur = { pts: [cross], raiders }
				out.push(cur)
			}
		}
		if (!cur) {
			cur = { pts: [], raiders }
			out.push(cur)
		}
		cur.pts.push(at(t, p))
	}
	return out
}

const d = (pts: { x: number; y: number }[], ox: number, oy: number) => pts.map((q, i) => `${i ? "L" : "M"}${(q.x - ox).toFixed(1)} ${(q.y - oy).toFixed(1)}`).join(" ")

// ---- the frame -----------------------------------------------------------------------------------------------

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, color: DIM, letterSpacing: 3, ...caps, ...extra })

export type ClipSpec = LabCardSpec & { scores: [number, number, number][]; slug: string }

/** The spec a clip is drawn from: the story card's spec plus the running score. */
export function buildClipSpec(game: LabGame, team: string): ClipSpec | null {
	const spec = buildLabSpec(game, team, { view: "story" })
	if (!spec) return null
	return { ...spec, scores: game.scores, slug: `week-${game.week}` }
}

export function renderClipFrame(spec: ClipSpec, kind: ClipKind, frame: ClipFrame): ReactElement {
	const L = layoutFor(kind)
	const { w, h, pad, chart: b, fonts: f } = L
	const opp = accent(opponentColors(spec.oppAbbr).dark)
	const el = frame.el
	const end = frame.phase === "end"
	const seen = seriesUpTo(spec.series, el)
	const p = wpAt(spec.series, el)
	const when = frame.phase === "intro" ? "Kickoff" : end ? "Final" : (() => { const c = clockAt(el); return `${c.q} · ${c.clock}` })()
	const [lv, them] = end ? spec.score : scoreAt(spec.scores, el)
	const oppNick = spec.oppName.split(" ").slice(-1)[0]
	const head = seen.length ? { x: chartX(el, spec.maxT, b), y: chartY(p, b) } : { x: b.x, y: chartY(0.5, b) }
	const segs = segments(seen, spec.maxT, b)
	const lead = p >= 0.5
	const markers = [spec.low, ...(spec.swing ? [spec.swing] : [])].filter((m) => el >= m.el && frame.phase !== "intro")
	const dots = markers.map((m) => ({ x: chartX(m.el, spec.maxT, b), y: chartY(m.p, b) }))
	const all = spec.series.map(([t, q]) => ({ x: chartX(t, spec.maxT, b), y: chartY(q, b) }))
	const spots = placeLabels(dots, b, L.label, all)
	const title = kind === "vertical" ? [`Raiders`, `vs ${oppNick}`] : [`Raiders ${spec.home ? "vs" : "at"} ${oppNick}`]
	const resColor = spec.result === "W" ? HIT : spec.result === "L" ? MISS : SILVER
	const verdict = spec.result === "W" ? "Win" : spec.result === "L" ? "Loss" : "Tie"
	const chance = (
		<div style={{ display: "flex", flexDirection: "column", alignItems: kind === "vertical" ? "center" : "flex-end" }}>
			<div style={label({ fontSize: f.small })}>{end ? "Final result" : "Chance to win"}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: f.big, lineHeight: 1.05, color: end ? resColor : lead ? WHITE : opp, ...caps }}>{end ? verdict : `${Math.round(p * 100)}%`}</div>
		</div>
	)
	const clock = (
		<div style={{ display: "flex", flexDirection: "column", alignItems: kind === "vertical" ? "center" : "flex-start" }}>
			<div style={label({ fontSize: f.small })}>Clock</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: f.mid, letterSpacing: 2, color: BRIGHT, marginTop: kind === "vertical" ? 10 : 0, ...caps }}>{when}</div>
		</div>
	)
	const scoreSize = kind === "vertical" ? 80 : f.big
	const score = (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
			<div style={label({ fontSize: f.small })}>Score</div>
			<div style={{ display: "flex", alignItems: "baseline" }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: scoreSize, color: WHITE }}>{lv}</div>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: scoreSize * 0.55, color: DIM, margin: "0 14px" }}>–</div>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: scoreSize, color: opp }}>{them}</div>
			</div>
			<div style={label({ fontSize: f.small - 2, letterSpacing: 2 })}>{`Raiders · ${oppNick}`}</div>
		</div>
	)
	const readout =
		kind === "vertical" ? (
			<div style={{ display: "flex", position: "absolute", left: pad, top: L.readoutY, width: w - pad * 2, flexDirection: "column", alignItems: "center" }}>
				{chance}
				<div style={{ display: "flex", width: w - pad * 2, justifyContent: "space-around", alignItems: "flex-start", marginTop: 26 }}>
					{clock}
					{score}
				</div>
			</div>
		) : (
			<div style={{ display: "flex", position: "absolute", left: pad, top: L.readoutY, width: w - pad * 2, justifyContent: "space-between", alignItems: "flex-start" }}>
				{clock}
				{score}
				{chance}
			</div>
		)

	return (
		<div style={{ display: "flex", position: "relative", width: w, height: h, overflow: "hidden", backgroundColor: BG, backgroundImage: `radial-gradient(circle at 90% 105%, ${rgba(opp, 0.3)} 0%, ${rgba(opp, 0)} 55%), radial-gradient(circle at 5% -5%, rgba(207,211,214,0.16) 0%, rgba(207,211,214,0) 45%)`, color: WHITE }}>
			<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: w, height: 7, backgroundImage: `linear-gradient(90deg, #e6e7e9 0%, #a7aeb3 40%, ${opp} 100%)` }} />
			<div style={{ display: "flex", position: "absolute", left: pad, top: kind === "vertical" ? 64 : 40, flexDirection: "column" }}>
				<div style={label({ fontSize: f.eyebrow, letterSpacing: 6 })}>{`The Lab · Week ${spec.week}`}</div>
				{title.map((line, i) => (
					<div key={i} style={{ display: "flex", fontFamily: "Anton", fontSize: f.title, lineHeight: 1.04, color: i === 0 ? WHITE : opp, marginTop: i === 0 ? 8 : 0, ...caps }}>
						{line}
					</div>
				))}
			</div>

			{readout}

			<div style={{ display: "flex", position: "absolute", left: b.x - 8, top: b.y - 14, width: b.w + 16, height: b.h + 28, backgroundColor: PANEL, border: `1px solid ${LINE}` }} />
			<svg width={b.w} height={b.h} viewBox={`0 0 ${b.w} ${b.h}`} style={{ position: "absolute", left: b.x, top: b.y }}>
				{[900, 1800, 2700].filter((t) => t < spec.maxT).map((t) => (
					<line key={t} x1={chartX(t, spec.maxT, b) - b.x} y1={0} x2={chartX(t, spec.maxT, b) - b.x} y2={b.h} stroke={LINE} strokeWidth={t === 1800 ? 2 : 1} />
				))}
				<line x1={0} y1={b.h / 2} x2={b.w} y2={b.h / 2} stroke="#5b616a" strokeWidth={2} strokeDasharray="8 8" />
				{segs.map((s, i) => (s.pts.length > 1 ? <path key={i} d={d(s.pts, b.x, b.y)} fill="none" stroke={s.raiders ? "#dfe3ea" : opp} strokeWidth={kind === "landscape" ? 5 : 4} strokeLinejoin="round" strokeLinecap="round" /> : null))}
				{dots.map((q, i) => (
					<circle key={i} cx={q.x - b.x} cy={q.y - b.y} r={7} fill={BG} stroke={WHITE} strokeWidth={3} />
				))}
				{frame.phase !== "intro" ? <circle cx={head.x - b.x} cy={head.y - b.y} r={kind === "landscape" ? 9 : 8} fill={lead ? "#dfe3ea" : opp} stroke={BG} strokeWidth={3} /> : null}
			</svg>
			<div style={{ display: "flex", position: "absolute", left: b.x, top: b.y + 2, fontFamily: "Oswald", fontWeight: 500, fontSize: f.tag, letterSpacing: 2, color: DIM, ...caps }}>Raiders favored</div>
			<div style={{ display: "flex", position: "absolute", left: b.x, top: b.y + b.h - f.tag - 6, fontFamily: "Oswald", fontWeight: 500, fontSize: f.tag, letterSpacing: 2, color: DIM, ...caps }}>{`${oppNick} favored`}</div>
			{[["Q1", 0], ["Q2", 900], ["Q3", 1800], ["Q4", 2700]].map(([q, t]) => (
				<div key={String(q)} style={{ display: "flex", position: "absolute", left: chartX(Number(t), spec.maxT, b) + 6, top: b.y + b.h + 8, fontFamily: "Oswald", fontWeight: 500, fontSize: f.tag, letterSpacing: 2, color: DIM }}>{q}</div>
			))}

			{markers.map((m, i) => (
				<div key={m.title} style={{ display: "flex", flexDirection: "column", position: "absolute", left: spots[i].x, top: spots[i].y, width: L.label.w, height: L.label.h, padding: "6px 12px", backgroundColor: "#0b0d10", border: `2px solid ${WHITE}` }}>
					<div style={label({ fontSize: f.tag - 3, letterSpacing: 2 })}>{m.title}</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: f.label + 4, lineHeight: 1.15, color: WHITE }}>{m.value}</div>
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: f.tag - 2, color: BRIGHT, ...caps, letterSpacing: 1 }}>{m.sub}</div>
				</div>
			))}

			<div style={{ display: "flex", position: "absolute", left: pad, top: L.footY, width: w - pad * 2, alignItems: "center" }}>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, border: `2px solid ${SILVER}`, fontFamily: "Anton", fontSize: 25, color: WHITE }}>RR</div>
				<div style={{ display: "flex", flexDirection: "column", marginLeft: 14 }}>
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: f.tag + 3, letterSpacing: 4, color: SILVER, ...caps }}>{`raidersrundown.com/lab/${spec.slug}`}</div>
					<div style={label({ fontSize: f.tag - 4, letterSpacing: 2 })}>Data: nflverse · CC BY 4.0</div>
				</div>
			</div>
		</div>
	)
}
