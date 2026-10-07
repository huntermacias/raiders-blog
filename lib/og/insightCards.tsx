// Share cards for the Lab's three insight features (1200x630):
//
//   the play card    (`type: "play"`):   the play that moved a game, or the season, the most, with the win
//                                        probability before and after it.
//   the fourth-down  (`type: "fourth"`): how the Raiders' fourth-down calls graded out, with the decisions
//                                        worth a look.
//   the scouting     (`type: "scout"`):  the Raiders against an opponent, unit by unit, and what to watch.
//   will it last     (`type: "last"`):   one of the Raiders' stats against every team that started the same way:
//                                        the dots in their first games and then in the rest of the season.
//
// Each build*Spec turns real data into a small plain spec (no network, so it can be tested and looked at from
// fixed data), and each render*Card turns a spec into JSX. See lib/og/kit.tsx for the shared stage and the
// Satori notes: inline styles only, every element with more than one child is display:flex, and no text
// inside an <svg>.

import type { ReactElement } from "react"

import { opponentColors } from "../lab/colors"
import { type Decision, type FourthGame, VERDICTS, boldest, choiceText, costliest, ptsText, spotText } from "../lab/fourthDown"
import type { Story } from "../lab/historyKit"
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

// ---- the fourth-down card -----------------------------------------------------------------------------------

export type FourthRow = { spot: string; choice: string; short: string; verdict: string; tone: "good" | "even" | "warn" | "bad" | "none"; line: string }

export type FourthCardSpec = {
	type: "fourth"
	scope: "game" | "season"
	week: number | null
	oppName: string | null
	oppColor: string
	/** Fourth downs graded the best call or a toss-up, out of those graded. */
	good: number
	graded: number
	total: number
	left: string | null
	rows: FourthRow[]
}

const toneColor = (t: FourthRow["tone"]): string => (t === "good" ? HIT : t === "even" ? SILVER : t === "warn" ? GOLD : t === "bad" ? MISS : DIM)

function rowOf(d: Decision): FourthRow {
	const v = d.verdict ? VERDICTS[d.verdict] : null
	const best = d.best && d.verdict && d.verdict !== "best" ? d.options[d.best] : null
	const chosen = d.options[d.chosen]
	const line = best && chosen ? `${ptsText(best.wp - chosen.wp)} better ${d.best === "go" ? "going for it" : d.best === "fg" ? "kicking" : "punting"}` : d.verdict === "best" ? "The best option" : "Not graded"
	return { spot: spotText(d), choice: choiceText(d.chosen, d.result), short: d.chosen === "go" ? "Went for it" : d.chosen === "fg" ? "Kicked a field goal" : "Punted", verdict: v ? v.short : "Not graded", tone: v ? v.tone : "none", line }
}

export function buildFourthSpec(game: FourthGame, labGame: Pick<LabGame, "oppName" | "opp">): FourthCardSpec {
	const worst = costliest(game, 4)
	const picked = worst.length ? worst : boldest(game, 4).length ? boldest(game, 4) : game.decisions.slice(0, 4)
	return {
		type: "fourth",
		scope: "game",
		week: game.week,
		oppName: labGame.oppName,
		oppColor: opponentColors(labGame.opp).dark,
		good: game.summary.bestOrClose,
		graded: game.summary.graded,
		total: game.summary.decisions,
		left: game.summary.leftOnTable > 0 ? ptsText(game.summary.leftOnTable) : null,
		rows: picked.map(rowOf),
	}
}

export function buildFourthSeasonSpec(games: FourthGame[]): FourthCardSpec {
	const all = games.flatMap((g) => g.decisions.map((d) => ({ d, week: g.week })))
	const worst = all
		.filter((x) => x.d.verdict === "questionable" || x.d.verdict === "costly")
		.sort((a, b) => (b.d.cost ?? 0) - (a.d.cost ?? 0))
		.slice(0, 4)
	const picked = worst.length ? worst : all.slice(0, 4)
	const left = games.reduce((n, g) => n + g.summary.leftOnTable, 0)
	return {
		type: "fourth",
		scope: "season",
		week: null,
		oppName: null,
		oppColor: SILVER,
		good: games.reduce((n, g) => n + g.summary.bestOrClose, 0),
		graded: games.reduce((n, g) => n + g.summary.graded, 0),
		total: games.reduce((n, g) => n + g.summary.decisions, 0),
		left: left > 0 ? ptsText(left) : null,
		rows: picked.map((x) => ({ ...rowOf(x.d), spot: `Wk ${x.week} · ${rowOf(x.d).spot}` })),
	}
}

