// Draws the six matchup cards (see lib/og/matchupCards.tsx for what each one is). Satori only understands a flexbox
// subset of CSS: inline styles, every element with more than one child is display:flex, and no text inside an <svg>,
// so the radar's labels are positioned boxes laid over the drawing.

import type { ReactElement, ReactNode } from "react"

import { SIZE_PIXELS } from "../lab/lastShare"
import { ordinal } from "../lab/unitsKit"
import { GROUP_BASIS, SOURCES, sourceLine } from "./basis"
import { BRIGHT, BRONZE, Brand, DIM, Eyebrow, Frame, GOLD, HIT, LINE, MISS, SILVER, WHITE, caps, clip, rgba } from "./kit"
import type { CardTeam, CoachRow, HurtSide, MatchupCardSpec, PairingRow, Spoke, StyleRow, TapeGroup, TeamSide } from "./matchupCards"

type Spec<V extends MatchupCardSpec["view"]> = Extract<MatchupCardSpec, { view: V }>

// ---- sizes ------------------------------------------------------------------------------------------------

function dims(spec: MatchupCardSpec) {
	const { width: w, height: h } = SIZE_PIXELS[spec.size]
	const tall = spec.size === "tall"
	const padX = tall ? 66 : 56
	return { w, h, tall, padX, padTop: tall ? 64 : 32, padBottom: tall ? 54 : 24, innerW: w - padX * 2 }
}
type Dims = ReturnType<typeof dims>

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

/** The Anton size (up to `big`) at which `text` fits `maxW` on one line. */
const fit = (text: string, maxW: number, big: number, min = 28): number => Math.max(min, Math.min(big, Math.floor(maxW / (text.length * 0.5))))

const winColor = (spec: MatchupCardSpec) => (spec.lead === null ? SILVER : spec.teams[spec.lead].color)

const EYEBROW: Record<MatchupCardSpec["view"], string> = {
	overview: "Matchup on paper",
	pairs: "Pairings by position group",
	tape: "Tale of the tape",
	style: "How each team likes to play",
	coaches: "The coaches",
	injuries: "Who is missing",
}

function Shell({ spec, d, note, source = SOURCES.grades, children }: { spec: MatchupCardSpec; d: Dims; note?: string; source?: string; children: ReactNode }) {
	const glow = winColor(spec)
	const foot = (right: boolean) => (
		<div style={{ display: "flex", flexDirection: "column", alignItems: right ? "flex-end" : "flex-start", fontFamily: "Oswald", fontWeight: 400, fontSize: d.tall ? 19 : 15, lineHeight: 1.25, letterSpacing: 1, color: DIM, textAlign: right ? "right" : "left" }}>
			{note ? <div style={{ display: "flex" }}>{note}</div> : null}
			<div style={{ display: "flex" }}>{sourceLine(source, spec.season, spec.through)}</div>
		</div>
	)
	return (
		<Frame glow={glow} w={d.w} h={d.h}>
			<div style={{ display: "flex", flexDirection: "column", width: d.w, height: d.h, padding: `${d.padTop}px ${d.padX}px ${d.padBottom}px` }}>
				<Eyebrow text={`${EYEBROW[spec.view]} · ${spec.week ? `Week ${spec.week}` : spec.season}`} color={glow} />
				{children}
				<div style={{ display: "flex", flexDirection: d.tall ? "column" : "row", alignItems: d.tall ? "flex-start" : "center", justifyContent: "space-between", marginTop: "auto" }}>
					{d.tall ? <div style={{ display: "flex", marginBottom: 14 }}>{foot(false)}</div> : null}
					<Brand />
					{d.tall ? null : foot(true)}
				</div>
			</div>
		</Frame>
	)
}

/** The two team names, each in its color, with its record and where its offense and defense rank. Compact: just names and a line of context. */
function Teams({ spec, d, big, context = true }: { spec: MatchupCardSpec; d: Dims; big: number; context?: boolean }) {
	const [A, B] = spec.teams
	const mid = d.tall ? 150 : 130
	const sideW = Math.floor((d.innerW - mid) / 2)
	const size = Math.min(fit(A.nick, sideW, big, 36), fit(B.nick, sideW, big, 36))
	const rank = (v: number | null) => (v === null ? "–" : ordinal(v))
	const side = (t: CardTeam, left: boolean) => (
		<div style={{ display: "flex", flexDirection: "column", width: sideW, alignItems: left ? "flex-start" : "flex-end" }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: 1, color: t.color, ...caps }}>{t.nick}</div>
			<div style={label({ fontSize: d.tall ? 21 : 15, letterSpacing: 2, marginTop: d.tall ? 10 : 6 })}>{`${t.record} · Off ${rank(t.off)} · Def ${rank(t.def)}`}</div>
		</div>
	)
	const ctx = [spec.game, spec.kickoff, spec.market].filter(Boolean).join(" · ")
	return (
		<div style={{ display: "flex", flexDirection: "column", width: d.innerW, marginTop: d.tall ? 22 : 12 }}>
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: d.innerW }}>
				{side(A, true)}
				<div style={{ display: "flex", width: mid, justifyContent: "center", fontFamily: "Anton", fontSize: Math.round(size * 0.46), lineHeight: 1.1, color: DIM, paddingTop: Math.round(size * 0.22) }}>VS</div>
				{side(B, false)}
			</div>
			{context && ctx ? <div style={label({ fontSize: d.tall ? 21 : 15, letterSpacing: 2, marginTop: d.tall ? 14 : 8, color: BRIGHT })}>{clip(ctx, d.tall ? 90 : 120)}</div> : null}
		</div>
	)
}

