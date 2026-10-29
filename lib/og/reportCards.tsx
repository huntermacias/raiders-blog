// The share cards for a game report (/games/<slug>), one for each part of the page:
//
//   final    the scoreboard: both teams' logos, the real final score, the line score and the headline, over the game's photo
//   stats    the numbers behind the game: the finding that stands out, then both teams side by side on the measures that decide games
//   players  the players who mattered, a headshot and the numbers the box score leaves out
//
// Each comes in two sizes: wide 1200x630 (the link preview on X, Facebook, iMessage, Slack) and tall 1080x1350 (4:5, for posting the picture).
// buildReportSpec turns a report into a small plain spec (no network, so tests can feed it) and renderReportCard turns the spec into JSX. Images
// (logos, headshots, the photo) arrive as data: URIs that the route fetches and sets on the spec. See lib/og/kit.tsx for the Satori notes: inline
// styles only, every element with more than one child is display:flex, no text inside an <svg>.

import type { ReactElement } from "react"

import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import { logoUrl, headshotUrl, shotUrl } from "../lab/playersKit"
import type { ReportView } from "../report/build"
import type { Performer } from "../report/players"
import { BG, BRIGHT, Brand, DIM, Eyebrow, Frame, HIT, LINE, MISS, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type ReportKind = "final" | "stats" | "players"

type Side = { code: string; nick: string; score: number; logoUrl: string; logo: string | null; color: string }

export type StatLine = { label: string; meText: string; oppText: string; meBar: number; oppBar: number; edge: "me" | "opp" | null; /** Where zero sits on the bars (0 to 1), for measures that go below zero. */ zero: number | null }
export type PlayerLine = { side: "me" | "opp"; name: string; pos: string; line: string; chips: { label: string; value: string }[]; headshotUrl: string | null; photo: string | null; /** The one who added the most. */ star: boolean }

export type ReportCardSpec = {
	type: "report"
	kind: ReportKind
	size: ShareSize
	title: string
	week: number | null
	result: "W" | "L" | "T"
	homeAway: "home" | "away"
	me: Side
	opp: Side
	quarters: { label: string; me: number; opp: number }[]
	/** The game's photo as a data: URI, set by the route. */
	photo: string | null
	headline: string
	stats: StatLine[]
	players: PlayerLine[]
}

export function reportCardSize(spec: ReportCardSpec): { width: number; height: number } {
	return SIZE_PIXELS[spec.size]
}

// ------------------------------------------------------------------------------------------------------------------ spec

/** How many measure rows fit on each size. */
const STAT_ROWS: Record<ShareSize, number> = { wide: 6, tall: 9 }
/** The measures chosen for the card, in order, when the game has them. */
const CARD_STATS = ["epa", "success", "epaRush", "epaPass", "rushYds", "explosive", "third", "giveaways", "penalties"]

export function buildReportSpec(view: ReportView, kind: ReportKind, size: ShareSize): ReportCardSpec {
	const oppCode = view.opp.abbr ?? "NFL"
	const stats: StatLine[] = []
	for (const key of CARD_STATS) {
		const row = view.head.find((r) => r.key === key)
		if (!row || row.me.value == null || row.opp.value == null) continue
		const span = row.max - row.min || 1
		const bar = (v: number) => Math.min(1, Math.max(0.02, (v - row.min) / span))
		stats.push({
			label: row.label,
			meText: row.me.text,
			oppText: row.opp.text,
			meBar: bar(row.me.value),
			oppBar: bar(row.opp.value),
			edge: row.edge,
			zero: row.kind === "signed" ? bar(0) : null,
		})
		if (stats.length === STAT_ROWS[size]) break
	}

	const star = view.performers.standout?.performer
	const pick = (list: Performer[], n: number) => list.slice(0, n)
	const perSide = size === "wide" ? 2 : 4
	const players: PlayerLine[] = [...pick(view.performers.me, perSide), ...pick(view.performers.opp, perSide)].map((p) => ({
		side: p.side,
		name: p.name,
		pos: p.pos,
		line: p.line,
		chips: p.chips.slice(0, 2).map((c) => ({ label: c.label, value: c.value })),
		headshotUrl: p.espn ? headshotUrl(p.espn) : p.shot ? shotUrl(p.shot) : null,
		photo: null,
		star: !!star && star.id === p.id,
	}))

	return {
		type: "report",
		kind,
		size,
		title: view.title,
		week: view.week,
		result: view.result,
		homeAway: view.lab ? (view.lab.home ? "home" : "away") : view.venue.startsWith("at ") ? "away" : "home",
		me: { code: "LV", nick: "Raiders", score: view.score.raiders, logoUrl: logoUrl("LV"), logo: null, color: SILVER },
		opp: { code: oppCode, nick: view.opp.nick, score: view.score.opponent, logoUrl: logoUrl(oppCode), logo: null, color: accent(view.opp.color) },
		quarters: view.quarters,
		photo: null,
		headline: view.findings[0]?.headline ?? (view.result === "W" ? "How the Raiders won" : view.result === "L" ? "How the Raiders lost" : "How the game went"),
		stats,
		players,
	}
}

/** Every image address the card needs, so the route can fetch them together. */
export function reportImageUrls(spec: ReportCardSpec): string[] {
	return [spec.me.logoUrl, spec.opp.logoUrl, ...spec.players.map((p) => p.headshotUrl ?? "")].filter(Boolean)
}

// ------------------------------------------------------------------------------------------------------------------ drawing

const FONT_HEAD = "Anton"
const FONT_TEXT = "Oswald"

function Logo({ src, size, fallback, color }: { src: string | null; size: number; fallback: string; color: string }) {
	if (!src) {
		return (
			<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size, backgroundColor: rgba(color, 0.25), border: `3px solid ${color}`, fontFamily: FONT_HEAD, fontSize: size * 0.34, color: WHITE }}>{fallback}</div>
		)
	}
	// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
	return <img src={src} width={size} height={size} style={{ width: size, height: size, objectFit: "contain" }} />
}

