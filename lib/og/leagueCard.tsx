// The share cards for the Beat the Blogger league (1200x630). Four looks:
//
//   the invite card (a plain link to /league): the big title and a "Join free" button on the left and,
//   on the right, this week's game with blank score boxes waiting to be filled, so the card is the
//   invitation: here is the game, guess the score.
//
//   the leaderboard card (`view=board`): the title on the left and, on the right, the leaderboard as it
//   stands with the blogger sitting in it among the players.
//
//   a player's card: their handle, rank and numbers, and a chip for every graded game saying whether
//   they beat me, lost to me or tied me that week.
//
//   a challenge card (a player's own invite link): the same numbers, framed as "think you can out-pick
//   them?" with a join button instead of the chips.
//
// buildLeagueSpec turns the league's data into a small plain spec and renderLeagueCard turns the spec
// into JSX, so both are testable without Sanity or a network. Satori only understands a flexbox subset
// of CSS, so styling is inline and every element with more than one child is display:flex.

import type { ReactElement } from "react"

import { HANDLE_RE, type LeagueData, bloggerLine, buildProfile, buildStandings, gradedWeeks, openGames } from "../league"
import { teamInfo } from "../nfl"
import { BG, BRIGHT, BRONZE, Brand, Button, DIM, Eyebrow, Frame, GOLD, HIT, LINE, MISS, PANEL, RRMark, SILVER, WHITE, accent, caps, clip, rgba } from "./kit"


// ---- spec ------------------------------------------------------------------------------------

export type LeagueBoardRow = {
	/** The player's rank, or null for the blogger's own line. */
	rank: number | null
	handle: string
	points: number
	blogger: boolean
}

export type LeagueChip = {
	week: number
	vs: "W" | "L" | "T"
	/** The Raiders' opponent that week ("LAC"), for the label under the week. */
	opp?: string
	/** What the player and the blogger scored on that game. */
	you?: number
	blogger?: number
}

/** The next game open for picks, shown on the invite card. */
export type LeagueNextGame = {
	week: number
	away: { abbr: string; nick: string; color: string }
	home: { abbr: string; nick: string; color: string }
	/** "Sun 1:25 PM PT" */
	kickoff: string
}

export type LeagueCardSpec = {
	type: "league"
	season: number
	/** Set for a player's card; absent for the league's own card. */
	handle?: string | null
	/** League card only: "invite" (the default) or "board" (the leaderboard look). */
	kind?: "invite" | "board"
	/** Player card only: frame it as that player's challenge to the viewer. */
	challenge?: boolean
	/** League invite card: the next game open for picks, if there is one. */
	next?: LeagueNextGame | null
	rank?: number | null
	ranked?: number | null
	points?: number | null
	vs?: { w: number; l: number; t: number } | null
	/** Players in the league, for the generic card. */
	players?: number | null
	/** The latest week with a graded game. */
	week?: number | null
	/** The leaderboard with the blogger placed among the players. Empty before the first graded game. */
	board?: LeagueBoardRow[]
	/** Graded games the player entered, and how many they got the winner of. */
	games?: number | null
	correct?: number | null
	avgMiss?: number | null
	/** Points ahead of (+) or behind (-) the blogger on the games the player entered. */
	delta?: number | null
	/** One chip per graded game, oldest first. */
	chips?: LeagueChip[]
	/** League cards: how many players are ahead of the blogger on points (null before a game is graded). */
	ahead?: number | null
	/** The blogger's points: the league's total, or on the games this player entered. */
	bloggerPoints?: number | null
}

const BOARD_PLAYERS = 5
const BOARD_ROWS = 6
const MAX_CHIPS = 8

export type LeagueSpecOptions = {
	/** Frame a player's card as their challenge to the viewer. */
	challenge?: boolean
	/** "board" asks for the leaderboard look instead of the invite. */
	view?: string | null
	/** The clock, for which game is next. Defaults to now. */
	now?: number
}

