// The share cards for "Will it last?" (/lab/will-it-last): one card for every part of the page that can be
// shared, each in two sizes.
//
//   chart      the dots: where the group stood early and where it finished, with the filters and any pinned team
//   wins       what the group's start meant in wins and playoffs, with the 100-team dot grid
//   fifths     how often teams made the playoffs by fifth of the league on the stat
//   checklist  the stats ranked by how well they have separated playoff teams, with where the Raiders stand
//   season     one team's season: the record at the split and at the end, and how the stat moved
//   bottom     the page's bottom line
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// Each build*Spec turns the analysis into a small plain spec (no network, so it can be tested and looked at
// from fixed data) and render*Card turns a spec into JSX. See lib/og/kit.tsx for the stage and the Satori
// notes: inline styles only, every element with more than one child is display:flex, no text inside an <svg>
// (labels are positioned divs over it), and no drop shadow on a rotated box.

import type { ReactElement } from "react"

import { type Analysis, type CheckRow, type Filter, type Meta, DEFAULT_FILTER, fifthName, formatStat, ordinalOf, pctText, recordText, seasonGames, seasonOf, teamLabel, teamName, yearsText } from "../lab/historyKit"
import { SIZE_PIXELS, type ShareKind, type ShareSize } from "../lab/lastShare"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, GOLD, LINE, PANEL, SILVER, WHITE, caps, clip, rgba } from "./kit"

const FADE = "#fb923c"
const IMPROVE = "#60a5fa"
const INK = "#0d0e10"

export type Tone = "fade" | "improve" | "even"
const toneColor = (t: Tone): string => (t === "fade" ? FADE : t === "improve" ? IMPROVE : SILVER)

// ---- specs -------------------------------------------------------------------------------------------------

/** One team-season on a plot: where it stood early (`a`) and at the end (`b`) across the same axis (0 to 1), and how high it sits (0 is the top). */
export type LastDot = {
	a: number
	b: number
	y: number
	po: boolean
	raiders: boolean
}

export type LastPlot = {
	dots: LastDot[]
	/** Teams outside the group, as faint specks at their finish. */
	bg: { x: number; y: number }[]
	ticks: { x: number; label: string }[]
	raiders: number
	raidersText: string
	base: number
	band: [number, number]
	avgA: number
	avgB: number
	avgText: string
	pin: { a: number; b: number; y: number; po: boolean; name: string } | null
	/** Horizontal guides when the dots are laid out by final wins. */
	winTicks: { y: number; label: string }[]
	higherIsBetter: boolean
	/** Draw the group dimly so a pinned team stands out. */
	dim: boolean
}

type Base = {
	type: "last"
	size: ShareSize
	n: number
	first: number
	last: number
	season: number
	/** "Teams that started like the Raiders · Made the playoffs · in 2016". */
	filter: string
	tone: Tone
}

export type Tile = { k: string; v: string; note: string }

export type ChartCard = Base & {
	kind: "chart"
	title: string
	rank: string
	verdict: string
	line: string
	tiles: Tile[]
	plot: LastPlot
}

export type SeasonCard = Base & {
	kind: "season"
	name: string
	raiders: boolean
	po: boolean
	startRecord: string
	finalRecord: string
	stat: string
	statRank: string
	moveText: string
	toward: boolean
	line: string
	tiles: Tile[]
	plot: LastPlot
}

export type WinsCard = Base & {
	kind: "wins"
	title: string
	stat: string
	groupSize: number
	/** Of every 100 teams in the group, how many made the playoffs. */
	made: number
	allMade: number
	line: string
	bars: {
		label: string
		v: number
		all: number | null
		text: string
		note: string
	}[]
}

export type FifthsCard = Base & {
	kind: "fifths"
	stat: string
	value: string
	rank: string
	line: string
	all: number
	bars: { name: string; rate: number; range: string; mine: boolean }[]
}

export type ChecklistCard = Base & {
	kind: "checklist"
	line: string
	best: string
	total: number
	rows: { label: string; rate: number; note: string; fifth: string }[]
}

export type BottomCard = Base & {
	kind: "bottom"
	title: string
	groups: { tone: Tone; head: string; names: string }[]
	record: { big: string; label: string; note: string } | null
	footnote: string
}

export type LastCardSpec = ChartCard | SeasonCard | WinsCard | FifthsCard | ChecklistCard | BottomCard

export type Ctx = {
	size: ShareSize
	n: number
	first: number
	last: number
	season: number
}

const toneOf = (a: Analysis): Tone => (a.verdict.id === "fade" ? "fade" : a.verdict.id === "improve" ? "improve" : "even")
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const r3 = (v: number) => Math.round(v * 1000) / 1000

/** "Teams that started like the Raiders · Chiefs · Made the playoffs · in 2016". */
export function filterText(f: Filter, first: number): string {
	const parts = [f.scope === "all" ? `Every team since ${first}` : "Teams that started like the Raiders"]
	if (f.team) parts.push(`${teamName(f.team)} only`)
	if (f.playoffs === "made") parts.push("Made the playoffs")
	if (f.playoffs === "missed") parts.push("Missed the playoffs")
	const y = yearsText(f.years)
	if (y) parts.push(y)
	return parts.join(" · ")
}

export const isFiltered = (f: Filter): boolean => f.scope !== DEFAULT_FILTER.scope || !!f.team || f.playoffs !== "any" || f.years.length > 0

/** `line` replaces the filter line for the cards the filters do not apply to; `lead` goes in front of it (the stat a card is about). */
const base = (ctx: Ctx, story: Analysis | null, filter: Filter, tone?: Tone, extra: { line?: string; lead?: string } = {}): Base => ({
	type: "last",
	size: ctx.size,
	n: ctx.n,
	first: ctx.first,
	last: ctx.last,
	season: ctx.season,
	filter: [extra.lead, extra.line ?? filterText(filter, ctx.first)].filter(Boolean).join(" · "),
	tone: tone ?? (story ? toneOf(story) : "even"),
})

const MAX_GROUP = 300
const MAX_BG = 380

