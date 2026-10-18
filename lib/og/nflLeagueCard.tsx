// The share cards for the three public NFL formats: game winners, confidence picks and the upset challenge.
//
//   view=me      one player's week: the big number, their rank, and a row for every pick whose game has started
//   view=board   the week's standings, top five (wide) or top seven (tall)
//   view=alert   the upset of the week (upset challenge only)
//   view=invite  the format itself, for a link with nothing personal to show. Every other view falls back to this when
//                it has nothing to draw, so a shared link always has a picture.
//
// Unlocked picks never appear on a card: a row is drawn only once its game has locked, so a card cannot give away a pick
// somebody could still copy. `buildNflLeagueSpec` turns the page views into a small plain spec and `renderNflLeagueCard`
// turns the spec into JSX, so both are testable without a database. Satori understands a flexbox subset of CSS, so
// styling is inline and every element with more than one child is display:flex.

import type { ReactElement } from "react"

import { SIZE_PIXELS, type ShareSize } from "../lab/lastShare"
import { MODE_NAME, type NflMode } from "../league2/competitions"
import type { NflGame, NflWeekView } from "../league2/view/nfl"
import type { ConfidenceView, UpsetView } from "../league2/view/nflFormats"
import { BRIGHT, Brand, Button, DIM, Eyebrow, Frame, GOLD, HIT, LINE, MISS, SILVER, WHITE, caps, clip, rgba } from "./kit"

export type NflCardView = "me" | "board" | "alert" | "invite"
export type NflCardResult = "hit" | "miss" | "push" | "live"

export type NflCardRow = {
	/** The confidence rank, or the upset's worth, or empty. */
	lead: string
	abbr: string
	color: string
	/** "at KC", "vs KC", "over KC". */
	vs: string
	result: NflCardResult
	/** "+9", "0" or "" while the game is on. */
	points: string
}

export type NflCardBoardRow = { rank: number; handle: string; value: string; sub: string }

export type NflCardAlert = { underdog: string; underdogColor: string; favourite: string; score: string; chance: number; value: number; callers: number }

export type NflLeagueCardSpec = {
	type: "nflleague"
	size: ShareSize
	mode: NflMode
	view: NflCardView
	season: number
	week: number | null
	handle: string | null
	big: string
	unit: string
	note: string
	rank: number | null
	ranked: number | null
	rows: NflCardRow[]
	/** Picks that locked but do not fit on the card. */
	more: number
	board: NflCardBoardRow[]
	alert: NflCardAlert | null
}

type Source = { mode: "winners"; view: NflWeekView } | { mode: "confidence"; view: ConfidenceView } | { mode: "upset"; view: UpsetView }

const MODE_ACCENT: Record<NflMode, string> = { winners: SILVER, confidence: GOLD, upset: "#fb923c" }
const ROWS = { wide: 6, tall: 6 } as const
const BOARD_ROWS = { wide: 5, tall: 6 } as const

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

export const nflCardSize = (spec: Pick<NflLeagueCardSpec, "size">) => SIZE_PIXELS[spec.size]

export function inviteSpec(mode: NflMode, size: ShareSize, season: number, week: number | null): NflLeagueCardSpec {
	return { type: "nflleague", size, mode, view: "invite", season, week, handle: null, big: "", unit: "", note: "", rank: null, ranked: null, rows: [], more: 0, board: [], alert: null }
}

const resultOf = (g: NflGame): NflCardResult => (g.outcome === "correct" ? "hit" : g.outcome === "wrong" ? "miss" : g.outcome === "push" || g.outcome === "void" ? "push" : "live")