// ---- the radar --------------------------------------------------------------------------------------------

function Radar({ size, spokes, colors }: { size: number; spokes: Spoke[]; colors: [string, string] }) {
	const k = spokes.length
	const c = size / 2
	const R = c - 12
	const ang = (j: number) => -Math.PI / 2 + (j * 2 * Math.PI) / k
	const pt = (j: number, r: number): [number, number] => [c + r * Math.cos(ang(j)), c + r * Math.sin(ang(j))]
	const poly = (vals: number[]) => vals.map((v, j) => pt(j, R * Math.max(0.03, v)).map((x) => x.toFixed(1)).join(",")).join(" ")
	const ring = (r: number) => Array.from({ length: k }, (_, j) => pt(j, R * r).map((x) => x.toFixed(1)).join(",")).join(" ")
	const a = spokes.map((s) => s.a)
	const b = spokes.map((s) => s.b)
	const stroke = size > 500 ? 6 : 4.5
	const dot = size > 500 ? 8 : 6
	// The offense takes the first four spokes and the defense the last three; a faint wedge behind each says so.
	const wedge = (from: number, to: number, fill: string) => {
		const pts = [`${c},${c}`]
		for (let j = from; j <= to; j++) pts.push(pt(j, R).map((x) => x.toFixed(1)).join(","))
		return <polygon points={pts.join(" ")} fill={fill} />
	}
	const offCount = spokes.filter((s) => s.off).length
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
			{wedge(0, offCount - 1, "rgba(255,255,255,0.025)")}
			{[0.25, 0.5, 0.75, 1].map((r) => (
				<polygon key={r} points={ring(r)} fill="none" stroke={r === 0.5 ? "#4a4e52" : LINE} strokeWidth={r === 0.5 ? 2 : 1.5} strokeDasharray={r === 0.5 ? "6 6" : undefined} />
			))}
			{spokes.map((_, j) => {
				const [x, y] = pt(j, R)
				return <line key={j} x1={c} y1={c} x2={x} y2={y} stroke={LINE} strokeWidth={1.5} />
			})}
			<polygon points={poly(b)} fill={rgba(colors[1], 0.22)} stroke={colors[1]} strokeWidth={stroke} strokeLinejoin="round" />
			<polygon points={poly(a)} fill={rgba(colors[0], 0.16)} stroke={colors[0]} strokeWidth={stroke} strokeLinejoin="round" />
			{b.map((v, j) => {
				const [x, y] = pt(j, R * Math.max(0.03, v))
				return <circle key={`b${j}`} cx={x} cy={y} r={dot} fill={colors[1]} stroke="#0a0a0b" strokeWidth={2} />
			})}
			{a.map((v, j) => {
				const [x, y] = pt(j, R * Math.max(0.03, v))
				return <circle key={`a${j}`} cx={x} cy={y} r={dot} fill={colors[0]} stroke="#0a0a0b" strokeWidth={2} />
			})}
		</svg>
	)
}

