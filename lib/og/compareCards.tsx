// The share graphics for a Player Lab comparison. Three formats, each wide (1200x630, what link previews show) or tall (1080x1350,
// what you post as a picture):
//
//   h2h     head to head: both faces, both overall grades, and the stats side by side with who leads each
//   radar   the shape of each player: percentile on every chosen stat, drawn over each other
//   spot    one player's case: his strongest numbers against his position, and how he does against the other
//
//   /api/og?type=compare&a=brock-bowers&b=trey-mcbride[&r=form][&m=epaTgt,croe][&f=h2h|radar|spot][&side=a|b][&size=wide|tall]
//
// buildCompareSpec turns the comparison model (lib/lab/compareKit.ts, the same one the page uses) into a plain spec with no network;
// the route fetches each `headshot` into `photo`. Satori notes are in lib/og/kit.tsx: inline styles only, every element with more
// than one child is display:flex, and no text inside an <svg> (the radar's labels are positioned boxes around the drawing).

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import type { PlayerHistory } from "../lab/seasonKit"
import { type CompareConfig, type Comparison, type Metric, buildComparison, configQuery, lastName, pctWord, peersWord, spotlightOf } from "../lab/compareKit"
import { SIZE_PIXELS } from "../lab/lastShare"
import { teamNick } from "../lab/playerView"
import { type PlayerRow, type PlayersData, GROUP_META, headshotUrl, ordinal, shotUrl } from "../lab/playersKit"
import { isV2Site } from "../lab/labMethod"
import { overallRank } from "../lab/playersKit"
import { SOURCES, sourceLine } from "./basis"
import { BG, BRIGHT, DIM, LINE, SILVER, WHITE, Speed, accent, caps, clip, rgba, RRMark } from "./kit"

export type CompareFormat = "h2h" | "radar" | "spot"
export type CompareSize = "wide" | "tall"

export type ComparePlayer = {
	name: string
	last: string
	/** "Raiders" */
	team: string
	pos: string
	/** His colour on the dark card; the two players' colours are always told apart. */
	color: string
	initials: string
	/** The overall grade, 1 to 99, or null for a job with none (offensive linemen). */
	overall: number | null
	/** True across positions: a grade is a standing at his own position, so it is not drawn as a score to set against the other's. */
	hideOverall?: boolean
	/** "3rd of 38 tight ends", season view only. */
	place: string | null
	/** Where his photo is, for the route to fetch; null when he has none. */
	headshot: string | null
	photo?: string | null
}

export type CompareRowSpec = {
	label: string
	a: string
	b: string
	/** Percentile, 0 to 100, worse to better; null draws no bar. */
	aPct: number | null
	bPct: number | null
	lead: "a" | "b" | "even"
	clear: boolean
	luck: boolean
}

export type SpotRow = { label: string; value: string; pct: number | null; note: string; beats: boolean }

export type CompareCardSpec = {
	type: "compare"
	format: CompareFormat
	size: CompareSize
	/** "Tight ends" */
	title: string
	peers: string
	a: ComparePlayer
	b: ComparePlayer
	/** "Season to date · Through Week 5" */
	range: string
	rows: CompareRowSpec[]
	radar: { label: string; a: number; b: number }[]
	tally: { a: number; b: number; even: number; noise: number }
	headline: string
	/** Set for a spotlight: whose case it is, and what he is strongest at. */
	spot: { side: "a" | "b"; rows: SpotRow[]; versus: string } | null
	/** True when the numbers rest on little (an early read), so the card says so. */
	early: boolean
	/** The comparison's own link, as printed on the card. */
	link: string
	/** One line on what the percentile is measured against. */
	basis: string
	season: number
	week: number
}

export const compareCardSize = (spec: Pick<CompareCardSpec, "size">) => SIZE_PIXELS[spec.size]