function ResultChip({ result, size }: { result: "W" | "L" | "T"; size: number }) {
	const color = result === "W" ? HIT : result === "L" ? MISS : SILVER
	return (
		<div style={{ display: "flex", padding: `${Math.round(size * 0.18)}px ${Math.round(size * 0.7)}px`, border: `3px solid ${color}`, borderRadius: 999, fontFamily: FONT_TEXT, fontWeight: 700, fontSize: size, letterSpacing: 5, color, ...caps, backgroundColor: rgba(color, 0.12) }}>
			{result === "W" ? "Win" : result === "L" ? "Loss" : "Tie"}
		</div>
	)
}

function Quarters({ spec, away, home, width }: { spec: ReportCardSpec; away: Side; home: Side; width: number }) {
	if (!spec.quarters.length) return <div style={{ display: "flex" }} />
	const cell = Math.min(86, Math.floor((width - 190) / (spec.quarters.length + 1)))
	const value = (s: Side, q: { me: number; opp: number }) => (s === spec.me ? q.me : q.opp)
	const row = (s: Side) => (
		<div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
			<div style={{ display: "flex", width: 110, fontFamily: FONT_TEXT, fontWeight: 600, fontSize: 24, letterSpacing: 3, color: BRIGHT }}>{s.code}</div>
			{spec.quarters.map((q) => (
				<div key={q.label} style={{ display: "flex", justifyContent: "center", width: cell, fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 28, color: BRIGHT }}>{value(s, q)}</div>
			))}
			<div style={{ display: "flex", justifyContent: "center", width: cell, fontFamily: FONT_TEXT, fontWeight: 700, fontSize: 32, color: WHITE }}>{s.score}</div>
		</div>
	)
	return (
		<div style={{ display: "flex", flexDirection: "column", width }}>
			<div style={{ display: "flex", alignItems: "center" }}>
				<div style={{ display: "flex", width: 110 }} />
				{spec.quarters.map((q) => (
					<div key={q.label} style={{ display: "flex", justifyContent: "center", width: cell, fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 18, letterSpacing: 3, color: DIM, ...caps }}>{q.label}</div>
				))}
				<div style={{ display: "flex", justifyContent: "center", width: cell, fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 18, letterSpacing: 3, color: DIM, ...caps }}>T</div>
			</div>
			<div style={{ display: "flex", height: 2, backgroundColor: LINE, marginTop: 6 }} />
			{row(away)}
			{row(home)}
		</div>
	)
}

