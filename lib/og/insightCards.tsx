// Share cards for the Lab's insight features (1200x630):
//
//   the play card    (`type: "play"`):   the play that moved a game, or the season, the most, with the win
//                                        probability before and after it.
//   the scouting     (`type: "scout"`):  the Raiders against an opponent, unit by unit, and what to watch.
//
// The "will it last?" cards live in lib/og/lastCards.tsx.
//
// Each build*Spec turns real data into a small plain spec (no network, so it can be tested and looked at from
// fixed data), and each render*Card turns a spec into JSX. See lib/og/kit.tsx for the shared stage and the
// Satori notes: inline styles only, every element with more than one child is display:flex, and no text
// inside an <svg>.

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import { ordinal, sampleNote, teamScout, watchList, type Watch } from "../lab/scouting"
import { type TopPlay, playWord, swingText, whenText } from "../lab/topPlays"
import type { LabGame } from "../lab/types"
import { BRIGHT, Brand, DIM, Eyebrow, Frame, H, HIT, LINE, MISS, PANEL, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"

const GOLD = "#f2c14e"

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })

// ---- the play card ------------------------------------------------------------------------------------------

export type PlayCardSpec = {
	type: "play"
	scope: "game" | "season"
	rank: number
	week: number
	oppName: string
	oppAbbr: string
	oppColor: string
	home: boolean
	result: "W" | "L" | "T"
	score: [number, number]
	word: string
	when: string
	text: string
	/** "+29" or "−23": whole points of Raiders win probability. */
	points: string
	good: boolean
	byRaiders: boolean
	before: number | null
	after: number | null
}

export function buildPlaySpec(game: LabGame, play: TopPlay, scope: "game" | "season"): PlayCardSpec {
	return {
		type: "play",
		scope,
		rank: play.rank,
		week: game.week,
		oppName: game.oppName,
		oppAbbr: game.opp,
		oppColor: opponentColors(game.opp).dark,
		home: game.home,
		result: game.result,
		score: game.score,
		word: playWord(play),
		when: whenText(play),
		text: play.text,
		points: swingText(play).replace(" pts", ""),
		good: play.swing >= 0,
		byRaiders: play.byRaiders,
		before: play.before,
		after: play.after,
	}
}

function PlayBar({ before, after, good }: { before: number; after: number; good: boolean }) {
	const W = 340
	const color = good ? HIT : MISS
	const px = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * W)
	return (
		<div style={{ display: "flex", flexDirection: "column", width: W + 4 }}>
			<div style={{ display: "flex", position: "relative", width: W, height: 22, backgroundColor: "#24272b" }}>
				<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: px(after), height: 22, backgroundColor: rgba(color, 0.9) }} />
				<div style={{ display: "flex", position: "absolute", left: px(before) - 2, top: -6, width: 4, height: 34, backgroundColor: WHITE }} />
				<div style={{ display: "flex", position: "absolute", left: Math.round(W / 2) - 1, top: 22, width: 2, height: 8, backgroundColor: DIM }} />
			</div>
			<div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={label({ fontSize: 16, letterSpacing: 3 })}>Before</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 44, color: WHITE, lineHeight: 1.1 }}>{`${Math.round(before * 100)}%`}</div>
				</div>
				<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
					<div style={label({ fontSize: 16, letterSpacing: 3 })}>After</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 44, color, lineHeight: 1.1 }}>{`${Math.round(after * 100)}%`}</div>
				</div>
			</div>
		</div>
	)
}

/** The play-by-play line without the tackler and blocker names, ending on a whole sentence where it can. */
export function playBlurb(raw: string, max = 150): string {
	const flat = raw
		.replace(/\s*\([^)]*\)/g, "")
		.replace(/\s*\[[^\]]*\]/g, "")
		.replace(/\s+/g, " ")
		.trim()
	if (flat.length <= max) return flat
	const sentences = flat.split(/(?<=\.)\s+/)
	let out = ""
	for (const part of sentences) {
		const next = out ? `${out} ${part}` : part
		if (next.length > max) break
		out = next
	}
	return out || clip(flat, max)
}