/** The radar with each spoke named and both teams' ranks beside it, in a box the size of `w` by `h`. */
function RadarBox({ spec, w, h, diameter, tall }: { spec: Spec<"overview">; w: number; h: number; diameter: number; tall: boolean }) {
	const colors: [string, string] = [spec.teams[0].color, spec.teams[1].color]
	const cx = w / 2
	const cy = h / 2
	const R = diameter / 2 - 12
	const labelW = tall ? 190 : 124
	const labelH = tall ? 70 : 50
	const gap = tall ? 46 : 40
	const k = spec.radar.length
	return (
		<div style={{ display: "flex", position: "relative", width: w, height: h }}>
			<div style={{ display: "flex", position: "absolute", left: cx - diameter / 2, top: cy - diameter / 2 }}>
				<Radar size={diameter} spokes={spec.radar} colors={colors} />
			</div>
			{spec.radar.map((s, j) => {
				const a = -Math.PI / 2 + (j * 2 * Math.PI) / k
				const x = cx + (R + gap) * Math.cos(a) * (tall ? 1.18 : 1.2)
				const y = cy + (R + gap) * Math.sin(a) * (tall ? 1.02 : 1.02)
				return (
					<div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "absolute", left: x - labelW / 2, top: y - labelH / 2, width: labelW, height: labelH }}>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 27 : 19, letterSpacing: 1.5, color: WHITE, ...caps }}>{s.label}</div>
						<div style={{ display: "flex", alignItems: "center", fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 23 : 16, letterSpacing: 0.5 }}>
							<div style={{ display: "flex", color: colors[0] }}>{ordinal(s.ranks[0])}</div>
							<div style={{ display: "flex", color: DIM, margin: tall ? "0 8px" : "0 5px" }}>·</div>
							<div style={{ display: "flex", color: colors[1] }}>{ordinal(s.ranks[1])}</div>
						</div>
					</div>
				)
			})}
		</div>
	)
}

function Scoreline({ spec, tall }: { spec: MatchupCardSpec; tall: boolean }) {
	const [A, B] = spec.teams
	const num = (side: TeamSide, align: "flex-start" | "flex-end") => (
		<div style={{ display: "flex", flexDirection: "column", alignItems: align }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 92 : 66, lineHeight: 1, color: spec.teams[side].color }}>{spec.edges[side]}</div>
			<div style={label({ fontSize: tall ? 20 : 14, letterSpacing: 3, marginTop: 4 })}>{`${spec.teams[side].nick} edges`}</div>
		</div>
	)
	return (
		<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
			{num(0, "flex-start")}
			<div style={label({ fontSize: tall ? 20 : 14, letterSpacing: 3, paddingBottom: tall ? 38 : 24, color: SILVER })}>of 8 pairings</div>
			{num(1, "flex-end")}
		</div>
	)
}

function Overview({ spec }: { spec: Spec<"overview"> }) {
	const d = dims(spec)
	const [A, B] = spec.teams
	const glow = winColor(spec)
	const callout = (c: Spec<"overview">["callouts"][number], i: number) => (
		<div key={i} style={{ display: "flex", alignItems: "flex-start", marginTop: d.tall ? 14 : 9 }}>
			<div style={{ display: "flex", width: 6, height: d.tall ? 54 : 26, marginRight: 14, flexShrink: 0, backgroundColor: spec.teams[c.team].color }} />
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: c.big ? 600 : 500, fontSize: d.tall ? 27 : 19, lineHeight: 1.25, color: c.big ? WHITE : BRIGHT }}>{clip(c.text, d.tall ? 96 : 84)}</div>
		</div>
	)
	const verdict = (
		<div style={{ display: "flex", alignSelf: "flex-start", padding: d.tall ? "10px 26px" : "6px 18px", border: `3px solid ${glow}`, color: glow, fontFamily: "Oswald", fontWeight: 700, fontSize: d.tall ? 28 : 19, letterSpacing: 4, ...caps }}>{spec.verdict}</div>
	)
	const legend = (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
			{spec.teams.map((t, i) => (
				<div key={t.abbr} style={{ display: "flex", alignItems: "center", marginLeft: i ? 28 : 0 }}>
					<div style={{ display: "flex", width: d.tall ? 16 : 12, height: d.tall ? 16 : 12, borderRadius: 20, backgroundColor: t.color, marginRight: 10 }} />
					<div style={label({ fontSize: d.tall ? 21 : 15, letterSpacing: 3, color: BRIGHT })}>{t.nick}</div>
				</div>
			))}
		</div>
	)
	if (d.tall) {
		return (
			<Shell spec={spec} d={d} note="Further out is better · dashed ring: league average · graded on per-play stats, not totals or scouting">
				<Teams spec={spec} d={d} big={112} />
				<div style={{ display: "flex", justifyContent: "center", marginTop: 0 }}>
					<RadarBox spec={spec} w={d.innerW} h={540} diameter={390} tall />
				</div>
				<div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
					<Scoreline spec={spec} tall />
					<div style={{ display: "flex", marginTop: 16 }}>{verdict}</div>
					<div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>{spec.callouts.slice(0, 2).map(callout)}</div>
				</div>
			</Shell>
		)
	}
	const rightW = d.innerW - 520 - 36
	const title = `${A.nick} vs ${B.nick}`
	return (
		<Shell spec={spec} d={d} note="Further out is better · dashed ring: league average · graded on per-play stats, not totals or scouting">
			<div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
				<div style={{ display: "flex", flexDirection: "column", width: 520, marginRight: 36 }}>
					<RadarBox spec={spec} w={520} h={402} diameter={320} tall={false} />
					{legend}
				</div>
				<div style={{ display: "flex", flexDirection: "column", width: rightW }}>
					<div style={label({ fontSize: 16, letterSpacing: 3, color: BRIGHT })}>{clip([spec.game, spec.kickoff].filter(Boolean).join(" · ") || `${A.record} · ${B.record}`, 64)}</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: fit(title, rightW, 74, 40), lineHeight: 1.05, marginTop: 6, ...caps }}>
						<div style={{ display: "flex", color: A.color }}>{A.nick}</div>
						<div style={{ display: "flex", color: DIM, margin: "0 0.26em" }}>vs</div>
						<div style={{ display: "flex", color: B.color }}>{B.nick}</div>
					</div>
					{spec.market ? <div style={label({ fontSize: 16, letterSpacing: 3, marginTop: 6 })}>{spec.market}</div> : null}
					<div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
						<Scoreline spec={spec} tall={false} />
					</div>
					<div style={{ display: "flex", marginTop: 12 }}>{verdict}</div>
					<div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>{spec.callouts.map(callout)}</div>
				</div>
			</div>
		</Shell>
	)
}