export function renderFourthCard(spec: FourthCardSpec): ReactElement {
	const glow = accent(spec.oppColor)
	const eyebrow = spec.scope === "season" ? "Fourth downs · Season" : `Fourth downs · Week ${spec.week}`
	const ratio = spec.graded > 0 ? spec.good / spec.graded : 0
	const color = ratio >= 0.75 ? HIT : ratio >= 0.5 ? GOLD : MISS
	const rows = spec.rows.slice(0, 4)
	const rowH = rows.length > 3 ? 104 : 120
	return (
		<Frame glow={glow}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 540, height: H, padding: "58px 20px 50px 64px" }}>
				<Eyebrow text={eyebrow} color={color} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", alignItems: "baseline" }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 190, lineHeight: 1.0, color }}>{spec.graded > 0 ? String(spec.good) : "–"}</div>
						<div style={{ display: "flex", marginLeft: 6, fontFamily: "Anton", fontSize: 84, color: SILVER }}>{spec.graded > 0 ? `/ ${spec.graded}` : ""}</div>
					</div>
					<div style={{ display: "flex", marginTop: 6, fontFamily: "Oswald", fontWeight: 600, fontSize: 30, lineHeight: 1.2, letterSpacing: 3, color: WHITE, ...caps, maxWidth: 440 }}>Fourth downs that were the best call or a toss-up</div>
					<div style={{ display: "flex", marginTop: 18, fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 2, color: spec.left ? GOLD : SILVER }}>
						{spec.left ? `${spec.left} of win probability left on the table${spec.scope === "season" ? ", all season" : ""}` : "Nothing left on the table"}
					</div>
				</div>
				<Brand />
			</div>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "0 56px 0 20px" }}>
				<div style={label({ fontSize: 19, marginBottom: 14 })}>{spec.rows.some((r) => r.tone === "warn" || r.tone === "bad") ? "The calls worth a look" : "A few of the calls"}</div>
				{rows.map((r, i) => (
					<div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: rowH - 14, marginBottom: 14, padding: "0 24px", backgroundColor: PANEL, border: `2px solid ${LINE}`, borderLeft: `8px solid ${toneColor(r.tone)}` }}>
						<div style={{ display: "flex", flexDirection: "column" }}>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: 32, color: WHITE, ...caps, letterSpacing: 1 }}>{r.spot}</div>
							<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 21, color: BRIGHT, marginTop: 2 }}>{r.tone === "warn" || r.tone === "bad" ? `${r.short} · ${r.line}` : r.choice}</div>
						</div>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 22, letterSpacing: 3, color: toneColor(r.tone), ...caps }}>{r.verdict}</div>
					</div>
				))}
				<div style={{ display: "flex", marginTop: 4, fontFamily: "Oswald", fontWeight: 400, fontSize: 17, letterSpacing: 1, color: DIM }}>{`${spec.oppName ? `Vs the ${spec.oppName}. ` : ""}Estimates from similar fourth downs, 2019 to last season.`}</div>
			</div>
		</Frame>
	)
}

// ---- the scouting card --------------------------------------------------------------------------------------

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

// ---- the "will it last?" card -------------------------------------------------------------------------------

const FADE = "#fb923c"
const IMPROVE = "#60a5fa"

export type LastDot = { x: number; y: number; toward: boolean; raiders: boolean }

export type LastCardSpec = {
	type: "last"
	title: string
	n: number
	first: number
	rank: string
	value: string
	verdict: string
	verdictTone: "fade" | "improve" | "even"
	/** "117 teams since 1999 started this well. 83% finished closer to average." */
	line: string
	/** Where each team stood after the first games and after the rest of the season, 0 to 1 across the same axis. */
	start: LastDot[]
	end: LastDot[]
	raiders: number
	base: number
	band: [number, number]
	startAvg: string
	endAvg: string
	/** "Won 67% of games early, 54% after. 51% made the playoffs." */
	wins: string
}

const MAX_CARD_DOTS = 110

export function buildLastSpec(story: Story, n: number, first: number): LastCardSpec {
	const [d0, d1] = story.domain
	const at = (v: number) => Math.min(1, Math.max(0, (v - d0) / (d1 - d0)))
	const step = Math.max(1, Math.ceil(story.dots.length / MAX_CARD_DOTS))
	const kept = story.dots.map((d, i) => ({ d, i })).filter(({ d, i }) => d.raiders || i % step === 0)
	const y = (i: number) => ((i * 53) % 100) / 100
	return {
		type: "last",
		title: story.label,
		n,
		first,
		rank: ordinal(story.rank),
		value: story.valueText,
		verdict: story.verdict.text,
		verdictTone: story.verdict.id === "fade" ? "fade" : story.verdict.id === "improve" ? "improve" : "even",
		line: `${story.dots.length} teams since ${first} ${story.kind === "atLeast" ? `started at least this ${story.good ? "well" : "poorly"}` : "started closest to this"}. ${Math.round(story.toward * 100)}% finished closer to average.`,
		start: kept.map(({ d, i }) => ({ x: at(d.start), y: y(i), toward: d.toward, raiders: d.raiders })),
		end: kept.map(({ d, i }) => ({ x: at(d.rest), y: y(i), toward: d.toward, raiders: d.raiders })),
		raiders: at(story.value),
		base: at(story.base),
		band: [at(story.band[0]), at(story.band[1])],
		startAvg: story.startText,
		endAvg: story.restText,
		wins: `Won ${Math.round(story.outcomes.startWin * 100)}% of games early, ${Math.round(story.outcomes.restWin * 100)}% after · ${Math.round(story.outcomes.playoffs * 100)}% made the playoffs`,
	}
}