const PT = "America/Los_Angeles"

/** The abbreviation of whoever the Raiders played in this game. */
function opponentAbbr(g: { awayTeam: string; homeTeam: string }): string {
	const away = teamInfo(g.awayTeam)
	const home = teamInfo(g.homeTeam)
	return away.abbr === "LV" ? home.abbr : away.abbr
}

/** "Sun 1:25 PM PT", or "" for a kickoff that isn't a date. */
export function kickoffLabel(iso: string): string {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ""
	const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: PT })
	const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: PT })
	return `${day} ${time} PT`
}

/** The soonest game still open for picks, in the shape the card draws. */
export function nextGameOf(data: LeagueData, now: number): LeagueNextGame | null {
	const g = openGames(data.games, now)[0]
	if (!g) return null
	const away = teamInfo(g.awayTeam)
	const home = teamInfo(g.homeTeam)
	return {
		week: g.week,
		away: { abbr: away.abbr, nick: away.nick, color: away.color },
		home: { abbr: home.abbr, nick: home.nick, color: home.color },
		kickoff: kickoffLabel(g.kickoff),
	}
}

/** The card's spec for the league, or for one player when `handle` is given. Null for a handle that isn't a player. */
export function buildLeagueSpec(data: LeagueData, season: number, handle?: string | null, opts: LeagueSpecOptions = {}): LeagueCardSpec | null {
	const weeks = gradedWeeks(data.games)
	const week = weeks.length ? weeks[weeks.length - 1] : null

	if (!handle) {
		const rows = buildStandings(data.games, data.players, data.picks)
		const blogger = bloggerLine(data.games)
		const board: LeagueBoardRow[] = rows.slice(0, BOARD_PLAYERS).map((r) => ({ rank: r.rank, handle: r.handle, points: r.points, blogger: false }))
		if (board.length > 0 && blogger.games > 0) {
			// Players with the same points as me sit above me: I only count as beaten when they pass me.
			let at = board.findIndex((r) => r.points < blogger.points)
			if (at === -1) at = board.length
			board.splice(at, 0, { rank: null, handle: "The blogger", points: blogger.points, blogger: true })
		}
		const ahead = blogger.games > 0 ? rows.filter((r) => r.points > blogger.points).length : null
		return {
			type: "league",
			season,
			kind: opts.view === "board" ? "board" : "invite",
			ahead,
			bloggerPoints: blogger.games > 0 ? blogger.points : null,
			players: data.players.length,
			week,
			board: board.slice(0, BOARD_ROWS),
			next: nextGameOf(data, opts.now ?? Date.now()),
		}
	}

	if (!HANDLE_RE.test(handle)) return null
	const profile = buildProfile(data.games, data.players, data.picks, handle)
	if (!profile) return null
	const { player, row, ranked, history } = profile
	const chips: LeagueChip[] = history
		.slice()
		.reverse()
		.map((h) => ({ week: h.game.week, vs: h.vs, opp: opponentAbbr(h.game), you: h.score.points, blogger: h.blogger.points }))
		.slice(-MAX_CHIPS)
	return {
		type: "league",
		season,
		handle: player.handle,
		challenge: opts.challenge === true,
		rank: row?.rank ?? null,
		ranked,
		points: row?.points ?? null,
		vs: row?.vsBlogger ?? null,
		week,
		games: row?.games ?? null,
		correct: row?.correct ?? null,
		avgMiss: row ? row.avgMarginError : null,
		delta: row?.delta ?? null,
		bloggerPoints: row && typeof row.delta === "number" ? row.points - row.delta : null,
		chips,
	}
}

