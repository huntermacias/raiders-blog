// The share cards for the Blogger vs. the Math page (1200x630). Two looks:
//
//   a team card (the Raiders by default): my rank against the math's, the playoff, division and win-total
//   numbers, the chance of each win total as a row of bars, and the next game.
//
//   a "where we disagree" card (`take=XX`): a one-line verdict on the team and the two ranks on a 1-to-32 track,
//   mine as a filled dot and the math's as a ring.
//
// buildMathSpec turns the finished report into a small plain spec and renderMathCard turns the spec into JSX,
// so both can be tested and looked at without Sanity or a network. Satori only understands a flexbox subset
// of CSS, so styling is inline and every element with more than one child is display:flex.

import type { ReactElement } from "react"

import { teamByAbbr } from "../nfl"
import { oddsText } from "../math/format"
import type { MathReport } from "../math/report"

const W = 1200
const H = 630

const BG = "#0a0a0b"
const PANEL = "#111214"
const WHITE = "#e6e7e9"
const SILVER = "#a7aeb3"
const BRIGHT = "#cfd3d6"
const DIM = "#80868b"
const LINE = "#2b2d30"
const HIT = "#4ade80"
const MISS = "#fb7185"

const caps = { textTransform: "uppercase" as const }

// ---- spec ------------------------------------------------------------------------------------

export type MathCardSpec = {
	type: "math"
	kind: "team" | "take"
	week: number
	abbr: string
	nick: string
	color: string
	blogger: number
	math: number
	/** Positive: I rank them higher than the math does. */
	gap: number
	record: string
	playoffs: string | null
	division: string | null
	projWins: string | null
	won: number
	remaining: number
	/** Chance of finishing with 0..17 wins, as whole-ish percentages 0..100. */
	winsPct: number[] | null
	next: { week: number; opp: string; home: boolean; chance: number } | null
	/** Results-only playoff odds, when the page is showing the fuller model. */
	plainPlayoffs: string | null
	/** One sentence from the box scores, when they say something. */
	insight: string | null
	/** The verdict line on a "take" card. */
	headline: string
}

const ABBR = /^[A-Za-z]{2,3}$/
const clean = (v: string | null | undefined) => (v && ABBR.test(v) ? v.toUpperCase() : null)

const signed = (n: number, d = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}`

function insightFor(t: MathReport["teams"][number]): string | null {
	const u = t.under
	if (!u || u.games < 2) return null
	const gap = u.yardageMargin - u.margin
	if (Math.abs(gap) >= 3) {
		return gap < 0
			? `Winning by ${signed(u.margin)} a game on the scoreboard, but only ${signed(u.yardageMargin)} by yards per play.`
			: `Only ${signed(u.margin)} a game on the scoreboard, but ${signed(u.yardageMargin)} by yards per play.`
	}
	if (Math.abs(u.turnoverMargin) >= 1) return `Turnover margin of ${signed(u.turnoverMargin)} a game.`
	return null
}

/** The card's numbers for one team, or null when the team isn't in the report. */
export function buildMathSpec(report: MathReport, opts: { team?: string | null; take?: string | null } = {}): MathCardSpec | null {
	const team = clean(opts.team)
	const take = team ? null : clean(opts.take)
	const abbr = team ?? take ?? "LV"
	const t = report.teams.find((x) => x.abbr === abbr)
	if (!t) return null
	const info = teamByAbbr(abbr)
	const o = t.odds
	const next = t.upcoming[0]
	const nick = info.nick
	const headline = t.gap === 0 ? `The math and I agree on the ${nick}.` : t.gap > 0 ? `The math doesn’t believe in the ${nick}.` : `The math loves the ${nick} more than I do.`
	return {
		type: "math",
		kind: take ? "take" : "team",
		week: report.week,
		abbr,
		nick,
		color: info.color,
		blogger: t.blogger,
		math: t.math,
		gap: t.gap,
		record: `${t.record.w}–${t.record.l}${t.record.t ? `–${t.record.t}` : ""}`,
		playoffs: o ? oddsText(o.playoffs, report.sims) : null,
		division: o ? oddsText(o.division, report.sims) : null,
		projWins: o ? o.projWins.toFixed(1) : null,
		won: t.record.w,
		remaining: o?.remaining ?? 0,
		winsPct: o ? o.winsDist.map((p) => p * 100) : null,
		next: next ? { week: next.week, opp: teamByAbbr(next.opp).nick, home: next.home, chance: Math.round(next.chance * 100) } : null,
		plainPlayoffs: o?.plain ? oddsText(o.plain.playoffs, report.sims) : null,
		insight: insightFor(t),
		headline,
	}
}

// ---- pieces ----------------------------------------------------------------------------------

/** A team color that still shows on a near-black card: dark colors are mixed toward white. */
export function lift(hex: string): string {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex)
	if (!m) return SILVER
	const n = parseInt(m[1], 16)
	const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
	const lum = (0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]) / 255
	const mix = lum < 0.45 ? (0.45 - lum) * 1.6 + 0.2 : 0
	const out = ch.map((c) => Math.round(c + (255 - c) * Math.min(0.85, mix)))
	return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`
}