/** The dots for a plot, thinned so the card stays readable: every Raiders team, the pinned team and an even sample of the rest. */
export function buildPlot(story: Analysis, meta: Meta, ctx: Ctx, opts: { pin?: string | null; y?: "spread" | "wins"; dim?: boolean } = {}): LastPlot {
	const [d0, d1] = story.domain
	const at = (v: number) => r3(clamp01((v - d0) / (d1 - d0)))
	const wins = opts.y === "wins"
	const gold = 0.6180339887
	const silver = 0.7548776662
	const yOf = (i: number): number => {
		if (!wins) return r3(((i + 1) * gold) % 1)
		const g = seasonGames(seasonOf(meta.teams[i]))
		const jitter = ((((i + 1) * silver) % 1) - 0.5) * 0.045
		return r3(clamp01(1 - clamp01(meta.wins[i] / g) + jitter))
	}
	const pinI = opts.pin ? meta.teams.indexOf(opts.pin) : -1
	const members = story.rows.filter((r) => r.inGroup && !r.raiders && r.i !== pinI)
	const step = Math.max(1, Math.ceil(members.length / MAX_GROUP))
	const dot = (r: { i: number; start: number; rest: number; po: boolean; raiders: boolean }): LastDot => ({
		a: at(r.start),
		b: at(r.rest),
		y: yOf(r.i),
		po: r.po,
		raiders: r.raiders,
	})
	const dots = [...members.filter((_, k) => k % step === 0), ...story.rows.filter((r) => r.raiders && r.i !== pinI)].map(dot)
	const outside = story.rows.filter((r) => !r.inGroup && !r.raiders && r.i !== pinI)
	const bgStep = Math.max(1, Math.ceil(outside.length / MAX_BG))
	const bg = outside.filter((_, k) => k % bgStep === 0).map((r) => ({ x: at(r.rest), y: yOf(r.i) }))
	const pinRow = pinI >= 0 ? story.rows.find((r) => r.i === pinI) : undefined
	const games = seasonGames(ctx.season)
	return {
		dots,
		bg,
		ticks: [0, 1, 2, 3, 4].map((k) => {
			const v = d0 + ((d1 - d0) * k) / 4
			const shown = story.fmt === "pct" || story.fmt === "pct1" ? clamp01(v) : v
			return { x: k / 4, label: formatStat(story, shown) }
		}),
		raiders: at(story.value),
		raidersText: story.valueText,
		base: at(story.base),
		band: [at(story.band[0]), at(story.band[1])],
		avgA: at(story.avgStart),
		avgB: at(story.avgRest),
		avgText: `${formatStat(story, story.avgStart)} to ${formatStat(story, story.avgRest)}`,
		pin: pinRow
			? {
					a: at(pinRow.start),
					b: at(pinRow.rest),
					y: yOf(pinRow.i),
					po: pinRow.po,
					name: teamLabel(meta.teams[pinRow.i]),
				}
			: null,
		winTicks: wins ? [4, 8, 12, 16].filter((w) => w < games).map((w) => ({ y: r3(1 - w / games), label: `${w} wins` })) : [],
		higherIsBetter: story.higherIsBetter,
		dim: !!opts.dim,
	}
}

function tilesOf(story: Analysis): Tile[] {
	const o = story.outcomes
	return [
		{
			k: "Moved toward average",
			v: pctText(story.toward),
			note: `of ${story.groupSize} teams`,
		},
		{
			k: "Won the rest of the way",
			v: pctText(o.restWin),
			note: `${pctText(o.startWin)} early`,
		},
		{
			k: "Made the playoffs",
			v: pctText(o.playoffs),
			note: `every team: ${pctText(o.allPlayoffs)}`,
		},
	]
}

export function buildChartSpec(story: Analysis, meta: Meta, ctx: Ctx, view: { pin?: string | null; y?: "spread" | "wins" } = {}): ChartCard {
	const filtered = isFiltered(story.filter)
	return {
		...base(ctx, story, story.filter),
		kind: "chart",
		title: story.label,
		rank: `Raiders ${ordinalOf(story.rank)} of 32 · ${story.valueText}`,
		verdict: story.verdict.text,
		line: filtered
			? `${story.groupSize} team-seasons match these filters. ${pctText(story.toward)} finished closer to average.`
			: `${story.groupSize} teams since ${ctx.first} ${story.kind === "atLeast" ? `started at least this ${story.good ? "well" : "poorly"}` : "started closest to this"}. ${pctText(story.toward)} finished closer to average.`,
		tiles: tilesOf(story),
		plot: buildPlot(story, meta, ctx, view),
	}
}

export function buildSeasonSpec(story: Analysis, meta: Meta, ctx: Ctx, pin: string, y: "spread" | "wins" = "spread"): SeasonCard | null {
	const i = meta.teams.indexOf(pin)
	const row = story.rows.find((r) => r.i === i)
	if (i < 0 || !row) return null
	const year = seasonOf(pin)
	const raiders = row.raiders
	const move = row.rest - row.start
	return {
		...base(ctx, story, story.filter, row.po ? "improve" : "fade", {
			lead: story.label,
		}),
		kind: "season",
		name: teamLabel(pin),
		raiders,
		po: row.po,
		startRecord: recordText(meta.startWins[i], meta.startLosses[i], ctx.n),
		finalRecord: recordText(meta.wins[i], meta.losses[i], seasonGames(year)),
		stat: story.label,
		statRank: `${ordinalOf(story.rank)} of 32`,
		moveText: `${formatStat(story, row.start)} to ${formatStat(story, row.rest)}`,
		toward: row.toward,
		line: `${teamLabel(pin)} ${row.toward ? "drifted toward the league average" : "moved further from the league average"} over the rest of its season (${formatStat(story, move)}). The ${ctx.season} Raiders are at ${story.valueText}.`,
		tiles: [
			{
				k: `Through ${ctx.n} games`,
				v: formatStat(story, row.start),
				note: story.label,
			},
			{
				k: "Rest of the season",
				v: formatStat(story, row.rest),
				note: row.toward ? "toward average" : "away from average",
			},
			{
				k: "Finished",
				v: recordText(meta.wins[i], meta.losses[i], seasonGames(year)),
				note: row.po ? "made the playoffs" : "missed the playoffs",
			},
		],
		plot: buildPlot(story, meta, ctx, { pin, y, dim: true }),
	}
}

export function buildWinsSpec(story: Analysis, ctx: Ctx, startRecord: { wins: number; losses: number } | null): WinsCard {
	const o = story.outcomes
	const raidersWin = startRecord ? startRecord.wins / ctx.n : null
	return {
		...base(ctx, story, story.filter, "improve", { lead: story.label }),
		kind: "wins",
		title: "In wins and playoffs",
		stat: story.label,
		groupSize: story.groupSize,
		made: Math.round(o.playoffs * 100),
		allMade: Math.round(o.allPlayoffs * 100),
		line: story.winsLine,
		bars: [
			{
				label: `Won in their first ${ctx.n} games`,
				v: o.startWin,
				all: raidersWin,
				text: pctText(o.startWin),
				note: raidersWin !== null && startRecord ? `The Raiders now: ${startRecord.wins}-${startRecord.losses}, ${pctText(raidersWin)}` : "",
			},
			{
				label: "Won over the rest of the season",
				v: o.restWin,
				all: o.allRestWin,
				text: pctText(o.restWin),
				note: `About ${o.restWins.toFixed(1)} wins in ${Math.round(o.restGames)} games. Every team: ${pctText(o.allRestWin)}`,
			},
			{
				label: "Made the playoffs",
				v: o.playoffs,
				all: o.allPlayoffs,
				text: pctText(o.playoffs),
				note: `Every team: ${pctText(o.allPlayoffs)}`,
			},
		],
	}
}

export function buildFifthsSpec(story: Analysis, ctx: Ctx): FifthsCard {
	const mine = story.fifths[story.raidersFifth]
	return {
		...base(ctx, story, DEFAULT_FILTER, "improve", {
			line: `Every team since ${ctx.first}, in five equal groups`,
		}),
		kind: "fifths",
		stat: story.label,
		value: story.valueText,
		rank: ordinalOf(story.rank),
		line: `The Raiders are in the ${fifthName(story.raidersFifth)} of teams, where ${pctText(mine.rate)} made the playoffs.`,
		all: story.outcomes.allPlayoffs,
		bars: story.fifths.map((f, k) => ({
			name: fifthName(k),
			rate: f.rate,
			range: `${formatStat(story, f.lo)} to ${formatStat(story, f.hi)}`,
			mine: k === story.raidersFifth,
		})),
	}
}