const initialsOf = (name: string) => {
	const parts = name.replace(/[^A-Za-z .'-]/g, "").split(/\s+/).filter(Boolean)
	return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase()
}

const hexRgb = (hex: string): [number, number, number] => {
	const n = parseInt(hex.slice(1), 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const apart = (x: string, y: string) => {
	const [a, b] = [hexRgb(x), hexRgb(y)]
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Each player's colour on the dark card: the Raiders in bone white, everyone else in their team's colour, and the second told apart from the first. */
export function pairColors(teamA: string, teamB: string): [string, string] {
	const base = (t: string) => (t === "LV" ? WHITE : accent(opponentColors(t).dark))
	const ca = base(teamA)
	let cb = base(teamB)
	if (teamA === teamB || apart(ca, cb) < 110) cb = ["#4da3ff", "#f2c14e", "#ff6b6b"].find((c) => apart(ca, c) > 130) ?? SILVER
	return [ca, cb]
}

const headshotOf = (p: PlayerRow) => (p.espn ? headshotUrl(p.espn) : p.shot ? shotUrl(p.shot).replace("f_auto,q_auto", "f_png,w_400") : null)

function playerOf(data: PlayersData, c: Comparison, side: "a" | "b", color: string): ComparePlayer {
	const p = side === "a" ? c.a : c.b
	const o = side === "a" ? c.overall.a : c.overall.b
	const rank = c.range === "season" ? overallRank(c.views[side], p) : null
	// A season is named on the card when it is not the one being played, or when the two men are not in the same one.
	const year = c.seasons[side]
	const named = year !== data.season || c.seasons.a !== c.seasons.b
	return {
		name: p.name,
		last: named ? `${lastName(p)} ${year}` : lastName(p),
		team: named ? `${teamNick(p.team)} ${year}` : teamNick(p.team),
		// "DB" and "DL" do not say which of the two jobs is being compared; the pair's own tag ("CB", "EDGE") does.
		pos: c.cross ? c.cross.tags[side] : p.pos,
		color,
		initials: initialsOf(p.name),
		overall: c.cross ? null : o,
		hideOverall: !!c.cross,
		place: rank ? `${ordinal(rank.rank)} of ${rank.of} ${GROUP_META[p.group].peers}` : null,
		headshot: headshotOf(p),
	}
}

/** The link printed on a card: the comparison's own address, without the picker's list of stats (the post's link carries those). */
function printedLink(cfg: CompareConfig, a: string, b: string): string {
	const q = configQuery({ ...cfg, a, b, metrics: null, group: null })
	return `raidersrundown.com/lab/players/compare?${q}`
}

/** The spec for one graphic of a comparison, or null when the pair cannot be compared (unknown player, two different jobs, the same man twice). */
export function buildCompareSpec(data: PlayersData, cfg: CompareConfig, opts: { format?: CompareFormat; size?: CompareSize; side?: "a" | "b" } = {}, history?: PlayerHistory | null): CompareCardSpec | null {
	const c = buildComparison(data, cfg, history)
	if (!c || !c.metrics.length) return null
	const size: CompareSize = opts.size === "tall" ? "tall" : "wide"
	let format: CompareFormat = opts.format ?? "h2h"
	// A radar needs at least three stats both players have a percentile on; fewer, and the head-to-head says it better.
	if (format === "radar" && c.radar.length < 3) format = "h2h"
	const [ca, cb] = pairColors(c.a.team, c.b.team)
	const a = playerOf(data, c, "a", ca)
	const b = playerOf(data, c, "b", cb)
	const cap = size === "tall" ? 8 : 6
	const metrics = c.metrics.slice(0, cap)
	const rows: CompareRowSpec[] = metrics.map((m) => ({
		label: clip(m.short, size === "tall" ? 26 : 20),
		a: m.a.text,
		b: m.b.text,
		aPct: m.a.pct,
		bPct: m.b.pct,
		lead: m.signal === "luck" ? "even" : m.lead,
		clear: m.strength === "clear" && m.signal !== "luck",
		luck: m.signal === "luck",
	}))
	let spot: CompareCardSpec["spot"] = null
	if (format === "spot") {
		const side = opts.side === "b" ? "b" : "a"
		const mine = spotlightOf(c, side, size === "tall" ? 5 : 4)
		if (mine.length < 2) format = "h2h"
		else {
			const wins = side === "a" ? c.tally.a : c.tally.b
			const n = c.tally.a + c.tally.b + c.tally.even
			const other = side === "a" ? c.b : c.a
			spot = {
				side,
				versus: wins > 0 && n ? `Ahead of ${lastName(other)} on ${wins} of ${n} ${c.cross ? "shared stats" : "stats"}` : `Strongest numbers among ${peersWord(c)}`,
				rows: mine.map((m: Metric) => {
					const s = side === "a" ? m.a : m.b
					return {
						label: clip(m.label, 30),
						value: s.text,
						pct: s.pct,
						note: `${s.rank !== null && s.of !== null ? `${ordinal(s.rank)} of ${s.of}` : pctWord(s.pct)}${m.signal === "luck" ? " · early read" : ""}`,
						beats: m.lead === side,
					}
				}),
			}
		}
	}
	return {
		type: "compare",
		format,
		size,
		title: c.cross ? `${c.cross.tags.a} vs ${c.cross.tags.b} · ${c.cross.short}` : GROUP_META[c.group].title,
		peers: peersWord(c),
		a,
		b,
		range: c.seasons.a !== c.seasons.b ? `${c.seasons.a} and ${c.seasons.b} seasons` : c.seasons.a !== data.season ? `${c.seasons.a} season · Full season` : `${c.rangeName} · ${c.rangeWeeks}`,
		rows,
		radar: c.radar.map((r) => ({ label: clip(r.short, 15), a: r.a, b: r.b })),
		tally: { a: c.tally.a, b: c.tally.b, even: c.tally.even, noise: c.tally.noise },
		headline: c.headline,
		spot,
		early: c.early.a || c.early.b,
		link: printedLink(cfg, c.a.slug, c.b.slug),
		basis: c.cross
			? c.range === "season"
				? `Shared stats only. Bars: one scale for ${c.cross.pool}, 100 is best.`
				: `Shared stats only. Bars: these games against the season's spread among ${c.cross.pool}. Fewer plays, so they swing more.`
			: c.range === "season"
				? `Bars: season rank among ${c.metrics.length ? GROUP_META[c.group].peers : "peers"}, 100 is best.`
				: `Bars: these games against the season's spread among ${GROUP_META[c.group].peers}. Fewer plays, so they swing more.`,
		season: data.season,
		week: data.week,
	}
}

// ---- drawing ----------------------------------------------------------------------------------------------------

const oswald = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, ...extra })
const anton = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Anton", ...extra })
const dim = (extra: Record<string, string | number> = {}) => oswald({ letterSpacing: 3, color: DIM, ...caps, ...extra })

/**
 * A player's face in a ring of his colour, or his initials when there is no photo. The glow behind it is a soft radial gradient rather than
 * a blurred shadow: a blur that wide takes the renderer seconds on a tall card, a gradient takes nothing.
 */
function Face({ p, size }: { p: ComparePlayer; size: number }) {
	const ring = Math.max(4, Math.round(size / 22))
	const outer = size + ring * 2
	const glow = Math.round(outer * 1.7)
	const inset = Math.round((glow - outer) / 2)
	return (
		<div style={{ display: "flex", position: "relative", width: outer, height: outer, alignItems: "center", justifyContent: "center", borderRadius: size, backgroundColor: rgba(p.color, 0.22) }}>
			<div style={{ display: "flex", position: "absolute", left: -inset, top: -inset, width: glow, height: glow, backgroundImage: `radial-gradient(circle at 50% 50%, ${rgba(p.color, 0.4)} 0%, ${rgba(p.color, 0.16)} 38%, ${rgba(p.color, 0)} 68%)` }} />
			<div style={{ display: "flex", position: "relative", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size, overflow: "hidden", border: `${ring}px solid ${p.color}`, backgroundColor: rgba(p.color, 0.3) }}>
				{p.photo ? (
					// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
					<img src={p.photo} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", objectPosition: "50% 15%" }} />
				) : (
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: Math.round(size * 0.4), color: WHITE }}>{p.initials}</div>
				)}
			</div>
		</div>
	)
}

/** The stage: near-black, a glow of each player's colour from its own side, the speed lines and a bar across the top from one colour to the other. */
function Stage({ spec, children }: { spec: CompareCardSpec; children: ReactElement[] | ReactElement }) {
	const { width: w, height: h } = compareCardSize(spec)
	const glowY = spec.size === "tall" ? "62%" : "100%"
	return (
		<div style={{ display: "flex", position: "relative", width: w, height: h, overflow: "hidden", backgroundColor: BG, color: WHITE, backgroundImage: `radial-gradient(circle at 0% ${glowY}, ${rgba(spec.a.color, 0.34)} 0%, ${rgba(spec.a.color, 0)} 56%), radial-gradient(circle at 100% ${glowY}, ${rgba(spec.b.color, 0.34)} 0%, ${rgba(spec.b.color, 0)} 56%), radial-gradient(circle at 50% -10%, rgba(207,211,214,0.16) 0%, rgba(207,211,214,0) 46%)` }}>
			<Speed w={w} h={h} />
			<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: w, height: 8, backgroundImage: `linear-gradient(90deg, ${spec.a.color} 0%, #e6e7e9 50%, ${spec.b.color} 100%)` }} />
			{children}
		</div>
	)
}

