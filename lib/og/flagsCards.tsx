// The share cards for the penalty flags (/lab/flags): one flag, a team, a player, two teams side by side, a leaderboard, a penalty, and a situation.
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// flagsSpec.ts turns the flags data into one of these small plain specs (no network, so it can be tested from fixed data) and renderFlagsCard turns a
// spec into JSX. A spec lists the people on the card in `heads`; the route fetches each photo and puts it in `photo`, and a card without one draws
// his initials. See lib/og/kit.tsx for the Satori notes: inline styles only, every element with more than one child is display:flex, and no text
// inside an <svg>.

import type { ReactElement } from "react"

import { type ShareSize, SIZE_PIXELS } from "../lab/lastShare"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, GOLD, LINE, MISS, SILVER, WHITE, caps, clip, rgba } from "./kit"

/** A person on a card. `url` is where his photo is (for the route to fetch); `photo` is it as a data: URI once fetched. */
export type Head = { name: string; sub: string; url: string | null; photo?: string | null; color: string }

/** One row of bars: a label, the number to read, how long the bar is (0 to 1), and a line of small print under it. */
export type Bar = { label: string; value: string; frac: number; note?: string; hot?: boolean }

/** One row of a leaderboard. */
export type Row = { rank: number; title: string; sub: string; v1: string; v2: string; head?: number; color?: string }

/** One row of a two-team comparison: the numbers, how long each bar is (0 to 1, on one shared scale) and which team's is worse. */
export type Pair = { label: string; a: string; b: string; fa: number; fb: number; worse: "a" | "b" | null }

type Base = { type: "flags"; size: ShareSize; season: number; week: number; color: string; heads: Head[]; updated?: string }

export type FlagCardSpec = Base & {
	kind: "flag"
	/** "Unnecessary Roughness". */
	ty: string
	yards: string
	/** The cost as text: "-5.2". */
	cost: string
	/** "1.2 turnovers" */
	turnovers: string
	/** "Week 4 vs KC" */
	game: string
	team: string
	teamName: string
	who: string
	whoSub: string
	head: number | null
	down: string
	spot: string
	clock: string
	score: string
	result: string
	tags: string[]
	/** The change in the team's win probability, as text, or null. */
	wp: string | null
}

export type TeamCardSpec = Base & {
	kind: "team"
	team: string
	name: string
	stats: { flags: string; cost: string; costly: string; yards: string }
	/** "Costs the 5th most of 32 teams, per game". */
	rank: string
	bars: Bar[]
	types: { label: string; value: string }[]
	worst: string | null
	/** Indexes of the heads with how many flags each has. */
	faces: { head: number; value: string }[]
}

export type PlayerCardSpec = Base & {
	kind: "player"
	name: string
	team: string
	teamName: string
	pos: string
	head: number | null
	stats: { flags: string; cost: string; costly: string; fourth: string }
	rank: string | null
	bars: Bar[]
	types: { label: string; value: string }[]
	worst: string | null
	note: string | null
}

export type CompareCardSpec = Base & {
	kind: "compare"
	a: { team: string; name: string; color: string; rank: string }
	b: { team: string; name: string; color: string; rank: string }
	pairs: Pair[]
	edges: string[]
}

export type BoardCardSpec = Base & {
	kind: "board"
	title: string
	sub: string
	cols: [string, string]
	rows: Row[]
}

export type PenaltyCardSpec = Base & {
	kind: "penalty"
	name: string
	stats: { flags: string; yards: string; avg: string; costly: string }
	bars: Bar[]
	teams: { label: string; value: string }[]
	people: { head: number; value: string }[]
	worst: string | null
	note: string | null
}

export type SituationCardSpec = Base & {
	kind: "situation"
	question: string
	subject: string
	label: string
	rows: Bar[]
	/** The sentence about where the subject stands out, or null. */
	standout: string | null
	total: string
}

export type FlagsCardSpec = FlagCardSpec | TeamCardSpec | PlayerCardSpec | CompareCardSpec | BoardCardSpec | PenaltyCardSpec | SituationCardSpec

export const flagsCardSize = (spec: Pick<FlagsCardSpec, "size">) => SIZE_PIXELS[spec.size]

