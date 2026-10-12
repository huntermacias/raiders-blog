// The player share card (1200x630): who he is, his overall grade against his position, the places he leads the league, and his five
// strongest numbers as bars against every player at his job.
//
//   /api/og?type=player&slug=brock-bowers[&pos=te]
//
// buildPlayerSpec turns the Lab's player data into a small plain spec (no network, so it can be tested from fixed data) and
// renderPlayerCard turns the spec into JSX. See lib/og/kit.tsx for the Satori notes: inline styles only, every element with more than
// one child is display:flex, and no text inside an <svg>.

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import { teamName } from "../lab/playerView"
import { type PlayerBio, type PlayerGroup, type PlayersData, GROUP_META, badgesFor, gradeWord, isEarly, ordinal, overall, overallRank, percentileBars, rowsFor, shownPct, statInfo, tierOf, TIER_WORD } from "../lab/playersKit"
import { SOURCES, sourceLine } from "./basis"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, LINE, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

export type PlayerCardBar = { label: string; value: string; pct: number; rank: string }
export type PlayerCardSpec = {
	type: "player"
	name: string
	team: string
	teamName: string
	/** "Tight end" */
	single: string
	/** "tight ends" */
	peers: string
	pos: string
	no: number | null
	grade: number | null
	gradeWord: string
	tier: string
	/** "3rd of 38 tight ends" */
	rank: string | null
	badges: string[]
	bars: PlayerCardBar[]
	/** True when every number rests on a small sample, so the card says so. */
	early: boolean
	season: number
	week: number
	games: number
	/** The team's colour on the dark card. */
	color: string
}

const W = 1200
const H = 630
const PAD = 56

/** The spec for a player's card, or null when the player is not in the data. `pos` picks the job for a two-way player. */
export function buildPlayerSpec(data: PlayersData, slug: string, bio: PlayerBio | undefined, pos?: string): PlayerCardSpec | null {
	const rows = rowsFor(data, slug)
	if (!rows.length) return null
	const p = (pos && rows.find((r) => r.group === (pos as PlayerGroup))) || rows[0]
	const meta = GROUP_META[p.group]
	const o = overall(p)
	const r = overallRank(data, p)
	const all = percentileBars(data, p).filter((b) => statInfo(p.group, b.k)?.counts !== false)
	// A stat that is still mostly luck is never shown as a strength, however it ranks.
	const real = all.filter((b) => b.signal !== "luck")
	const firm = real.filter((b) => b.sure !== "thin")
	// With fewer than three solid numbers, show what there is and say it is early rather than leave the panel empty.
	const early = firm.length < 3 || isEarly(data, p)
	const bars = (early ? real : firm).slice(0, 5)
	const color = p.team === "LV" ? WHITE : accent(opponentColors(p.team).dark)
	return {
		type: "player",
		name: p.name,
		team: p.team,
		teamName: teamName(p.team),
		single: meta.single,
		peers: meta.peers,
		pos: p.pos,
		no: bio?.no ?? null,
		grade: o === null ? null : Math.round(o),
		gradeWord: gradeWord(o),
		tier: r && !isEarly(data, p) ? TIER_WORD[tierOf(((r.of - r.rank) / Math.max(1, r.of - 1)) * 100)] : "",
		rank: r ? `${ordinal(r.rank)} of ${r.of} ${meta.peers}${isEarly(data, p) ? " so far" : ""}` : null,
		badges: badgesFor(data, p, 5, 3).map((b) => b.text),
		early,
		bars: bars.map((b) => ({ label: b.label, value: b.value, pct: shownPct(b.pct), rank: b.rank })),
		season: data.season,
		week: data.week,
		games: p.games,
		color,
	}
}

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })
const fit = (text: string, maxW: number, big: number, min = 52): number => Math.max(min, Math.min(big, Math.floor(maxW / (text.length * 0.52))))