function ScoreRow({ side, won, logo, nickSize, scoreSize, width }: { side: Side; won: boolean; logo: number; nickSize: number; scoreSize: number; width: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", width }}>
			<Logo src={side.logo} size={logo} fallback={side.code} color={side.color} />
			<div style={{ display: "flex", flex: 1, marginLeft: 22, fontFamily: FONT_TEXT, fontWeight: 600, fontSize: nickSize, letterSpacing: 5, color: won ? WHITE : BRIGHT, ...caps }}>{side.nick}</div>
			<div style={{ display: "flex", fontFamily: FONT_HEAD, fontSize: scoreSize, lineHeight: 1, color: won ? WHITE : DIM }}>{side.score}</div>
		</div>
	)
}

function renderFinal(spec: ReportCardSpec): ReactElement {
	const tall = spec.size === "tall"
	const { width: W, height: H } = SIZE_PIXELS[spec.size]
	const away = spec.homeAway === "home" ? spec.opp : spec.me
	const home = spec.homeAway === "home" ? spec.me : spec.opp
	const meWon = spec.result === "W"
	const glow = spec.opp.color
	const left = tall ? 70 : 64
	const innerW = tall ? W - left * 2 : 640
	const eyebrow = `${spec.week ? `Week ${spec.week} · ` : ""}Final`
	const title = clip(spec.title, tall ? 80 : 70)

	return (
		<Frame glow={glow} w={W} h={H}>
			{spec.photo ? (
				tall ? (
					<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: 470, overflow: "hidden" }}>
						{/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
						<img src={spec.photo} width={W} height={470} style={{ width: W, height: 470, objectFit: "cover" }} />
						<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: 470, backgroundImage: `linear-gradient(180deg, ${rgba(BG, 0.35)} 0%, ${rgba(BG, 0.55)} 55%, ${BG} 100%)` }} />
					</div>
				) : (
					<div style={{ display: "flex", position: "absolute", right: 0, top: 0, width: 420, height: H, overflow: "hidden" }}>
						{/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
						<img src={spec.photo} width={420} height={H} style={{ width: 420, height: H, objectFit: "cover" }} />
						<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 420, height: H, backgroundImage: `linear-gradient(90deg, ${BG} 0%, ${rgba(BG, 0.55)} 45%, ${rgba(BG, 0.2)} 100%)` }} />
					</div>
				)
			) : null}
			<div style={{ display: "flex", position: "absolute", left, top: tall ? 56 : 44 }}>
				<Eyebrow text={eyebrow} color={glow} />
			</div>
			<div style={{ display: "flex", position: "absolute", right: tall ? 70 : 60, top: tall ? 56 : 44 }}>
				<ResultChip result={spec.result} size={tall ? 30 : 24} />
			</div>
			<div style={{ display: "flex", flexDirection: "column", position: "absolute", left, top: tall ? 540 : 108, width: innerW }}>
				<ScoreRow side={away} won={spec.result === "T" || (away === spec.me ? meWon : spec.result === "L")} logo={tall ? 150 : 88} nickSize={tall ? 54 : 38} scoreSize={tall ? 190 : 108} width={innerW} />
				<div style={{ display: "flex", height: 2, backgroundColor: LINE, margin: tall ? "18px 0" : "10px 0" }} />
				<ScoreRow side={home} won={spec.result === "T" || (home === spec.me ? meWon : spec.result === "L")} logo={tall ? 150 : 88} nickSize={tall ? 54 : 38} scoreSize={tall ? 190 : 108} width={innerW} />
			</div>
			<div style={{ display: "flex", position: "absolute", left, top: tall ? 960 : 360 }}>
				<Quarters spec={spec} away={away} home={home} width={tall ? 560 : 440} />
			</div>
			{tall ? (
				<div style={{ display: "flex", position: "absolute", left, top: 1100, width: innerW, fontFamily: FONT_HEAD, fontSize: 62, lineHeight: 1.08, color: WHITE, ...caps }}>{title}</div>
			) : null}
			<div style={{ display: "flex", position: "absolute", left, top: tall ? 1252 : 548 }}>
				<Brand />
			</div>
		</Frame>
	)
}

function Bar({ value, color, zero, dim, width }: { value: number; color: string; zero: number | null; dim: boolean; width: number }) {
	return (
		<div style={{ display: "flex", position: "relative", width, height: 14, borderRadius: 7, backgroundColor: rgba("#ffffff", 0.07), overflow: "hidden" }}>
			<div style={{ display: "flex", width: Math.max(8, Math.round(width * value)), height: 14, borderRadius: 7, backgroundColor: color, opacity: dim ? 0.5 : 1 }} />
			{zero != null ? <div style={{ display: "flex", position: "absolute", left: Math.round(width * zero), top: 0, width: 2, height: 14, backgroundColor: WHITE, opacity: 0.8 }} /> : null}
		</div>
	)
}