// ---- pieces ----------------------------------------------------------------------------------------------------

const PAD = 56
const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })
const fit = (text: string, maxW: number, big: number, min = 40): number => Math.max(min, Math.min(big, Math.floor(maxW / (text.length * 0.5))))

function initials(name: string): string {
	if (/^[A-Z]{2,3}$/.test(name)) return name
	const parts = name.replace(/[^A-Za-z. -]/g, "").split(/[ .]+/).filter(Boolean)
	return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

/** A round photo in the team's colour, or his initials. */
function Face({ head, size, ring = 6 }: { head?: Head; size: number; ring?: number }) {
	const color = head?.color ?? SILVER
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: size, overflow: "hidden", border: `${ring}px solid ${color}`, backgroundColor: rgba(color, 0.3) }}>
			{head?.photo ? (
				// eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
				<img src={head.photo} width={size - ring * 2} height={size - ring * 2} style={{ width: size - ring * 2, height: size - ring * 2, objectFit: "cover", objectPosition: "50% 15%" }} />
			) : (
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: Math.round(size * 0.36), color: WHITE }}>{initials(head?.name ?? "?")}</div>
			)}
		</div>
	)
}

function Pill({ text, color = GOLD }: { text: string; color?: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", marginRight: 10, marginBottom: 10, padding: "7px 16px", border: `2px solid ${rgba(color, 0.85)}`, backgroundColor: rgba(color, 0.14), fontFamily: "Oswald", fontWeight: 600, fontSize: 20, letterSpacing: 1.5, color: WHITE, ...caps }}>
			<div style={{ display: "flex", width: 10, height: 10, marginRight: 12, backgroundColor: color, transform: "rotate(45deg)" }} />
			{text}
		</div>
	)
}

function Stat({ value, name, color = WHITE, size = 76, w }: { value: string; name: string; color?: string; size?: number; w?: number }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", marginRight: w ? 0 : 38, ...(w ? { width: w } : {}) }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: 1, color }}>{value}</div>
			<div style={label({ fontSize: 16, letterSpacing: 3, marginTop: 6, color: BRIGHT })}>{name}</div>
		</div>
	)
}

function Panel({ title, w, children }: { title: string; w: number; children: ReactElement | (ReactElement | null)[] }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", width: w, padding: "16px 20px 12px", backgroundColor: "rgba(17,18,20,0.92)", border: `2px solid ${LINE}` }}>
			<div style={label({ fontSize: 15, letterSpacing: 3 })}>{title}</div>
			{children}
		</div>
	)
}

/** Horizontal bars with the label and number over them. `w` is the width of the bar. `compact` puts the note beside the label and thins the bar. */
function Bars({ rows, w, color, rowH = 0, compact = false, scale = 1 }: { rows: Bar[]; w: number; color: string; rowH?: number; compact?: boolean; scale?: number }) {
	const bar = Math.round((compact ? 8 : 12) * scale)
	const px = (n: number) => Math.round(n * scale)
	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			{rows.map((r, i) => (
				<div key={`${r.label}${i}`} style={{ display: "flex", flexDirection: "column", marginTop: rowH ? rowH : 11 }}>
					<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: w }}>
						<div style={{ display: "flex", alignItems: "baseline" }}>
							<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: px(compact ? 19 : 20), color: BRIGHT }}>{clip(r.label, 34)}</div>
							{compact && r.note ? <div style={{ display: "flex", marginLeft: 14, fontFamily: "Oswald", fontWeight: 400, fontSize: px(15), color: DIM }}>{clip(r.note, 70)}</div> : null}
						</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: px(compact ? 24 : 26), lineHeight: 1, color: r.hot ? MISS : WHITE }}>{r.value}</div>
					</div>
					<div style={{ display: "flex", width: w, height: bar, marginTop: px(compact ? 3 : 5), backgroundColor: LINE, borderRadius: bar }}>
						<div style={{ display: "flex", width: Math.max(r.frac > 0 ? 8 : 0, Math.round(w * Math.min(1, Math.max(0, r.frac)))), height: bar, borderRadius: bar, backgroundColor: r.hot ? MISS : color }} />
					</div>
					{!compact && r.note ? <div style={{ display: "flex", marginTop: 3, fontFamily: "Oswald", fontWeight: 400, fontSize: px(15), color: DIM }}>{clip(r.note, 64)}</div> : null}
				</div>
			))}
		</div>
	)
}