export function buildChecklistSpec(rows: CheckRow[], ctx: Ctx): ChecklistCard | null {
	if (!rows.length) return null
	const top = rows[0]
	return {
		...base(ctx, null, DEFAULT_FILTER, "improve", {
			line: `The ${ctx.season} Raiders against every team since ${ctx.first}`,
		}),
		kind: "checklist",
		line: `How often teams that stood where the ${ctx.season} Raiders stand made the playoffs, stat by stat, from the stat that has separated playoff teams best.`,
		best: `${top.label}: ${pctText(top.best)} of the best fifth made it, ${pctText(top.worst)} of the worst`,
		total: rows.length,
		rows: rows.map((c) => ({
			label: c.label,
			rate: c.rate,
			note: `Raiders ${c.valueText} · ${ordinalOf(c.rank)} of 32`,
			fifth: fifthName(c.fifth),
		})),
	}
}

export function buildBottomSpec(
	stories: Analysis[],
	bottomTitle: string,
	record: {
		wins: number
		losses: number
		teams: number
		playoffs: number
		avgWins: number
	} | null,
	ctx: Ctx,
): BottomCard {
	const names = (ids: string[]) => stories.filter((s) => ids.includes(s.verdict.id)).map((s) => s.label)
	const groups: BottomCard["groups"] = [
		{
			tone: "fade" as Tone,
			head: "Likely to cool off",
			names: names(["fade"]).join(", "),
		},
		{
			tone: "improve" as Tone,
			head: "Likely to bounce back",
			names: names(["improve"]).join(", "),
		},
		{
			tone: "even" as Tone,
			head: "Tends to stay put",
			names: names(["hold", "linger"]).join(", "),
		},
	].filter((g) => g.names)
	return {
		...base(ctx, null, DEFAULT_FILTER, "even", {
			line: `The ${ctx.season} Raiders against every team since ${ctx.first}`,
		}),
		kind: "bottom",
		title: bottomTitle,
		groups,
		record: record
			? {
					big: pctText(record.playoffs / record.teams),
					label: `of ${record.teams} teams that started ${record.wins}-${record.losses} made the playoffs`,
					note: `The average one finished with ${record.avgWins.toFixed(1)} wins`,
				}
			: null,
		footnote: `Not a prediction for one game: what happened to teams that looked like the ${ctx.season} Raiders after ${ctx.n} games.`,
	}
}

// ---- layout ------------------------------------------------------------------------------------------------

type Dims = {
	w: number
	h: number
	tall: boolean
	padX: number
	padTop: number
	padBottom: number
	innerW: number
	mainH: number
}

function dimsOf(size: ShareSize): Dims {
	const { width: w, height: h } = SIZE_PIXELS[size]
	const tall = size === "tall"
	const padX = tall ? 72 : 60
	const padTop = tall ? 70 : 44
	const padBottom = tall ? 58 : 36
	// Header (eyebrow and the filter line) and footer (brand) take a fixed band each, and the card's body gets the rest.
	const header = tall ? 112 : 92
	const footer = tall ? 60 : 46
	return {
		w,
		h,
		tall,
		padX,
		padTop,
		padBottom,
		innerW: w - padX * 2,
		mainH: h - padTop - padBottom - header - footer - (tall ? 28 : 12),
	}
}

const label = (extra: Record<string, string | number> = {}) => ({
	display: "flex",
	fontFamily: "Oswald",
	fontWeight: 500,
	letterSpacing: 4,
	color: DIM,
	...caps,
	...extra,
})

const KIND_EYEBROW: Record<ShareKind, string> = {
	chart: "Will it last?",
	wins: "Will it last? · wins and playoffs",
	fifths: "Will it last? · playoff odds",
	checklist: "Will it last? · the checklist",
	season: "Will it last? · a team's season",
	bottom: "Will it last? · the bottom line",
}

function Shell({ spec, d, legend, children }: { spec: LastCardSpec; d: Dims; legend?: boolean | string; children: ReactElement | ReactElement[] }) {
	const tone = toneColor(spec.tone)
	return (
		<Frame glow={tone} w={d.w} h={d.h}>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: d.w,
					height: d.h,
					padding: `${d.padTop}px ${d.padX}px ${d.padBottom}px`,
				}}
			>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<Eyebrow text={`${KIND_EYEBROW[spec.kind]} · after ${spec.n} games`} color={tone} />
					<div
						style={{
							display: "flex",
							marginTop: d.tall ? 16 : 10,
							fontFamily: "Oswald",
							fontWeight: 500,
							fontSize: d.tall ? 26 : 20,
							letterSpacing: 2,
							color: SILVER,
							...caps,
						}}
					>
						{clip(spec.filter, d.tall ? 70 : 74)}
					</div>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: d.tall ? "column" : "row",
						width: d.innerW,
						height: d.mainH,
						marginTop: d.tall ? 28 : 12,
						justifyContent: d.tall ? "space-between" : "flex-start",
					}}
				>
					{children}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginTop: "auto",
					}}
				>
					<Brand />
					<div
						style={{
							display: "flex",
							fontFamily: "Oswald",
							fontWeight: 400,
							fontSize: d.tall ? 19 : 16,
							letterSpacing: 1,
							color: DIM,
						}}
					>
						{typeof legend === "string" ? legend : legend ? "Blue: made the playoffs · Orange ring: missed · Gold: the Raiders" : `Data: nflverse, CC BY 4.0 · every season ${spec.first} to ${spec.last}`}
					</div>
				</div>
			</div>
		</Frame>
	)
}

function Pill({ text, color, size, solid = false }: { text: string; color: string; size: number; solid?: boolean }) {
	return (
		<div
			style={{
				display: "flex",
				alignSelf: "flex-start",
				padding: `${Math.round(size * 0.24)}px ${Math.round(size * 0.6)}px`,
				border: `3px solid ${color}`,
				backgroundColor: solid ? color : "transparent",
				color: solid ? "#0a0a0b" : color,
				fontFamily: "Oswald",
				fontWeight: 700,
				fontSize: size,
				letterSpacing: Math.round(size * 0.14),
				...caps,
			}}
		>
			{text}
		</div>
	)
}

/** The biggest Anton size (up to `big`) at which `text` fits `maxW` in `lines` lines. Anton capitals run about half an em wide. */
function fitTitle(text: string, maxW: number, big: number, lines: 1 | 2 = 1): number {
	const longest = Math.max(...text.split(" ").map((w) => w.length))
	const need = lines === 1 ? text.length : Math.max(longest, Math.ceil(text.length / 2))
	return Math.max(44, Math.min(big, Math.floor(maxW / (need * 0.5))))
}

/** A right-pointing arrow drawn as a shape, since the fonts have no arrow glyph. */
function Arrow({ w, h, color }: { w: number; h: number; color: string }) {
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<polygon points={`0,${h * 0.36} ${w * 0.58},${h * 0.36} ${w * 0.58},0 ${w},${h / 2} ${w * 0.58},${h} ${w * 0.58},${h * 0.64} 0,${h * 0.64}`} fill={color} />
		</svg>
	)
}

// ---- the plot ----------------------------------------------------------------------------------------------

const circlePath = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

