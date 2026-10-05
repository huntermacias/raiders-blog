// Fetches ESPN's public feeds on the server and caches them. Nothing here runs in the browser: the
// page asks our own API routes, which ask this.

import { cached } from "./cache"
import { parseScoreboard, parseSummary } from "./espn"
import { parseGameStats, type AutoStats } from "./gamestats"
import { type RecordsByTeam, overlayRecords, parseStandings } from "./standings"
import type { FinalGame } from "../math/elo"
import { type FinalsGame, candidates, mergeFinals } from "./finals"
import { teamInfo } from "@/lib/nfl"
import { SEASON } from "@/lib/predictions"
import type { LiveGame, LiveGameInfo } from "./types"

// LIVE_FEED_BASE lets a test or a local stand-in replace ESPN.
const BASE = process.env.LIVE_FEED_BASE || "https://site.api.espn.com/apis/site/v2/sports/football/nfl"

async function getJson(url: string, timeoutMs = 6000): Promise<unknown> {
	const ctl = new AbortController()
	const timer = setTimeout(() => ctl.abort(), timeoutMs)
	try {
		// no-store: Next 13.2.1 would otherwise keep a token-free server fetch for a year.
		const res = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: { accept: "application/json" } })
		if (!res.ok) throw new Error(`ESPN responded ${res.status}`)
		return await res.json()
	} finally {
		clearTimeout(timer)
	}
}

/** Seconds a game's data may be reused for: short while it is being played, long once it is over. */
export function ttlFor(state: LiveGameInfo["state"] | null): number {
	return state === "in" ? 6_000 : state === "post" ? 300_000 : 60_000
}

export async function getScoreboard() {
	return cached("scoreboard", 8_000, async () => parseScoreboard(await getJson(`${BASE}/scoreboard`)))
}

export type GameResult = { game: LiveGame; stale: boolean; at: number }

/** One game's drives, stats and info, or null when the id isn't on this week's scoreboard. */
export async function getGame(id: string): Promise<GameResult | null> {
	if (!/^\d{6,12}$/.test(id)) return null
	const board = await getScoreboard()
	const info = board.value.find((g) => g.id === id)
	if (!info) return null
	const res = await cached(`game:${id}:${info.state}`, ttlFor(info.state), async () => parseSummary(await getJson(`${BASE}/summary?event=${id}`), info))
	// The scoreboard is fresher than a cached summary, so always show its score and clock.
	return { game: { ...res.value, info }, stale: res.stale || board.stale, at: res.at }
}

/** The game the page should lead with: the Raiders' if they are this week's, else a live one, else the next. */
export function featuredGame(games: LiveGameInfo[], team = "LV"): LiveGameInfo | null {
	const mine = games.find((g) => g.home.abbr === team || g.away.abbr === team)
	if (mine) return mine
	return games.find((g) => g.state === "in") ?? games.find((g) => g.state === "pre") ?? games[games.length - 1] ?? null
}

const DAY = 86_400_000
/** ESPN's scoreboard dates are US Eastern days ("20261004"), whatever the UTC date of the kickoff. */
const etDay = (ms: number) =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms).replace(/-/g, "")

// ESPN's scoreboard ignores a `dates=from-to` range here (it answers with no games), so every lookup is
// a single day or a single week, each cached for a minute.
async function scoreboardQuery(query: string, timeoutMs: number) {
	const res = await cached(`sb:${query}`, 60_000, async () => parseScoreboard(await getJson(`${BASE}/scoreboard?${query}`, timeoutMs)))
	return res.value
}

/** ESPN's event id for the Raiders game on (or a day either side of) `gameDate`, against `opponent`. */
export async function findRaidersEvent(opponent: string | null | undefined, gameDate: string | null | undefined): Promise<string | null> {
	const t = gameDate ? Date.parse(gameDate) : NaN
	if (!Number.isFinite(t)) return null
	const abbr = teamInfo(opponent).abbr
	for (const day of [etDay(t), etDay(t - DAY), etDay(t + DAY)]) {
		const games = await scoreboardQuery(`dates=${day}&limit=100`, 4000)
		const hit = games.find((g) => [g.home.abbr, g.away.abbr].includes("LV") && [g.home.abbr, g.away.abbr].includes(abbr))
		if (hit) return hit.id
	}
	return null
}