function Footer({ spec, width }: { spec: CompareCardSpec; width: number }) {
	const tall = spec.size === "tall"
	return (
		<div style={{ display: "flex", flexDirection: "column", width, marginTop: "auto" }}>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width }}>
				<div style={{ display: "flex", alignItems: "center" }}>
					<RRMark size={tall ? 52 : 44} />
					<div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
						<div style={oswald({ fontSize: tall ? 26 : 22, letterSpacing: 5, color: SILVER, ...caps })}>raidersrundown.com</div>
						<div style={oswald({ fontSize: tall ? 17 : 15, letterSpacing: 2, color: DIM, ...caps })}>Player Lab</div>
					</div>
				</div>
				<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: tall ? 640 : 560 }}>
					<div style={oswald({ fontSize: tall ? 24 : 20, letterSpacing: 3, color: WHITE, ...caps })}>Settle it with the numbers</div>
					<div style={oswald({ fontSize: tall ? 17 : 14, letterSpacing: 0.5, color: BRIGHT, marginTop: 4 })}>{clip(spec.link, tall ? 72 : 66)}</div>
				</div>
			</div>
			<div style={oswald({ fontSize: tall ? 15 : 13, letterSpacing: 0.5, color: DIM, marginTop: 10, fontWeight: 400 })}>
				{`${spec.basis} ${sourceLine(SOURCES.grades, spec.season, spec.week)}${spec.early ? " · Early read: small samples." : ""}`}
			</div>
		</div>
	)
}

