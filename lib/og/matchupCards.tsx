// The share card for a position-group matchup (/lab/matchup/lv-vs-ne): both teams' units against each other, eight
// pairings in all, each drawn as a circle (the offense) and a diamond (the defense) on a line from the weakest unit
// in the league to the best.
//
//   wide  1200x630   the link preview (X, Facebook, iMessage, Slack, Discord)
//   tall  1080x1350  the picture itself, 4:5, for Instagram, X in the feed and phone screens
//
// buildMatchupSpec turns the tables into a small plain spec (no network, so it can be tested from fixed data) and
// renderMatchupCard turns the spec into JSX. See lib/og/kit.tsx for the Satori notes: inline styles only, every
// element with more than one child is display:flex, and no text inside an <svg>.

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import { type UnitsData, headline, matchupRows, ordinal, paperEdge, tally } from "../lab/unitsKit"
import { teamByAbbr } from "../nfl"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, LINE, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type MatchupCardRow = {
	id: string
	label: string
	/** The team with the ball: 0 is the first team, 1 the second. */
	attacker: 0 | 1
	attackRank: number
	defendRank: number
	/** 0 to 100, further right is better. */
	attackScore: number
	defendScore: number
	/** Who wins the pairing: 0, 1, or null when it is even. */
	winner: 0 | 1 | null
	big: boolean
}

export type MatchupCardSpec = {
	type: "matchup"
	size: ShareSize
	teams: [{ abbr: string; nick: string; color: string; record: string }, { abbr: string; nick: string; color: string; record: string }]
	line: string
	week: number | null
	/** Pairings with the edge for each team. */
	edges: [number, number]
	/** Which team the position groups favor overall, or null when they cancel out. */
	lead: 0 | 1 | null
	rows: MatchupCardRow[]
	season: number
}

const colorOf = (abbr: string): string => (abbr === "LV" ? WHITE : accent(opponentColors(abbr).dark))

export function buildMatchupSpec(data: UnitsData, a: string, b: string, size: ShareSize): MatchupCardSpec | null {
	const ta = data.teams[a]
	const tb = data.teams[b]
	if (!ta || !tb || a === b) return null
	const rows = matchupRows(data, a, b)
	if (!rows.length) return null
	const names = { [a]: teamByAbbr(a).nick, [b]: teamByAbbr(b).nick }
	const edge = paperEdge(rows, a)
	const team = (abbr: string, t: typeof ta) => ({ abbr, nick: teamByAbbr(abbr).nick, color: colorOf(abbr), record: `${t.w}-${t.l}${t.t ? `-${t.t}` : ""}` })
	return {
		type: "matchup",
		size,
		teams: [team(a, ta), team(b, tb)],
		line: headline(rows, a, b, names),
		week: data.slate?.games.some((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a)) ? data.slate.week : null,
		edges: [tally(rows, a).edges, tally(rows, b).edges],
		lead: Math.abs(edge) < 6 ? null : edge > 0 ? 0 : 1,
		season: data.season,
		rows: rows.map((r) => ({
			id: r.pair.id,
			label: r.pair.label,
			attacker: r.attacker === a ? 0 : 1,
			attackRank: r.attack.rank,
			defendRank: r.defend.rank,
			attackScore: Math.round(r.attack.score * 10) / 10,
			defendScore: Math.round(r.defend.score * 10) / 10,
			winner: r.tier === "even" ? null : (r.edge > 0 ? r.attacker : r.defender) === a ? 0 : 1,
			big: r.tier === "big",
		})),
	}
}

export const matchupCardSize = (spec: Pick<MatchupCardSpec, "size">) => SIZE_PIXELS[spec.size]

// ---- drawing -----------------------------------------------------------------------------------------------

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

/** The Anton size (up to `big`) at which `text` fits `maxW` on one line. */
const fit = (text: string, maxW: number, big: number): number => Math.max(34, Math.min(big, Math.floor(maxW / (text.length * 0.5))))

