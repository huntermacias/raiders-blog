// The share cards for the Beat the Blogger league (1200x630). Two looks:
//
//   the league's own card: the big title on the left and, on the right, the leaderboard as it stands
//   with the blogger sitting in it among the players, so a link to /league shows who is ahead of me.
//
//   a player's card: their handle, rank and numbers, and a chip for every graded game saying whether
//   they beat me, lost to me or tied me that week.
//
// buildLeagueSpec turns the league's data into a small plain spec and renderLeagueCard turns the spec
// into JSX, so both are testable without Sanity or a network. Satori only understands a flexbox subset
// of CSS, so styling is inline and every element with more than one child is display:flex.

import type { ReactElement } from "react"

import { HANDLE_RE, type LeagueData, bloggerLine, buildProfile, buildStandings, gradedWeeks } from "../league"

const W = 1200
const H = 630

const BG = "#0a0a0b"
const PANEL = "#111214"
const WHITE = "#e6e7e9"
const SILVER = "#a7aeb3"
const BRIGHT = "#cfd3d6"
const DIM = "#80868b"
const LINE = "#2b2d30"
const HIT = "#4ade80"
const MISS = "#fb7185"

const caps = { textTransform: "uppercase" as const }

// ---- spec ------------------------------------------------------------------------------------

export type LeagueBoardRow = {
	/** The player's rank, or null for the blogger's own line. */
	rank: number | null
	handle: string
	points: number
	blogger: boolean
}

export type LeagueChip = { week: number; vs: "W" | "L" | "T" }

export type LeagueCardSpec = {
	type: "league"
	season: number
	/** Set for a player's card; absent for the league's own card. */
	handle?: string | null
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
}

const BOARD_PLAYERS = 5
const BOARD_ROWS = 6
const MAX_CHIPS = 8

/** The card's spec for the league, or for one player when `handle` is given. Null for a handle that isn't a player. */
export function buildLeagueSpec(data: LeagueData, season: number, handle?: string | null): LeagueCardSpec | null {
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
		return { type: "league", season, players: data.players.length, week, board: board.slice(0, BOARD_ROWS) }
	}

	if (!HANDLE_RE.test(handle)) return null
	const profile = buildProfile(data.games, data.players, data.picks, handle)
	if (!profile) return null
	const { player, row, ranked, history } = profile
	const chips: LeagueChip[] = history
		.slice()
		.reverse()
		.map((h) => ({ week: h.game.week, vs: h.vs }))
		.slice(-MAX_CHIPS)
	return {
		type: "league",
		season,
		handle: player.handle,
		rank: row?.rank ?? null,
		ranked,
		points: row?.points ?? null,
		vs: row?.vsBlogger ?? null,
		week,
		games: row?.games ?? null,
		correct: row?.correct ?? null,
		avgMiss: row ? row.avgMarginError : null,
		delta: row?.delta ?? null,
		chips,
	}
}

// ---- pieces ----------------------------------------------------------------------------------

function clip(text: string, max: number): string {
	const t = text.replace(/\s+/g, " ").trim()
	return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function RRMark({ size, color = SILVER }: { size: number; color?: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
				border: `${Math.max(2, Math.round(size / 40))}px solid ${color}`,
				fontFamily: "Anton",
				fontSize: size * 0.56,
				color: WHITE,
				letterSpacing: 1,
			}}
		>
			RR
		</div>
	)
}

function Brand() {
	return (
		<div style={{ display: "flex", alignItems: "center" }}>
			<RRMark size={44} />
			<div style={{ display: "flex", marginLeft: 18, fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 5, color: SILVER, ...caps }}>raidersrundown.com</div>
		</div>
	)
}

function Eyebrow({ text }: { text: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 24, letterSpacing: 6, color: DIM, ...caps }}>{text}</div>
			<div style={{ display: "flex", width: 84, height: 3, marginTop: 14, backgroundColor: SILVER }} />
		</div>
	)
}

/** A diagonal-lined field behind the right side, faint enough to read as texture. */
function Hatch() {
	const lines: ReactElement[] = []
	for (let i = -12; i < 22; i++) {
		lines.push(<line key={i} x1={i * 60} y1={H} x2={i * 60 + H} y2={0} stroke="#ffffff" strokeOpacity={0.035} strokeWidth={2} />)
	}
	return (
		<svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
			{lines}
		</svg>
	)
}

