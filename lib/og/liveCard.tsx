// The share card for /live (1200x630): the scoreboard on top, the win-probability line as the
// centerpiece, and one line about what is happening underneath. It has three looks: before kickoff
// (a split bar from the line), during the game (the line so far, ending in a dot) and after (the whole
// line, with the biggest swing marked and a one-line story).
//
// buildLiveSpec turns a LiveGame into a small plain spec and renderLiveCard turns the spec into JSX,
// so both can be tested without a network, and the card can be drawn from fixed data.
// Satori (the renderer) only understands a flexbox subset of CSS, so styling is inline.

import type { ReactElement } from "react"

import { TEAMS } from "@/lib/nfl"
import { clockText, kickoffLabel, periodName, spreadText } from "@/lib/live/format"
import { allPlays, biggestSwings, currentHomeWp, wpSeries } from "@/lib/live/series"
import type { LiveGame, LiveTeam, WpSample } from "@/lib/live/types"

const W = 1200
const H = 630

const BG = "#0a0a0b"
const WHITE = "#e6e7e9"
const SILVER = "#a7aeb3"
const DIM = "#80868b"
const LINE = "#2b2d30"
const LIVE_RED = "#ff5a5a"
/** The Raiders' color on this dark ground. */
export const RAIDERS_SILVER = "#cfd3d6"

const caps = { textTransform: "uppercase" as const }

// ---- spec ------------------------------------------------------------------------------------

export type LiveSide = { abbr: string; nick: string; score: number; color: string }

export type LiveCardSpec = {
	type: "live"
	state: "pre" | "in" | "post"
	away: LiveSide
	home: LiveSide
	/** The pill at the top left: LIVE, FINAL or KICKOFF. */
	chip: { text: string; color: string }
	/** The middle of the score row. */
	center: { kicker: string; main: string; sub: string }
	/** The home team's win probability after each play, [seconds elapsed, 0..1]. Empty before kickoff. */
	series: [number, number][]
	/** Right end of the chart's time axis, in seconds (3600, or more in overtime). */
	axisMax: number
	homeWp: number
	swing: { el: number; wp: number; label: string; color: string } | null
	bottom: { label: string; text: string }
	right: { label: string; value: string; color: string }
	/** The score the loser wore dimmer: only after the game. */
	winner: "away" | "home" | null
}

