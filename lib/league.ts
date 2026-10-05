// Beat the Blogger: the reader league.
//
// Readers enter a final score for each game before kickoff. After the final,
// every entry (and my own pick) is scored with the same rules, so "did you beat
// the blogger" is a plain points comparison. Everything in this file is pure:
// no Sanity, no clock, no randomness. The API routes and pages feed it data.

import type { GamePrediction } from "./predictions"

/** Scoring rules. Max per game is winner + exact margin + exact score = 25. */
export const POINTS = {
	winner: 10,
	/** Margin error thresholds, checked in order: <= max earns pts. */
	margin: [
		{ max: 0, pts: 10 },
		{ max: 3, pts: 6 },
		{ max: 7, pts: 3 },
	],
	exactScore: 5,
} as const

export const MAX_POINTS_PER_GAME =
	POINTS.winner + POINTS.margin[0].pts + POINTS.exactScore

export const MAX_SCORE = 99

export type LeagueGame = Pick<
	GamePrediction,
	| "_id"
	| "week"
	| "awayTeam"
	| "homeTeam"
	| "kickoff"
	| "predictedAwayScore"
	| "predictedHomeScore"
	| "actualAwayScore"
	| "actualHomeScore"
>

/** A player as the site reads them. Never carries the key hash. */
export type LeaguePlayer = {
	handle: string
	/** Lower-cased handle: the identity used by picks. */
	lower: string
	joinedAt?: string | null
}

export type LeaguePick = {
	/** Lower-cased handle of the player who made the pick. */
	player: string
	predictionId: string
	awayScore: number
	homeScore: number
}

export type Score = {
	points: number
	winner: boolean
	marginError: number
	exact: boolean
}

type Scoreline = { away: number; home: number }

export function isGraded(g: Pick<LeagueGame, "actualAwayScore" | "actualHomeScore">): boolean {
	return typeof g.actualAwayScore === "number" && typeof g.actualHomeScore === "number"
}

/** Score one predicted scoreline against the real one. */
export function scorePrediction(pred: Scoreline, actual: Scoreline): Score {
	const predMargin = pred.home - pred.away
	const actualMargin = actual.home - actual.away
	const actualTie = actualMargin === 0
	const winner = !actualTie && predMargin !== 0 && Math.sign(predMargin) === Math.sign(actualMargin)
	const marginError = Math.abs(predMargin - actualMargin)
	const exact = pred.away === actual.away && pred.home === actual.home

	let points = winner ? POINTS.winner : 0
	for (const tier of POINTS.margin) {
		if (marginError <= tier.max) {
			points += tier.pts
			break
		}
	}
	if (exact) points += POINTS.exactScore

	return { points, winner, marginError, exact }
}

function actualOf(g: LeagueGame): Scoreline {
	return { away: g.actualAwayScore as number, home: g.actualHomeScore as number }
}

/** My pick, scored like everyone else's. Null until the game is final. */
export function bloggerScore(g: LeagueGame): Score | null {
	if (!isGraded(g)) return null
	return scorePrediction({ away: g.predictedAwayScore, home: g.predictedHomeScore }, actualOf(g))
}

export function scorePick(pick: Pick<LeaguePick, "awayScore" | "homeScore">, g: LeagueGame): Score | null {
	if (!isGraded(g)) return null
	return scorePrediction({ away: pick.awayScore, home: pick.homeScore }, actualOf(g))
}

export type VsBlogger = "W" | "L" | "T"

function compare(player: number, blogger: number): VsBlogger {
	return player > blogger ? "W" : player < blogger ? "L" : "T"
}

export type StandingRow = {
	rank: number
	handle: string
	lower: string
	points: number
	games: number
	correct: number
	exact: number
	/** Mean absolute margin error across graded entries, 1 decimal not applied. */
	avgMarginError: number
	/** Game-by-game record against the blogger. */
	vsBlogger: { w: number; l: number; t: number }
	/** The blogger's points on exactly the games this player entered. */
	bloggerPoints: number
	/** points - bloggerPoints. Positive means ahead of the blogger. */
	delta: number
}

export type StandingsOptions = {
	/** Limit to one week. */
	week?: number
}

function rankKey(r: StandingRow): string {
	return `${r.points}|${r.correct}|${r.avgMarginError.toFixed(6)}`
}