function Overall({ p, size, align }: { p: ComparePlayer; size: number; align: "left" | "right" | "center" }) {
	if (p.hideOverall) return null
	const ai = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: ai }}>
			{p.overall === null ? null : (
				<div style={{ display: "flex", alignItems: "baseline" }}>
					<div style={anton({ fontSize: size, lineHeight: 1, color: p.color })}>{String(p.overall)}</div>
				</div>
			)}
			<div style={dim({ fontSize: Math.max(13, Math.round(size / 4.2)), letterSpacing: 2, marginTop: 2 })}>{p.overall === null ? "No overall for linemen" : isV2Site() ? "This season (percentile)" : "Overall grade"}</div>
		</div>
	)
}

function PlayerBlock({ p, face, align, nameSize, overallSize, width }: { p: ComparePlayer; face: number; align: "left" | "right" | "center"; nameSize: number; overallSize: number; width: number }) {
	const ai = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"
	const ta = align
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: ai, width }}>
			<Face p={p} size={face} />
			<div style={{ display: "flex", flexDirection: "column", alignItems: ai, marginTop: 14, width }}>
				<div style={anton({ fontSize: nameSize, lineHeight: 1.02, color: WHITE, textAlign: ta, ...caps })}>{clip(p.name, nameSize > 44 ? 20 : 24)}</div>
				<div style={dim({ fontSize: Math.round(nameSize / 2.6), letterSpacing: 3, marginTop: 6, color: p.color })}>{`${p.team} · ${p.pos}`}</div>
			</div>
			<div style={{ display: "flex", marginTop: 12 }}>
				<Overall p={p} size={overallSize} align={align} />
			</div>
			{p.place ? <div style={oswald({ fontSize: Math.round(nameSize / 2.4), color: BRIGHT, marginTop: 4, textAlign: ta })}>{clip(p.place, 34)}</div> : null}
		</div>
	)
}