function renderStats(spec: ReportCardSpec): ReactElement {
	const tall = spec.size === "tall"
	const { width: W, height: H } = SIZE_PIXELS[spec.size]
	const pad = tall ? 70 : 64
	const labelW = tall ? 330 : 270
	const barW = tall ? 400 : 480
	const rowH = tall ? 92 : 56
	const glow = spec.opp.color
	const head = clip(spec.headline, tall ? 60 : 52)
	return (
		<Frame glow={glow} w={W} h={H}>
			<div style={{ display: "flex", position: "absolute", left: pad, top: tall ? 56 : 40 }}>
				<Eyebrow text={`${spec.week ? `Week ${spec.week} · ` : ""}The numbers`} color={glow} />
			</div>
			<div style={{ display: "flex", position: "absolute", left: pad, top: tall ? 150 : 100, width: W - pad * 2, fontFamily: FONT_HEAD, fontSize: tall ? 78 : 50, lineHeight: 1.06, color: WHITE, ...caps }}>{head}</div>
			<div style={{ display: "flex", alignItems: "center", position: "absolute", left: pad, top: tall ? 340 : 172 }}>
				<Logo src={spec.me.logo} size={tall ? 44 : 32} fallback={spec.me.code} color={spec.me.color} />
				<div style={{ display: "flex", marginLeft: 12, fontFamily: FONT_TEXT, fontWeight: 600, fontSize: tall ? 28 : 22, letterSpacing: 4, color: WHITE, ...caps }}>{spec.me.nick}</div>
				<div style={{ display: "flex", marginLeft: 36 }}>
					<Logo src={spec.opp.logo} size={tall ? 44 : 32} fallback={spec.opp.code} color={spec.opp.color} />
				</div>
				<div style={{ display: "flex", marginLeft: 12, fontFamily: FONT_TEXT, fontWeight: 600, fontSize: tall ? 28 : 22, letterSpacing: 4, color: WHITE, ...caps }}>{spec.opp.nick}</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", position: "absolute", left: pad, top: tall ? 420 : 220, width: W - pad * 2 }}>
				{spec.stats.map((s) => (
					<div key={s.label} style={{ display: "flex", alignItems: "center", height: rowH, borderTop: `2px solid ${LINE}` }}>
						<div style={{ display: "flex", width: labelW, fontFamily: FONT_TEXT, fontWeight: 600, fontSize: tall ? 26 : 21, letterSpacing: 2, color: BRIGHT, ...caps }}>{s.label}</div>
						<div style={{ display: "flex", flexDirection: "column", width: barW }}>
							<Bar value={s.meBar} color={SILVER} zero={s.zero} dim={s.edge === "opp"} width={barW} />
							<div style={{ display: "flex", height: tall ? 10 : 6 }} />
							<Bar value={s.oppBar} color={spec.opp.color} zero={s.zero} dim={s.edge === "me"} width={barW} />
						</div>
						<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: 1 }}>
							<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 700, fontSize: tall ? 30 : 22, color: s.edge === "me" ? WHITE : BRIGHT }}>{s.meText}</div>
							<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 700, fontSize: tall ? 30 : 22, color: s.edge === "opp" ? WHITE : BRIGHT }}>{s.oppText}</div>
						</div>
					</div>
				))}
			</div>
			<div style={{ display: "flex", position: "absolute", left: pad, top: tall ? 1252 : 566 }}>
				<Brand />
			</div>
		</Frame>
	)
}