/** How many of the league's players are ahead of the blogger, as a row of lit dots. */
function AheadMeter({ ahead, players }: { ahead: number; players: number }) {
	const n = Math.min(players, 14)
	const lit = Math.min(n, Math.round((ahead / players) * n))
	const dots: ReactElement[] = []
	for (let i = 0; i < n; i++) {
		const on = i < lit
		dots.push(<div key={i} style={{ display: "flex", width: 20, height: 20, marginRight: 8, borderRadius: 10, backgroundColor: on ? HIT : "#1b1d20", border: `2px solid ${on ? HIT : LINE}`, boxShadow: on ? `0 0 14px ${rgba(HIT, 0.75)}` : "none" }} />)
	}
	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={{ display: "flex", alignItems: "center" }}>{dots}</div>
			<div style={{ display: "flex", marginTop: 12, fontFamily: "Oswald", fontWeight: 600, fontSize: 22, letterSpacing: 3, color: BRIGHT, ...caps }}>
				{ahead === 0 ? "Nobody has beaten the blogger yet" : `${ahead} of ${players} ${players === 1 ? "player is" : "players are"} beating the blogger`}
			</div>
		</div>
	)
}

// ---- the invite card: the pick slip ----------------------------------------------------------

function Half({ abbr, nick, color, flip }: { abbr: string; nick: string; color: string; flip?: boolean }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, height: 158, backgroundImage: `linear-gradient(${flip ? 225 : 135}deg, ${rgba(color, 0.62)} 0%, ${rgba(color, 0.08)} 100%)` }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1, color: WHITE }}>{clip(abbr, 4)}</div>
			<div style={{ display: "flex", marginTop: 6, fontFamily: "Oswald", fontWeight: 600, fontSize: 18, letterSpacing: 4, color: BRIGHT, ...caps }}>{clip(nick, 12)}</div>
		</div>
	)
}

function Blank() {
	return (
		<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 124, height: 88, borderRadius: 14, border: `3px solid ${BRIGHT}`, backgroundColor: BG, boxShadow: "0 0 26px rgba(207,211,214,0.4), inset 0 0 22px rgba(207,211,214,0.14)", fontFamily: "Anton", fontSize: 68, color: SILVER }}>?</div>
	)
}

function Worth({ pts, label }: { pts: string; label: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 38, lineHeight: 1.05, color: WHITE }}>{pts}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 15, letterSpacing: 3, color: DIM, ...caps }}>{label}</div>
		</div>
	)
}

function Notch({ side }: { side: "left" | "right" }) {
	return <div style={{ display: "flex", position: "absolute", top: -15, ...(side === "left" ? { left: -17 } : { right: -17 }), width: 30, height: 30, borderRadius: 15, backgroundColor: "#0b0b0c", border: `2px solid ${LINE}` }} />
}

function Slip({ spec }: { spec: LeagueCardSpec }) {
	const next = spec.next ?? null
	const a = next ? accent(next.away.color) : SILVER
	const h = next ? accent(next.home.color) : SILVER
	return (
		<div style={{ display: "flex", flexDirection: "column", width: 476, backgroundColor: "#0f1012", border: `2px solid ${LINE}`, borderRadius: 18, overflow: "hidden", transform: "rotate(-2.5deg)" }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 22px", backgroundImage: "linear-gradient(90deg, #e6e7e9 0%, #a7aeb3 100%)" }}>
				<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 20, letterSpacing: 5, color: BG, ...caps }}>{next ? "This week's slip" : "Every week"}</div>
				<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 18, letterSpacing: 4, color: BG, ...caps }}>{next ? `Week ${next.week}` : "New picks"}</div>
			</div>
			{next ? (
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", position: "relative", alignItems: "center" }}>
						<Half abbr={next.away.abbr} nick={next.away.nick} color={a} />
						<Half abbr={next.home.abbr} nick={next.home.nick} color={h} flip />
						<div style={{ display: "flex", position: "absolute", left: 207, top: 57, width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 23, backgroundColor: BG, border: `2px solid ${BRIGHT}`, fontFamily: "Oswald", fontWeight: 700, fontSize: 17, letterSpacing: 1, color: WHITE }}>AT</div>
					</div>
					{next.kickoff ? <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 8px 0", fontFamily: "Oswald", fontWeight: 600, fontSize: 24, letterSpacing: 4, color: BRIGHT, ...caps }}>{next.kickoff}</div> : <div style={{ display: "flex" }} />}
				</div>
			) : (
				<div style={{ display: "flex", justifyContent: "center", padding: "46px 28px 40px 28px", textAlign: "center", fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 3, color: DIM, ...caps }}>Picks open the moment the next game is set</div>
			)}
			<div style={{ display: "flex", position: "relative", height: 2, margin: "6px 18px 0 18px", borderTop: `2px dashed ${LINE}` }}>
				<Notch side="left" />
				<Notch side="right" />
			</div>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 0 0 0" }}>
				<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 16, letterSpacing: 5, color: DIM, ...caps }}>Your pick</div>
				<div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
					<Blank />
					<div style={{ display: "flex", width: 28, height: 6, margin: "0 16px", backgroundColor: SILVER }} />
					<Blank />
				</div>
			</div>
			<div style={{ display: "flex", margin: "18px 22px 18px 22px", paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
				<Worth pts="+10" label="Winner" />
				<Worth pts="+10" label="Margin" />
				<Worth pts="+5" label="Exact" />
			</div>
		</div>
	)
}