function RRMark({ size }: { size: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, border: `${Math.max(2, Math.round(size / 40))}px solid ${SILVER}`, fontFamily: "Anton", fontSize: size * 0.56, color: WHITE, letterSpacing: 1 }}>RR</div>
	)
}

function Brand() {
	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			<RRMark size={44} />
			<div style={{ display: "flex", marginLeft: 18, fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 5, color: SILVER, ...caps }}>raidersrundown.com</div>
		</div>
	)
}

function Eyebrow({ text }: { text: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 6, color: DIM, ...caps }}>{text}</div>
			<div style={{ display: "flex", width: 84, height: 3, marginTop: 14, backgroundColor: SILVER }} />
		</div>
	)
}

function Hatch() {
	const lines: ReactElement[] = []
	for (let i = -12; i < 22; i++) lines.push(<line key={i} x1={i * 60} y1={H} x2={i * 60 + H} y2={0} stroke="#ffffff" strokeOpacity={0.035} strokeWidth={2} />)
	return (
		<svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
			{lines}
		</svg>
	)
}

function Frame({ accent, children }: { accent: string; children: ReactElement | ReactElement[] }) {
	return (
		<div style={{ display: "flex", position: "relative", width: W, height: H, backgroundColor: BG, backgroundImage: "radial-gradient(circle at 16% 8%, #1a1c1e 0%, #0a0a0b 60%)", color: WHITE }}>
			<Hatch />
			<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: 8, backgroundColor: accent }} />
			{children}
		</div>
	)
}

function Tile({ label, value, foot }: { label: string; value: string; foot?: string | null }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 236, height: 128, padding: "16px 20px", backgroundColor: PANEL, border: `1px solid ${LINE}` }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 17, letterSpacing: 3, color: DIM, ...caps }}>{label}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 58, lineHeight: 1, color: WHITE }}>{value}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 15, letterSpacing: 1, color: DIM, height: 18 }}>{foot ?? ""}</div>
		</div>
	)
}

/** Chance of each win total as a row of bars; totals that are still possible are bright. */
function WinBars({ pct, won, remaining }: { pct: number[]; won: number; remaining: number }) {
	const max = Math.max(1, ...pct)
	const peak = pct.indexOf(Math.max(...pct))
	return (
		<div style={{ display: "flex", flexDirection: "column", width: 484 }}>
			<div style={{ display: "flex", alignItems: "flex-end", height: 82 }}>
				{pct.map((p, k) => {
					const possible = k >= won && k <= won + remaining
					return (
						<div key={k} style={{ display: "flex", flex: 1, height: 82, alignItems: "flex-end", justifyContent: "center", padding: "0 2px" }}>
							<div style={{ display: "flex", width: "100%", height: Math.max(2, Math.round((p / max) * 78)), backgroundColor: k === peak ? WHITE : possible ? SILVER : LINE }} />
						</div>
					)
				})}
			</div>
			<div style={{ display: "flex", marginTop: 6, height: 20 }}>
				{pct.map((_, k) => (
					<div key={k} style={{ display: "flex", flex: 1, justifyContent: "center", fontFamily: "Oswald", fontWeight: 500, fontSize: 14, color: k === peak ? WHITE : DIM }}>
						{k % 2 === 0 || k === peak ? k : ""}
					</div>
				))}
			</div>
		</div>
	)
}