/** A line of text on a gold-edged strip: the costliest flag, or the thing that stands out. */
function Callout({ kicker, text, w, size = 21 }: { kicker: string; text: string; w: number; size?: number }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", width: w, padding: "12px 18px", borderLeft: `6px solid ${GOLD}`, backgroundColor: "rgba(242,193,78,0.08)" }}>
			<div style={label({ fontSize: 14, letterSpacing: 3, color: GOLD })}>{kicker}</div>
			<div style={{ display: "flex", marginTop: 4, fontFamily: "Oswald", fontWeight: 500, fontSize: size, lineHeight: 1.2, color: WHITE }}>{clip(text, 150)}</div>
		</div>
	)
}

function Foot({ spec }: { spec: FlagsCardSpec }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
			<Brand />
			<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontFamily: "Oswald", fontWeight: 400, fontSize: 15, lineHeight: 1.25, letterSpacing: 1, color: DIM }}>
				<div style={{ display: "flex" }}>Accepted penalties · cost = expected points lost</div>
				<div style={{ display: "flex" }}>{`Data: nflverse play-by-play · ${spec.season} through Week ${spec.week}`}</div>
			</div>
		</div>
	)
}

/** The stage, the padding, the eyebrow and the footer every flags card shares. */
function Shell({ spec, eyebrow, children }: { spec: FlagsCardSpec; eyebrow: string; children: (ReactElement | null)[] | ReactElement }) {
	const { width, height } = flagsCardSize(spec)
	return (
		<Frame glow={spec.color} w={width} h={height}>
			<div style={{ display: "flex", flexDirection: "column", width, height, padding: `32px ${PAD}px 24px` }}>
				<Eyebrow text={eyebrow} color={GOLD} />
				{children}
				<Foot spec={spec} />
			</div>
		</Frame>
	)
}

const bigName = (text: string, maxW: number, big: number) => <div style={{ display: "flex", fontFamily: "Anton", fontSize: fit(text, maxW, big), lineHeight: 1, color: WHITE, ...caps }}>{text}</div>

// ---- the cards --------------------------------------------------------------------------------------------------