/** Rows for the player's own picks, started games only. */
function myRows(src: Source): NflCardRow[] {
	if (src.mode === "upset") {
		return src.view.games
			.filter((g) => g.called && g.status !== "open" && g.line)
			.map((g) => {
				const line = g.line!
				const dog = g[line.underdog]
				const fav = g[line.underdog === "away" ? "home" : "away"]
				const out = g.outcome
				return { lead: `+${line.value}`, abbr: dog.abbr, color: dog.color, vs: `over ${fav.abbr}`, result: out === "hit" ? "hit" : out === "miss" ? "miss" : out === "void" ? "push" : "live", points: out === "hit" ? `+${line.value}` : out === "miss" ? "0" : "" } satisfies NflCardRow
			})
			.sort((a, b) => Number(b.lead.slice(1)) - Number(a.lead.slice(1)))
	}
	const rows = (src.view.games as (NflGame & { rank?: number | null; earned?: number | null })[])
		.filter((g) => g.pick && g.status !== "open")
		.map((g) => {
			const side = g.pick as "away" | "home"
			const t = g[side]
			const opp = g[side === "away" ? "home" : "away"]
			const r = resultOf(g)
			const conf = src.mode === "confidence"
			return { r: g.rank ?? 0, row: { lead: conf && g.rank ? String(g.rank) : "", abbr: t.abbr, color: t.color, vs: `${side === "away" ? "at" : "vs"} ${opp.abbr}`, result: r, points: conf ? (r === "hit" ? `+${g.earned ?? g.rank ?? 0}` : r === "miss" ? "0" : "") : r === "hit" ? "+1" : r === "miss" ? "0" : "" } satisfies NflCardRow }
		})
	// Confidence reads best from the boldest pick down; the others keep kickoff order.
	return (src.mode === "confidence" ? rows.sort((a, b) => b.r - a.r) : rows).map((x) => x.row)
}

function boardRows(src: Source, limit: number): NflCardBoardRow[] {
	return src.view.weekBoard.rows.slice(0, limit).map((r) => ({
		rank: r.rank,
		handle: r.handle,
		value: String(r.points),
		sub: src.mode === "winners" ? `${r.games} ${plural(r.games, "pick")}` : src.mode === "confidence" ? `${r.correct} of ${r.games} right` : `${r.correct} ${plural(r.correct, "hit")} of ${r.games}`,
	}))
}

/**
 * The card for `view` of a format's week. `src.view` must have been built for the player the card is of (`handle`), or
 * for nobody. Falls back to the invite look whenever the asked-for view has nothing to show.
 */
export function buildNflLeagueSpec(src: Source, input: { size: ShareSize; view: NflCardView; handle?: string | null }): NflLeagueCardSpec {
	const v = src.view
	const spec = inviteSpec(src.mode, input.size, v.season, v.games.length > 0 ? v.week : null)

	if (input.view === "board") {
		const board = boardRows(src, BOARD_ROWS[input.size])
		if (board.length === 0) return spec
		return { ...spec, view: "board", board, ranked: v.weekBoard.total }
	}

	if (input.view === "alert") {
		if (src.mode !== "upset" || !src.view.upsetOfWeek) return spec
		const u = src.view.upsetOfWeek
		const hi = Math.max(u.score.away, u.score.home)
		const lo = Math.min(u.score.away, u.score.home)
		return { ...spec, view: "alert", alert: { underdog: u.underdog.abbr, underdogColor: u.underdog.color, favourite: u.favourite.abbr, score: `${hi}-${lo}`, chance: Math.round(u.favouriteWinChance * 100), value: u.value, callers: u.callers } }
	}

	if (input.view === "me" && input.handle) {
		const all = myRows(src)
		if (all.length === 0) return spec
		const limit = ROWS[input.size]
		const me = v.weekBoard.me
		let big: string
		let unit: string
		let note: string
		if (src.mode === "winners") {
			const s = src.view.summary
			if (s.final > 0) [big, unit, note] = [String(s.correct), "correct", `of ${s.final} final`]
			else [big, unit, note] = [String(all.length), plural(all.length, "pick") + " locked", "results post as games end"]
		} else if (src.mode === "confidence") {
			const s = src.view.summary
			;[big, unit, note] = [String(s.points), plural(s.points, "point"), `of ${s.maxPossible} possible`]
		} else {
			const s = src.view.summary
			;[big, unit, note] = [String(s.points), plural(s.points, "point"), `${s.hits} of ${s.called} ${plural(s.called, "upset")} hit`]
		}
		return { ...spec, view: "me", handle: input.handle, big, unit, note, rank: me ? me.rank : null, ranked: me ? v.weekBoard.total : null, rows: all.slice(0, limit), more: Math.max(0, all.length - limit) }
	}
	return spec
}