/**
 * Season (or single-week) standings. Only graded games count. Players with no
 * graded entry in scope are left out.
 *
 * Order: points, then correct winners, then lower average margin error, then
 * who joined first, then handle. Rows that tie on the first three share a rank.
 */
export function buildStandings(
	games: LeagueGame[],
	players: LeaguePlayer[],
	picks: LeaguePick[],
	opts: StandingsOptions = {}
): StandingRow[] {
	const graded = new Map<string, LeagueGame>()
	for (const g of games) {
		if (!isGraded(g)) continue
		if (opts.week !== undefined && g.week !== opts.week) continue
		graded.set(g._id, g)
	}

	// One pick per player per game; later entries win (the API replaces, so
	// duplicates shouldn't exist, but never double count if they do).
	const byPlayer = new Map<string, Map<string, LeaguePick>>()
	for (const p of picks) {
		if (!graded.has(p.predictionId)) continue
		let m = byPlayer.get(p.player)
		if (!m) byPlayer.set(p.player, (m = new Map()))
		m.set(p.predictionId, p)
	}

	const rows: (StandingRow & { joinedAt: string })[] = []
	for (const player of players) {
		const entries = byPlayer.get(player.lower)
		if (!entries || entries.size === 0) continue

		let points = 0
		let correct = 0
		let exact = 0
		let errSum = 0
		let bloggerPoints = 0
		const vs = { w: 0, l: 0, t: 0 }

		entries.forEach((pick, gameId) => {
			const g = graded.get(gameId) as LeagueGame
			const s = scorePick(pick, g) as Score
			const b = bloggerScore(g) as Score
			points += s.points
			bloggerPoints += b.points
			if (s.winner) correct++
			if (s.exact) exact++
			errSum += s.marginError
			const r = compare(s.points, b.points)
			if (r === "W") vs.w++
			else if (r === "L") vs.l++
			else vs.t++
		})

		rows.push({
			rank: 0,
			handle: player.handle,
			lower: player.lower,
			points,
			games: entries.size,
			correct,
			exact,
			avgMarginError: errSum / entries.size,
			vsBlogger: vs,
			bloggerPoints,
			delta: points - bloggerPoints,
			joinedAt: player.joinedAt ?? "",
		})
	}

	rows.sort(
		(a, b) =>
			b.points - a.points ||
			b.correct - a.correct ||
			a.avgMarginError - b.avgMarginError ||
			a.joinedAt.localeCompare(b.joinedAt) ||
			a.lower.localeCompare(b.lower)
	)

	let prevKey = ""
	let prevRank = 0
	rows.forEach((r, i) => {
		const key = rankKey(r)
		r.rank = key === prevKey ? prevRank : i + 1
		prevKey = key
		prevRank = r.rank
	})

	return rows.map(({ joinedAt: _j, ...r }) => r)
}

export type BloggerLine = {
	games: number
	points: number
	correct: number
	avgMarginError: number | null
}

/** My own season line, scored with the league rules, over every graded game. */
export function bloggerLine(games: LeagueGame[], week?: number): BloggerLine {
	let n = 0
	let points = 0
	let correct = 0
	let errSum = 0
	for (const g of games) {
		if (week !== undefined && g.week !== week) continue
		const s = bloggerScore(g)
		if (!s) continue
		n++
		points += s.points
		if (s.winner) correct++
		errSum += s.marginError
	}
	return { games: n, points, correct, avgMarginError: n > 0 ? errSum / n : null }
}

export type WeekSummary = {
	week: number
	entrants: number
	/** Players whose week total beat mine, tied mine, and fell short. */
	beat: number
	tied: number
	lost: number
	bloggerPoints: number
	topPoints: number | null
}

/** Weeks that have at least one graded game, ascending. */
export function gradedWeeks(games: LeagueGame[]): number[] {
	return Array.from(new Set(games.filter(isGraded).map((g) => g.week))).sort((a, b) => a - b)
}

/** How the readers did against me in one week. Player totals include only games they entered. */
export function weekSummary(games: LeagueGame[], players: LeaguePlayer[], picks: LeaguePick[], week: number): WeekSummary {
	const rows = buildStandings(games, players, picks, { week })
	let beat = 0
	let tied = 0
	let lost = 0
	for (const r of rows) {
		if (r.delta > 0) beat++
		else if (r.delta === 0) tied++
		else lost++
	}
	return {
		week,
		entrants: rows.length,
		beat,
		tied,
		lost,
		bloggerPoints: bloggerLine(games, week).points,
		topPoints: rows.length > 0 ? rows[0].points : null,
	}
}

