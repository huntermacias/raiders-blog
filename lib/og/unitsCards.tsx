// Two more share cards for the position-group pages:
//
//   slate   the week's games, each with how the two teams' position groups line up (/lab/matchups)
//   board   the league's heat map: every team ranked at all seven position groups (/lab/teams)
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// build*Spec turns the tables into a small plain spec (no network, so it can be tested from fixed data) and
// render*Card turns the spec into JSX. See lib/og/kit.tsx for the Satori notes: inline styles only, every element
// with more than one child is display:flex, and no text inside an <svg>.

import type { ReactElement, ReactNode } from "react"

import { opponentColors } from "../lab/colors"
import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import type { BoardSort, BoardView } from "../lab/matchupShare"
import { type GroupKey, type UnitsData, GROUPS, GROUP_ORDER, boardRows, heat, kickoffText, matchupRows, ordinal, paperEdge, recText, tally, teamCount, topEdges, viewOf } from "../lab/unitsKit"
import { TEAMS, teamByAbbr } from "../nfl"
import { cardColors } from "./matchupCards"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, LINE, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })
const fit = (text: string, maxW: number, big: number, min = 28): number => Math.max(min, Math.min(big, Math.floor(maxW / (text.length * 0.5))))

function dims(size: ShareSize) {
	const { width: w, height: h } = SIZE_PIXELS[size]
	const tall = size === "tall"
	const padX = tall ? 66 : 56
	return { w, h, tall, padX, padTop: tall ? 64 : 32, padBottom: tall ? 54 : 24, innerW: w - padX * 2 }
}
type Dims = ReturnType<typeof dims>

function Shell({ d, glow, eyebrow, note, children }: { d: Dims; glow: string; eyebrow: string; note: string; children: ReactNode }) {
	return (
		<Frame glow={glow} w={d.w} h={d.h}>
			<div style={{ display: "flex", flexDirection: "column", width: d.w, height: d.h, padding: `${d.padTop}px ${d.padX}px ${d.padBottom}px` }}>
				<Eyebrow text={eyebrow} color={glow} />
				{children}
				<div style={{ display: "flex", flexDirection: d.tall ? "column" : "row", alignItems: d.tall ? "flex-start" : "center", justifyContent: "space-between", marginTop: "auto" }}>
					{d.tall ? <div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: 19, letterSpacing: 1, color: DIM, marginBottom: 14 }}>{note}</div> : null}
					<Brand />
					{d.tall ? null : <div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: 15, letterSpacing: 1, color: DIM }}>{note}</div>}
				</div>
			</div>
		</Frame>
	)
}

const colorOf = (abbr: string): string => (abbr === "LV" ? WHITE : accent(opponentColors(abbr).dark))

// ---- the slate --------------------------------------------------------------------------------------------

export type SlateSide = { abbr: string; nick: string; color: string; record: string }
export type SlateCardGame = {
	away: SlateSide
	home: SlateSide
	when: string
	market: string | null
	/** Pairings with the edge for the away team and the home team, out of eight. */
	edges: [number, number]
	/** Which team the position groups favor: 0 away, 1 home, null when they cancel out. */
	lead: 0 | 1 | null
	/** How far ahead the leader is, 0 to 1. */
	strength: number
	raiders: boolean
	headline: string | null
}
export type SlateCardSpec = { type: "slate"; size: ShareSize; season: number; week: number; through: number; games: SlateCardGame[]; more: number; n: number }

/** "Raiders pass rush (2nd) vs Patriots pass protection (25th)", from the leader's side. */
function vsLine(row: Parameters<typeof viewOf>[0], team: string, names: Record<string, string>): string {
	const v = viewOf(row, team)
	const other = row.attacker === team ? row.defender : row.attacker
	return `${names[team]} ${v.mine.name} (${ordinal(v.mine.rank)}) vs ${names[other]} ${v.theirs.name} (${ordinal(v.theirs.rank)})`
}