// ---- drawing -----------------------------------------------------------------------------------------------

const label = (extra: Record<string, string | number> = {}) => ({ display: "flex", fontFamily: "Oswald", fontWeight: 500, letterSpacing: 4, color: DIM, ...caps, ...extra })
const RESULT_COLOR: Record<NflCardResult, string> = { hit: HIT, miss: MISS, push: DIM, live: SILVER }
const RESULT_TEXT: Record<NflCardResult, string> = { hit: "Hit", miss: "Miss", push: "Push", live: "Live" }

function Row({ row, w, h, tall }: { row: NflCardRow; w: number; h: number; tall: boolean }) {
	const c = RESULT_COLOR[row.result]
	return (
		<div style={{ display: "flex", alignItems: "center", width: w, height: h, marginTop: tall ? 10 : 8, backgroundColor: "rgba(15,16,18,0.92)", border: `2px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
			<div style={{ display: "flex", width: tall ? 12 : 8, height: h, backgroundColor: row.color }} />
			<div style={{ display: "flex", justifyContent: "center", width: row.lead ? (tall ? 84 : 66) : tall ? 28 : 20, fontFamily: "Anton", fontSize: tall ? 44 : 34, color: WHITE }}>{row.lead}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 52 : 40, letterSpacing: 1, color: WHITE }}>{row.abbr}</div>
			<div style={label({ fontSize: tall ? 26 : 20, letterSpacing: 3, color: BRIGHT, marginLeft: 16, flex: 1 })}>{row.vs}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 40 : 30, color: c, marginRight: 16 }}>{row.points}</div>
			<div style={{ display: "flex", justifyContent: "center", width: tall ? 118 : 92, marginRight: tall ? 18 : 14, padding: "4px 0", border: `2px solid ${rgba(c, 0.7)}`, borderRadius: 8, fontFamily: "Oswald", fontWeight: 700, fontSize: tall ? 26 : 20, letterSpacing: 3, color: c, ...caps }}>{RESULT_TEXT[row.result]}</div>
		</div>
	)
}

function title(spec: NflLeagueCardSpec): string {
	return `${MODE_NAME[spec.mode]}${spec.week ? ` · Week ${spec.week}` : ""}`
}

function Footer({ tall, note }: { tall: boolean; note: string }) {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
			<Brand />
			<Button text="Play free" note={tall ? undefined : note} />
		</div>
	)
}

function Me({ spec }: { spec: NflLeagueCardSpec }) {
	const tall = spec.size === "tall"
	const { width: W, height: H } = nflCardSize(spec)
	const pad = tall ? 64 : 60
	const accent = MODE_ACCENT[spec.mode]
	const rowW = tall ? W - pad * 2 : 640
	const rowH = tall ? 84 : 56
	const rank = spec.rank !== null && spec.ranked ? `#${spec.rank} of ${spec.ranked} this week` : "Week in progress"
	const left = (
		<div style={{ display: "flex", flexDirection: "column", width: tall ? W - pad * 2 : 430, alignItems: tall ? "center" : "flex-start", marginTop: tall ? 24 : 0 }}>
			<div style={label({ fontSize: tall ? 34 : 28, letterSpacing: 5, color: SILVER })}>{clip(spec.handle ?? "", 16)}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 210 : 190, lineHeight: 1.02, color: WHITE, textShadow: `0 0 40px ${rgba(accent, 0.45)}` }}>{spec.big}</div>
			<div style={label({ fontSize: tall ? 40 : 30, letterSpacing: 6, color: accent })}>{spec.unit}</div>
			<div style={label({ fontSize: tall ? 28 : 22, letterSpacing: 4, color: DIM, marginTop: 6 })}>{spec.note}</div>
			<div style={{ display: "flex", marginTop: tall ? 26 : 20, padding: "6px 20px", border: `2px solid ${rgba(accent, 0.6)}`, borderRadius: 999, fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 30 : 22, letterSpacing: 3, color: WHITE, ...caps }}>{rank}</div>
		</div>
	)
	const list = (
		<div style={{ display: "flex", flexDirection: "column", justifyContent: tall ? "flex-start" : "center", marginLeft: tall ? 0 : 40, marginTop: tall ? 14 : 0, overflow: "hidden" }}>
			{spec.rows.map((r, i) => (
				<Row key={i} row={r} w={rowW} h={rowH} tall={tall} />
			))}
			{spec.more > 0 ? <div style={label({ fontSize: tall ? 26 : 19, letterSpacing: 4, marginTop: 12, justifyContent: "center", width: rowW })}>{`+${spec.more} more`}</div> : null}
		</div>
	)
	return (
		<Frame glow={accent} w={W} h={H}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: tall ? `${pad}px` : "46px 60px 38px", position: "relative" }}>
				<Eyebrow text={title(spec)} color={accent} />
				<div style={{ display: "flex", flex: 1, flexDirection: tall ? "column" : "row", alignItems: tall ? "stretch" : "center", marginTop: tall ? 10 : 8 }}>
					{left}
					{list}
				</div>
				<Footer tall={tall} note="raidersrundown.com/league/nfl" />
			</div>
		</Frame>
	)
}