/**
 * ESPN's box score for a finished Raiders game, ready to merge into a game report. Never throws and
 * never returns half a game: if the feed is down, slow, or the game isn't final, it is null and the
 * report just shows what the writer typed.
 */
export async function getReportStats(game: { opponent?: string | null; gameDate?: string | null; espnGameId?: string | null }): Promise<AutoStats | null> {
	try {
		const id = game.espnGameId?.trim() || (await findRaidersEvent(game.opponent, game.gameDate))
		if (!id || !/^\d{6,12}$/.test(id)) return null
		const res = await cached(`reportstats:${id}`, 120_000, async () => parseGameStats(await getJson(`${BASE}/summary?event=${id}`, 4000)))
		return res.value ? { ...res.value, espnId: id } : null
	} catch {
		return null
	}
}

let finalsFailedAt = 0

/**
 * `games` with ESPN's final scores and kickoff times laid over any the writer hasn't entered (see
 * finals.ts). Never throws and never waits long: if ESPN is slow or down the games come back exactly as
 * they were, and it won't be asked again for 30 seconds.
 */
export async function withEspnFinals<T extends FinalsGame>(games: T[], now: number = Date.now()): Promise<T[]> {
	const open = candidates(games, now)
	if (open.length === 0 || now - finalsFailedAt < 30_000) return games

	// One request per regular-season week the open games belong to; a game with no week is looked up by its day.
	const queries = new Set<string>()
	for (const g of open) {
		const w = g.week
		if (typeof w === "number" && Number.isInteger(w) && w >= 1 && w <= 18) queries.add(`dates=${SEASON}&seasontype=2&week=${w}&limit=100`)
		else queries.add(`dates=${etDay(Date.parse(g.kickoff))}&limit=100`)
	}
	const results = await Promise.allSettled(Array.from(queries).map((q) => scoreboardQuery(q, 1500)))
	const events = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
	if (results.every((r) => r.status === "rejected")) {
		finalsFailedAt = now
		return games
	}
	return mergeFinals(games, events, now)
}

// Standings are at /apis/v2, not the /apis/site/v2 base the scoreboard uses. LIVE_FEED_BASE swaps both.
const STANDINGS_URL = process.env.LIVE_FEED_BASE ? `${process.env.LIVE_FEED_BASE}/standings` : "https://site.api.espn.com/apis/v2/sports/football/nfl/standings"
let recordsFailedAt = 0

/** Every team's record from ESPN, or {} if the feed is down or slow (callers then keep what was typed). */
export async function getRecords(now: number = Date.now()): Promise<RecordsByTeam> {
	if (now - recordsFailedAt < 30_000) return {}
	try {
		const res = await cached(`standings:${SEASON}`, 300_000, async () => parseStandings(await getJson(`${STANDINGS_URL}?season=${SEASON}`, 2000)))
		return res.value
	} catch {
		recordsFailedAt = now
		return {}
	}
}

/** `teams` (season-prediction rows) with ESPN's records laid over their typed wins, losses and ties. */
export async function withEspnRecords<T extends { team: string; wins?: number | null; losses?: number | null; ties?: number | null }>(teams: T[] | null | undefined): Promise<T[]> {
	const rows = teams ?? []
	if (rows.length === 0) return rows
	return overlayRecords(rows, await getRecords())
}

/**
 * Every finished regular-season game from week 1 through `throughWeek`, for the Elo ratings. One scoreboard
 * request per week, each cached for ten minutes. Returns null if any week can't be read: ratings built on
 * a partial season would quietly mislead.
 */
export async function getSeasonResults(throughWeek: number): Promise<FinalGame[] | null> {
	const last = Math.min(18, Math.floor(throughWeek))
	if (!(last >= 1)) return null
	try {
		const weeks = await Promise.all(
			Array.from({ length: last }, (_, i) => i + 1).map(async (week) => {
				const res = await cached(`results:${SEASON}:${week}`, 600_000, async () => parseScoreboard(await getJson(`${BASE}/scoreboard?dates=${SEASON}&seasontype=2&week=${week}&limit=100`, 3000)))
				return res.value
					.filter((g) => g.state === "post")
					.map((g): FinalGame => ({ week, home: g.home.abbr, away: g.away.abbr, homeScore: g.home.score, awayScore: g.away.score }))
			})
		)
		return weeks.flat()
	} catch {
		return null
	}
}