function Plot({ p, w, h, big }: { p: LastPlot; w: number; h: number; big: boolean }) {
	const PL = 18
	const PR = 18
	const PT = big ? 104 : 84
	const PB = big ? 70 : 58
	const pw = w - PL - PR
	const X = (v: number) => PL + v * pw
	const Y = (t: number) => PT + 8 + t * (h - PT - PB - 16)
	const r = big ? 6.2 : 4.4
	const gridTop = PT - 4
	const gridBottom = h - PB + 6

	let made = ""
	let glow = ""
	let missed = ""
	let ghost = ""
	let trails = ""
	for (const d of p.dots) {
		if (d.raiders) continue
		const x = X(d.b)
		const y = Y(d.y)
		trails += `M${X(d.a).toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}`
		ghost += circlePath(X(d.a), y, r * 0.55)
		if (d.po) {
			made += circlePath(x, y, r)
			glow += circlePath(x, y, r * 2.1)
		} else missed += circlePath(x, y, r - 1)
	}
	let bg = ""
	for (const b of p.bg) bg += circlePath(X(b.x), Y(b.y), r * 0.5)
	const raiders = p.dots.filter((d) => d.raiders)

	const chipText = `Raiders now ${p.raidersText}`
	const chipFont = big ? 21 : 17
	const chipW = Math.round(chipText.length * chipFont * 0.55 + 28)
	const chipX = Math.max(6, Math.min(w - chipW - 6, X(p.raiders) - chipW / 2))
	const avgText = `Group average ${p.avgText}`
	const avgFont = big ? 21 : 16
	const avgW = Math.round(avgText.length * avgFont * 0.5 + 10)
	const avgMid = (X(p.avgA) + X(p.avgB)) / 2
	const avgX = Math.max(6, Math.min(w - avgW - 6, avgMid - avgW / 2))
	const arrowY = PT - 14
	const dir = p.avgB >= p.avgA ? 1 : -1
	const ax = X(p.avgB)
	const head = big ? 11 : 8

	return (
		<div style={{ display: "flex", position: "relative", width: w, height: h }}>
			<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0 }}>
				<rect x={1} y={1} width={w - 2} height={h - 2} fill={INK} stroke={LINE} strokeWidth={2} />
				{p.ticks.map((t, k) => (
					<line key={`g${k}`} x1={X(t.x)} x2={X(t.x)} y1={gridTop} y2={gridBottom} stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1.5} />
				))}
				{p.winTicks.map((t, k) => (
					<line key={`w${k}`} x1={PL} x2={w - PR} y1={Y(t.y)} y2={Y(t.y)} stroke="#ffffff" strokeOpacity={0.1} strokeWidth={1.5} strokeDasharray="2 6" />
				))}
				<rect x={X(p.band[0])} y={gridTop} width={Math.max(4, X(p.band[1]) - X(p.band[0]))} height={gridBottom - gridTop} fill={GOLD} fillOpacity={0.12} stroke={GOLD} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="7 6" />
				<line x1={X(p.base)} x2={X(p.base)} y1={gridTop} y2={gridBottom} stroke={DIM} strokeWidth={2} strokeDasharray="3 6" />
				<path d={bg} fill="#ffffff" fillOpacity={0.16} />
				<path d={trails} fill="none" stroke="#ffffff" strokeOpacity={p.dim ? 0.05 : 0.13} strokeWidth={1.2} />
				<path d={ghost} fill={SILVER} fillOpacity={p.dim ? 0.2 : 0.45} />
				<path d={glow} fill={IMPROVE} fillOpacity={p.dim ? 0.03 : 0.1} />
				<path d={missed} fill={FADE} fillOpacity={p.dim ? 0.04 : 0.14} stroke={FADE} strokeOpacity={p.dim ? 0.35 : 1} strokeWidth={big ? 2.6 : 2} />
				<path d={made} fill={IMPROVE} fillOpacity={p.dim ? 0.3 : 0.92} />
				<line x1={X(p.avgA)} x2={X(p.avgA)} y1={arrowY} y2={gridBottom} stroke="#ffffff" strokeOpacity={0.4} strokeWidth={2} strokeDasharray="4 5" />
				<line x1={ax} x2={ax} y1={arrowY} y2={gridBottom} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={3} />
				<line x1={X(p.avgA)} x2={ax - dir * head} y1={arrowY} y2={arrowY} stroke="#ffffff" strokeWidth={3} />
				<polygon points={`${ax},${arrowY} ${ax - dir * head * 1.6},${arrowY - head} ${ax - dir * head * 1.6},${arrowY + head}`} fill="#ffffff" />
				<polygon points={`${PL + 6},${h - (big ? 23 : 19)} ${PL + 17},${h - (big ? 30 : 25)} ${PL + 17},${h - (big ? 16 : 13)}`} fill={DIM} />
				<polygon points={`${w - PR - 6},${h - (big ? 23 : 19)} ${w - PR - 17},${h - (big ? 30 : 25)} ${w - PR - 17},${h - (big ? 16 : 13)}`} fill={DIM} />
				<rect x={X(p.raiders) - 9} y={gridTop - 10} width={18} height={gridBottom - gridTop + 10} fill={GOLD} fillOpacity={0.16} />
				<rect x={X(p.raiders) - 2.5} y={gridTop - 10} width={5} height={gridBottom - gridTop + 10} fill={GOLD} />
				{raiders.map((d, k) => (
					<g key={`r${k}`}>
						<line x1={X(d.a)} x2={X(d.b)} y1={Y(d.y)} y2={Y(d.y)} stroke={GOLD} strokeOpacity={0.4} strokeWidth={1.6} />
						<circle cx={X(d.b)} cy={Y(d.y)} r={r + 3.2} fill={d.po ? IMPROVE : INK} stroke={GOLD} strokeWidth={big ? 3.6 : 3} strokeDasharray={d.po ? undefined : "4 3"} />
					</g>
				))}
				{p.pin ? (
					<g>
						<line x1={X(p.pin.a)} x2={X(p.pin.b)} y1={Y(p.pin.y)} y2={Y(p.pin.y)} stroke="#ffffff" strokeWidth={big ? 4 : 3} strokeOpacity={0.95} />
						<circle cx={X(p.pin.a)} cy={Y(p.pin.y)} r={r + 4} fill={INK} stroke="#ffffff" strokeWidth={3} strokeDasharray="4 3" />
						<circle cx={X(p.pin.b)} cy={Y(p.pin.y)} r={r + 11} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2} />
						<circle cx={X(p.pin.b)} cy={Y(p.pin.y)} r={r + 5} fill={p.pin.po ? IMPROVE : INK} stroke={p.pin.po ? "#ffffff" : FADE} strokeWidth={3.4} />
					</g>
				) : null}
			</svg>
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: chipX,
					top: 12,
					padding: `${big ? 5 : 3}px 14px`,
					backgroundColor: GOLD,
					color: "#0a0a0b",
					fontFamily: "Oswald",
					fontWeight: 700,
					fontSize: chipFont,
					letterSpacing: 1.5,
					...caps,
				}}
			>
				{chipText}
			</div>
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: avgX,
					top: big ? 52 : 42,
					fontFamily: "Oswald",
					fontWeight: 600,
					fontSize: avgFont,
					letterSpacing: 1.5,
					color: WHITE,
					...caps,
				}}
			>
				{avgText}
			</div>
			{p.winTicks.map((t, k) => (
				<div
					key={`wl${k}`}
					style={{
						display: "flex",
						position: "absolute",
						left: PL + 6,
						top: Y(t.y) - (big ? 24 : 20),
						fontFamily: "Oswald",
						fontWeight: 600,
						fontSize: big ? 17 : 14,
						letterSpacing: 1,
						color: DIM,
						...caps,
					}}
				>
					{t.label}
				</div>
			))}
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: Math.min(w - 120, X(p.base) + 8),
					top: gridBottom - (big ? 34 : 28),
					padding: "1px 6px",
					backgroundColor: INK,
					fontFamily: "Oswald",
					fontWeight: 600,
					fontSize: big ? 16 : 13,
					letterSpacing: 1.5,
					color: SILVER,
					...caps,
				}}
			>
				League average
			</div>
			{p.ticks.map((t, k) => (
				<div
					key={`t${k}`}
					style={{
						display: "flex",
						position: "absolute",
						left: Math.max(2, Math.min(w - 92, X(t.x) - 45)),
						top: h - PB + (big ? 8 : 14),
						width: 90,
						justifyContent: "center",
						fontFamily: "Oswald",
						fontWeight: 500,
						fontSize: big ? 22 : 17,
						color: SILVER,
					}}
				>
					{t.label}
				</div>
			))}
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: PL + 24,
					top: h - (big ? 32 : 26),
					fontFamily: "Oswald",
					fontWeight: 600,
					fontSize: big ? 16 : 13,
					letterSpacing: 3,
					color: DIM,
					...caps,
				}}
			>
				{p.higherIsBetter ? "Worse" : "Better"}
			</div>
			<div
				style={{
					display: "flex",
					position: "absolute",
					right: PR + 24,
					top: h - (big ? 32 : 26),
					fontFamily: "Oswald",
					fontWeight: 600,
					fontSize: big ? 16 : 13,
					letterSpacing: 3,
					color: DIM,
					...caps,
				}}
			>
				{p.higherIsBetter ? "Better" : "Worse"}
			</div>
			{p.pin ? (
				<div
					style={{
						display: "flex",
						position: "absolute",
						left: Math.max(6, Math.min(w - 220, X(p.pin.b) - 100)),
						top: Math.max(PT + 6, Math.min(h - PB - 40, Y(p.pin.y) + (p.pin.y > 0.55 ? -(big ? 62 : 52) : big ? 22 : 18))),
						padding: "3px 12px",
						backgroundColor: WHITE,
						color: "#0a0a0b",
						fontFamily: "Oswald",
						fontWeight: 700,
						fontSize: big ? 22 : 17,
						letterSpacing: 1.5,
						...caps,
					}}
				>
					{p.pin.name}
				</div>
			) : null}
		</div>
	)
}