// ---- the pairings -----------------------------------------------------------------------------------------

function Rail({ w, h, row, colors }: { w: number; h: number; row: PairingRow; colors: [string, string] }) {
	const atkColor = colors[row.attacker]
	const defColor = colors[row.attacker === 0 ? 1 : 0]
	const pad = h * 0.6
	const x = (s: number) => pad + ((w - pad * 2) * Math.max(2, Math.min(98, s))) / 100
	const lo = Math.min(row.attackScore, row.defendScore)
	const hi = Math.max(row.attackScore, row.defendScore)
	const win = row.attackScore >= row.defendScore ? atkColor : defColor
	const r = h * 0.34
	const cy = h / 2
	const dx = x(row.defendScore)
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<rect x={pad} y={cy - 3} width={w - pad * 2} height={6} rx={3} fill={LINE} />
			<rect x={x(lo)} y={cy - 3} width={Math.max(0, x(hi) - x(lo))} height={6} rx={3} fill={rgba(win, 0.65)} />
			<polygon points={`${dx},${cy - r * 1.15} ${dx + r * 1.15},${cy} ${dx},${cy + r * 1.15} ${dx - r * 1.15},${cy}`} fill={defColor} stroke="#0a0a0b" strokeWidth={3} />
			<circle cx={x(row.attackScore)} cy={cy} r={r} fill={atkColor} stroke="#0a0a0b" strokeWidth={3} />
		</svg>
	)
}

function PairRow({ row, spec, w, tall }: { row: PairingRow; spec: Spec<"pairs">; w: number; tall: boolean }) {
	const colors: [string, string] = [spec.teams[0].color, spec.teams[1].color]
	const atkColor = colors[row.attacker]
	const defColor = colors[row.attacker === 0 ? 1 : 0]
	const win = row.winner === null ? null : colors[row.winner]
	const verdict = row.winner === null ? "Even" : `${spec.teams[row.winner].nick} ${row.big ? "big edge" : "edge"}`
	const side = tall ? 96 : 66
	const rank = { display: "flex", width: side, fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 27 : 20, letterSpacing: 0.5 }
	return (
		<div style={{ display: "flex", flexDirection: "column", width: w }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
				<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 27 : 19, letterSpacing: 1, color: WHITE, ...caps }}>{row.label}</div>
				<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: tall ? 21 : 15, letterSpacing: 3, color: win ?? DIM, ...caps }}>{verdict}</div>
			</div>
			<div style={{ display: "flex", alignItems: "center" }}>
				<div style={{ ...rank, color: atkColor }}>{ordinal(row.attackRank)}</div>
				<Rail w={w - side * 2} h={tall ? 44 : 30} row={row} colors={colors} />
				<div style={{ ...rank, color: defColor, justifyContent: "flex-end" }}>{ordinal(row.defendRank)}</div>
			</div>
		</div>
	)
}