function LastStrip({ title, dots, spec, band }: { title: string; dots: LastDot[]; spec: LastCardSpec; band: boolean }) {
	const W_ = 430
	const H_ = 150
	return (
		<div style={{ display: "flex", flexDirection: "column", marginBottom: 14 }}>
			<div style={label({ fontSize: 17, letterSpacing: 3, marginBottom: 8 })}>{title}</div>
			<div style={{ display: "flex", position: "relative", width: W_, height: H_, backgroundColor: "#0d0e10", border: `2px solid ${LINE}` }}>
				{band ? <div style={{ display: "flex", position: "absolute", left: Math.round(spec.band[0] * W_), top: 0, width: Math.max(3, Math.round((spec.band[1] - spec.band[0]) * W_)), height: H_, backgroundColor: rgba(GOLD, 0.16), borderLeft: `2px dashed ${rgba(GOLD, 0.7)}`, borderRight: `2px dashed ${rgba(GOLD, 0.7)}` }} /> : null}
				<div style={{ display: "flex", position: "absolute", left: Math.round(spec.base * W_), top: 0, width: 2, height: H_, backgroundColor: DIM }} />
				{dots.map((d, i) =>
					d.raiders ? (
						<div key={i} style={{ display: "flex", position: "absolute", left: Math.round(d.x * W_) - 8, top: 12 + Math.round(d.y * (H_ - 40)) - 2, width: 16, height: 16, borderRadius: 8, backgroundColor: WHITE, border: `3px solid ${GOLD}` }} />
					) : (
						<div key={i} style={{ display: "flex", position: "absolute", left: Math.round(d.x * W_) - 5, top: 12 + Math.round(d.y * (H_ - 40)), width: 11, height: 11, borderRadius: 6, backgroundColor: d.toward ? SILVER : "transparent", border: d.toward ? "none" : `2px solid ${IMPROVE}` }} />
					),
				)}
				<div style={{ display: "flex", position: "absolute", left: Math.round(spec.raiders * W_) - 2, top: 0, width: 4, height: H_, backgroundColor: GOLD }} />
			</div>
		</div>
	)
}

export function renderLastCard(spec: LastCardSpec): ReactElement {
	const tone = spec.verdictTone === "fade" ? FADE : spec.verdictTone === "improve" ? IMPROVE : SILVER
	const titleSize = spec.title.length <= 11 ? 112 : spec.title.length <= 16 ? 76 : 64
	return (
		<Frame glow={tone}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, height: H, padding: "58px 20px 50px 64px" }}>
				<Eyebrow text={`Will it last? · after ${spec.n} games`} color={tone} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: titleSize, lineHeight: 1.02, color: WHITE, ...caps }}>{spec.title}</div>
					<div style={{ display: "flex", marginTop: 8, fontFamily: "Oswald", fontWeight: 600, fontSize: 30, letterSpacing: 3, color: SILVER, ...caps }}>{`Raiders ${spec.rank} of 32 · ${spec.value}`}</div>
					<div style={{ display: "flex", alignSelf: "flex-start", marginTop: 22, padding: "7px 18px", border: `3px solid ${tone}`, color: tone, fontFamily: "Oswald", fontWeight: 700, fontSize: 30, letterSpacing: 4, ...caps }}>{spec.verdict}</div>
					<div style={{ display: "flex", marginTop: 20, fontFamily: "Oswald", fontWeight: 400, fontSize: 27, lineHeight: 1.3, color: BRIGHT, maxWidth: 540 }}>{spec.line}</div>
				</div>
				<Brand />
			</div>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "26px 40px 0 0" }}>
				<LastStrip title={`First ${spec.n} games`} dots={spec.start} spec={spec} band={false} />
				<LastStrip title="Rest of the season" dots={spec.end} spec={spec} band />
				<div style={{ display: "flex", marginBottom: 10, fontFamily: "Oswald", fontWeight: 600, fontSize: 21, letterSpacing: 1, color: BRIGHT }}>{spec.wins}</div>
				<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 400, fontSize: 16, letterSpacing: 1, color: DIM }}>{`Gold line: the Raiders now. Gold band: where the middle half finished. Data: nflverse, CC BY 4.0.`}</div>
			</div>
		</Frame>
	)
}