export type HistoryRow = {
	game: LeagueGame
	pick: LeaguePick
	score: Score
	blogger: Score
	vs: VsBlogger
}

export type Profile = {
	player: LeaguePlayer
	/** Season row, with the player's overall rank. Null before their first graded game. */
	row: StandingRow | null
	/** Total players with at least one graded entry. */
	ranked: number
	/** Newest first. Graded games only: open picks stay private. */
	history: HistoryRow[]
	/** Entries on games that haven't been graded yet. A count, never the picks. */
	pending: number
}

export function findPlayer(players: LeaguePlayer[], handle: string): LeaguePlayer | null {
	const lower = handle.trim().toLowerCase()
	return players.find((p) => p.lower === lower) ?? null
}

export function buildProfile(games: LeagueGame[], players: LeaguePlayer[], picks: LeaguePick[], handle: string): Profile | null {
	const player = findPlayer(players, handle)
	if (!player) return null

	const standings = buildStandings(games, players, picks)
	const row = standings.find((r) => r.lower === player.lower) ?? null

	const byId = new Map(games.map((g) => [g._id, g]))
	const history: HistoryRow[] = []
	let pending = 0
	const seen = new Set<string>()
	for (const pick of picks) {
		if (pick.player !== player.lower || seen.has(pick.predictionId)) continue
		seen.add(pick.predictionId)
		const g = byId.get(pick.predictionId)
		if (!g) continue
		if (!isGraded(g)) {
			pending++
			continue
		}
		const score = scorePick(pick, g) as Score
		const blogger = bloggerScore(g) as Score
		history.push({ game: g, pick, score, blogger, vs: compare(score.points, blogger.points) })
	}
	history.sort((a, b) => b.game.week - a.game.week || b.game.kickoff.localeCompare(a.game.kickoff))

	return { player, row, ranked: standings.length, history, pending }
}

// --- entering picks -------------------------------------------------------

export type OpenGame = Pick<LeagueGame, "_id" | "week" | "awayTeam" | "homeTeam" | "kickoff">

/** Games a reader can still pick: not graded, kickoff in the future. Soonest first. */
export function openGames(games: LeagueGame[], nowMs: number): OpenGame[] {
	return games
		.filter((g) => !isGraded(g) && new Date(g.kickoff).getTime() > nowMs)
		.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
		.map(({ _id, week, awayTeam, homeTeam, kickoff }) => ({ _id, week, awayTeam, homeTeam, kickoff }))
}

export type PickValidation =
	| { ok: true; awayScore: number; homeScore: number }
	| { ok: false; status: number; message: string }

function isScore(n: unknown): n is number {
	return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE
}

/** Check a submitted scoreline against the game it's for. */
export function validatePick(
	input: { awayScore?: unknown; homeScore?: unknown },
	game: Pick<LeagueGame, "kickoff" | "actualAwayScore" | "actualHomeScore"> | null,
	nowMs: number
): PickValidation {
	if (!game) return { ok: false, status: 404, message: "Game not found" }
	if (isGraded(game) || nowMs >= new Date(game.kickoff).getTime()) {
		return { ok: false, status: 409, message: "Picks are closed for this game" }
	}
	if (!isScore(input.awayScore) || !isScore(input.homeScore)) {
		return { ok: false, status: 400, message: `Scores must be whole numbers from 0 to ${MAX_SCORE}` }
	}
	if (input.awayScore === input.homeScore) {
		return { ok: false, status: 400, message: "Pick a winner: the scores can't be tied" }
	}
	return { ok: true, awayScore: input.awayScore, homeScore: input.homeScore }
}

// --- handles --------------------------------------------------------------

export const HANDLE_RE = /^[A-Za-z0-9_]{3,16}$/

/**
 * A player's personal invite link. The page shows who is challenging, the share card is built around
 * their numbers, and the utm tags credit the sign-up to that player (first touch wins, so a friend who
 * joins from this link is recorded as coming from it). These links are shared off the site, so tagging
 * them is right; links inside the site stay untagged.
 */