function Pairs({ spec }: { spec: Spec<"pairs"> }) {
	const d = dims(spec)
	const colGap = 44
	const colW = d.tall ? d.innerW : Math.floor((d.innerW - colGap) / 2)
	const column = (team: 0 | 1) => (
		<div key={team} style={{ display: "flex", flexDirection: "column", width: colW }}>
			<div style={{ display: "flex", alignItems: "center", marginBottom: d.tall ? 12 : 6 }}>
				<div style={{ display: "flex", width: d.tall ? 16 : 13, height: d.tall ? 16 : 13, borderRadius: 20, backgroundColor: spec.teams[team].color, marginRight: 12 }} />
				<div style={label({ fontSize: d.tall ? 24 : 18, letterSpacing: 4, color: BRIGHT })}>{`${spec.teams[team].nick} attack`}</div>
			</div>
			{spec.rows
				.filter((r) => r.attacker === team)
				.map((r) => (
					<div key={r.id} style={{ display: "flex", marginBottom: d.tall ? 6 : 7 }}>
						<PairRow row={r} spec={spec} w={colW} tall={d.tall} />
					</div>
				))}
		</div>
	)
	return (
		<Shell spec={spec} d={d} note="Circle: offense · diamond: defense · further right is better · per-play stats">
			<Teams spec={spec} d={d} big={d.tall ? 120 : 64} />
			<div style={{ display: "flex", width: d.innerW, flexShrink: 0, marginTop: d.tall ? 16 : 8, fontFamily: "Oswald", fontWeight: 500, fontSize: d.tall ? 25 : 18, lineHeight: 1.3, color: BRIGHT }}>{clip(spec.line, d.tall ? 100 : 112)}</div>
			<div style={{ display: "flex", flexDirection: d.tall ? "column" : "row", justifyContent: "space-between", marginTop: d.tall ? 22 : 12, width: d.innerW }}>
				{column(0)}
				{column(1)}
			</div>
		</Shell>
	)
}

// ---- bars growing out from the middle ---------------------------------------------------------------------

type BarSide = { main: string; sub?: string | null; frac: number }
type BarRow = { key: string; title: string; tag: string | null; tagColor: string | null; a: BarSide | null; b: BarSide | null; winner: TeamSide | null; detail?: string }

function Butterfly({ d, rows, colors, rowH, outerW, labelW, divider }: { d: Dims; rows: BarRow[]; colors: [string, string]; rowH: number; outerW: number; labelW: number; divider?: (index: number) => string | null }) {
	const barW = Math.floor((d.innerW - outerW * 2 - labelW) / 2)
	const barH = d.tall ? 30 : 18
	const bar = (side: TeamSide, s: BarSide | null, win: TeamSide | null) => {
		const lost = win !== null && win !== side
		const color = colors[side]
		const alpha = lost ? 0.42 : 1
		const px = s ? Math.max(8, Math.round(barW * Math.max(0, Math.min(1, s.frac)))) : 0
		return (
			<div style={{ display: "flex", position: "relative", alignItems: "center", width: barW, height: rowH, justifyContent: side === 0 ? "flex-end" : "flex-start" }}>
				<div style={{ display: "flex", position: "absolute", left: Math.round(barW / 2), top: Math.round(rowH / 2 - barH * 0.9), width: 2, height: Math.round(barH * 1.8), backgroundColor: "#34373b" }} />
				{s ? <div style={{ display: "flex", width: px, height: barH, borderRadius: barH, backgroundImage: `linear-gradient(${side === 0 ? 90 : 270}deg, ${rgba(color, alpha)} 0%, ${rgba(color, alpha * 0.42)} 100%)`, ...(!lost && win !== null ? { boxShadow: `0 0 16px ${rgba(color, 0.45)}` } : {}) }} /> : null}
			</div>
		)
	}
	const outer = (side: TeamSide, s: BarSide | null, win: TeamSide | null) => {
		const lost = win !== null && win !== side
		return (
			<div style={{ display: "flex", flexDirection: "column", width: outerW, justifyContent: "center", alignItems: side === 0 ? "flex-start" : "flex-end" }}>
				<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: d.tall ? 31 : s?.sub ? 20 : 22, lineHeight: 1.05, letterSpacing: 0.5, color: lost ? "#8b9096" : colors[side] }}>{s ? s.main : "–"}</div>
				{s?.sub ? <div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: d.tall ? 17 : 11, lineHeight: 1.1, letterSpacing: 1, color: DIM, ...caps }}>{s.sub}</div> : null}
			</div>
		)
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", width: d.innerW }}>
			{rows.map((r, i) => {
				const head = divider?.(i) ?? null
				return (
					<div key={r.key} style={{ display: "flex", flexDirection: "column" }}>
						{head ? (
							<div style={{ display: "flex", alignItems: "center", marginTop: i === 0 ? 0 : d.tall ? 10 : 4, marginBottom: d.tall ? 2 : 0 }}>
								<div style={label({ fontSize: d.tall ? 18 : 13, letterSpacing: 5, color: SILVER })}>{head}</div>
								<div style={{ display: "flex", flexGrow: 1, height: 2, marginLeft: 16, backgroundColor: LINE }} />
							</div>
						) : null}
						<div style={{ display: "flex", alignItems: "center", height: rowH, width: d.innerW }}>
							{outer(0, r.a, r.winner)}
							{bar(0, r.a, r.winner)}
							<div style={{ display: "flex", flexDirection: "column", width: labelW, alignItems: "center", justifyContent: "center" }}>
								<div style={{ display: "flex", textAlign: "center", fontFamily: "Oswald", fontWeight: 600, fontSize: d.tall ? 22 : 16, letterSpacing: 1.5, lineHeight: 1.1, color: WHITE, ...caps }}>{r.title}</div>
								{r.detail && d.tall ? <div style={{ display: "flex", maxWidth: labelW - 44, textAlign: "center", justifyContent: "center", fontFamily: "Oswald", fontWeight: 400, fontSize: 13, letterSpacing: 0.3, lineHeight: 1.15, marginTop: 3, color: DIM }}>{r.detail}</div> : null}
								{r.tag ? <div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: d.tall ? 15 : 11, letterSpacing: 2.5, marginTop: 2, color: r.tagColor ?? DIM, ...caps }}>{r.tag}</div> : null}
							</div>
							{bar(1, r.b, r.winner)}
							{outer(1, r.b, r.winner)}
						</div>
					</div>
				)
			})}
		</div>
	)
}

