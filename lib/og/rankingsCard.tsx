// The share card for the power rankings page (1200x630): the top of the ladder with every team's move, the
// Raiders' own spot picked out wherever they sit, and a strip of all 32 teams with the Raiders lit up.
//
// buildRankingsSpec turns a week's board into a small plain spec (no network, so it is testable) and
// renderRankingsCard turns the spec into JSX. See lib/og/kit.tsx for the shared stage and the Satori notes.

import type { ReactElement } from "react"

import { teamInfo } from "../nfl"
import { type RankingsWeek, raidersRow } from "../rankings"
import { BG, BRIGHT, Brand, DIM, Eyebrow, Frame, HIT, LINE, MISS, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type RankingsCardRow = {
	rank: number
	abbr: string
	nick: string
	color: string
	/** Positive = up, null = no earlier week (or new to the list). */
	change: number | null
	raiders: boolean
}

export type RankingsCardSpec = {
	type: "rankings"
	season: number
	week: number
	/** The Raiders' rank this week, if they are on the list */
	raidersRank?: number | null
	/** Positive = up. null when there is no previous week */
	change?: number | null
	/** The week's headline from Studio, if there is one. */
	headline?: string | null
	/** The top of the ladder (five teams), then the Raiders' row when they are lower than that. */
	top?: RankingsCardRow[]
	/** Where the Raiders sit when they are not in `top`. */
	raiders?: RankingsCardRow | null
	/** Every ranked team in order, for the strip along the bottom. */
	ladder?: { abbr: string; color: string }[]
}

const TOP = 5

const rowOf = (r: RankingsWeek["rows"][number]): RankingsCardRow => {
	const t = teamInfo(r.team)
	return { rank: r.rank, abbr: t.abbr, nick: t.nick, color: t.color, change: r.change, raiders: t.abbr === "LV" }
}

/** The card's spec for one week's board. */
export function buildRankingsSpec(board: RankingsWeek, season: number): RankingsCardSpec {
	const lv = raidersRow(board.rows)
	const top = board.rows.slice(0, TOP).map(rowOf)
	return {
		type: "rankings",
		season,
		week: board.week,
		raidersRank: lv?.rank ?? null,
		change: lv?.change ?? null,
		headline: board.headline?.trim() || null,
		top,
		raiders: lv && lv.rank > TOP ? rowOf(lv) : null,
		ladder: board.rows.map((r) => ({ abbr: teamInfo(r.team).abbr, color: teamInfo(r.team).color })),
	}
}

// ---- drawing ---------------------------------------------------------------------------------

function Move({ change }: { change: number | null }) {
	const up = change !== null && change > 0
	const down = change !== null && change < 0
	const text = change === null ? "" : change === 0 ? "—" : up ? `+${change}` : `-${Math.abs(change)}`
	return (
		<div style={{ display: "flex", justifyContent: "flex-end", width: 70, fontFamily: "Anton", fontSize: 30, color: up ? HIT : down ? MISS : DIM }}>{text}</div>
	)
}

function LadderRow({ row, big }: { row: RankingsCardRow; big?: boolean }) {
	const c = accent(row.color)
	const h = big ? 78 : 66
	return (
		<div style={{ display: "flex", alignItems: "center", height: h, paddingRight: 16, position: "relative", ...(row.raiders ? { backgroundImage: "linear-gradient(90deg, rgba(230,231,233,0.24) 0%, rgba(230,231,233,0.05) 100%)", borderTop: `1px solid ${BRIGHT}`, borderBottom: `1px solid ${BRIGHT}` } : {}) }}>
			<div style={{ display: "flex", width: 8, height: h - 14, marginLeft: 10, backgroundColor: c }} />
			<div style={{ display: "flex", width: 76, justifyContent: "center", fontFamily: "Anton", fontSize: big ? 56 : 48, color: row.rank === 1 ? "#f2c14e" : row.raiders ? WHITE : BRIGHT }}>{String(row.rank)}</div>
			<div style={{ display: "flex", width: 112, fontFamily: "Anton", fontSize: big ? 44 : 38, letterSpacing: 1, color: WHITE }}>{clip(row.abbr, 4)}</div>
			<div style={{ display: "flex", flex: 1, fontFamily: "Oswald", fontWeight: 600, fontSize: 23, letterSpacing: 4, color: row.raiders ? WHITE : DIM, ...caps }}>{clip(row.nick, 12)}</div>
			<Move change={row.change} />
		</div>
	)
}

/** All the ranked teams as ticks, in order, with the Raiders' tick tall and lit. */
function Strip({ ladder }: { ladder: { abbr: string; color: string }[] }) {
	return (
		<div style={{ display: "flex", alignItems: "flex-end", height: 34 }}>
			{ladder.map((t, i) => {
				const lv = t.abbr === "LV"
				return <div key={`${t.abbr}-${i}`} style={{ display: "flex", width: lv ? 14 : 9, height: lv ? 34 : 18, marginRight: 4, backgroundColor: lv ? WHITE : rgba(accent(t.color), 0.62) }} />
			})}
		</div>
	)
}

export function RankingsCard({ spec }: { spec: RankingsCardSpec }) {
	const top = spec.top ?? []
	const rows = top.length > 0
	const lead = rows ? accent(top[0].color) : SILVER
	const rr = spec.raidersRank ?? null
	const ch = spec.change ?? null
	const move = ch === null ? null : ch === 0 ? "No change" : ch > 0 ? `Up ${ch}` : `Down ${Math.abs(ch)}`
	const headline = spec.headline ? clip(spec.headline, 78) : null
	return (
		<Frame glow={lead}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "58px 10px 50px 72px" }}>
				<Eyebrow text={`${spec.season} season  ·  All 32 teams`} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 112, lineHeight: 0.98, color: WHITE, ...caps }}>Power</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 112, lineHeight: 0.98, color: SILVER, textShadow: "0 0 40px rgba(207,211,214,0.35)", ...caps }}>Rankings</div>
					<div style={{ display: "flex", alignItems: "center", marginTop: 20 }}>
						<div style={{ display: "flex", padding: "8px 22px", backgroundImage: "linear-gradient(180deg, #f4f5f6 0%, #b9bfc4 100%)", color: BG, fontFamily: "Anton", fontSize: 34, letterSpacing: 4, boxShadow: "0 0 30px rgba(207,211,214,0.35)", ...caps }}>{`Week ${spec.week}`}</div>
						{rr ? (
							<div style={{ display: "flex", alignItems: "center", marginLeft: 22, fontFamily: "Oswald", fontWeight: 600, fontSize: 26, letterSpacing: 3, color: BRIGHT, ...caps }}>
								{`Raiders No. ${rr}`}
								{move ? <div style={{ display: "flex", marginLeft: 14, color: ch !== null && ch > 0 ? HIT : ch !== null && ch < 0 ? MISS : DIM }}>{move}</div> : <div style={{ display: "flex" }} />}
							</div>
						) : (
							<div style={{ display: "flex" }} />
						)}
					</div>
					{headline ? <div style={{ display: "flex", marginTop: 18, width: 520, fontFamily: "Oswald", fontWeight: 500, fontSize: 24, lineHeight: 1.25, color: DIM }}>{headline}</div> : <div style={{ display: "flex" }} />}
				</div>
				<Brand />
			</div>

			<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "44px 64px 44px 24px" }}>
				<div style={{ display: "flex", flexDirection: "column", backgroundColor: "rgba(15,16,18,0.92)", border: `2px solid ${LINE}`, borderRadius: 20, padding: "20px 14px 18px 14px", boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 60px ${rgba(lead, 0.16)}` }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 14px 12px 14px", borderBottom: `1px solid ${LINE}` }}>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 20, letterSpacing: 5, color: SILVER, ...caps }}>The ladder</div>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 18, letterSpacing: 4, color: DIM, ...caps }}>vs last week</div>
					</div>
					{rows ? (
						<div style={{ display: "flex", flexDirection: "column", paddingTop: 6 }}>
							{top.map((r) => <LadderRow key={r.abbr} row={r} />)}
							{spec.raiders ? (
								<div style={{ display: "flex", flexDirection: "column" }}>
									<div style={{ display: "flex", justifyContent: "center", height: 22, fontFamily: "Anton", fontSize: 24, letterSpacing: 8, color: LINE }}>· · ·</div>
									<LadderRow row={spec.raiders} big />
								</div>
							) : (
								<div style={{ display: "flex" }} />
							)}
						</div>
					) : (
						<div style={{ display: "flex", justifyContent: "center", padding: "60px 0", fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 3, color: DIM, ...caps }}>New rankings every week</div>
					)}
					{spec.ladder && spec.ladder.length > 0 ? (
						<div style={{ display: "flex", flexDirection: "column", padding: "14px 14px 0 14px", marginTop: 8, borderTop: `1px solid ${LINE}` }}>
							<Strip ladder={spec.ladder} />
						</div>
					) : (
						<div style={{ display: "flex" }} />
					)}
				</div>
			</div>
		</Frame>
	)
}

export function renderRankingsCard(spec: RankingsCardSpec): ReactElement {
	return <RankingsCard spec={spec} />
}