function FlagCardView({ spec }: { spec: FlagCardSpec }) {
	const tall = spec.size === "tall"
	const { width } = flagsCardSize(spec)
	const inner = width - PAD * 2
	const head = spec.head !== null ? spec.heads[spec.head] : undefined
	const colW = tall ? inner : 640
	const situation = [
		["Down", spec.down],
		["Ball", spec.spot],
		["Clock", spec.clock],
		["Score", spec.score],
	]
	const hero = (
		<div style={{ display: "flex", flexDirection: "column", width: colW }}>
			<div style={{ display: "flex", alignItems: "baseline" }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 210 : 150, lineHeight: 1, color: MISS }}>{spec.cost}</div>
				<div style={{ display: "flex", flexDirection: "column", marginLeft: 22 }}>
					<div style={label({ fontSize: 22, letterSpacing: 3, color: BRIGHT })}>expected points</div>
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 30, color: WHITE, marginTop: 4, ...caps }}>{spec.turnovers}</div>
				</div>
			</div>
			<div style={{ display: "flex", marginTop: 14 }}>{bigName(clip(spec.ty, 40).toUpperCase(), colW, tall ? 84 : 66)}</div>
			<div style={label({ fontSize: 22, letterSpacing: 3, marginTop: 10, color: BRIGHT })}>{`${spec.yards} · ${spec.game}`}</div>
		</div>
	)
	const grid = (
		<div style={{ display: "flex", flexWrap: "wrap", width: tall ? inner : 440 }}>
			{situation.map(([k, v]) => (
				<div key={k} style={{ display: "flex", flexDirection: "column", width: tall ? inner / 2 : 210, marginBottom: 16 }}>
					<div style={label({ fontSize: 14, letterSpacing: 3 })}>{k}</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 52 : 40, lineHeight: 1.05, color: WHITE, marginTop: 4 }}>{clip(v, 14)}</div>
				</div>
			))}
		</div>
	)
	const culprit = (
		<div style={{ display: "flex", alignItems: "center", width: tall ? inner : 440 }}>
			<Face head={head} size={tall ? 200 : 168} ring={7} />
			<div style={{ display: "flex", flexDirection: "column", marginLeft: 24, width: (tall ? inner : 440) - (tall ? 224 : 192) }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: fit(spec.who.toUpperCase(), (tall ? inner : 440) - 230, tall ? 56 : 44, 28), lineHeight: 1.05, color: WHITE, ...caps }}>{clip(spec.who, 24)}</div>
				<div style={label({ fontSize: 19, letterSpacing: 3, marginTop: 8, color: BRIGHT })}>{spec.whoSub}</div>
			</div>
		</div>
	)
	const result = (
		<div style={{ display: "flex", flexDirection: "column", width: colW, marginTop: tall ? 30 : 20 }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 34 : 28, color: WHITE, marginBottom: 12 }}>{clip(spec.result, 70)}</div>
			<div style={{ display: "flex", flexWrap: "wrap", width: colW }}>
				{spec.tags.map((t) => (
					<Pill key={t} text={t} />
				))}
				{spec.wp ? <Pill text={`Win probability ${spec.wp}`} color={MISS} /> : null}
			</div>
		</div>
	)
	return (
		<Shell spec={spec} eyebrow={`Flags · the ${spec.teamName} · ${spec.game}`}>
			{tall ? (
				<div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
					{culprit}
					<div style={{ display: "flex", marginTop: 30 }}>{hero}</div>
					<div style={{ display: "flex", marginTop: 30 }}>{grid}</div>
					{result}
				</div>
			) : (
				<div style={{ display: "flex", marginTop: 26, width: inner }}>
					<div style={{ display: "flex", flexDirection: "column", width: 640 }}>
						{hero}
						{result}
					</div>
					<div style={{ display: "flex", flexDirection: "column", width: 440, marginLeft: 40, padding: "20px 22px 4px", backgroundColor: "rgba(17,18,20,0.92)", border: `2px solid ${LINE}` }}>
						{culprit}
						<div style={{ display: "flex", marginTop: 24 }}>{grid}</div>
					</div>
				</div>
			)}
		</Shell>
	)
}