function Tape({ spec }: { spec: Spec<"tape"> }) {
	const d = dims(spec)
	const colors: [string, string] = [spec.teams[0].color, spec.teams[1].color]
	const rows: BarRow[] = spec.groups.map((g: TapeGroup) => ({
		key: g.key,
		title: g.label,
		tag: g.winner === null ? "Even" : `${spec.teams[g.winner].nick} ${g.big ? "big edge" : "edge"}`,
		tagColor: g.winner === null ? DIM : colors[g.winner],
		a: { main: ordinal(g.a.rank), frac: g.a.score / 100 },
		b: { main: ordinal(g.b.rank), frac: g.b.score / 100 },
		winner: g.winner,
		detail: GROUP_BASIS[g.key],
	}))
	const firstDef = spec.groups.findIndex((g) => !g.off)
	const divider = (i: number) => (i === 0 ? "Offense" : i === firstDef ? "Defense" : null)
	return (
		<Shell spec={spec} d={d} note={`Longer bar is better, ranked of ${spec.n} · grade = average rank of its stats, per play not totals`}>
			<Teams spec={spec} d={d} big={d.tall ? 120 : 58} context={d.tall} />
			<div style={{ display: "flex", marginTop: d.tall ? 22 : 10 }}>
				<Butterfly d={d} rows={rows} colors={colors} rowH={d.tall ? 96 : 41} outerW={d.tall ? 96 : 70} labelW={d.tall ? 372 : 214} divider={divider} />
			</div>
		</Shell>
	)
}

function Style({ spec }: { spec: Spec<"style"> }) {
	const d = dims(spec)
	const colors: [string, string] = [spec.teams[0].color, spec.teams[1].color]
	const rows: BarRow[] = spec.rows.map((r: StyleRow) => ({
		key: r.key,
		title: r.label,
		tag: null,
		tagColor: null,
		a: r.a ? { main: r.a.text, sub: `${ordinal(r.a.rank)} most`, frac: r.a.pct } : null,
		b: r.b ? { main: r.b.text, sub: `${ordinal(r.b.rank)} most`, frac: r.b.pct } : null,
		winner: null,
	}))
	const firstDef = spec.rows.findIndex((r) => !r.off)
	const divider = (i: number) => (i === 0 ? "Offense" : i === firstDef ? "Defense" : null)
	return (
		<Shell spec={spec} d={d} source={SOURCES.style} note="Not good or bad, just style · longer bar means more of it">
			<Teams spec={spec} d={d} big={d.tall ? 120 : 50} context={d.tall} />
			<div style={{ display: "flex", marginTop: d.tall ? 18 : 4 }}>
				<Butterfly d={d} rows={rows} colors={colors} rowH={d.tall ? 92 : 40} outerW={d.tall ? 132 : 112} labelW={d.tall ? 262 : 250} divider={divider} />
			</div>
		</Shell>
	)
}

// ---- the coaches ------------------------------------------------------------------------------------------