/** The score between the two: how many stats each leads. */
function Score({ spec, big }: { spec: CompareCardSpec; big: boolean }) {
	const f = big ? 96 : 66
	const { a, b, even, noise } = spec.tally
	const og = spec.a.overall !== null && spec.b.overall !== null ? spec.a.overall - spec.b.overall : 0
	const gradeLine = Math.abs(og) >= 3 ? `${og > 0 ? spec.a.last : spec.b.last} grades ${Math.abs(og)} higher overall` : null
	if (a + b === 0) {
		// Nobody leads anything that counts: say so in words rather than showing 0 to 0.
		return (
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
				<div style={dim({ fontSize: big ? 22 : 17, letterSpacing: 6 })}>Verdict</div>
				<div style={anton({ fontSize: Math.round(f * 0.72), lineHeight: 1.05, marginTop: 6, color: WHITE, ...caps })}>{even ? "Dead even" : "Too early"}</div>
				<div style={dim({ fontSize: big ? 18 : 14, letterSpacing: 2, marginTop: 4 })}>{gradeLine ?? (even ? "No gap beats the noise" : `${noise} stat${noise === 1 ? "" : "s"} still mostly luck`)}</div>
			</div>
		)
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
			<div style={dim({ fontSize: big ? 22 : 17, letterSpacing: 6 })}>Stats led</div>
			<div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
				<div style={anton({ fontSize: f, lineHeight: 1, color: a >= b ? spec.a.color : DIM })}>{String(a)}</div>
				<div style={anton({ fontSize: Math.round(f / 2), color: DIM, margin: big ? "0 20px" : "0 14px" })}>–</div>
				<div style={anton({ fontSize: f, lineHeight: 1, color: b >= a ? spec.b.color : DIM })}>{String(b)}</div>
			</div>
			{even ? <div style={dim({ fontSize: big ? 18 : 14, letterSpacing: 2, marginTop: 4 })}>{`${even} too close to call`}</div> : null}
		</div>
	)
}

/** One stat: his number, the label with two bars growing from the middle, hers. The leader's number is lit in his colour. */
function StatRow({ r, spec, width, big }: { r: CompareRowSpec; spec: CompareCardSpec; width: number; big: boolean }) {
	const valW = big ? 190 : 108
	const mid = width - valW * 2
	const half = Math.round((mid - 24) / 2)
	const barH = big ? 14 : 10
	const lit = (side: "a" | "b") => r.lead === side
	const color = (side: "a" | "b") => (side === "a" ? spec.a.color : spec.b.color)
	const val = (side: "a" | "b", text: string) => (
		<div style={{ display: "flex", width: valW, justifyContent: side === "a" ? "flex-end" : "flex-start", alignItems: "center" }}>
			<div style={anton({ fontSize: big ? 46 : 31, lineHeight: 1, color: lit(side) ? color(side) : "#9aa0a6" })}>{clip(text, big ? 12 : 11)}</div>
		</div>
	)
	const bar = (side: "a" | "b", pct: number | null) => (
		<div style={{ display: "flex", width: half, justifyContent: side === "a" ? "flex-end" : "flex-start", backgroundColor: "rgba(255,255,255,0.06)", height: barH }}>
			{pct === null ? null : <div style={{ display: "flex", width: Math.max(4, Math.round((half * pct) / 100)), height: barH, backgroundColor: color(side), opacity: lit(side) ? 1 : 0.5 }} />}
		</div>
	)
	return (
		<div style={{ display: "flex", alignItems: "center", width, height: big ? 82 : 55, borderBottom: `1px solid ${LINE}` }}>
			{val("a", r.a)}
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: mid }}>
				<div style={{ display: "flex", alignItems: "center" }}>
					<div style={oswald({ fontSize: big ? 24 : 17, letterSpacing: 2, color: BRIGHT, ...caps })}>{r.label}</div>
					{r.luck ? <div style={oswald({ fontSize: big ? 15 : 12, letterSpacing: 1, color: DIM, marginLeft: 10, ...caps })}>mostly luck</div> : r.clear ? <div style={oswald({ fontSize: big ? 15 : 12, letterSpacing: 1, color: "#4ade80", marginLeft: 10, ...caps })}>clear lead</div> : null}
				</div>
				<div style={{ display: "flex", alignItems: "center", marginTop: big ? 8 : 5 }}>
					{bar("a", r.aPct)}
					<div style={{ display: "flex", width: 24, justifyContent: "center" }}>
						<div style={{ display: "flex", width: 2, height: barH + 8, backgroundColor: "rgba(255,255,255,0.35)" }} />
					</div>
					{bar("b", r.bPct)}
				</div>
			</div>
			{val("b", r.b)}
		</div>
	)
}

const Headline = ({ text, size, width }: { text: string; size: number; width: number }) => <div style={oswald({ fontSize: size, fontWeight: 600, color: WHITE, width, lineHeight: 1.2 })}>{clip(text, 110)}</div>