function Board({ spec }: { spec: NflLeagueCardSpec }) {
	const tall = spec.size === "tall"
	const { width: W, height: H } = nflCardSize(spec)
	const pad = tall ? 64 : 60
	const accent = MODE_ACCENT[spec.mode]
	const rowW = tall ? W - pad * 2 : 640
	const rowH = tall ? 100 : 62
	const unit = spec.mode === "winners" ? "correct" : "points"
	return (
		<Frame glow={accent} w={W} h={H}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: tall ? `${pad}px` : "46px 60px 38px", position: "relative" }}>
				<Eyebrow text={title(spec)} color={accent} />
				<div style={{ display: "flex", flex: 1, flexDirection: tall ? "column" : "row", alignItems: tall ? "stretch" : "center", marginTop: tall ? 20 : 8 }}>
					<div style={{ display: "flex", flexDirection: "column", width: tall ? W - pad * 2 : 430 }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 150 : 110, lineHeight: 1.02, color: WHITE, textTransform: "uppercase", textShadow: `0 0 40px ${rgba(accent, 0.45)}` }}>Standings</div>
						<div style={label({ fontSize: tall ? 36 : 28, letterSpacing: 6, color: accent })}>{`Week ${spec.week ?? ""}`}</div>
						<div style={label({ fontSize: tall ? 28 : 22, letterSpacing: 4, marginTop: 8 })}>{spec.ranked ? `${spec.ranked} ${plural(spec.ranked, "player")}` : ""}</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", marginLeft: tall ? 0 : 40, marginTop: tall ? 20 : 0 }}>
						{spec.board.map((r) => (
							<div key={r.rank} style={{ display: "flex", alignItems: "center", width: rowW, height: rowH, marginTop: tall ? 10 : 8, backgroundColor: "rgba(15,16,18,0.92)", border: `2px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
								<div style={{ display: "flex", width: tall ? 12 : 8, height: rowH, backgroundColor: r.rank === 1 ? GOLD : r.rank <= 3 ? SILVER : LINE }} />
								<div style={{ display: "flex", justifyContent: "center", width: tall ? 96 : 70, fontFamily: "Anton", fontSize: tall ? 52 : 38, color: r.rank === 1 ? GOLD : BRIGHT }}>{r.rank}</div>
								<div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
									<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: tall ? 40 : 30, letterSpacing: 2, color: WHITE }}>{clip(r.handle, 16)}</div>
									<div style={label({ fontSize: tall ? 22 : 16, letterSpacing: 3 })}>{r.sub}</div>
								</div>
								<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginRight: tall ? 28 : 20 }}>
									<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 60 : 42, lineHeight: 1, color: WHITE }}>{r.value}</div>
									<div style={label({ fontSize: tall ? 20 : 14, letterSpacing: 3 })}>{unit}</div>
								</div>
							</div>
						))}
					</div>
				</div>
				<Footer tall={tall} note="raidersrundown.com/league/nfl" />
			</div>
		</Frame>
	)
}

function Alert({ spec }: { spec: NflLeagueCardSpec }) {
	const a = spec.alert as NflCardAlert
	const tall = spec.size === "tall"
	const { width: W, height: H } = nflCardSize(spec)
	const pad = tall ? 64 : 60
	const accent = MODE_ACCENT.upset
	return (
		<Frame glow={a.underdogColor} w={W} h={H}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: tall ? `${pad}px` : "46px 60px 38px", position: "relative" }}>
				<Eyebrow text={`Upset of the week${spec.week ? ` · Week ${spec.week}` : ""}`} color={accent} />
				<div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", alignItems: tall ? "center" : "flex-start", marginTop: 24, marginBottom: 12 }}>
					<div style={{ display: "flex", alignItems: "flex-end" }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 300 : 170, lineHeight: 1, color: WHITE, textShadow: `0 0 50px ${rgba(a.underdogColor, 0.6)}` }}>{a.underdog}</div>
						<div style={label({ fontSize: tall ? 56 : 40, letterSpacing: 6, color: accent, marginLeft: 24, marginBottom: tall ? 46 : 30 })}>over</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 150 : 90, lineHeight: 1, color: DIM, marginLeft: 24, marginBottom: tall ? 12 : 8 }}>{a.favourite}</div>
					</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 120 : 70, color: BRIGHT, marginTop: 8 }}>{a.score}</div>
					<div style={label({ fontSize: tall ? 34 : 26, letterSpacing: 5, color: SILVER, marginTop: 16 })}>{`Rated ${a.chance}% to lose · worth ${a.value} ${plural(a.value, "point")}`}</div>
					<div style={label({ fontSize: tall ? 30 : 22, letterSpacing: 4, marginTop: 8 })}>{a.callers > 0 ? `${a.callers} ${plural(a.callers, "player")} called it` : "Nobody called it"}</div>
				</div>
				<Footer tall={tall} note="Call next week's upsets" />
			</div>
		</Frame>
	)
}

const PITCH: Record<NflMode, { line: string; steps: string[] }> = {
	winners: { line: "Pick every winner", steps: ["Tap the team you think wins", "Change it until kickoff", "One point per winner"] },
	confidence: { line: "How sure are you?", steps: ["Pick every winner", "Rank each pick, one use per rank", "A correct pick scores its rank"] },
	upset: { line: "Call the upsets", steps: ["Our ratings name the underdogs", "Call up to five of them", "The longer the shot, the more it pays"] },
}

function Invite({ spec }: { spec: NflLeagueCardSpec }) {
	const tall = spec.size === "tall"
	const { width: W, height: H } = nflCardSize(spec)
	const pad = tall ? 64 : 60
	const accent = MODE_ACCENT[spec.mode]
	const p = PITCH[spec.mode]
	return (
		<Frame glow={accent} w={W} h={H}>
			<div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: tall ? `${pad}px` : "46px 60px 38px", position: "relative" }}>
				<Eyebrow text={`${MODE_NAME[spec.mode]} · ${spec.season}`} color={accent} />
				<div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: tall ? 150 : 104, lineHeight: 1.04, color: WHITE, textTransform: "uppercase", textShadow: `0 0 40px ${rgba(accent, 0.4)}` }}>{p.line}</div>
					<div style={{ display: "flex", flexDirection: "column", marginTop: tall ? 40 : 24 }}>
						{p.steps.map((s, i) => (
							<div key={s} style={{ display: "flex", alignItems: "center", marginTop: tall ? 18 : 10 }}>
								<div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: tall ? 56 : 40, height: tall ? 56 : 40, border: `2px solid ${accent}`, borderRadius: 999, fontFamily: "Anton", fontSize: tall ? 30 : 22, color: WHITE }}>{String(i + 1)}</div>
								<div style={label({ fontSize: tall ? 36 : 26, letterSpacing: 3, color: BRIGHT, marginLeft: 20 })}>{s}</div>
							</div>
						))}
					</div>
				</div>
				<Footer tall={tall} note="Free · raidersrundown.com/league/nfl" />
			</div>
		</Frame>
	)
}

export function renderNflLeagueCard(spec: NflLeagueCardSpec): ReactElement {
	if (spec.view === "me") return <Me spec={spec} />
	if (spec.view === "board") return <Board spec={spec} />
	if (spec.view === "alert" && spec.alert) return <Alert spec={spec} />
	return <Invite spec={spec} />
}