function Coaches({ spec }: { spec: Spec<"coaches"> }) {
	const d = dims(spec)
	const [A, B] = spec.teams
	const colW = Math.floor((d.innerW - 300) / 2)
	const rowH = d.tall ? 80 : 56
	const nameSize = Math.min(fit(spec.coaches[0].name, colW, d.tall ? 76 : 50, 30), fit(spec.coaches[1].name, colW, d.tall ? 76 : 50, 30))
	const side = (t: CardTeam, name: string, left: boolean) => (
		<div style={{ display: "flex", flexDirection: "column", width: colW, alignItems: left ? "flex-start" : "flex-end" }}>
			<div style={label({ fontSize: d.tall ? 24 : 16, letterSpacing: 5, color: t.color })}>{`${t.nick} head coach`}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: nameSize, lineHeight: 1.05, marginTop: 4, color: WHITE, ...caps }}>{name}</div>
		</div>
	)
	const cell = (c: CoachRow["a"], color: string, win: boolean, left: boolean) => (
		<div style={{ display: "flex", flexDirection: "column", width: colW, alignItems: left ? "flex-start" : "flex-end", justifyContent: "center" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: c.main.length > 8 ? (d.tall ? 32 : 24) : d.tall ? 42 : 30, letterSpacing: 0.5, lineHeight: 1.05, color: win ? color : "#767b80" }}>{c.main}</div>
			{c.sub ? <div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: d.tall ? 18 : 12, letterSpacing: 2, color: DIM, ...caps }}>{c.sub}</div> : null}
			{win ? <div style={{ display: "flex", width: d.tall ? 54 : 36, height: 4, marginTop: 3, backgroundColor: color }} /> : null}
		</div>
	)
	return (
		<Shell spec={spec} d={d} source={SOURCES.coaches} note="Regular-season games since 1999 · against the spread per the games file">
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: d.innerW, marginTop: d.tall ? 24 : 12 }}>
				{side(A, spec.coaches[0].name, true)}
				<div style={{ display: "flex", width: 300, justifyContent: "center", fontFamily: "Anton", fontSize: d.tall ? 48 : 32, color: DIM, paddingTop: d.tall ? 36 : 14 }}>VS</div>
				{side(B, spec.coaches[1].name, false)}
			</div>
			<div style={{ display: "flex", flexDirection: "column", marginTop: d.tall ? 26 : 10, width: d.innerW }}>
				{spec.rows.map((r, i) => (
					<div key={r.label} style={{ display: "flex", alignItems: "center", height: rowH, width: d.innerW, borderTop: `2px solid ${i === 0 ? "#3a3d41" : LINE}` }}>
						{cell(r.a, A.color, r.better === 0, true)}
						<div style={{ display: "flex", width: 300, justifyContent: "center", textAlign: "center", fontFamily: "Oswald", fontWeight: 600, fontSize: d.tall ? 20 : 14, letterSpacing: 2.5, lineHeight: 1.15, color: BRIGHT, ...caps }}>{r.label}</div>
						{cell(r.b, B.color, r.better === 1, false)}
					</div>
				))}
			</div>
			{d.tall && spec.meetings.length ? (
				<div style={{ display: "flex", flexDirection: "column", marginTop: 20, borderTop: `2px solid ${LINE}`, paddingTop: 16 }}>
					<div style={label({ fontSize: 18, letterSpacing: 4, color: SILVER })}>{`Last meetings · ${A.nick} score first, newest first`}</div>
					<div style={{ display: "flex", marginTop: 12 }}>
						{spec.meetings.map((m, i) => (
							<div key={i} style={{ display: "flex", flexDirection: "column", marginRight: 22, paddingLeft: 12, borderLeft: `4px solid ${m.won === null ? DIM : m.won ? HIT : MISS}` }}>
								<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 30, color: WHITE }}>{m.text.split("  ")[0]}</div>
								<div style={label({ fontSize: 15, letterSpacing: 2 })}>{m.text.split("  ")[1]}</div>
							</div>
						))}
					</div>
				</div>
			) : null}
		</Shell>
	)
}

// ---- who is missing ---------------------------------------------------------------------------------------

const STATUS_COLOR: Record<string, string> = { Out: MISS, Doubtful: BRONZE, Questionable: GOLD }
const STATUS_TEXT: Record<string, string> = { DNP: "No practice", Limited: "Limited", Full: "Full practice" }
const PRACTICE_COLOR: Record<string, string> = { DNP: MISS, Limited: GOLD, Full: HIT }
const PRACTICE_PIP: Record<string, string> = { DNP: "DNP", Limited: "LTD", Full: "FULL" }