function TeamCardView({ spec }: { spec: TeamCardSpec }) {
	const tall = spec.size === "tall"
	const { width } = flagsCardSize(spec)
	const inner = width - PAD * 2
	const leftW = tall ? inner : 560
	const rightW = tall ? inner : inner - leftW - 40
	const bars = tall ? spec.bars : spec.bars.slice(0, 4).map((b) => ({ ...b, note: undefined }))
	const stats = (
		<div style={{ display: "flex", flexDirection: "column", width: leftW }}>
			<div style={{ display: "flex" }}>
				<Stat value={spec.stats.flags} name="Flags" size={tall ? 110 : 68} />
				<Stat value={spec.stats.cost} name="Points lost" color={MISS} size={tall ? 110 : 68} />
				<Stat value={spec.stats.costly} name="Like a turnover" color={GOLD} size={tall ? 110 : 68} />
			</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: tall ? 22 : 19, color: SILVER, marginTop: tall ? 14 : 8 }}>{spec.rank}</div>
		</div>
	)
	const faces = spec.faces.length ? (
		<div style={{ display: "flex", flexDirection: "column", width: leftW, marginTop: tall ? 28 : 12 }}>
			<div style={label({ fontSize: 15, letterSpacing: 3 })}>Most flags</div>
			<div style={{ display: "flex", marginTop: tall ? 10 : 6 }}>
				{spec.faces.map((f) => (
					<div key={f.head} style={{ display: "flex", alignItems: "center", marginRight: tall ? 30 : 22 }}>
						<Face head={spec.heads[f.head]} size={tall ? 96 : 60} ring={5} />
						<div style={{ display: "flex", flexDirection: "column", marginLeft: 10 }}>
							<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 22 : 18, color: WHITE }}>{clip(spec.heads[f.head]?.name ?? "", 14)}</div>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 34 : 28, color: BRIGHT }}>{f.value}</div>
						</div>
					</div>
				))}
			</div>
		</div>
	) : null
	return (
		<Shell spec={spec} eyebrow={`Flags · ${spec.season} season`}>
			<div style={{ display: "flex", marginTop: tall ? 16 : 10 }}>{bigName(`${spec.name} penalties`.toUpperCase(), inner, tall ? 120 : 72)}</div>
			<div style={{ display: "flex", flexDirection: tall ? "column" : "row", marginTop: tall ? 30 : 14, width: inner }}>
				<div style={{ display: "flex", flexDirection: "column", width: leftW }}>
					{stats}
					{spec.worst ? (
						<div style={{ display: "flex", marginTop: tall ? 28 : 12 }}>
							<Callout kicker="Costliest flag" text={spec.worst} w={leftW} size={tall ? 26 : 18} />
						</div>
					) : null}
					{faces}
				</div>
				<div style={{ display: "flex", flexDirection: "column", width: rightW, marginLeft: tall ? 0 : 40, marginTop: tall ? 28 : 0 }}>
					<Panel title="Cost by down" w={rightW}>
						<Bars rows={bars} w={rightW - 40} color={GOLD} rowH={tall ? 14 : 12} compact={tall} />
					</Panel>
					{tall ? (
						<div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
							<Panel title="Most common penalties" w={rightW}>
								<div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
									{spec.types.slice(0, 3).map((t) => (
										<div key={t.label} style={{ display: "flex", justifyContent: "space-between", width: rightW - 40, marginTop: 6, fontFamily: "Oswald", fontWeight: 500, fontSize: 24, color: BRIGHT }}>
											<div style={{ display: "flex" }}>{clip(t.label, 32)}</div>
											<div style={{ display: "flex", fontFamily: "Anton", fontSize: 28, color: WHITE }}>{t.value}</div>
										</div>
									))}
								</div>
							</Panel>
						</div>
					) : null}
				</div>
			</div>
		</Shell>
	)
}

function PlayerCardView({ spec }: { spec: PlayerCardSpec }) {
	const tall = spec.size === "tall"
	const { width } = flagsCardSize(spec)
	const inner = width - PAD * 2
	const leftW = tall ? inner : 590
	const rightW = tall ? inner : inner - leftW - 40
	const head = spec.head !== null ? spec.heads[spec.head] : undefined
	return (
		<Shell spec={spec} eyebrow={`Flags · ${spec.pos} · ${spec.season} season`}>
			<div style={{ display: "flex", alignItems: "center", marginTop: 18, width: inner }}>
				<Face head={head} size={tall ? 220 : 112} ring={tall ? 8 : 6} />
				<div style={{ display: "flex", flexDirection: "column", marginLeft: 28, width: inner - (tall ? 250 : 142) }}>
					{bigName(clip(spec.name, 26).toUpperCase(), inner - (tall ? 250 : 142), tall ? 96 : 64)}
					<div style={label({ fontSize: 22, letterSpacing: 3, marginTop: 10, color: BRIGHT })}>{`${spec.teamName} · ${spec.pos}`}</div>
				</div>
			</div>
			<div style={{ display: "flex", flexDirection: tall ? "column" : "row", marginTop: tall ? 34 : 18, width: inner }}>
				<div style={{ display: "flex", flexDirection: "column", width: leftW }}>
					<div style={{ display: "flex" }}>
						<Stat value={spec.stats.flags} name="Flags" size={tall ? 104 : 64} />
						<Stat value={spec.stats.cost} name="Points lost" color={MISS} size={tall ? 104 : 64} />
						<Stat value={spec.stats.costly} name="Like a turnover" color={GOLD} size={tall ? 104 : 64} />
						<Stat value={spec.stats.fourth} name="On 4th down" size={tall ? 104 : 64} />
					</div>
					{spec.rank ? <div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: tall ? 22 : 19, color: SILVER, marginTop: tall ? 14 : 8 }}>{spec.rank}</div> : null}
					{spec.types.length ? (
						<div style={{ display: "flex", flexWrap: "wrap", marginTop: tall ? 18 : 12, width: leftW }}>
							{(tall ? spec.types : spec.types.slice(0, 1)).map((t) => (
								<Pill key={t.label} text={`${clip(t.label, 26)} ×${t.value}`} color={SILVER} />
							))}
						</div>
					) : null}
					{spec.worst ? (
						<div style={{ display: "flex", marginTop: 10 }}>
							<Callout kicker="Costliest flag" text={spec.worst} w={leftW} size={tall ? 26 : 18} />
						</div>
					) : spec.note ? (
						<div style={{ display: "flex", marginTop: 10, fontFamily: "Oswald", fontWeight: 500, fontSize: 22, color: SILVER, width: leftW }}>{spec.note}</div>
					) : null}
				</div>
				<div style={{ display: "flex", flexDirection: "column", width: rightW, marginLeft: tall ? 0 : 40, marginTop: tall ? 30 : 0 }}>
					<Panel title="Cost by down" w={rightW}>
						<Bars rows={tall ? spec.bars : spec.bars.slice(0, 4).map((b) => ({ ...b, note: undefined }))} w={rightW - 40} color={GOLD} rowH={tall ? 14 : 10} compact={tall} />
					</Panel>
				</div>
			</div>
		</Shell>
	)
}