function PlayerCell({ p, spec, tall }: { p: PlayerLine; spec: ReportCardSpec; tall: boolean }) {
	const color = p.side === "me" ? SILVER : spec.opp.color
	const size = tall ? 136 : 120
	return (
		<div style={{ display: "flex", alignItems: "center", width: tall ? 460 : 530, height: tall ? 196 : 150 }}>
			<div style={{ display: "flex", width: size, height: size, borderRadius: size, overflow: "hidden", border: `${p.star ? 7 : 5}px solid ${p.star ? "#f2c14e" : color}`, backgroundColor: rgba(color, 0.3), alignItems: "flex-end", justifyContent: "center" }}>
				{p.photo ? (
					// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
					<img src={p.photo} width={size - 10} height={size - 10} style={{ width: size - 10, height: size - 10, objectFit: "cover", objectPosition: "50% 12%" }} />
				) : (
					<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size - 10, height: size - 10, fontFamily: FONT_HEAD, fontSize: size * 0.34, color: WHITE }}>{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
				)}
			</div>
			<div style={{ display: "flex", flexDirection: "column", marginLeft: 20, width: (tall ? 460 : 530) - size - 24 }}>
				{p.star ? <div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 600, fontSize: 16, letterSpacing: 4, color: "#f2c14e", ...caps }}>Biggest impact</div> : <div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 16, letterSpacing: 4, color: DIM, ...caps }}>{p.pos}</div>}
				<div style={{ display: "flex", fontFamily: FONT_HEAD, fontSize: tall ? (p.name.length > 13 ? 33 : 40) : p.name.length > 13 ? 30 : 34, lineHeight: 1.05, color: WHITE, ...caps }}>{clip(p.name, 24)}</div>
				<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 500, fontSize: tall ? 20 : 18, lineHeight: 1.15, color: BRIGHT, marginTop: 4 }}>{clip(p.line, 52)}</div>
				<div style={{ display: "flex", marginTop: 6 }}>
					{p.chips.map((c) => (
						<div key={c.label} style={{ display: "flex", flexDirection: "column", marginRight: 18 }}>
							<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 700, fontSize: tall ? 28 : 24, color: WHITE }}>{c.value}</div>
							<div style={{ display: "flex", fontFamily: FONT_TEXT, fontWeight: 500, fontSize: 13, letterSpacing: 2, color: DIM, ...caps }}>{clip(c.label, 16)}</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

function renderPlayers(spec: ReportCardSpec): ReactElement {
	const tall = spec.size === "tall"
	const { width: W, height: H } = SIZE_PIXELS[spec.size]
	const pad = tall ? 70 : 64
	const glow = spec.opp.color
	const mine = spec.players.filter((p) => p.side === "me")
	const theirs = spec.players.filter((p) => p.side === "opp")
	const col = (side: Side, list: PlayerLine[]) => (
		<div style={{ display: "flex", flexDirection: "column", width: tall ? 460 : 530 }}>
			<div style={{ display: "flex", alignItems: "center", marginBottom: tall ? 10 : 4 }}>
				<Logo src={side.logo} size={tall ? 52 : 38} fallback={side.code} color={side.color} />
				<div style={{ display: "flex", marginLeft: 14, fontFamily: FONT_TEXT, fontWeight: 600, fontSize: tall ? 32 : 26, letterSpacing: 5, color: WHITE, ...caps }}>{side.nick}</div>
			</div>
			{list.map((p) => (
				<PlayerCell key={p.name} p={p} spec={spec} tall={tall} />
			))}
		</div>
	)
	return (
		<Frame glow={glow} w={W} h={H}>
			<div style={{ display: "flex", position: "absolute", left: pad, top: tall ? 56 : 36 }}>
				<Eyebrow text={`${spec.week ? `Week ${spec.week} · ` : ""}The players`} color={glow} />
			</div>
			<div style={{ display: "flex", position: "absolute", left: pad, top: tall ? 150 : 98, width: W - pad * 2, fontFamily: FONT_HEAD, fontSize: tall ? 66 : 42, lineHeight: 1.06, color: WHITE, ...caps }}>
				{clip(`${spec.me.nick} ${spec.me.score}, ${spec.opp.nick} ${spec.opp.score}`, 50)}
			</div>
			<div style={{ display: "flex", position: "absolute", left: pad, top: tall ? 290 : 160, width: W - pad * 2, justifyContent: "space-between" }}>
				{col(spec.me, mine)}
				{col(spec.opp, theirs)}
			</div>
			<div style={{ display: "flex", position: "absolute", left: pad, top: tall ? 1252 : 566 }}>
				<Brand />
			</div>
		</Frame>
	)
}

export function renderReportCard(spec: ReportCardSpec): ReactElement {
	return spec.kind === "stats" ? renderStats(spec) : spec.kind === "players" ? renderPlayers(spec) : renderFinal(spec)
}