export function buildSlateSpec(data: UnitsData, size: ShareSize): SlateCardSpec | null {
	if (!data.slate?.games.length) return null
	const all = data.slate.games.flatMap((g) => {
		const ta = data.teams[g.away]
		const tb = data.teams[g.home]
		if (!ta || !tb) return []
		const rows = matchupRows(data, g.away, g.home)
		if (!rows.length) return []
		const names = { [g.away]: teamByAbbr(g.away).nick, [g.home]: teamByAbbr(g.home).nick }
		const edge = paperEdge(rows, g.away)
		const lead: 0 | 1 | null = Math.abs(edge) < 6 ? null : edge > 0 ? 0 : 1
		const [ca, cb] = cardColors(g.away, g.home)
		const side = (abbr: string, t: typeof ta, color: string): SlateSide => ({ abbr, nick: names[abbr], color, record: recText({ w: t.w, l: t.l, t: t.t }) })
		const top = lead === null ? null : topEdges(rows, lead === 0 ? g.away : g.home, 1)[0]
		return [
			{
				abs: Math.abs(edge),
				game: {
					away: side(g.away, ta, ca),
					home: side(g.home, tb, cb),
					when: kickoffText(g.day, g.time),
					market: g.spread === null ? null : g.spread === 0 ? "Pick 'em" : `${names[g.spread > 0 ? g.home : g.away]} −${Math.abs(g.spread)}`,
					edges: [tally(rows, g.away).edges, tally(rows, g.home).edges] as [number, number],
					lead,
					strength: Math.min(1, Math.abs(edge) / 40),
					raiders: g.away === "LV" || g.home === "LV",
					headline: top ? vsLine(top, lead === 0 ? g.away : g.home, names) : null,
				} satisfies SlateCardGame,
			},
		]
	})
	if (!all.length) return null
	// The Raiders' game first, then the games where the position groups are furthest apart.
	const ordered = [...all].sort((a, b) => Number(b.game.raiders) - Number(a.game.raiders) || b.abs - a.abs).map((x) => x.game)
	const max = size === "tall" ? 9 : 5
	return { type: "slate", size, season: data.season, week: data.slate.week, through: data.week, games: ordered.slice(0, max), more: Math.max(0, ordered.length - max), n: teamCount(data) }
}

function SlateRow({ g, d, rowH }: { g: SlateCardGame; d: Dims; rowH: number }) {
	const sideW = d.tall ? 200 : 292
	const midW = d.innerW - sideW * 2
	const barH = d.tall ? 16 : 12
	const half = Math.floor((midW - (d.tall ? 120 : 100)) / 2)
	const leadColor = g.lead === null ? SILVER : g.lead === 0 ? g.away.color : g.home.color
	const len = g.lead === null ? 6 : Math.max(10, Math.round(half * g.strength))
	const team = (s: SlateSide, left: boolean, won: boolean) => (
		<div style={{ display: "flex", flexDirection: "column", width: sideW, alignItems: left ? "flex-start" : "flex-end" }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: fit(s.nick, sideW - 10, d.tall ? 38 : 34, 24), lineHeight: 1, color: won || g.lead === null ? s.color : rgba(s.color, 0.62), ...caps }}>{s.nick}</div>
			<div style={label({ fontSize: d.tall ? 16 : 12, letterSpacing: 2, lineHeight: 1, marginTop: 6 })}>{s.record}</div>
		</div>
	)
	const num = (n: number, color: string, left: boolean) => (
		<div style={{ display: "flex", width: d.tall ? 60 : 50, justifyContent: left ? "flex-end" : "flex-start", fontFamily: "Oswald", fontWeight: 700, fontSize: d.tall ? 28 : 22, lineHeight: 1, color }}>{n}</div>
	)
	return (
		<div style={{ display: "flex", alignItems: "center", height: rowH, width: d.innerW, borderTop: `2px solid ${g.raiders ? "#555a5f" : LINE}`, backgroundColor: g.raiders ? "rgba(255,255,255,0.045)" : "transparent" }}>
			{team(g.away, true, g.lead === 0)}
			<div style={{ display: "flex", flexDirection: "column", width: midW, alignItems: "center" }}>
				<div style={label({ fontSize: d.tall ? 15 : 12, letterSpacing: 1.5, lineHeight: 1, color: BRIGHT })}>{clip([g.when, g.market].filter(Boolean).join(" · "), 64)}</div>
				<div style={{ display: "flex", alignItems: "center", marginTop: d.tall ? 8 : 4 }}>
					{num(g.edges[0], g.away.color, true)}
					<div style={{ display: "flex", position: "relative", width: half * 2, height: barH, backgroundColor: LINE, borderRadius: barH }}>
						<div
							style={{
								display: "flex",
								position: "absolute",
								top: 0,
								height: barH,
								width: len,
								borderRadius: barH,
								left: g.lead === 1 || g.lead === null ? half : half - len,
								backgroundImage: `linear-gradient(${g.lead === 0 ? 270 : 90}deg, ${leadColor} 0%, ${rgba(leadColor, 0.45)} 100%)`,
							}}
						/>
						<div style={{ display: "flex", position: "absolute", left: half - 1, top: -4, width: 3, height: barH + 8, backgroundColor: "#8a9096" }} />
					</div>
					{num(g.edges[1], g.home.color, false)}
				</div>
				{g.headline ? <div style={{ display: "flex", marginTop: d.tall ? 8 : 4, fontFamily: "Oswald", fontWeight: 500, fontSize: d.tall ? 17 : 13, lineHeight: 1, color: DIM }}>{clip(g.headline, 74)}</div> : <div style={{ display: "flex", marginTop: d.tall ? 8 : 4, fontFamily: "Oswald", fontWeight: 500, fontSize: d.tall ? 17 : 13, lineHeight: 1, color: DIM }}>A toss-up on paper</div>}
			</div>
			{team(g.home, false, g.lead === 1)}
		</div>
	)
}