function CompareCardView({ spec }: { spec: CompareCardSpec }) {
	const tall = spec.size === "tall"
	const { width } = flagsCardSize(spec)
	const inner = width - PAD * 2
	const mid = spec.size === "tall" ? 300 : 230
	const half = (inner - mid) / 2
	const rowH = tall ? 70 : 48
	const side = (s: CompareCardSpec["a"], align: "flex-start" | "flex-end") => (
		<div style={{ display: "flex", flexDirection: "column", alignItems: align, width: half }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 104 : 72, lineHeight: 1, color: s.color }}>{s.team}</div>
			<div style={label({ fontSize: 20, letterSpacing: 3, marginTop: 6, color: BRIGHT })}>{clip(s.name, 22)}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 18, color: SILVER, marginTop: 4 }}>{s.rank}</div>
		</div>
	)
	return (
		<Shell spec={spec} eyebrow={`Flags · team vs team · ${spec.season} season`}>
			<div style={{ display: "flex", alignItems: "center", marginTop: 18, width: inner }}>
				{side(spec.a, "flex-start")}
				<div style={{ display: "flex", justifyContent: "center", width: mid, fontFamily: "Anton", fontSize: 40, color: DIM }}>VS</div>
				{side(spec.b, "flex-end")}
			</div>
			<div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 28 : 14, width: inner }}>
				{spec.pairs.slice(0, tall ? 8 : 4).map((p) => (
					<div key={p.label} style={{ display: "flex", alignItems: "center", width: inner, height: rowH }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: half }}>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 38 : 30, color: p.worse === "a" ? MISS : WHITE, marginRight: 14 }}>{p.a}</div>
							<div style={{ display: "flex", justifyContent: "flex-end", width: half - 120, height: 16, backgroundColor: LINE }}>
								<div style={{ display: "flex", width: Math.max(p.fa > 0 ? 6 : 0, Math.round((half - 120) * p.fa)), height: 16, backgroundColor: p.worse === "a" ? MISS : spec.a.color }} />
							</div>
						</div>
						<div style={label({ justifyContent: "center", width: mid, fontSize: tall ? 20 : 17, letterSpacing: 2, color: BRIGHT })}>{p.label}</div>
						<div style={{ display: "flex", alignItems: "center", width: half }}>
							<div style={{ display: "flex", width: half - 120, height: 16, backgroundColor: LINE }}>
								<div style={{ display: "flex", width: Math.max(p.fb > 0 ? 6 : 0, Math.round((half - 120) * p.fb)), height: 16, backgroundColor: p.worse === "b" ? MISS : spec.b.color }} />
							</div>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 38 : 30, color: p.worse === "b" ? MISS : WHITE, marginLeft: 14 }}>{p.b}</div>
						</div>
					</div>
				))}
			</div>
			{spec.edges.length ? (
				<div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 22 : 10, width: inner }}>
					{spec.edges.slice(0, tall ? 3 : 1).map((e) => (
						<div key={e} style={{ display: "flex", marginTop: 8 }}>
							<Callout kicker="Where they differ" text={e} w={inner} size={tall ? 26 : 21} />
						</div>
					))}
				</div>
			) : null}
		</Shell>
	)
}