// ---- colors ----------------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "")
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function luminance([r, g, b]: [number, number, number]): number {
	const f = (v: number) => {
		const c = v / 255
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio of a color on the card's near-black ground. */
export function contrastOnBg(hex: string): number {
	return (luminance(rgb(hex)) + 0.05) / (luminance(rgb(BG)) + 0.05)
}

/** Lighten a team color toward white until it reads on the dark ground (navy and purple would vanish). */
export function liftForDark(hex: string, minContrast = 3.4): string {
	let [r, g, b] = rgb(hex)
	for (let i = 0; i < 20 && contrastOnBg(toHex(r, g, b)) < minContrast; i++) {
		r += (255 - r) * 0.12
		g += (255 - g) * 0.12
		b += (255 - b) * 0.12
	}
	return toHex(r, g, b)
}

function toHex(r: number, g: number, b: number): string {
	const p = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")
	return `#${p(r)}${p(g)}${p(b)}`
}

function distance(a: string, b: string): number {
	const [r1, g1, b1] = rgb(a)
	const [r2, g2, b2] = rgb(b)
	return Math.hypot(r1 - r2, g1 - g2, b1 - b2)
}

function teamFor(t: LiveTeam): { nick: string; color: string } {
	const info = TEAMS.find((x) => x.abbr === t.abbr)
	const nick = info?.nick ?? t.name.split(" ").slice(-1)[0]
	if (t.abbr === "LV") return { nick, color: RAIDERS_SILVER }
	return { nick, color: liftForDark(info?.color ?? "#8a8f94") }
}

/** Colors for the two sides: the Raiders are silver, everyone else wears a lightened team color, and two teams that look alike get told apart. */
export function sideColors(away: LiveTeam, home: LiveTeam): { away: string; home: string } {
	const a = teamFor(away).color
	let h = teamFor(home).color
	if (distance(a, h) < 110) h = a === RAIDERS_SILVER ? "#f2b84b" : RAIDERS_SILVER
	return { away: a, home: h }
}

// ---- numbers ---------------------------------------------------------------------------------

const pct = (p: number) => `${Math.round(p * 100)}%`

/** "Q3", or "OT" past regulation, for seconds of game time elapsed. */
export function quarterAt(el: number): string {
	if (el >= 3600) return "OT"
	return `Q${Math.min(4, Math.floor(Math.max(0, el) / 900) + 1)}`
}

/** Keep at most `max` points, always the first and the last, so the path stays small. */
export function downsample<T>(items: T[], max = 300): T[] {
	if (items.length <= max) return items
	const stride = (items.length - 1) / (max - 1)
	const out: T[] = []
	for (let i = 0; i < max; i++) out.push(items[Math.round(i * stride)])
	return out
}

/** One line about how the game went, from the winner's lowest point. */
export function storyLine(series: [number, number][], awayScore: number, homeScore: number, winnerNick: string): string {
	if (awayScore === homeScore) return "Neither side could pull away."
	const winnerHome = homeScore > awayScore
	let min = 1
	let at = 0
	for (const [el, home] of series) {
		if (el <= 0) continue
		const w = winnerHome ? home : 1 - home
		if (w < min) {
			min = w
			at = el
		}
	}
	if (min < 0.3) return `Down to ${pct(min)} in ${quarterAt(at)}, then the ${winnerNick} took it back.`
	if (min >= 0.6) return "Never in doubt."
	return Math.abs(homeScore - awayScore) <= 8 ? "A one-score game to the end." : `The ${winnerNick} pulled away.`
}

function playLabel(game: LiveGame, sample: WpSample): string {
	const play = allPlays(game).find((p) => p.text === sample.text)
	if (!play) return "BIG PLAY"
	if (play.touchdown) return "TOUCHDOWN"
	if (play.turnover) return "TURNOVER"
	if (play.scoring) return "FIELD GOAL"
	if (play.kind === "sack") return "SACK"
	return "BIG PLAY"
}

// ---- building the spec -----------------------------------------------------------------------

/** What the card needs, from a game and its win-probability line. Never throws on thin data. */
export function buildLiveSpec(game: LiveGame): LiveCardSpec {
	const { info } = game
	const colors = sideColors(info.away, info.home)
	const away: LiveSide = { abbr: info.away.abbr, nick: teamFor(info.away).nick, score: info.away.score, color: colors.away }
	const home: LiveSide = { abbr: info.home.abbr, nick: teamFor(info.home).nick, score: info.home.score, color: colors.home }

	const full = info.state === "pre" ? [] : wpSeries(game)
	const series = downsample(full).map((s) => [Math.round(s.el), Math.round(s.home * 1000) / 1000] as [number, number])
	const homeWp = currentHomeWp(info)
	const lastEl = series.length ? series[series.length - 1][0] : 0
	const axisMax = Math.max(3600, lastEl)

	// The leader and their number, for the right-hand block.
	const homeLeads = homeWp >= 0.5
	const leader = homeLeads ? home : away
	const leaderWp = homeLeads ? homeWp : 1 - homeWp

	let swing: LiveCardSpec["swing"] = null
	// A two-point try or a flag isn't a play anyone remembers as the turning point.
	const top = full.length > 1 ? biggestSwings(full.filter((x, i) => i === 0 || !/two-point|penalty|no play|timeout/i.test(x.text)), 1)[0] : undefined
	if (top && Math.abs(top.delta) >= 0.12) {
		const side = top.delta > 0 ? home : away
		swing = {
			el: Math.round(top.sample.el),
			wp: Math.round(top.sample.home * 1000) / 1000,
			label: `${playLabel(game, top.sample)} · ${quarterAt(top.sample.el)} · ${top.delta > 0 ? "+" : "−"}${Math.round(Math.abs(top.delta) * 100)}`,
			color: side.color,
		}
	}

	if (info.state === "pre") {
		const line = spreadText(info)
		const ou = info.odds?.overUnder != null ? `O/U ${info.odds.overUnder}` : ""
		return {
			type: "live",
			state: "pre",
			away,
			home,
			chip: { text: "Kickoff", color: SILVER },
			center: { kicker: info.network ?? "", main: kickoffLabel(info.kickoff).replace(" PT", "") || "Soon", sub: kickoffLabel(info.kickoff) ? "Pacific" : "" },
			series: [],
			axisMax,
			homeWp,
			swing: null,
			bottom: { label: "The line", text: [line, ou].filter(Boolean).join(" · ") || "Win probability and every play, live" },
			right: { label: `${leader.abbr} win probability`, value: pct(leaderWp), color: leader.color },
			winner: null,
		}
	}

	if (info.state === "post") {
		const winner = info.home.score === info.away.score ? null : info.home.score > info.away.score ? "home" : "away"
		const winnerNick = winner === "home" ? home.nick : away.nick
		return {
			type: "live",
			state: "post",
			away,
			home,
			chip: { text: "Final", color: SILVER },
			center: { kicker: info.network ?? "", main: info.period > 4 ? "Final/OT" : "Final", sub: "" },
			series,
			axisMax,
			homeWp,
			swing,
			bottom: { label: "The story", text: storyLine(series, info.away.score, info.home.score, winnerNick) },
			right: swing
				? { label: "Biggest swing", value: swing.label.split(" · ").pop() as string, color: swing.color }
				: { label: "Margin", value: String(Math.abs(info.home.score - info.away.score)), color: WHITE },
			winner,
		}
	}

	const clock = clockText(info.clockSeconds)
	const plays = allPlays(game)
	const lastPlay = plays[plays.length - 1]
	return {
		type: "live",
		state: "in",
		away,
		home,
		chip: { text: "Live", color: LIVE_RED },
		center: { kicker: periodName(info.period), main: clock || "—", sub: info.network ?? "" },
		series,
		axisMax,
		homeWp,
		swing,
		bottom: { label: "Now", text: info.situation?.text || (lastPlay ? lastPlay.text : "Drive underway") },
		right: { label: `${leader.abbr} win probability`, value: pct(leaderWp), color: leader.color },
		winner: null,
	}
}

// ---- drawing ---------------------------------------------------------------------------------

const CH_W = 1056
const CH_H = 204
const PAD_Y = 14

const INSET_L = 14
const INSET_R = 20
const xAt = (el: number, max: number) => Math.round((INSET_L + (Math.min(el, max) / max) * (CH_W - INSET_L - INSET_R)) * 10) / 10
const yAt = (wp: number) => Math.round((PAD_Y + (1 - wp) * (CH_H - PAD_Y * 2)) * 10) / 10

/** The path of the line, and of the shape between the line and the 50% mark. */
export function chartPaths(series: [number, number][], axisMax: number): { line: string; area: string; endX: number; endY: number } {
	if (series.length === 0) return { line: "", area: "", endX: 0, endY: yAt(0.5) }
	const pts = series.map(([el, wp]) => [xAt(el, axisMax), yAt(wp)] as const)
	const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ")
	const mid = yAt(0.5)
	const area = `${line} L${pts[pts.length - 1][0]},${mid} L${pts[0][0]},${mid} Z`
	const last = pts[pts.length - 1]
	return { line, area, endX: last[0], endY: last[1] }
}

function RRMark({ size }: { size: number }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				border: `${Math.max(2, Math.round(size / 40))}px solid ${SILVER}`,
				fontFamily: "Anton",
				fontSize: size * 0.56,
				color: WHITE,
				letterSpacing: 1,
			}}
		>
			RR
		</div>
	)
}