function RankPair({ blogger, math, size = 84 }: { blogger: number; math: number; size?: number }) {
	const col = (label: string, n: number, color: string) => (
		<div style={{ display: "flex", flexDirection: "column", marginRight: 40 }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 20, letterSpacing: 4, color: DIM, ...caps }}>{label}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: 1.05, color }}>{`No. ${n}`}</div>
		</div>
	)
	return (
		<div style={{ display: "flex" }}>
			{col("Me", blogger, WHITE)}
			{col("The math", math, SILVER)}
		</div>
	)
}

function gapLine(gap: number): string {
	if (gap === 0) return "We agree."
	const n = Math.abs(gap)
	return gap > 0 ? `I have them ${n} spot${n === 1 ? "" : "s"} higher than the math does.` : `The math has them ${n} spot${n === 1 ? "" : "s"} higher than I do.`
}

// ---- the team card ---------------------------------------------------------------------------

function TeamCard({ spec }: { spec: MathCardSpec }) {
	const accent = lift(spec.color)
	const next = spec.next
	return (
		<Frame accent={accent}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 650, padding: "58px 20px 46px 64px" }}>
				<Eyebrow text={`Blogger vs. the math  ·  Week ${spec.week}`} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: spec.nick.length > 8 ? 112 : 132, lineHeight: 1, color: WHITE, ...caps }}>{spec.nick}</div>
					<div style={{ display: "flex", width: 120, height: 8, marginTop: 14, marginBottom: 26, backgroundColor: accent }} />
					<RankPair blogger={spec.blogger} math={spec.math} />
					<div style={{ display: "flex", marginTop: 10, fontFamily: "Oswald", fontWeight: 500, fontSize: 25, color: BRIGHT }}>{gapLine(spec.gap)}</div>
				</div>
				<Brand />
			</div>

			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 550, padding: "50px 56px 46px 12px" }}>
				{spec.playoffs != null ? (
					<div style={{ display: "flex", flexWrap: "wrap", width: 484, justifyContent: "space-between", rowGap: 12 }}>
						<Tile label="Make playoffs" value={spec.playoffs} foot={spec.plainPlayoffs ? `Results alone: ${spec.plainPlayoffs}` : null} />
						<Tile label="Win division" value={spec.division ?? "n/a"} />
						<Tile label="Projected wins" value={spec.projWins ?? "n/a"} foot={`Now ${spec.record}, ${spec.remaining} to play`} />
						<Tile label="Record" value={spec.record} />
					</div>
				) : (
					<div style={{ display: "flex", flexWrap: "wrap", width: 484, justifyContent: "space-between" }}>
						<Tile label="Record" value={spec.record} />
						<Tile label="Math rank" value={`No. ${spec.math}`} />
					</div>
				)}
				<div style={{ display: "flex", flexDirection: "column" }}>
					{spec.winsPct && (
						<div style={{ display: "flex", flexDirection: "column" }}>
							<div style={{ display: "flex", marginBottom: 8, fontFamily: "Oswald", fontWeight: 500, fontSize: 16, letterSpacing: 3, color: DIM, ...caps }}>Chance of each win total</div>
							<WinBars pct={spec.winsPct} won={spec.won} remaining={spec.remaining} />
						</div>
					)}
					{next && (
						<div style={{ display: "flex", alignItems: "center", marginTop: 16, fontFamily: "Oswald", fontWeight: 600, fontSize: 22, letterSpacing: 2, color: BRIGHT, ...caps }}>
							{`Next: Wk ${next.week} ${next.home ? "vs" : "at"} ${next.opp}`}
							<div style={{ display: "flex", marginLeft: 14, color: next.chance >= 50 ? HIT : MISS }}>{`${next.chance}% to win`}</div>
						</div>
					)}
				</div>
			</div>
		</Frame>
	)
}