function TileRow({ tiles, d, color }: { tiles: Tile[]; d: Dims; color: string }) {
	const gap = 16
	const tw = Math.floor((d.innerW - gap * (tiles.length - 1)) / tiles.length)
	return (
		<div style={{ display: "flex", width: d.innerW }}>
			{tiles.map((t, k) => (
				<div
					key={t.k}
					style={{
						display: "flex",
						flexDirection: "column",
						width: tw,
						marginLeft: k ? gap : 0,
						padding: "16px 22px 14px",
						backgroundColor: PANEL,
						border: `2px solid ${LINE}`,
						borderTop: `5px solid ${k === tiles.length - 1 ? color : SILVER}`,
					}}
				>
					<div style={label({ fontSize: 18, letterSpacing: 2 })}>{t.k}</div>
					<div
						style={{
							display: "flex",
							marginTop: 4,
							fontFamily: "Anton",
							fontSize: t.v.length > 6 ? 54 : 70,
							lineHeight: 1.05,
							color: WHITE,
						}}
					>
						{t.v}
					</div>
					<div
						style={{
							display: "flex",
							marginTop: 2,
							fontFamily: "Oswald",
							fontWeight: 400,
							fontSize: 20,
							color: SILVER,
						}}
					>
						{t.note}
					</div>
				</div>
			))}
		</div>
	)
}

// ---- chart -------------------------------------------------------------------------------------------------

function renderChart(spec: ChartCard, d: Dims): ReactElement {
	const tone = toneColor(spec.tone)
	if (d.tall) {
		return (
			<Shell spec={spec} d={d} legend>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div
						style={{
							display: "flex",
							fontFamily: "Anton",
							fontSize: fitTitle(spec.title, d.innerW, 150),
							lineHeight: 1.02,
							color: WHITE,
							...caps,
						}}
					>
						{spec.title}
					</div>
					<div
						style={{
							display: "flex",
							marginTop: 6,
							fontFamily: "Oswald",
							fontWeight: 600,
							fontSize: 34,
							letterSpacing: 3,
							color: SILVER,
							...caps,
						}}
					>
						{spec.rank}
					</div>
					<div style={{ display: "flex", marginTop: 18 }}>
						<Pill text={spec.verdict} color={tone} size={34} />
					</div>
					<div
						style={{
							display: "flex",
							marginTop: 16,
							fontFamily: "Oswald",
							fontWeight: 400,
							fontSize: 28,
							lineHeight: 1.3,
							color: BRIGHT,
							maxWidth: 900,
						}}
					>
						{spec.line}
					</div>
				</div>
				<Plot p={spec.plot} w={d.innerW} h={470} big />
				<TileRow tiles={spec.tiles} d={d} color={tone} />
			</Shell>
		)
	}
	return (
		<Shell spec={spec} d={d} legend>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					width: 410,
					height: d.mainH,
					paddingRight: 18,
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: fitTitle(spec.title, 390, 96, 2),
						lineHeight: 1.02,
						color: WHITE,
						...caps,
					}}
				>
					{spec.title}
				</div>
				<div
					style={{
						display: "flex",
						marginTop: 8,
						fontFamily: "Oswald",
						fontWeight: 600,
						fontSize: 23,
						letterSpacing: 2.5,
						color: SILVER,
						...caps,
					}}
				>
					{spec.rank}
				</div>
				<div style={{ display: "flex", marginTop: 18 }}>
					<Pill text={spec.verdict} color={tone} size={25} />
				</div>
				<div
					style={{
						display: "flex",
						marginTop: 16,
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 22,
						lineHeight: 1.3,
						color: BRIGHT,
					}}
				>
					{spec.line}
				</div>
			</div>
			<Plot p={spec.plot} w={d.innerW - 410} h={d.mainH} big={false} />
		</Shell>
	)
}

// ---- season ------------------------------------------------------------------------------------------------