function Injuries({ spec }: { spec: Spec<"injuries"> }) {
	const d = dims(spec)
	const gap = 44
	const colW = Math.floor((d.innerW - gap) / 2)
	const rowH = d.tall ? 98 : 72
	const chipW = d.tall ? 150 : 124
	const nameW = colW - chipW - 16
	const column = (side: TeamSide, hs: HurtSide) => {
		const t = spec.teams[side]
		return (
			<div key={t.abbr} style={{ display: "flex", flexDirection: "column", width: colW }}>
				<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: d.tall ? 12 : 6, borderBottom: `3px solid ${t.color}` }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: fit(t.nick, colW - 250, d.tall ? 70 : 46, 30), lineHeight: 1, color: t.color, ...caps }}>{t.nick}</div>
					<div style={{ display: "flex", alignItems: "flex-end" }}>
						<div style={label({ fontSize: d.tall ? 15 : 11, letterSpacing: 2.5, marginRight: 12, marginBottom: d.tall ? 8 : 4, textAlign: "right", width: d.tall ? 120 : 90 })}>starters out or limited</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: d.tall ? 84 : 52, lineHeight: 1, color: hs.starters ? WHITE : DIM }}>{hs.starters}</div>
					</div>
				</div>
				<div style={label({ fontSize: d.tall ? 17 : 12, letterSpacing: 2, marginTop: d.tall ? 10 : 6, marginBottom: d.tall ? 4 : 2 })}>{clip(hs.note ?? "", d.tall ? 54 : 58)}</div>
				{hs.players.length ? (
					hs.players.map((p, i) => {
						const game = STATUS_COLOR[p.status]
						const color = game ?? (p.practice ? PRACTICE_COLOR[p.practice] : DIM)
						const trail = p.trail.slice(-(d.tall ? 4 : 3))
						return (
							<div key={`${p.name}-${i}`} style={{ display: "flex", alignItems: "center", height: rowH, borderBottom: `2px solid ${LINE}` }}>
								<div style={{ display: "flex", flexShrink: 0, width: chipW, justifyContent: "center", padding: "4px 0", marginRight: 16, border: `2px solid ${color}`, backgroundColor: game ? color : "transparent", color: game ? "#0b0c0d" : color, fontFamily: "Oswald", fontWeight: 700, fontSize: d.tall ? 15 : 12, letterSpacing: 1.5, ...caps }}>
									{game ? p.status : STATUS_TEXT[p.status] ?? p.status}
								</div>
								<div style={{ display: "flex", flexDirection: "column", width: nameW, flexShrink: 0 }}>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: d.tall ? 27 : 21, lineHeight: 1.1, color: p.starter ? WHITE : BRIGHT }}>{clip(p.name, d.tall ? 24 : 28)}</div>
									<div style={label({ fontSize: d.tall ? 15 : 11.5, letterSpacing: 1.2, marginTop: 2 })}>{clip(`${p.pos} · ${p.group}${p.starter ? " · starter" : ""}${p.injury ? ` · ${p.injury}` : ""}`, d.tall ? 38 : 42)}</div>
									{trail.length ? (
										<div style={{ display: "flex", alignItems: "center", marginTop: d.tall ? 8 : 4 }}>
											{trail.map((step, k) => (
												<div key={k} style={{ display: "flex", alignItems: "center" }}>
													{k > 0 ? <div style={{ display: "flex", fontFamily: "Oswald", fontSize: d.tall ? 15 : 11, color: DIM, margin: "0 6px" }}>›</div> : null}
													<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: d.tall ? 14 : 10.5, letterSpacing: 1.2, color: step.practice ? PRACTICE_COLOR[step.practice] : DIM, ...caps }}>
														{`${step.day} ${step.practice ? PRACTICE_PIP[step.practice] : step.label}`}
													</div>
												</div>
											))}
											{p.trend ? (
													<svg width={d.tall ? 13 : 10} height={d.tall ? 11 : 9} viewBox="0 0 10 8" style={{ marginLeft: 10 }}>
														<polygon points={p.trend === "up" ? "5,0 10,8 0,8" : "0,0 10,0 5,8"} fill={p.trend === "up" ? HIT : MISS} />
													</svg>
												) : null}
										</div>
									) : null}
								</div>
							</div>
						)
					})
				) : (
					<div style={{ display: "flex", marginTop: 18, fontFamily: "Oswald", fontWeight: 500, fontSize: d.tall ? 26 : 18, color: BRIGHT }}>{hs.empty}</div>
				)}
				{hs.more || hs.cleared ? (
					<div style={label({ fontSize: d.tall ? 18 : 13, letterSpacing: 3, marginTop: 10, color: SILVER })}>
						{[hs.more ? `+${hs.more} more` : "", hs.cleared ? `${hs.cleared} back at full practice` : ""].filter(Boolean).join("  ·  ")}
					</div>
				) : null}
			</div>
		)
	}
	return (
		<Shell spec={spec} d={d} source={SOURCES.injuries} note="Practice days as we saw them · starters play over half the snaps">
			<div style={{ display: "flex", justifyContent: "space-between", width: d.innerW, marginTop: d.tall ? 28 : 16 }}>
				{column(0, spec.sides[0])}
				{column(1, spec.sides[1])}
			</div>
		</Shell>
	)
}

export function renderMatchupView(spec: MatchupCardSpec): ReactElement {
	switch (spec.view) {
		case "pairs":
			return <Pairs spec={spec} />
		case "tape":
			return <Tape spec={spec} />
		case "style":
			return <Style spec={spec} />
		case "coaches":
			return <Coaches spec={spec} />
		case "injuries":
			return <Injuries spec={spec} />
		default:
			return <Overview spec={spec} />
	}
}