// ---- the disagreement card -------------------------------------------------------------------

const TRACK = 1060
/** Pixel position of a rank along the track (satori has no calc()). */
const pos = (rank: number) => Math.round(((rank - 1) / 31) * TRACK)

function Track({ blogger, math }: { blogger: number; math: number }) {
	const lo = Math.min(blogger, math)
	const hi = Math.max(blogger, math)
	const ticks = [1, 8, 16, 24, 32]
	return (
		<div style={{ display: "flex", flexDirection: "column", width: TRACK }}>
			<div style={{ display: "flex", position: "relative", width: TRACK, height: 44 }}>
				<div style={{ display: "flex", position: "absolute", left: 0, top: 21, width: TRACK, height: 2, backgroundColor: LINE }} />
				<div style={{ display: "flex", position: "absolute", left: pos(lo), top: 19, width: pos(hi) - pos(lo), height: 6, backgroundColor: WHITE }} />
				<div style={{ display: "flex", position: "absolute", left: pos(math) - 20, top: 2, width: 40, height: 40, borderRadius: 20, border: `5px solid ${SILVER}`, backgroundColor: BG }} />
				<div style={{ display: "flex", position: "absolute", left: pos(blogger) - 20, top: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: WHITE, border: `4px solid ${BG}` }} />
			</div>
			<div style={{ display: "flex", position: "relative", width: TRACK, height: 24, marginTop: 4 }}>
				{ticks.map((t) => (
					<div key={t} style={{ display: "flex", position: "absolute", left: pos(t) - 20, width: 40, justifyContent: "center", fontFamily: "Oswald", fontWeight: 500, fontSize: 18, color: DIM }}>
						{t}
					</div>
				))}
			</div>
		</div>
	)
}

function TakeCard({ spec }: { spec: MathCardSpec }) {
	const accent = lift(spec.color)
	const long = spec.headline.length > 40
	return (
		<Frame accent={accent}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: W, padding: "58px 70px 46px 70px" }}>
				<Eyebrow text={`Where we disagree  ·  Week ${spec.week}`} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: long ? 76 : 88, lineHeight: 1.08, color: WHITE, maxWidth: 1000 }}>{spec.headline}</div>
					<div style={{ display: "flex", marginTop: 22 }}>
						<RankPair blogger={spec.blogger} math={spec.math} size={72} />
					</div>
					<div style={{ display: "flex", marginTop: 6, fontFamily: "Oswald", fontWeight: 500, fontSize: 24, color: BRIGHT, maxWidth: 1000 }}>{spec.insight ?? gapLine(spec.gap)}</div>
				</div>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<Track blogger={spec.blogger} math={spec.math} />
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
						<Brand />
						<div style={{ display: "flex", alignItems: "center", fontFamily: "Oswald", fontWeight: 500, fontSize: 18, letterSpacing: 3, color: DIM, ...caps }}>
							<div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, backgroundColor: WHITE, marginRight: 10 }} />
							Me
							<div style={{ display: "flex", width: 18, height: 18, borderRadius: 9, border: `3px solid ${SILVER}`, marginLeft: 26, marginRight: 10 }} />
							The math
						</div>
					</div>
				</div>
			</div>
		</Frame>
	)
}

export function renderMathCard(spec: MathCardSpec): ReactElement {
	return spec.kind === "take" ? <TakeCard spec={spec} /> : <TeamCard spec={spec} />
}