export function renderPlayCard(spec: PlayCardSpec): ReactElement {
	const glow = accent(spec.oppColor)
	const eyebrow = spec.scope === "season" ? `Play #${spec.rank} of the season · Week ${spec.week}` : spec.rank === 1 ? `Play of the game · Week ${spec.week}` : `Play #${spec.rank} · Week ${spec.week}`
	const numColor = spec.good ? HIT : MISS
	const text = playBlurb(spec.text)
	const matchLine = `${spec.home ? "vs" : "at"} ${spec.oppName}`
	const end = `${spec.result === "W" ? "W" : spec.result === "L" ? "L" : "T"} ${spec.score[0]}-${spec.score[1]}`
	const wordSize = spec.word.length <= 11 ? 132 : spec.word.length <= 16 ? 104 : 80
	return (
		<Frame glow={glow}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 700, height: H, padding: "58px 20px 50px 64px" }}>
				<Eyebrow text={eyebrow} color={numColor} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: wordSize, lineHeight: 1.02, color: WHITE, ...caps }}>{spec.word}</div>
					<div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 36, letterSpacing: 3, color: SILVER, ...caps }}>{spec.when || `Week ${spec.week}`}</div>
						<div style={{ display: "flex", marginLeft: 22, fontFamily: "Oswald", fontWeight: 500, fontSize: 26, letterSpacing: 3, color: DIM, ...caps }}>{`${matchLine} · ${end}`}</div>
					</div>
					<div style={{ display: "flex", marginTop: 22, fontFamily: "Oswald", fontWeight: 400, fontSize: 27, lineHeight: 1.3, color: BRIGHT, maxWidth: 600 }}>{text}</div>
				</div>
				<Brand />
			</div>
			<div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, paddingRight: 56 }}>
				<div style={{ display: "flex", flexDirection: "column", width: 420, padding: "34px 36px 34px 36px", backgroundColor: PANEL, border: `2px solid ${LINE}` }}>
					<div style={label({ fontSize: 19 })}>{spec.good ? "Win probability added" : "Win probability lost"}</div>
					<div style={{ display: "flex", alignItems: "baseline", marginTop: 6 }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 176, lineHeight: 1.02, color: numColor }}>{spec.points}</div>
						<div style={{ display: "flex", marginLeft: 12, fontFamily: "Anton", fontSize: 44, color: SILVER, ...caps }}>pts</div>
					</div>
					<div style={{ display: "flex", marginTop: 4, marginBottom: 26, fontFamily: "Oswald", fontWeight: 500, fontSize: 22, letterSpacing: 2, color: BRIGHT }}>
						{spec.byRaiders ? (spec.good ? "For the Raiders, on offense" : "Against the Raiders, on offense") : spec.good ? "For the Raiders, on defense" : `For the ${spec.oppName}`}
					</div>
					{spec.before !== null && spec.after !== null ? <PlayBar before={spec.before} after={spec.after} good={spec.good} /> : null}
				</div>
			</div>
		</Frame>
	)
}

export type ScoutRow = { unit: string; ours: number; theirs: number; ourLabel: string; theirLabel: string; edge: number }

export type ScoutCardSpec = {
	type: "scout"
	week: number | null
	oppName: string
	oppNick: string
	oppAbbr: string
	oppColor: string
	games: number
	rows: ScoutRow[]
	watch: Watch[]
	note: string
}

/** The Raiders against an opponent by points added per play, offense and defense. */
export function buildScoutSpec(opp: { abbr: string; name: string; nick: string }, week: number | null): ScoutCardSpec | null {
	const lv = teamScout("LV")
	const them = teamScout(opp.abbr)
	if (!lv || !them) return null
	const o = lv.off.epa
	const d = lv.def.epa
	const to = them.off.epa
	const td = them.def.epa
	const rows: ScoutRow[] = []
	if (o && td) rows.push({ unit: "Raiders offense", ours: o.rank, theirs: td.rank, ourLabel: "Raiders offense", theirLabel: `${opp.nick} defense`, edge: td.rank - o.rank })
	if (to && d) rows.push({ unit: "Raiders defense", ours: d.rank, theirs: to.rank, ourLabel: "Raiders defense", theirLabel: `${opp.nick} offense`, edge: to.rank - d.rank })
	return {
		type: "scout",
		week,
		oppName: opp.name,
		oppNick: opp.nick,
		oppAbbr: opp.abbr,
		oppColor: opponentColors(opp.abbr).dark,
		games: Math.min(lv.g, them.g),
		rows,
		watch: watchList(opp.abbr, opp.nick).slice(0, 3),
		note: sampleNote(Math.min(lv.g, them.g)),
	}
}