function Small({ text, color = DIM, size = 22, spacing = 5 }: { text: string; color?: string; size?: number; spacing?: number }) {
	return (
		<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: size, letterSpacing: spacing, color, ...caps }}>{text}</div>
	)
}

function TeamBlock({ side, align, dim }: { side: LiveSide; align: "left" | "right"; dim: boolean }) {
	const right = align === "right"
	return (
		<div style={{ display: "flex", flex: 1, flexDirection: right ? "row-reverse" : "row", alignItems: "center" }}>
			<div style={{ display: "flex", width: 10, height: 112, backgroundColor: side.color }} />
			<div style={{ display: "flex", flexDirection: "column", alignItems: right ? "flex-end" : "flex-start", margin: right ? "0 22px 0 0" : "0 0 0 22px" }}>
				<Small text={side.nick} color={side.color} size={30} spacing={6} />
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: 124, lineHeight: 1, color: dim ? DIM : WHITE }}>{side.score}</div>
			</div>
		</div>
	)
}

function Chart({ spec }: { spec: LiveCardSpec }) {
	const { home, away, series, axisMax, swing } = spec
	const mid = yAt(0.5)
	const { line, area, endX, endY } = chartPaths(series, axisMax)
	const leaderColor = spec.homeWp >= 0.5 ? home.color : away.color

	// The label for the biggest swing goes in the empty half of the chart (the line is in the other
	// one at that moment), joined to its point by a thin line, and kept inside the chart.
	let swingBox: { left: number; top: number; width: number; edgeY: number } | null = null
	let sx = 0
	let sy = 0
	if (swing) {
		sx = xAt(swing.el, axisMax)
		sy = yAt(swing.wp)
		const width = swing.label.length * 12.5 + 30
		const above = sy > mid
		const top = above ? mid - 30 - 34 : mid + 30
		swingBox = { left: Math.min(Math.max(sx - width / 2, 0), CH_W - width), top, width, edgeY: above ? top + 34 : top }
	}

	const quarters = [0, 1, 2, 3].map((q) => ({ q: `Q${q + 1}`, x: ((q + 0.5) / 4) * CH_W }))

	return (
		<div style={{ display: "flex", flexDirection: "column", width: CH_W, height: CH_H + 30 }}>
			<div style={{ display: "flex", position: "relative", width: CH_W, height: CH_H }}>
				<svg width={CH_W} height={CH_H} viewBox={`0 0 ${CH_W} ${CH_H}`} style={{ position: "absolute", left: 0, top: 0 }}>
					<defs>
						<linearGradient id="up" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0" stopColor={home.color} stopOpacity="0.7" />
							<stop offset="1" stopColor={home.color} stopOpacity="0.04" />
						</linearGradient>
						<linearGradient id="down" x1="0" y1="1" x2="0" y2="0">
							<stop offset="0" stopColor={away.color} stopOpacity="0.7" />
							<stop offset="1" stopColor={away.color} stopOpacity="0.04" />
						</linearGradient>
						<clipPath id="above">
							<rect x="0" y="0" width={CH_W} height={mid} />
						</clipPath>
						<clipPath id="below">
							<rect x="0" y={mid} width={CH_W} height={CH_H - mid} />
						</clipPath>
					</defs>
					{[1, 2, 3].map((q) => (
						<line key={q} x1={(q / 4) * CH_W} y1="0" x2={(q / 4) * CH_W} y2={CH_H} stroke={LINE} strokeWidth="2" strokeDasharray="4 8" />
					))}
					<line x1="0" y1={mid} x2={CH_W} y2={mid} stroke="#3a3d41" strokeWidth="2" />
					{area ? <path d={area} fill="url(#up)" clipPath="url(#above)" /> : null}
					{area ? <path d={area} fill="url(#down)" clipPath="url(#below)" /> : null}
					{line ? <path d={line} fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="12" strokeLinejoin="round" strokeLinecap="round" /> : null}
					{line ? <path d={line} fill="none" stroke="#f4f5f6" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
					{swing && swingBox ? <line x1={sx} y1={sy} x2={Math.min(Math.max(sx, swingBox.left + 12), swingBox.left + swingBox.width - 12)} y2={swingBox.edgeY} stroke={swing.color} strokeWidth="2" strokeDasharray="3 5" /> : null}
					{swing ? <circle cx={sx} cy={sy} r="8" fill={BG} stroke={swing.color} strokeWidth="4" /> : null}
					{series.length > 0 && spec.state === "in" ? <circle cx={endX} cy={endY} r="22" fill={leaderColor} fillOpacity="0.28" /> : null}
					{series.length > 0 ? <circle cx={endX} cy={endY} r="9" fill="#ffffff" stroke={BG} strokeWidth="3" /> : null}
				</svg>

				<div style={{ display: "flex", position: "absolute", left: 10, top: 4 }}>
					<Small text={`${home.abbr} ahead`} color={home.color} size={16} spacing={4} />
				</div>
				<div style={{ display: "flex", position: "absolute", left: 10, bottom: 2 }}>
					<Small text={`${away.abbr} ahead`} color={away.color} size={16} spacing={4} />
				</div>

				{swing && swingBox ? (
					<div
						style={{
							display: "flex",
							position: "absolute",
							left: swingBox.left,
							top: swingBox.top,
							width: swingBox.width,
							height: 34,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: BG,
							border: `2px solid ${swing.color}`,
							fontFamily: "Oswald",
							fontWeight: 700,
							fontSize: 19,
							letterSpacing: 3,
							color: swing.color,
							...caps,
						}}
					>
						{swing.label}
					</div>
				) : null}
			</div>
			<div style={{ display: "flex", position: "relative", width: CH_W, height: 30 }}>
				{quarters.map((q) => (
					<div key={q.q} style={{ display: "flex", position: "absolute", left: q.x - 20, top: 6, width: 40, justifyContent: "center" }}>
						<Small text={q.q} size={16} spacing={3} />
					</div>
				))}
			</div>
		</div>
	)
}

/** Before kickoff there is no line yet, so show the two chances as a split bar. */
function PregameBar({ spec }: { spec: LiveCardSpec }) {
	const { home, away, homeWp } = spec
	const homeW = Math.round(CH_W * homeWp)
	return (
		<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: CH_W, height: CH_H + 30 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<Small text={`${away.abbr} win probability`} color={away.color} size={20} spacing={4} />
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1.05, color: away.color }}>{pct(1 - homeWp)}</div>
				</div>
				<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
					<Small text={`${home.abbr} win probability`} color={home.color} size={20} spacing={4} />
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1.05, color: home.color }}>{pct(homeWp)}</div>
				</div>
			</div>
			<div style={{ display: "flex", width: CH_W, height: 30, marginTop: 14 }}>
				<div style={{ display: "flex", width: CH_W - homeW - 3, height: 30, backgroundColor: away.color }} />
				<div style={{ display: "flex", width: 3, height: 30, backgroundColor: BG }} />
				<div style={{ display: "flex", width: homeW, height: 30, backgroundColor: home.color }} />
			</div>
		</div>
	)
}