function renderSeason(spec: SeasonCard, d: Dims): ReactElement {
	const tone = toneColor(spec.tone)
	const badge = spec.po ? "Made the playoffs" : "Missed the playoffs"
	const records = (big: number, small: number) => (
		<div style={{ display: "flex", alignItems: "flex-end" }}>
			<div style={{ display: "flex", flexDirection: "column" }}>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: big,
						lineHeight: 1,
						color: SILVER,
					}}
				>
					{spec.startRecord}
				</div>
				<div style={label({ fontSize: small, letterSpacing: 3, marginTop: 4 })}>{`After ${spec.n} games`}</div>
			</div>
			<div
				style={{
					display: "flex",
					margin: `0 ${Math.round(big * 0.25)}px ${Math.round(big * 0.27)}px`,
				}}
			>
				<Arrow w={Math.round(big * 0.42)} h={Math.round(big * 0.34)} color={tone} />
			</div>
			<div style={{ display: "flex", flexDirection: "column" }}>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: big,
						lineHeight: 1,
						color: WHITE,
					}}
				>
					{spec.finalRecord}
				</div>
				<div style={label({ fontSize: small, letterSpacing: 3, marginTop: 4 })}>Final record</div>
			</div>
		</div>
	)
	if (d.tall) {
		return (
			<Shell spec={spec} d={d} legend>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div
						style={{
							display: "flex",
							fontFamily: "Anton",
							fontSize: fitTitle(spec.name, d.innerW, 128),
							lineHeight: 1.02,
							color: WHITE,
							...caps,
						}}
					>
						{spec.name}
					</div>
					<div style={{ display: "flex", marginTop: 22 }}>{records(150, 22)}</div>
					<div style={{ display: "flex", marginTop: 24 }}>
						<Pill text={badge} color={tone} size={32} solid={spec.po} />
					</div>
				</div>
				<Plot p={spec.plot} w={d.innerW} h={400} big />
				<TileRow tiles={spec.tiles} d={d} color={tone} />
			</Shell>
		)
	}
	return (
		<Shell spec={spec} d={d} legend>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					width: 430,
					height: d.mainH,
					paddingRight: 20,
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: fitTitle(spec.name, 410, 74, 2),
						lineHeight: 1.02,
						color: WHITE,
						...caps,
					}}
				>
					{spec.name}
				</div>
				<div style={{ display: "flex", marginTop: 12 }}>{records(76, 14)}</div>
				<div style={{ display: "flex", marginTop: 14 }}>
					<Pill text={badge} color={tone} size={21} solid={spec.po} />
				</div>
				<div
					style={{
						display: "flex",
						marginTop: 12,
						fontFamily: "Oswald",
						fontWeight: 600,
						fontSize: 21,
						letterSpacing: 1.5,
						color: SILVER,
						...caps,
					}}
				>{`${spec.stat}: ${spec.moveText}`}</div>
				<div
					style={{
						display: "flex",
						marginTop: 6,
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 18,
						lineHeight: 1.28,
						color: BRIGHT,
					}}
				>
					{clip(spec.line, 150)}
				</div>
			</div>
			<Plot p={spec.plot} w={d.innerW - 430} h={d.mainH} big={false} />
		</Shell>
	)
}

// ---- wins and playoffs -------------------------------------------------------------------------------------

/** 100 dots in 10 rows (or 5 rows of 20): the first `made` are blue. */
function Waffle({ made, cols, cell, r }: { made: number; cols: number; cell: number; r: number }) {
	const rows = Math.ceil(100 / cols)
	let blue = ""
	let ring = ""
	for (let k = 0; k < 100; k++) {
		const x = (k % cols) * cell + cell / 2
		const y = Math.floor(k / cols) * cell + cell / 2
		if (k < made) blue += circlePath(x, y, r)
		else ring += circlePath(x, y, r - 1)
	}
	return (
		<svg width={cols * cell} height={rows * cell} viewBox={`0 0 ${cols * cell} ${rows * cell}`}>
			<path d={ring} fill="none" stroke={SILVER} strokeOpacity={0.4} strokeWidth={2} />
			<path d={blue} fill={IMPROVE} />
		</svg>
	)
}

function BarRow({ bar, w, big }: { bar: WinsCard["bars"][number]; w: number; big: boolean }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", width: w }}>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "space-between",
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Oswald",
						fontWeight: 600,
						fontSize: big ? 24 : 20,
						letterSpacing: 1,
						color: BRIGHT,
					}}
				>
					{bar.label}
				</div>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: big ? 52 : 38,
						lineHeight: 1,
						color: WHITE,
					}}
				>
					{bar.text}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					position: "relative",
					width: w,
					height: big ? 22 : 16,
					marginTop: 8,
					backgroundColor: "#1b1d20",
				}}
			>
				<div
					style={{
						display: "flex",
						width: Math.round(bar.v * w),
						height: big ? 22 : 16,
						backgroundColor: IMPROVE,
					}}
				/>
				{bar.all !== null ? (
					<div
						style={{
							display: "flex",
							position: "absolute",
							left: Math.round(bar.all * w) - 2,
							top: -6,
							width: 4,
							height: big ? 34 : 28,
							backgroundColor: GOLD,
						}}
					/>
				) : null}
			</div>
			{big ? (
				<div
					style={{
						display: "flex",
						marginTop: 8,
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 19,
						color: SILVER,
					}}
				>
					{clip(bar.note, 70)}
				</div>
			) : null}
		</div>
	)
}

function renderWins(spec: WinsCard, d: Dims): ReactElement {
	const hero = (size: number, labelSize: number) => (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div
				style={{
					display: "flex",
					fontFamily: "Anton",
					fontSize: size,
					lineHeight: 0.98,
					color: IMPROVE,
				}}
			>{`${spec.made}%`}</div>
			<div
				style={{
					display: "flex",
					fontFamily: "Oswald",
					fontWeight: 700,
					fontSize: labelSize,
					letterSpacing: Math.round(labelSize * 0.14),
					color: WHITE,
					...caps,
				}}
			>
				made the playoffs
			</div>
		</div>
	)
	const caption = `${spec.groupSize} team${spec.groupSize === 1 ? "" : "s"} in this group. Every team: ${spec.allMade}%.`
	if (d.tall) {
		const bw = 440
		return (
			<Shell spec={spec} d={d} legend="Gold tick: the Raiders now (first bar) · every team (the others)">
				<div style={{ display: "flex", flexDirection: "column" }}>
					{hero(300, 44)}
					<div
						style={{
							display: "flex",
							marginTop: 14,
							fontFamily: "Oswald",
							fontWeight: 500,
							fontSize: 28,
							letterSpacing: 1,
							color: SILVER,
						}}
					>{`Out of every 100 teams like this. ${caption}`}</div>
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						width: d.innerW,
					}}
				>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<Waffle made={spec.made} cols={10} cell={46} r={18} />
						<div
							style={{
								display: "flex",
								marginTop: 12,
								fontFamily: "Oswald",
								fontWeight: 500,
								fontSize: 18,
								letterSpacing: 2,
								color: DIM,
								...caps,
							}}
						>
							Each dot: 1 in 100 teams · blue made it
						</div>
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							justifyContent: "space-between",
							height: 470,
						}}
					>
						{spec.bars.map((b) => (
							<BarRow key={b.label} bar={b} w={bw} big />
						))}
					</div>
				</div>
				<div
					style={{
						display: "flex",
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 25,
						lineHeight: 1.3,
						color: BRIGHT,
					}}
				>
					{clip(spec.line, 230)}
				</div>
			</Shell>
		)
	}
	return (
		<Shell spec={spec} d={d} legend="Gold tick: the Raiders now (first bar) · every team (the others)">
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					width: 400,
					height: d.mainH,
					paddingRight: 20,
				}}
			>
				{hero(168, 34)}
				<div
					style={{
						display: "flex",
						marginTop: 16,
						fontFamily: "Oswald",
						fontWeight: 500,
						fontSize: 22,
						lineHeight: 1.3,
						color: SILVER,
					}}
				>{`Out of every 100 teams like this. ${caption}`}</div>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					width: d.innerW - 400,
					height: d.mainH,
				}}
			>
				{spec.bars.map((b) => (
					<BarRow key={b.label} bar={b} w={d.innerW - 400} big={false} />
				))}
				<div style={{ display: "flex", alignItems: "center" }}>
					<Waffle made={spec.made} cols={20} cell={Math.floor((d.innerW - 400) / 20)} r={7} />
				</div>
			</div>
		</Shell>
	)
}

// ---- playoff odds by fifth ---------------------------------------------------------------------------------