function LeagueInvite({ spec }: { spec: LeagueCardSpec }) {
	const players = typeof spec.players === "number" && spec.players > 0 ? spec.players : null
	const next = spec.next ?? null
	const meter = players !== null && typeof spec.ahead === "number" && players >= 2
	const note = players ? `${players} ${players === 1 ? "player" : "players"}  ·  no email` : "Free  ·  no email"
	return (
		<Frame glow={next ? accent(next.home.color) : SILVER}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 650, padding: "58px 10px 50px 72px" }}>
				<Eyebrow text={`Free to play  ·  ${spec.season}`} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 100, lineHeight: 0.98, color: WHITE, ...caps }}>Beat the</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 100, lineHeight: 0.98, color: SILVER, textShadow: "0 0 40px rgba(207,211,214,0.35)", ...caps }}>Blogger</div>
					<div style={{ display: "flex", marginTop: 12, fontFamily: "Oswald", fontWeight: 600, fontSize: 25, letterSpacing: 3, color: BRIGHT, ...caps }}>Pick the score. Out-pick me.</div>
					<div style={{ display: "flex", marginTop: 16 }}>{meter ? <AheadMeter ahead={spec.ahead as number} players={players as number} /> : <div style={{ display: "flex" }} />}</div>
					<div style={{ display: "flex", marginTop: meter ? 16 : 6 }}>
						<Button text="Join free" note={meter ? "" : note} />
					</div>
				</div>
				<Brand />
			</div>
			<div style={{ display: "flex", position: "relative", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, padding: "30px 56px 30px 0" }}>
				{/* the glow sits behind the slip as a gradient: a drop shadow on a rotated box crashes resvg */}
				<div style={{ display: "flex", position: "absolute", left: -10, top: 40, width: 560, height: 550, backgroundImage: `radial-gradient(circle at 50% 50%, ${rgba(next ? accent(next.home.color) : SILVER, 0.3)} 0%, rgba(0,0,0,0) 68%)` }} />
				<Slip spec={spec} />
			</div>
		</Frame>
	)
}

// ---- the leaderboard card --------------------------------------------------------------------