function eyebrow(spec: CompareCardSpec, width: number, big: boolean) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width }}>
			<div style={{ display: "flex", flexDirection: "column" }}>
				<div style={dim({ fontSize: big ? 26 : 22, letterSpacing: 6 })}>{`Player Lab · ${spec.title}`}</div>
				<div style={{ display: "flex", width: 84, height: 4, marginTop: 10, backgroundImage: `linear-gradient(90deg, ${spec.a.color}, ${spec.b.color})` }} />
			</div>
			<div style={oswald({ fontSize: big ? 22 : 18, letterSpacing: 3, color: SILVER, ...caps })}>{clip(spec.range, 48)}</div>
		</div>
	)
}

// ---- head to head ----

function H2H({ spec }: { spec: CompareCardSpec }) {
	const tall = spec.size === "tall"
	const { width: W, height: H } = compareCardSize(spec)
	if (!tall) {
		const pad = 40
		const inner = W - pad * 2
		const side = 270
		const mid = inner - side * 2 - 40
		return (
			<Stage spec={spec}>
				<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `26px ${pad}px 20px` }}>
					{eyebrow(spec, inner, false)}
					<div style={{ display: "flex", marginTop: 14, width: inner }}>
						<PlayerBlock p={spec.a} face={168} align="left" nameSize={38} overallSize={64} width={side} />
						<div style={{ display: "flex", flexDirection: "column", width: mid, marginLeft: 20, marginRight: 20 }}>
							<div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
								<Score spec={spec} big={false} />
							</div>
							{spec.rows.map((r) => (
								<StatRow key={r.label} r={r} spec={spec} width={mid} big={false} />
							))}
						</div>
						<PlayerBlock p={spec.b} face={168} align="right" nameSize={38} overallSize={64} width={side} />
					</div>
					<Footer spec={spec} width={inner} />
				</div>
			</Stage>
		)
	}
	const pad = 56
	const inner = W - pad * 2
	return (
		<Stage spec={spec}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `40px ${pad}px 32px` }}>
				{eyebrow(spec, inner, true)}
				<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 26, width: inner }}>
					<PlayerBlock p={spec.a} face={236} align="center" nameSize={46} overallSize={84} width={340} />
					<div style={{ display: "flex", marginTop: 70 }}>
						<Score spec={spec} big />
					</div>
					<PlayerBlock p={spec.b} face={236} align="center" nameSize={46} overallSize={84} width={340} />
				</div>
				<div style={{ display: "flex", flexDirection: "column", marginTop: 26, width: inner }}>
					{spec.rows.map((r) => (
						<StatRow key={r.label} r={r} spec={spec} width={inner} big />
					))}
				</div>
				<div style={{ display: "flex", marginTop: 22 }}>
					<Headline text={spec.headline} size={30} width={inner} />
				</div>
				<Footer spec={spec} width={inner} />
			</div>
		</Stage>
	)
}

// ---- radar ----