export function renderSlateCard(spec: SlateCardSpec): ReactElement {
	const d = dims(spec.size)
	const rowH = d.tall ? 98 : 62
	const first = spec.games[0]
	const glow = first?.raiders ? first.away.abbr === "LV" ? first.home.color : first.away.color : SILVER
	return (
		<Shell d={d} glow={glow} eyebrow={`Week ${spec.week} · the slate on paper`} note="Bar: whose position groups lead · numbers: pairings with the edge, of 8 · Data: nflverse, CC BY 4.0">
			<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: d.innerW, marginTop: d.tall ? 22 : 10 }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: d.tall ? 96 : 54, lineHeight: 1, color: WHITE, ...caps }}>{`Week ${spec.week} matchups`}</div>
				<div style={label({ fontSize: d.tall ? 20 : 15, letterSpacing: 3, paddingBottom: d.tall ? 12 : 6 })}>Away · Home</div>
			</div>
			<div style={{ display: "flex", flexDirection: "column", marginTop: d.tall ? 22 : 10, width: d.innerW }}>
				{spec.games.map((g) => (
					<SlateRow key={`${g.away.abbr}-${g.home.abbr}`} g={g} d={d} rowH={rowH} />
				))}
			</div>
			{spec.more ? <div style={label({ fontSize: d.tall ? 18 : 13, letterSpacing: 3, marginTop: 8, color: SILVER })}>{`+${spec.more} more games, biggest mismatches shown first`}</div> : null}
		</Shell>
	)
}

// ---- the board --------------------------------------------------------------------------------------------

export const BOARD_LABEL: Record<BoardSort, string> = {
	composite: "overall grade",
	off: "offense, per play",
	def: "defense, per play",
	qb: GROUPS.qb.label.toLowerCase(),
	ol: GROUPS.ol.label.toLowerCase(),
	rec: GROUPS.rec.label.toLowerCase(),
	run: GROUPS.run.label.toLowerCase(),
	rush: GROUPS.rush.label.toLowerCase(),
	rund: GROUPS.rund.label.toLowerCase(),
	cov: GROUPS.cov.label.toLowerCase(),
}