export function renderScoutCard(spec: ScoutCardSpec): ReactElement {
	const glow = accent(spec.oppColor)
	const nick = spec.oppNick.toUpperCase()
	const titleSize = nick.length > 9 ? 88 : 104
	return (
		<Frame glow={glow}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, height: H, padding: "58px 20px 50px 64px" }}>
				<Eyebrow text={spec.week ? `Scouting report · Week ${spec.week}` : "Scouting report"} color={glow} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: titleSize, lineHeight: 1.0, color: WHITE, ...caps }}>Raiders</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: titleSize, lineHeight: 1.04, color: glow, ...caps }}>{`vs ${nick}`}</div>
					<div style={{ display: "flex", marginTop: 20, flexDirection: "column" }}>
						{spec.rows.map((r) => {
							const good = r.edge > 0
							return (
								<div key={r.unit} style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
									<div style={{ display: "flex", flexDirection: "column", width: 190 }}>
										<div style={label({ fontSize: 15, letterSpacing: 2 })}>{r.ourLabel}</div>
										<div style={{ display: "flex", fontFamily: "Anton", fontSize: 44, lineHeight: 1.1, color: WHITE }}>{ordinal(r.ours)}</div>
									</div>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 22, color: DIM, letterSpacing: 3, marginRight: 22 }}>VS</div>
									<div style={{ display: "flex", flexDirection: "column", width: 190 }}>
										<div style={label({ fontSize: 15, letterSpacing: 2 })}>{r.theirLabel}</div>
										<div style={{ display: "flex", fontFamily: "Anton", fontSize: 44, lineHeight: 1.1, color: SILVER }}>{ordinal(r.theirs)}</div>
									</div>
									<div style={{ display: "flex", padding: "5px 14px", border: `2px solid ${Math.abs(r.edge) < 4 ? SILVER : good ? HIT : MISS}`, color: Math.abs(r.edge) < 4 ? SILVER : good ? HIT : MISS, fontFamily: "Oswald", fontWeight: 700, fontSize: 18, letterSpacing: 3, ...caps }}>{Math.abs(r.edge) < 4 ? "Even" : good ? "Edge" : "Watch"}</div>
								</div>
							)
						})}
					</div>
				</div>
				<Brand />
			</div>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "0 56px 0 24px" }}>
				<div style={label({ fontSize: 19, marginBottom: 16 })}>What to watch</div>
				{spec.watch.length === 0 ? (
					<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: 28, lineHeight: 1.3, color: BRIGHT }}>No lopsided matchups yet. Both teams look close to average on paper.</div>
				) : (
					spec.watch.map((w, i) => (
						<div key={i} style={{ display: "flex", flexDirection: "column", marginBottom: 16, padding: "16px 22px", backgroundColor: PANEL, border: `2px solid ${LINE}`, borderLeft: `8px solid ${w.kind === "edge" ? HIT : MISS}` }}>
							<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 23, letterSpacing: 3, color: w.kind === "edge" ? HIT : MISS, ...caps }}>{clip(w.headline, 40)}</div>
							<div style={{ display: "flex", marginTop: 6, fontFamily: "Oswald", fontWeight: 400, fontSize: 21, lineHeight: 1.3, color: BRIGHT }}>{clip(w.detail, 100)}</div>
						</div>
					))
				)}
				<div style={{ display: "flex", marginTop: 2, fontFamily: "Oswald", fontWeight: 400, fontSize: 17, color: DIM }}>{`${spec.note} Ranks are of 32 teams, 1st is best.`}</div>
			</div>
		</Frame>
	)
}