function Fifths({ spec, w, h, big }: { spec: FifthsCard; w: number; h: number; big: boolean }) {
	const n = spec.bars.length
	const gap = big ? 22 : 16
	const bw = Math.floor((w - gap * (n - 1)) / n)
	const labelH = big ? 96 : 70
	const topH = big ? 64 : 56
	const area = h - labelH - topH
	// Scaled so the tallest bar fills the space, which the numbers on the bars make plain.
	const top = Math.min(1, Math.max(0.3, Math.max(...spec.bars.map((b) => b.rate), spec.all) + 0.08))
	const yOf = (rate: number) => Math.round((rate / top) * area)
	const lineY = topH + area - yOf(spec.all)
	return (
		<div style={{ display: "flex", position: "relative", width: w, height: h }}>
			{spec.bars.map((b, k) => {
				const bh = Math.max(8, yOf(b.rate))
				const inside = bh >= (big ? 76 : 52)
				const left = k * (bw + gap)
				return (
					<div
						key={b.name}
						style={{
							display: "flex",
							flexDirection: "column",
							position: "absolute",
							left,
							top: 0,
							width: bw,
							height: h,
						}}
					>
						<div
							style={{
								display: "flex",
								position: "absolute",
								left: 0,
								top: topH + area - bh - (b.mine ? (big ? 40 : 32) : 0) - (inside ? 0 : big ? 62 : 46),
								width: bw,
								justifyContent: "center",
							}}
						>
							{b.mine ? (
								<div
									style={{
										display: "flex",
										padding: "2px 12px",
										backgroundColor: GOLD,
										color: "#0a0a0b",
										fontFamily: "Oswald",
										fontWeight: 700,
										fontSize: big ? 20 : 15,
										letterSpacing: 2,
										...caps,
									}}
								>
									Raiders
								</div>
							) : null}
						</div>
						{!inside ? (
							<div
								style={{
									display: "flex",
									position: "absolute",
									left: 0,
									top: topH + area - bh - (big ? 62 : 46),
									width: bw,
									justifyContent: "center",
									fontFamily: "Anton",
									fontSize: big ? 56 : 40,
									lineHeight: 1,
									color: b.mine ? GOLD : WHITE,
								}}
							>
								{pctText(b.rate)}
							</div>
						) : null}
						<div
							style={{
								display: "flex",
								position: "absolute",
								left: 0,
								top: topH + area - bh,
								width: bw,
								height: bh,
								backgroundColor: b.mine ? GOLD : IMPROVE,
								alignItems: "flex-end",
								justifyContent: "center",
							}}
						>
							{inside ? (
								<div
									style={{
										display: "flex",
										marginBottom: 10,
										fontFamily: "Anton",
										fontSize: big ? 60 : 42,
										lineHeight: 1,
										color: "#0a0a0b",
									}}
								>
									{pctText(b.rate)}
								</div>
							) : null}
						</div>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								position: "absolute",
								left: 0,
								top: topH + area + 10,
								width: bw,
							}}
						>
							<div
								style={{
									display: "flex",
									fontFamily: "Oswald",
									fontWeight: 700,
									fontSize: big ? 24 : 18,
									letterSpacing: 2,
									color: b.mine ? GOLD : BRIGHT,
									...caps,
								}}
							>
								{b.name.replace(" fifth", "")}
							</div>
							<div
								style={{
									display: "flex",
									marginTop: 4,
									fontFamily: "Oswald",
									fontWeight: 400,
									fontSize: big ? 19 : 14,
									color: DIM,
								}}
							>
								{b.range}
							</div>
						</div>
					</div>
				)
			})}
			<div
				style={{
					display: "flex",
					position: "absolute",
					left: 0,
					top: lineY,
					width: w,
					height: 0,
					borderTop: `3px dashed ${rgba(WHITE, 0.8)}`,
				}}
			/>
			<div
				style={{
					display: "flex",
					position: "absolute",
					right: 0,
					top: 0,
					fontFamily: "Oswald",
					fontWeight: 600,
					fontSize: big ? 20 : 15,
					letterSpacing: 2,
					color: WHITE,
					...caps,
				}}
			>{`Dashed line: every team, ${pctText(spec.all)}`}</div>
		</div>
	)
}

function renderFifths(spec: FifthsCard, d: Dims): ReactElement {
	if (d.tall) {
		return (
			<Shell spec={spec} d={d}>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div
						style={{
							display: "flex",
							fontFamily: "Anton",
							fontSize: 76,
							lineHeight: 1.04,
							color: WHITE,
							...caps,
						}}
					>{`Playoff odds by ${clip(spec.stat, 26)}`}</div>
					<div
						style={{
							display: "flex",
							marginTop: 12,
							fontFamily: "Oswald",
							fontWeight: 600,
							fontSize: 30,
							letterSpacing: 3,
							color: SILVER,
							...caps,
						}}
					>{`Raiders ${spec.rank} of 32 · ${spec.value}`}</div>
					<div
						style={{
							display: "flex",
							marginTop: 14,
							fontFamily: "Oswald",
							fontWeight: 400,
							fontSize: 27,
							lineHeight: 1.3,
							color: BRIGHT,
						}}
					>{`Teams grouped by this stat after ${spec.n} games. ${spec.line}`}</div>
				</div>
				<Fifths spec={spec} w={d.innerW} h={680} big />
			</Shell>
		)
	}
	return (
		<Shell spec={spec} d={d}>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					width: 380,
					height: d.mainH,
					paddingRight: 22,
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: 54,
						lineHeight: 1.04,
						color: WHITE,
						...caps,
					}}
				>{`Playoff odds by ${clip(spec.stat, 22)}`}</div>
				<div
					style={{
						display: "flex",
						marginTop: 10,
						fontFamily: "Oswald",
						fontWeight: 600,
						fontSize: 20,
						letterSpacing: 2,
						color: SILVER,
						...caps,
					}}
				>{`Raiders ${spec.rank} of 32 · ${spec.value}`}</div>
				<div
					style={{
						display: "flex",
						marginTop: 12,
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 20,
						lineHeight: 1.3,
						color: BRIGHT,
					}}
				>{`Teams grouped by this stat after ${spec.n} games. ${spec.line}`}</div>
			</div>
			<Fifths spec={spec} w={d.innerW - 380} h={d.mainH} big={false} />
		</Shell>
	)
}

// ---- the checklist -----------------------------------------------------------------------------------------

function CheckRows({ spec, w, h, rows, big }: { spec: ChecklistCard; w: number; h: number; rows: number; big: boolean }) {
	const shown = spec.rows.slice(0, rows)
	const rowH = Math.floor(h / rows)
	return (
		<div style={{ display: "flex", flexDirection: "column", width: w, height: h }}>
			{shown.map((c, k) => {
				const color = c.rate >= 0.6 ? IMPROVE : c.rate <= 0.4 ? FADE : SILVER
				return (
					<div
						key={c.label}
						style={{
							display: "flex",
							flexDirection: "column",
							justifyContent: "flex-start",
							width: w,
							height: rowH,
							paddingTop: big ? 6 : 3,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "flex-end",
								justifyContent: "space-between",
							}}
						>
							<div style={{ display: "flex", alignItems: "baseline" }}>
								<div
									style={{
										display: "flex",
										width: big ? 44 : 32,
										fontFamily: "Oswald",
										fontWeight: 700,
										fontSize: big ? 24 : 18,
										color: DIM,
									}}
								>
									{String(k + 1)}
								</div>
								<div
									style={{
										display: "flex",
										fontFamily: "Oswald",
										fontWeight: 600,
										fontSize: big ? 31 : 23,
										letterSpacing: 0.5,
										color: WHITE,
									}}
								>
									{clip(c.label, 28)}
								</div>
							</div>
							<div
								style={{
									display: "flex",
									fontFamily: "Anton",
									fontSize: big ? 46 : 32,
									lineHeight: 1,
									color,
								}}
							>
								{pctText(c.rate)}
							</div>
						</div>
						<div
							style={{
								display: "flex",
								width: w,
								height: big ? 16 : 11,
								marginTop: 6,
								backgroundColor: "#1b1d20",
							}}
						>
							<div
								style={{
									display: "flex",
									width: Math.round(c.rate * w),
									height: big ? 16 : 11,
									backgroundColor: color,
								}}
							/>
						</div>
						<div
							style={{
								display: "flex",
								marginTop: 5,
								fontFamily: "Oswald",
								fontWeight: 400,
								fontSize: big ? 20 : 15,
								color: SILVER,
							}}
						>
							{c.note}
						</div>
					</div>
				)
			})}
		</div>
	)
}