function Radar({ spec, size }: { spec: CompareCardSpec; size: number }) {
	const axes = spec.radar
	const n = axes.length
	const R = size / 2 - (spec.size === "tall" ? 74 : 86)
	const cx = size / 2
	const cy = size / 2
	const ang = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180)
	const pt = (i: number, pct: number) => `${(cx + R * (pct / 100) * Math.cos(ang(i))).toFixed(1)},${(cy + R * (pct / 100) * Math.sin(ang(i))).toFixed(1)}`
	const poly = (get: (i: number) => number) => axes.map((_, i) => pt(i, Math.max(3, get(i)))).join(" ")
	const ring = (pct: number) => axes.map((_, i) => pt(i, pct)).join(" ")
	const labW = spec.size === "tall" ? 170 : 128
	const f = spec.size === "tall" ? 20 : 16
	return (
		<div style={{ display: "flex", position: "relative", width: size, height: size }}>
			<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", left: 0, top: 0 }}>
				{[25, 50, 75, 100].map((p) => (
					<polygon key={p} points={ring(p)} fill={p === 50 ? "rgba(255,255,255,0.035)" : "none"} stroke={p === 100 ? "#4a4d52" : "#2b2d30"} strokeWidth={p === 100 ? 2 : 1.5} />
				))}
				{axes.map((_, i) => (
					<line key={i} x1={cx} y1={cy} x2={cx + R * Math.cos(ang(i))} y2={cy + R * Math.sin(ang(i))} stroke="#2b2d30" strokeWidth={1.5} />
				))}
				<polygon points={poly((i) => axes[i].b)} fill={rgba(spec.b.color, 0.28)} stroke={spec.b.color} strokeWidth={4} strokeLinejoin="round" />
				<polygon points={poly((i) => axes[i].a)} fill={rgba(spec.a.color, 0.3)} stroke={spec.a.color} strokeWidth={4} strokeLinejoin="round" />
				{axes.map((r, i) => {
					const [ax, ay] = pt(i, Math.max(3, r.a)).split(",")
					const [bx, by] = pt(i, Math.max(3, r.b)).split(",")
					return (
						<g key={i}>
							<circle cx={bx} cy={by} r={6} fill={spec.b.color} stroke={BG} strokeWidth={2} />
							<circle cx={ax} cy={ay} r={6} fill={spec.a.color} stroke={BG} strokeWidth={2} />
						</g>
					)
				})}
			</svg>
			{axes.map((r, i) => {
				const lx = cx + (R + (spec.size === "tall" ? 46 : 40)) * Math.cos(ang(i))
				const ly = cy + (R + (spec.size === "tall" ? 40 : 34)) * Math.sin(ang(i))
				return (
					<div key={r.label} style={{ display: "flex", position: "absolute", left: lx - labW / 2, top: ly - f, width: labW, justifyContent: "center", textAlign: "center" }}>
						<div style={oswald({ fontSize: f, letterSpacing: 1.5, color: BRIGHT, justifyContent: "center", textAlign: "center", ...caps })}>{r.label}</div>
					</div>
				)
			})}
		</div>
	)
}

function RadarCard({ spec }: { spec: CompareCardSpec }) {
	const tall = spec.size === "tall"
	const { width: W, height: H } = compareCardSize(spec)
	if (!tall) {
		const pad = 40
		const inner = W - pad * 2
		const rightW = 500
		return (
			<Stage spec={spec}>
				<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `26px ${pad}px 20px` }}>
					{eyebrow(spec, inner, false)}
					<div style={{ display: "flex", alignItems: "center", marginTop: 4, width: inner }}>
						<Radar spec={spec} size={440} />
						<div style={{ display: "flex", flexDirection: "column", width: rightW, marginLeft: 70 }}>
							<div style={{ display: "flex", alignItems: "center" }}>
								<Face p={spec.a} size={96} />
								<div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
									<div style={anton({ fontSize: 40, lineHeight: 1.02, color: WHITE, ...caps })}>{clip(spec.a.name, 18)}</div>
									<div style={dim({ fontSize: 17, letterSpacing: 3, color: spec.a.color, marginTop: 4 })}>{spec.a.hideOverall ? `${spec.a.team} · ${spec.a.pos}` : `${spec.a.team} · Overall ${spec.a.overall ?? "–"}`}</div>
								</div>
							</div>
							<div style={{ display: "flex", alignItems: "center", marginTop: 20 }}>
								<Face p={spec.b} size={96} />
								<div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
									<div style={anton({ fontSize: 40, lineHeight: 1.02, color: WHITE, ...caps })}>{clip(spec.b.name, 18)}</div>
									<div style={dim({ fontSize: 17, letterSpacing: 3, color: spec.b.color, marginTop: 4 })}>{spec.b.hideOverall ? `${spec.b.team} · ${spec.b.pos}` : `${spec.b.team} · Overall ${spec.b.overall ?? "–"}`}</div>
								</div>
							</div>
							<div style={{ display: "flex", marginTop: 22 }}>
								<Headline text={spec.headline} size={26} width={rightW} />
							</div>
						</div>
					</div>
					<Footer spec={spec} width={inner} />
				</div>
			</Stage>
		)
	}
	const pad = 56
	const inner = W - pad * 2
	return (
		<Stage spec={spec}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `40px ${pad}px 32px` }}>
				{eyebrow(spec, inner, true)}
				<div style={{ display: "flex", justifyContent: "center", marginTop: 6, width: inner }}>
					<Radar spec={spec} size={700} />
				</div>
				<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: inner, marginTop: 6 }}>
					<PlayerBlock p={spec.a} face={120} align="center" nameSize={36} overallSize={56} width={300} />
					<div style={{ display: "flex", marginTop: 24 }}>
						<Score spec={spec} big={false} />
					</div>
					<PlayerBlock p={spec.b} face={120} align="center" nameSize={36} overallSize={56} width={300} />
				</div>
				<div style={{ display: "flex", marginTop: 16 }}>
					<Headline text={spec.headline} size={28} width={inner} />
				</div>
				<Footer spec={spec} width={inner} />
			</div>
		</Stage>
	)
}