function BoardRow({ row, max, beatenBlogger, first }: { row: LeagueBoardRow; max: number; beatenBlogger: boolean; first: boolean }) {
	const frac = Math.max(0.04, row.points / max)
	const barColor = row.blogger ? WHITE : beatenBlogger ? HIT : SILVER
	return (
		<div style={{ display: "flex", alignItems: "center", height: 62, paddingLeft: 6, ...(row.blogger ? { backgroundImage: "linear-gradient(90deg, rgba(230,231,233,0.2) 0%, rgba(230,231,233,0.05) 100%)", borderTop: `1px solid ${BRIGHT}`, borderBottom: `1px solid ${BRIGHT}` } : {}) }}>
			<div style={{ display: "flex", width: 46, justifyContent: "center", alignItems: "center" }}>
				{row.blogger ? <RRMark size={34} color={WHITE} /> : <div style={{ display: "flex", fontFamily: "Anton", fontSize: 40, color: first ? GOLD : SILVER }}>{row.rank}</div>}
			</div>
			<div style={{ display: "flex", width: 226, marginLeft: 8, fontFamily: "Oswald", fontWeight: 600, fontSize: 24, letterSpacing: 1, color: row.blogger || first ? WHITE : BRIGHT, ...caps }}>{clip(row.handle, 15)}</div>
			<div style={{ display: "flex", flex: 1, height: 14, backgroundColor: "#1b1d20", borderRadius: 7, marginRight: 16 }}>
				<div style={{ display: "flex", width: `${Math.round(frac * 100)}%`, height: 14, borderRadius: 7, backgroundColor: barColor, boxShadow: beatenBlogger ? `0 0 14px ${rgba(HIT, 0.7)}` : "none" }} />
			</div>
			<div style={{ display: "flex", width: 64, justifyContent: "flex-end", paddingRight: 16, fontFamily: "Anton", fontSize: 34, color: row.blogger || first ? WHITE : BRIGHT }}>{row.points}</div>
		</div>
	)
}

function GhostRow({ n }: { n: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", height: 62, paddingLeft: 6 }}>
			<div style={{ display: "flex", width: 46, justifyContent: "center", fontFamily: "Anton", fontSize: 40, color: LINE }}>{n}</div>
			<div style={{ display: "flex", width: 226, marginLeft: 8, fontFamily: "Oswald", fontWeight: 600, fontSize: 24, letterSpacing: 1, color: "#3a3d41", ...caps }}>{n === 1 ? "You?" : "Open"}</div>
			<div style={{ display: "flex", flex: 1, height: 14, backgroundColor: "#17181a", borderRadius: 7, marginRight: 16 }} />
			<div style={{ display: "flex", width: 64, justifyContent: "flex-end", paddingRight: 16, fontFamily: "Anton", fontSize: 34, color: LINE }}>0</div>
		</div>
	)
}