function Rail({ w, h, row, colors }: { w: number; h: number; row: MatchupCardRow; colors: [string, string] }) {
	const atkColor = colors[row.attacker]
	const defColor = colors[row.attacker === 0 ? 1 : 0]
	const pad = h * 0.6
	const x = (s: number) => pad + ((w - pad * 2) * Math.max(2, Math.min(98, s))) / 100
	const lo = Math.min(row.attackScore, row.defendScore)
	const hi = Math.max(row.attackScore, row.defendScore)
	const winColor = row.attackScore >= row.defendScore ? atkColor : defColor
	const r = h * 0.34
	const cy = h / 2
	const dx = x(row.defendScore)
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			<rect x={pad} y={cy - 3} width={w - pad * 2} height={6} rx={3} fill={LINE} />
			<rect x={x(lo)} y={cy - 3} width={Math.max(0, x(hi) - x(lo))} height={6} rx={3} fill={rgba(winColor, 0.65)} />
			<polygon points={`${dx},${cy - r * 1.15} ${dx + r * 1.15},${cy} ${dx},${cy + r * 1.15} ${dx - r * 1.15},${cy}`} fill={defColor} stroke="#0a0a0b" strokeWidth={3} />
			<circle cx={x(row.attackScore)} cy={cy} r={r} fill={atkColor} stroke="#0a0a0b" strokeWidth={3} />
		</svg>
	)
}

function PairRow({ row, spec, w, tall }: { row: MatchupCardRow; spec: MatchupCardSpec; w: number; tall: boolean }) {
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

export function renderMatchupCard(spec: MatchupCardSpec): ReactElement {
	const { width: w, height: h } = SIZE_PIXELS[spec.size]
	const tall = spec.size === "tall"
	const padX = tall ? 66 : 56
	const padTop = tall ? 64 : 34
	const padBottom = tall ? 54 : 26
	const innerW = w - padX * 2
	const [A, B] = spec.teams
	const title = `${A.nick} vs ${B.nick}`
	const titleSize = fit(title, innerW, tall ? 124 : 88)
	const glow = spec.lead === null ? SILVER : spec.teams[spec.lead].color
	const colGap = 44
	const colW = tall ? innerW : Math.floor((innerW - colGap) / 2)
	const column = (team: 0 | 1) => (
		<div key={team} style={{ display: "flex", flexDirection: "column", width: colW }}>
			<div style={{ display: "flex", alignItems: "center", marginBottom: tall ? 12 : 6 }}>
				<div style={{ display: "flex", width: tall ? 16 : 13, height: tall ? 16 : 13, borderRadius: 20, backgroundColor: spec.teams[team].color, marginRight: 12 }} />
				<div style={label({ fontSize: tall ? 24 : 18, letterSpacing: 4, color: BRIGHT })}>{`${spec.teams[team].nick} attack`}</div>
			</div>
			{spec.rows
				.filter((r) => r.attacker === team)
				.map((r) => (
					<div key={r.id} style={{ display: "flex", marginBottom: tall ? 10 : 7 }}>
						<PairRow row={r} spec={spec} w={colW} tall={tall} />
					</div>
				))}
		</div>
	)
	const edgeBox = (team: 0 | 1) => (
		<div key={team} style={{ display: "flex", flexDirection: "column", alignItems: team === 0 ? "flex-start" : "flex-end" }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 84 : 50, lineHeight: 1, color: spec.teams[team].color }}>{spec.edges[team]}</div>
			<div style={label({ fontSize: tall ? 19 : 14, letterSpacing: 3 })}>{`${spec.teams[team].nick} edges`}</div>
		</div>
	)

	return (
		<Frame glow={glow} w={w} h={h}>
			<div style={{ display: "flex", flexDirection: "column", width: w, height: h, padding: `${padTop}px ${padX}px ${padBottom}px` }}>
				<Eyebrow text={`Matchup by position group${spec.week ? ` · Week ${spec.week}` : ""}`} color={glow} />
				<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: tall ? 20 : 8, width: innerW }}>
					{edgeBox(0)}
					<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: titleSize * (tall ? 0.78 : 0.56), lineHeight: 1.02, color: WHITE, ...caps }}>{title}</div>
						<div style={label({ fontSize: tall ? 22 : 16, letterSpacing: 3, marginTop: 4 })}>{`${A.record} · ${B.record}`}</div>
					</div>
					{edgeBox(1)}
				</div>
				<div style={{ display: "flex", marginTop: tall ? 18 : 4, fontFamily: "Oswald", fontWeight: 400, fontSize: tall ? 27 : 18, lineHeight: 1.3, color: BRIGHT }}>{clip(spec.line, tall ? 130 : 112)}</div>
				<div style={{ display: "flex", flexDirection: tall ? "column" : "row", justifyContent: "space-between", marginTop: tall ? 24 : 14, width: innerW }}>
					{column(0)}
					{column(1)}
				</div>
				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<Brand />
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: tall ? 19 : 15, letterSpacing: 1, color: DIM }}>{`Circle: offense · Diamond: defense · Data: nflverse, CC BY 4.0 · ${spec.season}`}</div>
				</div>
			</div>
		</Frame>
	)
}
