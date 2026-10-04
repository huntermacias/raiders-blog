// Fetches ESPN's public feeds on the server and caches them. Nothing here runs in the browser: the
// page asks our own API routes, which ask this.

import { cached } from "./cache"
import { parseScoreboard, parseSummary } from "./espn"
import type { LiveGame, LiveGameInfo } from "./types"

// LIVE_FEED_BASE lets a test or a local stand-in replace ESPN.
const BASE = process.env.LIVE_FEED_BASE || "https://site.api.espn.com/apis/site/v2/sports/football/nfl"

async function getJson(url: string): Promise<unknown> {
	const ctl = new AbortController()
	const timer = setTimeout(() => ctl.abort(), 6000)
	try {
		const res = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } })
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