export function renderLiveCard(spec: LiveCardSpec): ReactElement {
	const dimAway = spec.winner === "home"
	const dimHome = spec.winner === "away"
	const bottomText = spec.bottom.text.length > 74 ? `${spec.bottom.text.slice(0, 73).trimEnd()}…` : spec.bottom.text

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: W,
				height: H,
				padding: "30px 72px 26px 72px",
				backgroundColor: BG,
				backgroundImage: "radial-gradient(circle at 50% 0%, #1a1b1e 0%, #0a0a0b 66%)",
				color: WHITE,
			}}
		>
			{/* top bar: state and brand */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 44 }}>
				<div style={{ display: "flex", alignItems: "center" }}>
					{spec.state === "in" ? <div style={{ display: "flex", width: 16, height: 16, borderRadius: 8, backgroundColor: spec.chip.color, marginRight: 14 }} /> : null}
					<Small text={spec.chip.text} color={spec.chip.color} size={28} spacing={8} />
					<div style={{ display: "flex", width: 2, height: 24, backgroundColor: LINE, margin: "0 18px" }} />
					<Small text="Game Day" size={22} spacing={6} />
				</div>
				<div style={{ display: "flex", alignItems: "center" }}>
					<RRMark size={38} />
					<div style={{ display: "flex", marginLeft: 14 }}>
						<Small text="raidersrundown.com/live" color={SILVER} size={22} spacing={4} />
					</div>
				</div>
			</div>

			{/* scoreboard */}
			<div style={{ display: "flex", alignItems: "center", height: 168, marginTop: 10 }}>
				<TeamBlock side={spec.away} align="left" dim={dimAway} />
				<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 300 }}>
					{spec.center.kicker ? <Small text={spec.center.kicker} size={24} spacing={6} /> : null}
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: spec.center.main.length > 6 ? 50 : 76, lineHeight: 1.05, color: WHITE, ...caps }}>{spec.center.main}</div>
					{spec.center.sub ? <Small text={spec.center.sub} size={20} spacing={5} /> : null}
				</div>
				<TeamBlock side={spec.home} align="right" dim={dimHome} />
			</div>

			{/* the chart */}
			<div style={{ display: "flex", marginTop: 6 }}>{spec.state === "pre" ? <PregameBar spec={spec} /> : <Chart spec={spec} />}</div>

			{/* bottom line */}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flex: 1, marginTop: 8 }}>
				<div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
					<Small text={spec.bottom.label} size={18} spacing={6} />
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 36, lineHeight: 1.1, color: WHITE, marginTop: 2 }}>{bottomText}</div>
				</div>
				{spec.state === "pre" ? null : (
					<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
						<Small text={spec.right.label} size={18} spacing={5} />
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 60, lineHeight: 1.05, color: spec.right.color }}>{spec.right.value}</div>
					</div>
				)}
			</div>
		</div>
	)
}
