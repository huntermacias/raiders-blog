// Fetches ESPN's public feeds on the server and caches them. Nothing here runs in the browser: the
// page asks our own API routes, which ask this.

import { cached } from "./cache"
import { parseScoreboard, parseSummary } from "./espn"
import { parseGameStats, type AutoStats } from "./gamestats"
import { teamInfo } from "@/lib/nfl"
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
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "")

/** ESPN's event id for the Raiders game on (or a day either side of) `gameDate`, against `opponent`. */
export async function findRaidersEvent(opponent: string | null | undefined, gameDate: string | null | undefined): Promise<string | null> {
	const t = gameDate ? Date.parse(gameDate) : NaN
	if (!Number.isFinite(t)) return null
	const abbr = teamInfo(opponent).abbr
	const res = await cached(`window:${ymd(t - DAY)}`, 600_000, async () => parseScoreboard(await getJson(`${BASE}/scoreboard?dates=${ymd(t - DAY)}-${ymd(t + DAY)}&limit=100`, 4000)))
	const hit = res.value.find((g) => [g.home.abbr, g.away.abbr].includes("LV") && [g.home.abbr, g.away.abbr].includes(abbr))
	return hit?.id ?? null
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