function BoardCardView({ spec }: { spec: BoardCardSpec }) {
	const tall = spec.size === "tall"
	const { width } = flagsCardSize(spec)
	const inner = width - PAD * 2
	const rowH = tall ? 112 : 70
	const face = tall ? 84 : 56
	const rows = spec.rows.slice(0, tall ? 8 : 5)
	return (
		<Shell spec={spec} eyebrow={`Flags · ${spec.season} season`}>
			<div style={{ display: "flex", marginTop: 14 }}>{bigName(spec.title.toUpperCase(), inner, tall ? 92 : 66)}</div>
			<div style={label({ fontSize: 20, letterSpacing: 3, marginTop: 8, color: BRIGHT })}>{spec.sub}</div>
			<div style={label({ justifyContent: "flex-end", width: inner, marginTop: 12, fontSize: 14, letterSpacing: 3 })}>
				<div style={{ display: "flex", width: 150, justifyContent: "flex-end" }}>{spec.cols[0]}</div>
				<div style={{ display: "flex", width: 170, justifyContent: "flex-end" }}>{spec.cols[1]}</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", width: inner }}>
				{rows.map((r) => (
					<div key={`${r.rank}${r.title}`} style={{ display: "flex", alignItems: "center", width: inner, height: rowH, borderTop: `2px solid ${LINE}` }}>
						<div style={{ display: "flex", width: 56, fontFamily: "Anton", fontSize: tall ? 40 : 32, color: r.rank === 1 ? GOLD : DIM }}>{r.rank}</div>
						{r.head !== undefined ? (
							<div style={{ display: "flex", marginRight: 16 }}>
								<Face head={spec.heads[r.head]} size={face} ring={4} />
							</div>
						) : null}
						<div style={{ display: "flex", flexDirection: "column", width: inner - 56 - 320 - (r.head !== undefined ? face + 16 : 0) }}>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 38 : 30, lineHeight: 1.05, color: WHITE, ...caps }}>{clip(r.title, 28)}</div>
							<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: tall ? 21 : 17, color: SILVER, marginTop: 3 }}>{clip(r.sub, 56)}</div>
						</div>
						<div style={{ display: "flex", justifyContent: "flex-end", width: 150, fontFamily: "Anton", fontSize: tall ? 40 : 32, color: BRIGHT }}>{r.v1}</div>
						<div style={{ display: "flex", justifyContent: "flex-end", width: 170, fontFamily: "Anton", fontSize: tall ? 46 : 36, color: MISS }}>{r.v2}</div>
					</div>
				))}
			</div>
		</Shell>
	)
}