function LeagueOwn({ spec }: { spec: LeagueCardSpec }) {
	const board = spec.board ?? []
	const live = board.length > 0
	const max = Math.max(1, ...board.map((r) => r.points))
	const bloggerPts = board.find((r) => r.blogger)?.points ?? null
	const players = typeof spec.players === "number" && spec.players > 0 ? spec.players : null
	const hero = live && typeof spec.ahead === "number" && players !== null
	return (
		<Frame glow={hero && (spec.ahead as number) > 0 ? HIT : SILVER}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 540, padding: "58px 10px 50px 72px" }}>
				<Eyebrow text={`The board  ·  ${spec.week ? `Week ${spec.week}` : spec.season}`} />
				{hero ? (
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", alignItems: "flex-end" }}>
							<div style={{ display: "flex", fontFamily: "Anton", fontSize: 250, lineHeight: 0.94, color: (spec.ahead as number) > 0 ? HIT : WHITE, textShadow: (spec.ahead as number) > 0 ? `0 0 60px ${rgba(HIT, 0.45)}` : "none" }}>{String(spec.ahead)}</div>
							<div style={{ display: "flex", margin: "0 0 18px 14px", fontFamily: "Anton", fontSize: 72, lineHeight: 1, color: DIM }}>{`/ ${players}`}</div>
						</div>
						<div style={{ display: "flex", marginTop: 10, fontFamily: "Oswald", fontWeight: 600, fontSize: 30, letterSpacing: 4, lineHeight: 1.15, color: BRIGHT, ...caps }}>{(spec.ahead as number) === 1 ? "Player is beating" : "Players are beating"}</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 64, letterSpacing: 2, lineHeight: 1.05, color: WHITE, ...caps }}>the blogger</div>
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 128, lineHeight: 0.96, color: WHITE, ...caps }}>Beat the</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: 128, lineHeight: 0.96, color: SILVER, ...caps }}>Blogger</div>
						<div style={{ display: "flex", marginTop: 16, fontFamily: "Oswald", fontWeight: 600, fontSize: 26, letterSpacing: 3, color: BRIGHT, ...caps }}>Pick the score. Climb the board.</div>
					</div>
				)}
				<Brand />
			</div>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "44px 64px 44px 20px" }}>
				<div style={{ display: "flex", flexDirection: "column", backgroundColor: "rgba(15,16,18,0.92)", border: `2px solid ${LINE}`, borderRadius: 20, padding: "22px 20px 18px 20px", boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 60px ${rgba(hero && (spec.ahead as number) > 0 ? HIT : SILVER, 0.14)}` }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 12px 12px 12px", borderBottom: `1px solid ${LINE}` }}>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 20, letterSpacing: 5, color: SILVER, ...caps }}>Leaderboard</div>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 18, letterSpacing: 4, color: DIM, ...caps }}>{live ? (spec.week ? `Through week ${spec.week}` : "This season") : "Opens after week 1"}</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", paddingTop: 8 }}>
						{live ? board.map((r, i) => <BoardRow key={`${r.handle}-${i}`} row={r} max={max} first={!r.blogger && r.rank === 1} beatenBlogger={bloggerPts !== null && r.points > bloggerPts} />) : [1, 2, 3, 4, 5].map((n) => <GhostRow key={n} n={n} />)}
					</div>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px 0 12px", borderTop: `1px solid ${LINE}`, marginTop: 6 }}>
						{live ? (
							<div style={{ display: "flex", alignItems: "center", fontFamily: "Oswald", fontWeight: 500, fontSize: 16, letterSpacing: 2, color: DIM, ...caps }}>
								<div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, backgroundColor: HIT, marginRight: 10 }} />
								Ahead of the blogger
							</div>
						) : (
							<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 16, letterSpacing: 2, color: DIM, ...caps }}>Picks lock at kickoff</div>
						)}
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 16, letterSpacing: 2, color: DIM, ...caps }}>Max 25 a game</div>
					</div>
				</div>
			</div>
		</Frame>
	)
}

// ---- a player's card and the challenge card --------------------------------------------------

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", marginRight: 44 }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 52, lineHeight: 1.05, color: tint ?? WHITE }}>{value}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 18, letterSpacing: 4, color: DIM, ...caps }}>{label}</div>
		</div>
	)
}

/** The player against the blogger on the games the player entered, as one bar split by points. */
function Duel({ you, blogger, handle }: { you: number; blogger: number; handle: string }) {
	const total = Math.max(1, you + blogger)
	const lead = you > blogger
	const left = Math.max(6, Math.min(94, Math.round((you / total) * 100)))
	const yourColor = lead ? HIT : you === blogger ? BRIGHT : SILVER
	return (
		<div style={{ display: "flex", flexDirection: "column", width: 640 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
				<div style={{ display: "flex", alignItems: "baseline" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 38, color: yourColor }}>{String(you)}</div>
					<div style={{ display: "flex", marginLeft: 10, fontFamily: "Oswald", fontWeight: 600, fontSize: 16, letterSpacing: 3, color: DIM, ...caps }}>{clip(handle, 18)}</div>
				</div>
				<div style={{ display: "flex", alignItems: "baseline" }}>
					<div style={{ display: "flex", marginRight: 10, fontFamily: "Oswald", fontWeight: 600, fontSize: 16, letterSpacing: 3, color: DIM, ...caps }}>The blogger</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 38, color: WHITE }}>{String(blogger)}</div>
				</div>
			</div>
			<div style={{ display: "flex", width: 640, height: 16, marginTop: 6, borderRadius: 8, backgroundColor: "#2a2d30", overflow: "hidden" }}>
				<div style={{ display: "flex", width: `${left}%`, height: 16, backgroundColor: yourColor, boxShadow: lead ? `0 0 18px ${rgba(HIT, 0.8)}` : "none" }} />
			</div>
		</div>
	)
}

function ChipTile({ chip }: { chip: LeagueChip }) {
	const color = chip.vs === "W" ? HIT : chip.vs === "L" ? MISS : SILVER
	const word = chip.vs === "W" ? "Beat" : chip.vs === "L" ? "Lost" : "Tied"
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 84, height: 70, marginRight: 8, borderRadius: 10, border: `2px solid ${color}`, backgroundColor: rgba(color, 0.1), boxShadow: chip.vs === "W" ? `0 0 16px ${rgba(HIT, 0.3)}` : "none" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 14, letterSpacing: 1, color: DIM, ...caps }}>{chip.opp ? `Wk ${chip.week} ${chip.opp}` : `Wk ${chip.week}`}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 27, lineHeight: 1.1, color, ...caps }}>{word}</div>
		</div>
	)
}

function RankCard({ rank, ranked }: { rank: number; ranked?: number | null }) {
	const tier = rank === 1 ? GOLD : rank === 2 ? BRIGHT : rank === 3 ? BRONZE : SILVER
	const top = rank <= 3
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 270, height: 380, border: `4px solid ${tier}`, borderRadius: 14, backgroundColor: PANEL, backgroundImage: `linear-gradient(180deg, ${rgba(tier, top ? 0.34 : 0.16)} 0%, rgba(17,18,20,0.96) 72%)`, boxShadow: `0 0 ${top ? 70 : 36}px ${rgba(tier, top ? 0.5 : 0.22)}, 0 24px 50px rgba(0,0,0,0.55)`, transform: "rotate(2deg)" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 22, letterSpacing: 7, color: tier }}>RANK</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: rank >= 100 ? 150 : 200, lineHeight: 1.05, color: WHITE }}>{String(rank)}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 26, letterSpacing: 4, color: tier, ...caps }}>{ranked ? `of ${ranked}` : ""}</div>
		</div>
	)
}

/** The challenge card's right side: the challenger's rank facing an empty "you" box. */
function FaceOff({ rank, ranked, points }: { rank: number | null; ranked?: number | null; points?: number | null }) {
	const top = (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 280, height: 184, paddingBottom: 30, border: `4px solid ${rank === 1 ? GOLD : BRIGHT}`, borderRadius: 14, backgroundImage: `linear-gradient(180deg, ${rgba(rank === 1 ? GOLD : SILVER, 0.28)} 0%, rgba(17,18,20,0.96) 80%)`, boxShadow: `0 0 50px ${rgba(rank === 1 ? GOLD : SILVER, 0.3)}` }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 20, letterSpacing: 7, color: SILVER }}>{rank !== null ? "RANK" : "NEW"}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: rank !== null && rank >= 100 ? 74 : 92, lineHeight: 1.05, color: WHITE }}>{rank !== null ? String(rank) : typeof points === "number" ? String(points) : "—"}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 20, letterSpacing: 4, color: SILVER, ...caps }}>{rank !== null ? (ranked ? `of ${ranked}` : "") : "Challenger"}</div>
		</div>
	)
	const you = (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 280, height: 160, paddingTop: 10, border: `4px dashed ${SILVER}`, borderRadius: 14, backgroundColor: "rgba(10,10,11,0.7)" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 20, letterSpacing: 7, color: DIM }}>YOU</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 92, lineHeight: 1.05, color: SILVER }}>?</div>
		</div>
	)
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
			{top}
			<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 74, height: 74, margin: "-20px 0 -20px 0", borderRadius: 37, backgroundImage: "linear-gradient(180deg, #f4f5f6 0%, #b9bfc4 100%)", boxShadow: "0 0 36px rgba(207,211,214,0.55)", fontFamily: "Anton", fontSize: 34, color: BG }}>VS</div>
			{you}
		</div>
	)
}

function LeaguePlayer({ spec }: { spec: LeagueCardSpec }) {
	const handle = clip(spec.handle ?? "", 16)
	const size = handle.length <= 8 ? 128 : handle.length <= 12 ? 104 : 80
	const graded = typeof spec.rank === "number"
	const vs = spec.vs
	const delta = spec.delta ?? null
	const chips = spec.chips ?? []
	const tag = delta === null ? "Picks are in. Waiting on the first final." : delta > 0 ? `${delta} ${delta === 1 ? "point" : "points"} ahead of the blogger` : delta < 0 ? `${-delta} ${delta === -1 ? "point" : "points"} behind the blogger` : "Dead even with the blogger"
	const tagColor = delta === null ? DIM : delta > 0 ? HIT : delta < 0 ? SILVER : BRIGHT
	const challenge = spec.challenge === true
	const duel = !challenge && typeof spec.points === "number" && typeof spec.bloggerPoints === "number" && spec.points + spec.bloggerPoints > 0
	const glow = challenge ? SILVER : delta !== null && delta > 0 ? HIT : SILVER
	return (
		<Frame glow={glow}>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "56px 10px 48px 72px" }}>
				<Eyebrow text={challenge ? "A challenge  ·  Beat the Blogger" : `Beat the Blogger  ·  ${spec.season}`} color={challenge ? BRIGHT : delta !== null && delta > 0 ? HIT : SILVER} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: 1.0, letterSpacing: 0.5, color: WHITE, textShadow: "0 0 44px rgba(207,211,214,0.25)", ...caps }}>{handle}</div>
					<div style={{ display: "flex", marginTop: 10, fontFamily: "Oswald", fontWeight: 600, fontSize: 26, letterSpacing: 3, color: challenge ? BRIGHT : tagColor, ...caps }}>{challenge ? "Think you can out-pick them?" : tag}</div>
					<div style={{ display: "flex", marginTop: 18 }}>
						{typeof spec.points === "number" && !duel ? <Stat label="Points" value={String(spec.points)} /> : <div style={{ display: "flex" }} />}
						{vs ? <Stat label="Vs the blogger" value={`${vs.w}-${vs.l}${vs.t > 0 ? `-${vs.t}` : ""}`} /> : <div style={{ display: "flex" }} />}
						{typeof spec.correct === "number" && typeof spec.games === "number" ? <Stat label="Winners right" value={`${spec.correct}/${spec.games}`} /> : <div style={{ display: "flex" }} />}
					</div>
					{challenge ? (
						<div style={{ display: "flex", marginTop: 26 }}>
							<Button text="Take them on" note="Free  ·  no email" />
						</div>
					) : (
						<div style={{ display: "flex", flexDirection: "column" }}>
							{duel ? <div style={{ display: "flex", marginTop: 18 }}><Duel you={spec.points as number} blogger={spec.bloggerPoints as number} handle={handle} /></div> : <div style={{ display: "flex" }} />}
							{chips.length > 0 ? <div style={{ display: "flex", marginTop: 18 }}>{chips.map((c, i) => <ChipTile key={`${c.week}-${i}`} chip={c} />)}</div> : <div style={{ display: "flex" }} />}
						</div>
					)}
				</div>
				<Brand />
			</div>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 360, padding: "0 56px 0 0" }}>
				{challenge ? <FaceOff rank={graded ? (spec.rank as number) : null} ranked={spec.ranked} points={spec.points} /> : graded ? <RankCard rank={spec.rank as number} ranked={spec.ranked} /> : <RRMark size={210} />}
			</div>
		</Frame>
	)
}

export function renderLeagueCard(spec: LeagueCardSpec): ReactElement {
	if (spec.handle) return <LeaguePlayer spec={spec} />
	return spec.kind === "board" ? <LeagueOwn spec={spec} /> : <LeagueInvite spec={spec} />
}