// ---- spotlight ----

function SpotRows({ spec, width, big }: { spec: CompareCardSpec; width: number; big: boolean }) {
	const s = spec.spot!
	const color = s.side === "a" ? spec.a.color : spec.b.color
	const track = width - (big ? 260 : 200)
	return (
		<div style={{ display: "flex", flexDirection: "column", width }}>
			{s.rows.map((r) => (
				<div key={r.label} style={{ display: "flex", flexDirection: "column", width, marginBottom: big ? 20 : 12 }}>
					<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", width }}>
						<div style={{ display: "flex", alignItems: "center" }}>
							<div style={oswald({ fontSize: big ? 28 : 22, letterSpacing: 2, color: WHITE, ...caps })}>{r.label}</div>
							{r.beats ? <div style={oswald({ fontSize: big ? 16 : 13, letterSpacing: 1, color: "#4ade80", marginLeft: 12, ...caps })}>ahead</div> : null}
						</div>
						<div style={oswald({ fontSize: big ? 22 : 17, letterSpacing: 1, color: BRIGHT })}>{r.note}</div>
					</div>
					<div style={{ display: "flex", alignItems: "center", marginTop: 6 }}>
						<div style={{ display: "flex", width: track, height: big ? 16 : 12, backgroundColor: "rgba(255,255,255,0.07)" }}>
							<div style={{ display: "flex", width: r.pct === null ? 0 : Math.max(6, Math.round((track * r.pct) / 100)), height: big ? 16 : 12, backgroundColor: color }} />
						</div>
						<div style={anton({ fontSize: big ? 44 : 32, lineHeight: 1, color, marginLeft: 20 })}>{clip(r.value, 12)}</div>
					</div>
				</div>
			))}
		</div>
	)
}

function Spot({ spec }: { spec: CompareCardSpec }) {
	const s = spec.spot!
	const me = s.side === "a" ? spec.a : spec.b
	const other = s.side === "a" ? spec.b : spec.a
	const tall = spec.size === "tall"
	const { width: W, height: H } = compareCardSize(spec)
	if (!tall) {
		const pad = 44
		const inner = W - pad * 2
		const left = 360
		return (
			<Stage spec={{ ...spec, a: me, b: other }}>
				<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `26px ${pad}px 20px` }}>
					{eyebrow({ ...spec, a: me, b: other }, inner, false)}
					<div style={{ display: "flex", marginTop: 16, width: inner }}>
						<PlayerBlock p={me} face={150} align="left" nameSize={40} overallSize={64} width={left} />
						<div style={{ display: "flex", flexDirection: "column", marginLeft: 60, width: inner - left - 60 }}>
							<div style={dim({ fontSize: 18, letterSpacing: 4, color: me.color, marginBottom: 14 })}>{`The case for ${me.last} · ${clip(s.versus, 46)}`}</div>
							<SpotRows spec={spec} width={inner - left - 60} big={false} />
						</div>
					</div>
					<Footer spec={spec} width={inner} />
				</div>
			</Stage>
		)
	}
	const pad = 56
	const inner = W - pad * 2
	return (
		<Stage spec={{ ...spec, a: me, b: other }}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `40px ${pad}px 32px` }}>
				{eyebrow({ ...spec, a: me, b: other }, inner, true)}
				<div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 30, width: inner }}>
					<PlayerBlock p={me} face={210} align="center" nameSize={56} overallSize={88} width={inner} />
				</div>
				<div style={dim({ fontSize: 22, letterSpacing: 4, color: me.color, marginTop: 26, marginBottom: 20 })}>{`The case for ${me.last} · ${clip(s.versus, 50)}`}</div>
				<SpotRows spec={spec} width={inner} big />
				<Footer spec={spec} width={inner} />
			</div>
		</Stage>
	)
}

export function renderCompareCard(spec: CompareCardSpec): ReactElement {
	if (spec.format === "radar") return <RadarCard spec={spec} />
	if (spec.format === "spot" && spec.spot) return <Spot spec={spec} />
	return <H2H spec={spec} />
}