function PenaltyCardView({ spec }: { spec: PenaltyCardSpec }) {
	const tall = spec.size === "tall"
	const { width } = flagsCardSize(spec)
	const inner = width - PAD * 2
	const leftW = tall ? inner : 560
	const rightW = tall ? inner : inner - leftW - 40
	return (
		<Shell spec={spec} eyebrow={`Flags · the penalty · ${spec.season} season`}>
			<div style={{ display: "flex", marginTop: 16 }}>{bigName(clip(spec.name, 34).toUpperCase(), inner, tall ? 112 : 70)}</div>
			<div style={{ display: "flex", flexDirection: tall ? "column" : "row", marginTop: tall ? 28 : 12, width: inner }}>
				<div style={{ display: "flex", flexDirection: "column", width: leftW }}>
					<div style={{ display: "flex" }}>
						<Stat value={spec.stats.flags} name="Flags" size={tall ? 104 : 64} />
						<Stat value={spec.stats.avg} name="Points lost each" color={MISS} size={tall ? 104 : 64} />
						<Stat value={spec.stats.costly} name="Like a turnover" color={GOLD} size={tall ? 104 : 64} />
					</div>
					<div style={label({ fontSize: 18, letterSpacing: 3, marginTop: 12, color: BRIGHT })}>{`${spec.stats.yards} yards each, on average`}</div>
					{spec.people.length ? (
						<div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 26 : 16, width: leftW }}>
							<div style={label({ fontSize: 15, letterSpacing: 3 })}>Most of them</div>
							<div style={{ display: "flex", marginTop: 10 }}>
								{spec.people.map((p) => (
									<div key={p.head} style={{ display: "flex", alignItems: "center", marginRight: tall ? 26 : 18 }}>
										<Face head={spec.heads[p.head]} size={tall ? 92 : 58} ring={5} />
										<div style={{ display: "flex", flexDirection: "column", marginLeft: 10 }}>
											<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 21 : 17, color: WHITE }}>{clip(spec.heads[p.head]?.name ?? "", 13)}</div>
											<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 32 : 26, color: BRIGHT }}>{p.value}</div>
										</div>
									</div>
								))}
							</div>
						</div>
					) : null}
					{spec.worst ? (
						<div style={{ display: "flex", marginTop: tall ? 26 : 10 }}>
							<Callout kicker="Costliest one" text={spec.worst} w={leftW} size={tall ? 25 : 17} />
						</div>
					) : null}
				</div>
				<div style={{ display: "flex", flexDirection: "column", width: rightW, marginLeft: tall ? 0 : 40, marginTop: tall ? 28 : 0 }}>
					<Panel title="Cost by down" w={rightW}>
						<Bars rows={tall ? spec.bars : spec.bars.slice(0, 4).map((b) => ({ ...b, note: undefined }))} w={rightW - 40} color={GOLD} rowH={tall ? 14 : 10} compact={tall} />
					</Panel>
					{spec.teams.length && tall ? (
						<div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
							<Panel title="Teams with the most" w={rightW}>
								<div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
									{spec.teams.slice(0, 3).map((t) => (
										<div key={t.label} style={{ display: "flex", justifyContent: "space-between", width: rightW - 40, marginTop: 4, fontFamily: "Oswald", fontWeight: 500, fontSize: 21, color: BRIGHT }}>
											<div style={{ display: "flex" }}>{clip(t.label, 28)}</div>
											<div style={{ display: "flex", fontFamily: "Anton", fontSize: 26, color: WHITE }}>{t.value}</div>
										</div>
									))}
								</div>
							</Panel>
						</div>
					) : null}
				</div>
			</div>
		</Shell>
	)
}

function SituationCardView({ spec }: { spec: SituationCardSpec }) {
	const tall = spec.size === "tall"
	const { width } = flagsCardSize(spec)
	const inner = width - PAD * 2
	return (
		<Shell spec={spec} eyebrow={`Flags · ${spec.label} · ${spec.season} season`}>
			<div style={{ display: "flex", marginTop: 16 }}>{bigName(clip(spec.question, 44).toUpperCase(), inner, tall ? 100 : 60)}</div>
			<div style={label({ fontSize: tall ? 22 : 19, letterSpacing: 3, marginTop: 8, color: BRIGHT })}>{`${spec.subject} · ${spec.total}`}</div>
			<div style={{ display: "flex", flexDirection: "column", width: inner, marginTop: tall ? 18 : 6 }}>
				<Bars rows={spec.rows} w={inner} color={GOLD} rowH={tall ? 44 : spec.rows.length > 5 ? 6 : 10} compact scale={tall ? 1.35 : 1} />
			</div>
			{spec.standout && (tall || spec.rows.length <= 6) ? (
				<div style={{ display: "flex", marginTop: tall ? 30 : 12 }}>
					<Callout kicker="Stands out" text={spec.standout} w={inner} size={tall ? 27 : 19} />
				</div>
			) : null}
		</Shell>
	)
}

export function renderFlagsCard(spec: FlagsCardSpec): ReactElement {
	switch (spec.kind) {
		case "flag":
			return <FlagCardView spec={spec} />
		case "team":
			return <TeamCardView spec={spec} />
		case "player":
			return <PlayerCardView spec={spec} />
		case "compare":
			return <CompareCardView spec={spec} />
		case "board":
			return <BoardCardView spec={spec} />
		case "penalty":
			return <PenaltyCardView spec={spec} />
		case "situation":
			return <SituationCardView spec={spec} />
	}
}
