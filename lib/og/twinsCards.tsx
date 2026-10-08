// The share card for "Season twins" (/lab/season-twins): the Raiders' shape laid over the closest team's, who the
// twin is, how its season went, and what the thirty closest teams did.
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// buildTwinsSpec turns a match into a small plain spec (no network, so it can be tested from fixed data) and
// renderTwinsCard turns the spec into JSX. See lib/og/kit.tsx for the Satori notes: inline styles only, every
// element with more than one child is display:flex, and no text inside an <svg>.

import type { ReactElement } from "react"

import { abbrOf, recordText } from "../lab/historyKit"
import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import { type Twin, type TwinMode, type TwinsResult, TWIN_MODES, agreement } from "../lab/twinsKit"
import { opponentColors } from "../lab/colors"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, GOLD, LINE, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type TwinsCardSpec = {
	type: "twins"
	size: ShareSize
	n: number
	first: number
	last: number
	season: number
	mode: TwinMode
	modeName: string
	/** "2022 Jaguars". */
	title: string
	/** The share of all team-seasons that are further away, as text: "99.9%". */
	closer: string
	/** The twin's color on the card. */
	color: string
	raidersRecord: string | null
	twinStart: string
	twinFinal: string
	playoffs: boolean
	/** One 0 to 1 number per spoke, further out is better. */
	mine: number[]
	theirs: number[]
	alike: string[]
	apart: string | null
	pool: { size: number; restWin: string; allRestWin: string; playoffs: string; allPlayoffs: string }
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const closerText = (v: number): string => {
	const p = v * 100
	return p >= 99.95 ? "99.9%" : p >= 99 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`
}

/** Builds the card for one twin of a match (the closest when `row` is not one of them); null when there is nothing to show. */
export function buildTwinsSpec(result: TwinsResult, row: string | null, ctx: { size: ShareSize; season: number; first: number; last: number; start: { wins: number; losses: number } | null }): TwinsCardSpec | null {
	const pool = [...result.twins, ...(result.raidersTwin ? [result.raidersTwin] : [])]
	const twin: Twin | undefined = (row ? pool.find((t) => t.row === row) : undefined) ?? result.twins[0]
	if (!twin) return null
	const near = agreement(result, twin)
	const o = result.pool.outcomes
	return {
		type: "twins",
		size: ctx.size,
		n: result.n,
		first: ctx.first,
		last: ctx.last,
		season: ctx.season,
		mode: result.mode,
		modeName: TWIN_MODES.find((m) => m.id === result.mode)?.label ?? "The whole team",
		title: twin.label,
		closer: closerText(twin.closer),
		color: twin.raiders ? GOLD : accent(opponentColors(abbrOf(twin.row)).dark),
		raidersRecord: ctx.start ? recordText(ctx.start.wins, ctx.start.losses, result.n) : null,
		twinStart: recordText(twin.startWins, twin.startLosses, result.n),
		twinFinal: recordText(twin.wins, twin.losses, twin.games),
		playoffs: twin.playoffs,
		mine: result.stats.map((s) => Math.round(s.raidersPct * 1000) / 1000),
		theirs: twin.pcts.map((p, j) => Math.round((p ?? result.stats[j].raidersPct) * 1000) / 1000),
		alike: near.slice(0, 2).map((a) => result.stats[a.index].short),
		apart: near.length > 2 ? result.stats[near[near.length - 1].index].short : null,
		pool: { size: result.pool.size, restWin: pct(o.restWin), allRestWin: pct(o.allRestWin), playoffs: pct(o.playoffs), allPlayoffs: pct(o.allPlayoffs) },
	}
}

export const twinsCardSize = (spec: Pick<TwinsCardSpec, "size">) => SIZE_PIXELS[spec.size]

// ---- drawing -----------------------------------------------------------------------------------------------

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

/** A right-pointing arrow drawn as a shape, since the fonts have no arrow glyph. */
function Arrow({ w, h, color }: { w: number; h: number; color: string }) {
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<polygon points={`0,${h * 0.36} ${w * 0.58},${h * 0.36} ${w * 0.58},0 ${w},${h / 2} ${w * 0.58},${h} ${w * 0.58},${h * 0.64} 0,${h * 0.64}`} fill={color} />
		</svg>
	)
}

/** The Anton size (up to `big`) at which `text` fits `maxW` on one line. */
const fit = (text: string, maxW: number, big: number): number => Math.max(40, Math.min(big, Math.floor(maxW / (text.length * 0.5))))

function Radar({ size, mine, theirs, color }: { size: number; mine: number[]; theirs: number[]; color: string }) {
	const k = mine.length
	const c = size / 2
	const R = c - 14
	const pt = (j: number, r: number): [number, number] => [c + r * Math.cos(-Math.PI / 2 + (j * 2 * Math.PI) / k), c + r * Math.sin(-Math.PI / 2 + (j * 2 * Math.PI) / k)]
	const poly = (vals: number[]) => vals.map((v, j) => pt(j, R * Math.max(0.02, v)).map((x) => x.toFixed(1)).join(",")).join(" ")
	const ring = (r: number) => Array.from({ length: k }, (_, j) => pt(j, R * r).map((x) => x.toFixed(1)).join(",")).join(" ")
	const dot = size > 600 ? 7 : 5
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
			{[0.25, 0.5, 0.75, 1].map((r) => (
				<polygon key={r} points={ring(r)} fill="none" stroke={r === 0.5 ? "#4a4e52" : LINE} strokeWidth={r === 0.5 ? 2 : 1.5} strokeDasharray={r === 0.5 ? "6 6" : undefined} />
			))}
			{mine.map((_, j) => {
				const [x, y] = pt(j, R)
				return <line key={j} x1={c} y1={c} x2={x} y2={y} stroke={LINE} strokeWidth={1.5} />
			})}
			<polygon points={poly(theirs)} fill={rgba(color, 0.2)} stroke={color} strokeWidth={size > 600 ? 6 : 4.5} strokeLinejoin="round" />
			<polygon points={poly(mine)} fill={rgba(WHITE, 0.14)} stroke={WHITE} strokeWidth={size > 600 ? 6 : 4.5} strokeLinejoin="round" />
			{theirs.map((v, j) => {
				const [x, y] = pt(j, R * Math.max(0.02, v))
				return <circle key={`t${j}`} cx={x} cy={y} r={dot} fill={color} />
			})}
			{mine.map((v, j) => {
				const [x, y] = pt(j, R * Math.max(0.02, v))
				return <circle key={`m${j}`} cx={x} cy={y} r={dot} fill={WHITE} />
			})}
		</svg>
	)
}

function Key({ color, text, size }: { color: string; text: string; size: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			<div style={{ display: "flex", width: size * 0.62, height: size * 0.62, borderRadius: size, backgroundColor: color }} />
			<div style={{ display: "flex", marginLeft: 12, fontFamily: "Oswald", fontWeight: 500, fontSize: size, letterSpacing: 2, color: BRIGHT, ...caps }}>{text}</div>
		</div>
	)
}

function Pill({ text, color, size }: { text: string; color: string; size: number }) {
	return (
		<div style={{ display: "flex", alignSelf: "flex-start", padding: `${Math.round(size * 0.24)}px ${Math.round(size * 0.6)}px`, border: `3px solid ${color}`, color, fontFamily: "Oswald", fontWeight: 700, fontSize: size, letterSpacing: Math.round(size * 0.14), ...caps }}>
			{text}
		</div>
	)
}

export function renderTwinsCard(spec: TwinsCardSpec): ReactElement {
	const { width: w, height: h } = SIZE_PIXELS[spec.size]
	const tall = spec.size === "tall"
	const padX = tall ? 72 : 60
	const padTop = tall ? 70 : 44
	const padBottom = tall ? 58 : 36
	const innerW = w - padX * 2
	const radar = tall ? 430 : 424
	const colW = tall ? innerW : innerW - radar - 48
	const mode = spec.mode === "all" ? "" : ` · ${spec.modeName.toLowerCase()}`
	const titleSize = fit(spec.title, colW, tall ? 112 : 96)
	const big = tall ? 38 : 30
	const alike = spec.alike.length ? `Most alike on ${spec.alike.join(" and ")}${spec.apart ? `. Furthest apart on ${spec.apart}.` : "."}` : ""

	const text = (
		<div style={{ display: "flex", flexDirection: "column", width: colW, marginTop: tall ? 26 : 0 }}>
			<div style={label({ fontSize: tall ? 24 : 20 })}>{`The ${spec.season} Raiders' closest match`}</div>
			<div style={{ display: "flex", marginTop: 8, fontFamily: "Anton", fontSize: titleSize, lineHeight: 1.02, color: WHITE, ...caps }}>{spec.title}</div>
			<div style={{ display: "flex", marginTop: tall ? 14 : 8, fontFamily: "Oswald", fontWeight: 500, fontSize: tall ? 28 : 23, letterSpacing: 1.5, color: SILVER }}>{`Closer than ${spec.closer} of all team-seasons since ${spec.first}`}</div>
			<div style={{ display: "flex", alignItems: "center", marginTop: tall ? 30 : 22 }}>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={label({ fontSize: tall ? 20 : 16, letterSpacing: 3 })}>{`${spec.season} Raiders`}</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: big * 1.5, color: WHITE, lineHeight: 1.1 }}>{spec.raidersRecord ?? "-"}</div>
				</div>
				<div style={{ display: "flex", width: tall ? 56 : 44, height: 2, marginLeft: tall ? 40 : 28, marginRight: tall ? 40 : 28, backgroundColor: LINE }} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={label({ fontSize: tall ? 20 : 16, letterSpacing: 3, color: spec.color })}>{spec.title}</div>
					<div style={{ display: "flex", alignItems: "center" }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: big * 1.5, color: WHITE, lineHeight: 1.1 }}>{spec.twinStart}</div>
						<div style={{ display: "flex", margin: tall ? "0 18px" : "0 12px" }}>
							<Arrow w={tall ? 40 : 30} h={tall ? 30 : 22} color={spec.color} />
						</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: big * 1.5, color: spec.color, lineHeight: 1.1 }}>{spec.twinFinal}</div>
					</div>
				</div>
			</div>
			<div style={{ display: "flex", marginTop: tall ? 22 : 16 }}>
				<Pill text={spec.playoffs ? "Made the playoffs" : "Missed the playoffs"} color={spec.playoffs ? "#60a5fa" : "#fb923c"} size={tall ? 26 : 20} />
			</div>
			{alike ? <div style={{ display: "flex", marginTop: tall ? 26 : 18, fontFamily: "Oswald", fontWeight: 400, fontSize: tall ? 26 : 21, lineHeight: 1.3, color: BRIGHT }}>{clip(alike, tall ? 110 : 96)}</div> : null}
			<div style={{ display: "flex", marginTop: tall ? 18 : 12, fontFamily: "Oswald", fontWeight: 400, fontSize: tall ? 24 : 19, lineHeight: 1.3, color: SILVER }}>
				{`The ${spec.pool.size} closest won ${spec.pool.restWin} of their games after game ${spec.n} (all teams ${spec.pool.allRestWin}); ${spec.pool.playoffs} made the playoffs (all ${spec.pool.allPlayoffs}).`}
			</div>
		</div>
	)

	const keys = (
		<div style={{ display: "flex", marginTop: tall ? 18 : 10 }}>
			<Key color={WHITE} text={`${spec.season} Raiders`} size={tall ? 24 : 18} />
			<div style={{ display: "flex", width: 28 }} />
			<Key color={spec.color} text={spec.title} size={tall ? 24 : 18} />
		</div>
	)

	return (
		<Frame glow={spec.color} w={w} h={h}>
			<div style={{ display: "flex", flexDirection: "column", width: w, height: h, padding: `${padTop}px ${padX}px ${padBottom}px` }}>
				<Eyebrow text={`Season twins${mode} · after ${spec.n} games`} color={spec.color} />
				<div style={{ display: "flex", flexDirection: tall ? "column" : "row", alignItems: tall ? "center" : "flex-start", marginTop: tall ? 18 : 18, width: innerW }}>
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: radar, marginRight: tall ? 0 : 48 }}>
						<Radar size={radar} mine={spec.mine} theirs={spec.theirs} color={spec.color} />
						{keys}
					</div>
					{text}
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<Brand />
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: tall ? 19 : 16, letterSpacing: 1, color: DIM }}>{`Data: nflverse, CC BY 4.0 · every season ${spec.first} to ${spec.last}`}</div>
				</div>
			</div>
		</Frame>
	)
}