export function renderPlayerCard(spec: PlayerCardSpec): ReactElement {
	const leftW = 590
	const rightW = W - PAD * 2 - leftW - 40
	const name = clip(spec.name, 26).toUpperCase()
	const barW = rightW - 40
	return (
		<Frame glow={spec.color} ghost={spec.no !== null ? String(spec.no) : undefined} w={W} h={H}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: `32px ${PAD}px 24px` }}>
				<Eyebrow text={`Player Lab · ${spec.single}`} color={spec.color} />
				<div style={{ display: "flex", marginTop: 20, width: W - PAD * 2 }}>
					<div style={{ display: "flex", flexDirection: "column", width: leftW }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: fit(name, leftW, 92), lineHeight: 1, color: WHITE, ...caps }}>{name}</div>
						<div style={label({ fontSize: 22, letterSpacing: 3, marginTop: 12, color: BRIGHT })}>{`${spec.teamName} · ${spec.pos}${spec.no !== null ? ` · #${spec.no}` : ""}`}</div>

						<div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 150, height: 150, borderRadius: 150, border: `10px solid ${spec.color}`, backgroundColor: "rgba(255,255,255,0.04)" }}>
								<div style={{ display: "flex", fontFamily: "Anton", fontSize: 76, lineHeight: 1, color: WHITE }}>{spec.grade === null ? "–" : String(spec.grade)}</div>
							</div>
							<div style={{ display: "flex", flexDirection: "column", marginLeft: 26, width: leftW - 176 }}>
								<div style={label({ fontSize: 15, letterSpacing: 3 })}>Overall grade, 20 to 80</div>
								<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 38, lineHeight: 1.05, color: WHITE, marginTop: 6, ...caps }}>{spec.grade === null ? "Not enough yet" : spec.gradeWord}</div>
								{spec.rank ? <div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 22, color: SILVER, marginTop: 6 }}>{spec.rank}</div> : null}
							</div>
						</div>

						{spec.badges.length ? (
							<div style={{ display: "flex", flexWrap: "wrap", marginTop: 24, width: leftW }}>
								{spec.badges.map((b) => (
									<div key={b} style={{ display: "flex", alignItems: "center", marginRight: 10, marginBottom: 10, padding: "8px 16px", border: `2px solid ${rgba(spec.color, 0.8)}`, backgroundColor: rgba(spec.color, 0.12), fontFamily: "Oswald", fontWeight: 600, fontSize: 21, letterSpacing: 1, color: WHITE }}>
										<div style={{ display: "flex", width: 10, height: 10, marginRight: 12, backgroundColor: spec.color, transform: "rotate(45deg)" }} />
										{clip(b, 44)}
									</div>
								))}
							</div>
						) : null}
					</div>

					<div style={{ display: "flex", flexDirection: "column", width: rightW, marginLeft: 40, alignSelf: "flex-start", padding: "18px 20px 10px", backgroundColor: "rgba(17,18,20,0.92)", border: `2px solid ${LINE}` }}>
						<div style={label({ fontSize: 15, letterSpacing: 3 })}>{spec.early ? `Early read vs. ${clip(spec.peers, 22)}` : `Strongest numbers vs. ${clip(spec.peers, 22)}`}</div>
						{spec.bars.length ? (
							spec.bars.map((b) => (
								<div key={b.label} style={{ display: "flex", flexDirection: "column", marginTop: 11 }}>
									<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", width: barW }}>
										<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 19, letterSpacing: 0.5, color: BRIGHT }}>{clip(b.label, 36)}</div>
										<div style={{ display: "flex", fontFamily: "Anton", fontSize: 26, lineHeight: 1, color: WHITE }}>{b.value}</div>
									</div>
									<div style={{ display: "flex", position: "relative", width: barW, height: 12, marginTop: 6, backgroundColor: LINE, borderRadius: 12 }}>
										<div style={{ display: "flex", width: Math.max(14, Math.round((barW * b.pct) / 100)), height: 12, borderRadius: 12, backgroundColor: spec.color }} />
										<div style={{ display: "flex", position: "absolute", left: Math.round(barW / 2) - 1, top: -3, width: 3, height: 18, backgroundColor: "#8a9096" }} />
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", width: barW, marginTop: 3, fontFamily: "Oswald", fontWeight: 400, fontSize: 15, color: DIM }}>
										<div style={{ display: "flex" }}>{b.rank}</div>
										<div style={{ display: "flex" }}>{`${ordinal(b.pct)} percentile`}</div>
									</div>
								</div>
							))
						) : (
							<div style={{ display: "flex", marginTop: 16, fontFamily: "Oswald", fontWeight: 400, fontSize: 22, color: SILVER }}>Not enough plays yet for a fair comparison.</div>
						)}
					</div>
				</div>

				<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
					<Brand />
					<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontFamily: "Oswald", fontWeight: 400, fontSize: 15, lineHeight: 1.25, letterSpacing: 1, color: DIM }}>
						<div style={{ display: "flex" }}>{`Middle tick = the typical ${spec.single.toLowerCase()} · ${spec.games} ${spec.games === 1 ? "game" : "games"} behind the grades${spec.early ? " · early read" : ""}`}</div>
						<div style={{ display: "flex" }}>{sourceLine(SOURCES.grades, spec.season, spec.week)}</div>
					</div>
				</div>
			</div>
		</Frame>
	)
}