function renderChecklist(spec: ChecklistCard, d: Dims): ReactElement {
	const key = "Blue: 60% or more made the playoffs · Orange: 40% or fewer"
	if (d.tall) {
		return (
			<Shell spec={spec} d={d} legend={key}>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div
						style={{
							display: "flex",
							fontFamily: "Anton",
							fontSize: 84,
							lineHeight: 1.02,
							color: WHITE,
							...caps,
						}}
					>
						The Raiders&rsquo; playoff checklist
					</div>
					<div
						style={{
							display: "flex",
							marginTop: 12,
							fontFamily: "Oswald",
							fontWeight: 400,
							fontSize: 26,
							lineHeight: 1.3,
							color: BRIGHT,
						}}
					>
						{spec.line}
					</div>
				</div>
				<CheckRows spec={spec} w={d.innerW} h={730} rows={7} big />
			</Shell>
		)
	}
	return (
		<Shell spec={spec} d={d} legend={key}>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					width: 400,
					height: d.mainH,
					paddingRight: 24,
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: 64,
						lineHeight: 1.03,
						color: WHITE,
						...caps,
					}}
				>
					The Raiders&rsquo; playoff checklist
				</div>
				<div
					style={{
						display: "flex",
						marginTop: 14,
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 20,
						lineHeight: 1.3,
						color: BRIGHT,
					}}
				>
					{spec.line}
				</div>
			</div>
			<CheckRows spec={spec} w={d.innerW - 400} h={d.mainH} rows={5} big={false} />
		</Shell>
	)
}

// ---- the bottom line ---------------------------------------------------------------------------------------

function renderBottom(spec: BottomCard, d: Dims): ReactElement {
	const panels = (w: number, headSize: number, nameSize: number) =>
		spec.groups.map((g, k) => {
			const c = toneColor(g.tone)
			return (
				<div
					key={g.head}
					style={{
						display: "flex",
						flexDirection: "column",
						width: w,
						marginTop: k ? (d.tall ? 22 : 12) : 0,
						padding: d.tall ? "22px 30px" : "14px 22px",
						backgroundColor: PANEL,
						border: `2px solid ${LINE}`,
						borderLeft: `10px solid ${c}`,
					}}
				>
					<div
						style={{
							display: "flex",
							fontFamily: "Oswald",
							fontWeight: 700,
							fontSize: headSize,
							letterSpacing: 4,
							color: c,
							...caps,
						}}
					>
						{g.head}
					</div>
					<div
						style={{
							display: "flex",
							marginTop: 6,
							fontFamily: "Oswald",
							fontWeight: 500,
							fontSize: nameSize,
							lineHeight: 1.25,
							color: WHITE,
						}}
					>
						{clip(g.names, d.tall ? 110 : 80)}
					</div>
				</div>
			)
		})
	const record = spec.record
	if (d.tall) {
		return (
			<Shell spec={spec} d={d}>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: 100,
						lineHeight: 1.05,
						color: WHITE,
						...caps,
					}}
				>
					{spec.title}
				</div>
				<div style={{ display: "flex", flexDirection: "column" }}>{panels(d.innerW, 26, 36)}</div>
				{record ? (
					<div style={{ display: "flex", alignItems: "center" }}>
						<div
							style={{
								display: "flex",
								fontFamily: "Anton",
								fontSize: 150,
								lineHeight: 1,
								color: IMPROVE,
							}}
						>
							{record.big}
						</div>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								marginLeft: 28,
								width: 600,
							}}
						>
							<div
								style={{
									display: "flex",
									fontFamily: "Oswald",
									fontWeight: 600,
									fontSize: 30,
									lineHeight: 1.2,
									color: WHITE,
								}}
							>
								{record.label}
							</div>
							<div
								style={{
									display: "flex",
									marginTop: 6,
									fontFamily: "Oswald",
									fontWeight: 400,
									fontSize: 24,
									color: SILVER,
								}}
							>
								{record.note}
							</div>
						</div>
					</div>
				) : (
					<div style={{ display: "flex" }} />
				)}
				<div
					style={{
						display: "flex",
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 22,
						lineHeight: 1.3,
						color: DIM,
					}}
				>
					{spec.footnote}
				</div>
			</Shell>
		)
	}
	return (
		<Shell spec={spec} d={d}>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					width: 470,
					height: d.mainH,
					paddingRight: 28,
				}}
			>
				<div
					style={{
						display: "flex",
						fontFamily: "Anton",
						fontSize: 64,
						lineHeight: 1.04,
						color: WHITE,
						...caps,
					}}
				>
					{spec.title}
				</div>
				<div
					style={{
						display: "flex",
						marginTop: 14,
						fontFamily: "Oswald",
						fontWeight: 400,
						fontSize: 17,
						lineHeight: 1.3,
						color: DIM,
					}}
				>
					{spec.footnote}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					width: d.innerW - 470,
					height: d.mainH,
				}}
			>
				{panels(d.innerW - 470, 18, 25)}
				{record ? (
					<div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
						<div
							style={{
								display: "flex",
								width: 168,
								fontFamily: "Anton",
								fontSize: 76,
								lineHeight: 1,
								color: IMPROVE,
							}}
						>
							{record.big}
						</div>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								marginLeft: 12,
								width: d.innerW - 470 - 180,
							}}
						>
							<div
								style={{
									display: "flex",
									fontFamily: "Oswald",
									fontWeight: 600,
									fontSize: 20,
									lineHeight: 1.2,
									color: WHITE,
								}}
							>
								{record.label}
							</div>
							<div
								style={{
									display: "flex",
									marginTop: 4,
									fontFamily: "Oswald",
									fontWeight: 400,
									fontSize: 17,
									color: SILVER,
								}}
							>
								{record.note}
							</div>
						</div>
					</div>
				) : null}
			</div>
		</Shell>
	)
}

// ---- entry -------------------------------------------------------------------------------------------------

export function lastCardSize(spec: Pick<LastCardSpec, "size">): {
	width: number
	height: number
} {
	return SIZE_PIXELS[spec.size]
}

export function renderLastCard(spec: LastCardSpec): ReactElement {
	const d = dimsOf(spec.size)
	switch (spec.kind) {
		case "chart":
			return renderChart(spec, d)
		case "season":
			return renderSeason(spec, d)
		case "wins":
			return renderWins(spec, d)
		case "fifths":
			return renderFifths(spec, d)
		case "checklist":
			return renderChecklist(spec, d)
		case "bottom":
			return renderBottom(spec, d)
	}
}