export function challengeUrl(origin: string, handle: string): string {
	const h = encodeURIComponent(handle)
	return `${origin}/league?challenge=${h}&utm_source=challenge&utm_medium=player&utm_campaign=${h.toLowerCase()}`
}

const RESERVED = new Set([
	"admin",
	"administrator",
	"moderator",
	"mod",
	"staff",
	"support",
	"system",
	"official",
	"league",
	"blogger",
	"theblogger",
	"hunter",
	"hunter_macias",
	"raiders",
	"raidersrundown",
	"rundown",
	"me",
	"you",
	"null",
	"undefined",
	"anonymous",
])

// A short list of unambiguous words. Anything it misses gets banned from
// Studio; this only stops the obvious ones from ever appearing on the board.
const BLOCKED = ["fuck", "shit", "cunt", "nigg", "fagg", "bitch", "whore", "slut", "rape", "nazi", "hitler", "kkk", "retard", "pussy"]

function squash(handle: string): string {
	return handle
		.toLowerCase()
		.replace(/[_]/g, "")
		.replace(/0/g, "o")
		.replace(/[1!|]/g, "i")
		.replace(/3/g, "e")
		.replace(/4/g, "a")
		.replace(/5/g, "s")
		.replace(/7/g, "t")
		.replace(/\$/g, "s")
}

export type HandleResult = { ok: true; handle: string; lower: string } | { ok: false; message: string }

export function parseHandle(raw: unknown): HandleResult {
	if (typeof raw !== "string") return { ok: false, message: "Pick a handle" }
	const handle = raw.trim()
	if (!HANDLE_RE.test(handle)) {
		return { ok: false, message: "Handles are 3 to 16 letters, numbers or underscores" }
	}
	const lower = handle.toLowerCase()
	if (RESERVED.has(lower)) return { ok: false, message: "That handle is reserved" }
	const squashed = squash(handle)
	if (BLOCKED.some((w) => squashed.includes(w))) return { ok: false, message: "Pick a different handle" }
	return { ok: true, handle, lower }
}

/** Ids for the two private document types. A dot in an id keeps a document out of the public dataset. */
export const playerId = (lower: string) => `leaguePlayer.${lower}`
export const pickId = (lower: string, predictionId: string) => `leaguePick.${lower}.${predictionId}`

/** The GROQ the pages share. Players are read without their key hash. */
export const LEAGUE_QUERY = `{
	"games": *[_type == 'gamePrediction' && season == $season && !(_id in path('drafts.**'))] | order(kickoff asc) {
		_id, week, awayTeam, homeTeam, kickoff,
		predictedAwayScore, predictedHomeScore,
		actualAwayScore, actualHomeScore
	},
	"players": *[_type == 'leaguePlayer' && !(_id in path('drafts.**')) && banned != true] {
		handle, "lower": handleLower, "joinedAt": _createdAt
	},
	"picks": *[_type == 'leaguePick' && season == $season && !(_id in path('drafts.**'))] {
		player, predictionId, awayScore, homeScore
	}
}`

export type LeagueData = {
	games: LeagueGame[]
	players: LeaguePlayer[]
	picks: LeaguePick[]
}

/** Query results can contain nulls; normalise to arrays. */
export function normalizeLeagueData(raw: Partial<Record<keyof LeagueData, unknown>> | null | undefined): LeagueData {
	const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
	return {
		games: arr<LeagueGame>(raw?.games),
		players: arr<LeaguePlayer>(raw?.players).filter((p) => p && typeof p.handle === "string" && typeof p.lower === "string"),
		picks: arr<LeaguePick>(raw?.picks),
	}
}

// --- display helpers ------------------------------------------------------

/** "+12", "-3", "0". A real minus sign would break copy/paste; keep ASCII. */
export function signed(n: number): string {
	return n > 0 ? `+${n}` : String(n)
}

/** One decimal, or an en dash when there's nothing to average. */
export function oneDecimal(n: number | null | undefined): string {
	return typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : "–"
}

/** "5–3–1", dropping the ties when there are none. */
export function recordText(r: { w: number; l: number; t: number }): string {
	return r.t > 0 ? `${r.w}–${r.l}–${r.t}` : `${r.w}–${r.l}`
}

/** Players who've beaten the blogger on the games they entered (season scope). */
export function aheadOfBlogger(rows: StandingRow[]): number {
	return rows.filter((r) => r.delta > 0).length
}