function Frame({ children }: { children: ReactElement | ReactElement[] }) {
	return (
		<div
			style={{
				display: "flex",
				position: "relative",
				width: W,
				height: H,
				backgroundColor: BG,
				backgroundImage: "radial-gradient(circle at 16% 8%, #1a1c1e 0%, #0a0a0b 60%)",
				color: WHITE,
			}}
		>
			<Hatch />
			<div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: W, height: 6, backgroundImage: "linear-gradient(90deg, #cfd3d6 0%, #6f777c 55%, #0a0a0b 100%)" }} />
			{children}
		</div>
	)
}

// ---- the league's own card -------------------------------------------------------------------

function BoardRow({ row, max, beatenBlogger, first }: { row: LeagueBoardRow; max: number; beatenBlogger: boolean; first: boolean }) {
	const frac = Math.max(0.03, row.points / max)
	const barColor = row.blogger ? WHITE : beatenBlogger ? HIT : SILVER
	return (
		<div style={{ display: "flex", alignItems: "center", height: 62, paddingLeft: 4, ...(row.blogger ? { backgroundColor: "#1a1b1e", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` } : {}) }}>
			<div style={{ display: "flex", width: 46, justifyContent: "center", alignItems: "center" }}>
				{row.blogger ? <RRMark size={34} color={WHITE} /> : <div style={{ display: "flex", fontFamily: "Anton", fontSize: 40, color: first ? WHITE : SILVER }}>{row.rank}</div>}
			</div>
			<div style={{ display: "flex", width: 236, marginLeft: 8, fontFamily: "Oswald", fontWeight: 600, fontSize: 24, letterSpacing: 1, color: row.blogger ? WHITE : first ? WHITE : BRIGHT, ...caps }}>
				{clip(row.handle, 16)}
			</div>
			<div style={{ display: "flex", flex: 1, height: 14, backgroundColor: LINE, borderRadius: 7, marginRight: 16 }}>
				<div style={{ display: "flex", width: `${Math.round(frac * 100)}%`, height: 14, borderRadius: 7, backgroundColor: barColor }} />
			</div>
			<div style={{ display: "flex", width: 64, justifyContent: "flex-end", paddingRight: 16, fontFamily: "Anton", fontSize: 34, color: row.blogger ? WHITE : first ? WHITE : BRIGHT }}>{row.points}</div>
		</div>
	)
}

function GhostRow({ n }: { n: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", height: 62, paddingLeft: 4 }}>
			<div style={{ display: "flex", width: 46, justifyContent: "center", fontFamily: "Anton", fontSize: 40, color: LINE }}>{n}</div>
			<div style={{ display: "flex", width: 236, marginLeft: 8, fontFamily: "Oswald", fontWeight: 600, fontSize: 24, letterSpacing: 1, color: "#3a3d41", ...caps }}>
				{n === 1 ? "You?" : "Open"}
			</div>
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
	return (
		<Frame>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "58px 20px 50px 72px" }}>
				<Eyebrow text={`Beat the Blogger  ·  ${spec.season}`} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 150, lineHeight: 0.98, color: WHITE, ...caps }}>Beat the</div>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: 150, lineHeight: 0.98, color: SILVER, ...caps }}>Blogger</div>
					<div style={{ display: "flex", marginTop: 22, fontFamily: "Oswald", fontWeight: 600, fontSize: 27, letterSpacing: 3, color: BRIGHT, ...caps }}>Pick the score. Climb the board.</div>
					<div style={{ display: "flex", marginTop: 14, fontFamily: "Oswald", fontWeight: 500, fontSize: 22, letterSpacing: 4, color: DIM, ...caps }}>
						{players ? `${players} ${players === 1 ? "player" : "players"}  ·  free  ·  no email` : "Free  ·  no email  ·  new picks every week"}
					</div>
				</div>
				<Brand />
			</div>

			<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: "44px 64px 44px 12px" }}>
				<div style={{ display: "flex", flexDirection: "column", backgroundColor: PANEL, border: `2px solid ${LINE}`, borderRadius: 20, padding: "22px 20px 18px 20px" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 12px 12px 12px", borderBottom: `1px solid ${LINE}` }}>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 20, letterSpacing: 5, color: SILVER, ...caps }}>Leaderboard</div>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 18, letterSpacing: 4, color: DIM, ...caps }}>
							{live ? (spec.week ? `Through week ${spec.week}` : "This season") : "Opens after week 1"}
						</div>
					</div>
					<div style={{ display: "flex", flexDirection: "column", paddingTop: 8 }}>
						{live ? (
							board.map((r, i) => <BoardRow key={`${r.handle}-${i}`} row={r} max={max} first={!r.blogger && r.rank === 1} beatenBlogger={bloggerPts !== null && r.points > bloggerPts} />)
						) : (
							[1, 2, 3, 4, 5].map((n) => <GhostRow key={n} n={n} />)
						)}
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

// ---- a player's card -------------------------------------------------------------------------

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", marginRight: 46 }}>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 56, lineHeight: 1.05, color: tint ?? WHITE }}>{value}</div>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 19, letterSpacing: 4, color: DIM, ...caps }}>{label}</div>
		</div>
	)
}

function ChipTile({ chip }: { chip: LeagueChip }) {
	const color = chip.vs === "W" ? HIT : chip.vs === "L" ? MISS : SILVER
	const word = chip.vs === "W" ? "Beat" : chip.vs === "L" ? "Lost" : "Tied"
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				width: 74,
				height: 74,
				marginRight: 10,
				borderRadius: 12,
				border: `2px solid ${color}`,
				backgroundColor: PANEL,
			}}
		>
			<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 500, fontSize: 16, letterSpacing: 2, color: DIM }}>{`WK ${chip.week}`}</div>
			<div style={{ display: "flex", fontFamily: "Anton", fontSize: 26, lineHeight: 1.1, color, ...caps }}>{word}</div>
		</div>
	)
}

function LeaguePlayer({ spec }: { spec: LeagueCardSpec }) {
	const handle = clip(spec.handle ?? "", 16)
	const size = handle.length <= 8 ? 132 : handle.length <= 12 ? 106 : 82
	const graded = typeof spec.rank === "number"
	const vs = spec.vs
	const delta = spec.delta ?? null
	const chips = spec.chips ?? []
	const tag =
		delta === null ? "Picks are in. Waiting on the first final." : delta > 0 ? `${delta} ${delta === 1 ? "point" : "points"} ahead of the blogger` : delta < 0 ? `${-delta} ${delta === -1 ? "point" : "points"} behind the blogger` : "Dead even with the blogger"
	const tagColor = delta === null ? DIM : delta > 0 ? HIT : delta < 0 ? SILVER : BRIGHT
	const top = graded && (spec.rank as number) <= 3
	return (
		<Frame>
			<div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "58px 20px 50px 72px" }}>
				<Eyebrow text={`Beat the Blogger  ·  ${spec.season}`} />
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex", fontFamily: "Anton", fontSize: size, lineHeight: 1.0, letterSpacing: 0.5, color: WHITE, ...caps }}>{handle}</div>
					<div style={{ display: "flex", marginTop: 12, fontFamily: "Oswald", fontWeight: 600, fontSize: 26, letterSpacing: 3, color: tagColor, ...caps }}>{tag}</div>
					<div style={{ display: "flex", marginTop: 26 }}>
						{typeof spec.points === "number" ? <Stat label="Points" value={String(spec.points)} /> : <div style={{ display: "flex" }} />}
						{vs ? <Stat label="Vs the blogger" value={`${vs.w}-${vs.l}${vs.t > 0 ? `-${vs.t}` : ""}`} /> : <div style={{ display: "flex" }} />}
						{typeof spec.correct === "number" && typeof spec.games === "number" ? <Stat label="Winners right" value={`${spec.correct}/${spec.games}`} /> : <div style={{ display: "flex" }} />}
					</div>
					{chips.length > 0 ? <div style={{ display: "flex", marginTop: 22 }}>{chips.map((c, i) => <ChipTile key={`${c.week}-${i}`} chip={c} />)}</div> : <div style={{ display: "flex" }} />}
				</div>
				<Brand />
			</div>

			<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 330, padding: "0 56px 0 0" }}>
				{graded ? (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							width: 270,
							height: 360,
							border: `4px solid ${top ? BRIGHT : SILVER}`,
							borderRadius: 6,
							backgroundColor: PANEL,
							...(top ? { backgroundImage: "linear-gradient(180deg, #2a2d30 0%, #111214 70%)" } : {}),
						}}
					>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 600, fontSize: 22, letterSpacing: 6, color: DIM }}>RANK</div>
						<div style={{ display: "flex", fontFamily: "Anton", fontSize: (spec.rank as number) >= 100 ? 150 : 190, lineHeight: 1.05, color: WHITE }}>{spec.rank}</div>
						<div style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: 26, letterSpacing: 4, color: SILVER, ...caps }}>{spec.ranked ? `of ${spec.ranked}` : ""}</div>
					</div>
				) : (
					<RRMark size={210} />
				)}
			</div>
		</Frame>
	)
}

export function renderLeagueCard(spec: LeagueCardSpec): ReactElement {
	return spec.handle ? <LeaguePlayer spec={spec} /> : <LeagueOwn spec={spec} />
}