const COLUMN: Array<{ key: BoardSort; head: string }> = [
	{ key: "composite", head: "All" },
	{ key: "off", head: "Off" },
	{ key: "def", head: "Def" },
	{ key: "qb", head: "QB" },
	{ key: "ol", head: "OL" },
	{ key: "rec", head: "REC" },
	{ key: "run", head: "RUN" },
	{ key: "rush", head: "RSH" },
	{ key: "rund", head: "RDF" },
	{ key: "cov", head: "COV" },
]

export type BoardCardRow = { pos: number; abbr: string; nick: string; color: string; record: string; focus: boolean; ranks: Array<number | null> }
export type BoardCardSpec = {
	type: "board"
	size: ShareSize
	season: number
	through: number
	n: number
	sort: BoardSort
	show: string | null
	focus: string | null
	rows: BoardCardRow[]
	/** Index in `rows` before which the list skips ahead (the focus team is further down), or null. */
	skipAt: number | null
	/** Teams in the view, before the cut. */
	total: number
}

export function buildBoardSpec(data: UnitsData, view: BoardView, size: ShareSize): BoardCardSpec | null {
	const all = boardRows(data)
	if (!all.length) return null
	const info = new Map(TEAMS.map((t) => [t.abbr, t]))
	const rankOf = (r: (typeof all)[number], key: BoardSort): number => (key === "composite" ? r.compositeRank : key === "off" ? (r.off ?? 99) : key === "def" ? (r.def ?? 99) : r.groups[key as GroupKey])
	const shown = all
		.filter((r) => {
			const t = info.get(r.abbr)
			return !!t && (!view.show || t.conference === view.show || t.division === view.show)
		})
		.sort((a, b) => rankOf(a, view.sort) - rankOf(b, view.sort) || a.abbr.localeCompare(b.abbr))
	if (!shown.length) return null
	const focus = view.team && shown.some((r) => r.abbr === view.team) ? view.team : shown.some((r) => r.abbr === "LV") ? "LV" : null
	const max = size === "tall" ? 16 : 7
	const row = (r: (typeof all)[number], i: number): BoardCardRow => ({
		pos: i + 1,
		abbr: r.abbr,
		nick: teamByAbbr(r.abbr).nick,
		color: colorOf(r.abbr),
		record: r.record,
		focus: r.abbr === focus,
		ranks: [r.compositeRank, r.off, r.def, ...GROUP_ORDER.map((g) => r.groups[g])],
	})
	let rows: BoardCardRow[]
	let skipAt: number | null = null
	const at = focus ? shown.findIndex((r) => r.abbr === focus) : -1
	if (at < max) {
		rows = shown.slice(0, max).map(row)
	} else {
		rows = [...shown.slice(0, max - 1).map(row), row(shown[at], at)]
		skipAt = max - 1
	}
	return { type: "board", size, season: data.season, through: data.week, n: teamCount(data), sort: view.sort, show: view.show, focus, rows, skipAt, total: shown.length }
}

/** A cell's background: light for a top rank, rose for a bottom one, nothing in the middle. */
function cellBg(rank: number | null, n: number): string {
	const h = heat(rank ?? undefined, n)
	if (h === null) return "transparent"
	const strength = Math.abs(h - 0.5) * 2
	if (strength < 0.18) return "transparent"
	return h > 0.5 ? `rgba(230,231,233,${(strength * 0.34).toFixed(3)})` : `rgba(251,113,133,${(strength * 0.4).toFixed(3)})`
}

export function renderBoardCard(spec: BoardCardSpec): ReactElement {
	const d = dims(spec.size)
	const focusRow = spec.rows.find((r) => r.focus)
	const glow = focusRow ? focusRow.color : SILVER
	const posW = d.tall ? 49 : 39
	const teamW = d.tall ? 236 : 236
	const recW = d.tall ? 96 : 92
	const colW = Math.floor((d.innerW - posW - teamW - recW) / COLUMN.length)
	const rowH = d.tall ? Math.max(54, Math.min(80, Math.floor(860 / spec.rows.length))) : Math.max(36, Math.min(52, Math.floor(300 / spec.rows.length)))
	const sortIdx = COLUMN.findIndex((c) => c.key === spec.sort)
	const title = spec.show ? `How the ${spec.show} stacks up` : "How the league stacks up"
	const sub = `${spec.total} teams, ranked by ${BOARD_LABEL[spec.sort]}`
	const cell = (v: number | null, w: number, key: string, bold: boolean) => (
		<div key={key} style={{ display: "flex", width: w - 4, height: rowH - 8, marginRight: 4, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: cellBg(v, spec.n) }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: bold ? 700 : 600, fontSize: d.tall ? 25 : 18, color: WHITE }}>{v === null ? "–" : v}</div>
		</div>
	)
	return (
		<Shell d={d} glow={glow} eyebrow={`${spec.season} season · through Week ${spec.through}`} note={`League ranks out of ${spec.n}, 1 is best · light is top of the league, rose is bottom · Data: nflverse, CC BY 4.0`}>
			<div style={{ display: "flex", flexDirection: "column", marginTop: d.tall ? 22 : 10 }}>
				<div style={{ display: "flex", fontFamily: "Anton", fontSize: fit(title, d.innerW, d.tall ? 92 : 52, 36), lineHeight: 1, color: WHITE, ...caps }}>{title}</div>
				<div style={label({ fontSize: d.tall ? 21 : 15, letterSpacing: 3, marginTop: 6, color: BRIGHT })}>{sub}</div>
			</div>
			<div style={{ display: "flex", alignItems: "flex-end", width: d.innerW, marginTop: d.tall ? 22 : 8, height: d.tall ? 40 : 26 }}>
				<div style={{ display: "flex", width: posW }} />
				<div style={label({ width: teamW, fontSize: d.tall ? 17 : 12, letterSpacing: 3 })}>Team</div>
				<div style={label({ width: recW, fontSize: d.tall ? 17 : 12, letterSpacing: 3 })}>Record</div>
				{COLUMN.map((c, i) => (
					<div key={c.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: colW }}>
						<div style={label({ fontSize: d.tall ? 17 : 12, letterSpacing: 2, color: i === sortIdx ? WHITE : DIM })}>{c.head}</div>
						<div style={{ display: "flex", width: d.tall ? 28 : 20, height: 3, marginTop: 3, backgroundColor: i === sortIdx ? glow : "transparent" }} />
					</div>
				))}
			</div>
			<div style={{ display: "flex", flexDirection: "column", width: d.innerW, marginTop: 4 }}>
				{spec.rows.map((r, i) => (
					<div key={r.abbr} style={{ display: "flex", flexDirection: "column" }}>
						{spec.skipAt === i ? <div style={label({ fontSize: d.tall ? 22 : 14, letterSpacing: 8, height: d.tall ? 26 : 14, color: DIM, justifyContent: "center", width: d.innerW })}>···</div> : null}
						<div style={{ display: "flex", alignItems: "center", height: rowH, width: d.innerW, borderTop: `2px solid ${LINE}`, backgroundColor: r.focus ? rgba(r.color, 0.16) : "transparent", borderLeft: `5px solid ${r.focus ? r.color : "transparent"}` }}>
							<div style={{ display: "flex", width: posW, justifyContent: "center", fontFamily: "Oswald", fontWeight: 600, fontSize: d.tall ? 22 : 16, color: DIM }}>{r.pos}</div>
							<div style={{ display: "flex", alignItems: "center", width: teamW }}>
								<div style={{ display: "flex", width: d.tall ? 14 : 10, height: d.tall ? 14 : 10, borderRadius: 14, backgroundColor: r.color, marginRight: 12 }} />
								<div style={{ display: "flex", fontFamily: "Anton", fontSize: d.tall ? 31 : 22, lineHeight: 1, color: r.focus ? WHITE : BRIGHT, ...caps }}>{r.nick}</div>
							</div>
							<div style={{ display: "flex", width: recW, fontFamily: "Oswald", fontWeight: 500, fontSize: d.tall ? 20 : 15, letterSpacing: 1, color: DIM }}>{r.record}</div>
							{r.ranks.map((v, j) => cell(v, colW, `${r.abbr}-${j}`, j === sortIdx))}
						</div>
					</div>
				))}
			</div>
		</Shell>
	)
}
