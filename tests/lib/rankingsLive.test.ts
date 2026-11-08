import { describe, expect, it } from "vitest"

import { LIVE_POLL_MS, gameCardPath, gamePagePath, gameShareText, gamesByTeam, liveCount, minuteStamp, pollDelay, stripGames } from "../../lib/rankingsLive"
import type { LiveGameInfo } from "../../lib/live/types"

const NOW = Date.parse("2026-11-08T21:00:00Z")
const team = (abbr: string, name: string, score: number) => ({ abbr, name, score, record: null, espnId: null })
const game = (over: Partial<LiveGameInfo> & { id: string }): LiveGameInfo => ({
	state: "in",
	detail: "Q3 4:12",
	shortDetail: "Q3 4:12",
	period: 3,
	clockSeconds: 252,
	kickoff: new Date(NOW - 2 * 3600_000).toISOString(),
	home: team("KC", "Kansas City Chiefs", 17),
	away: team("BUF", "Buffalo Bills", 21),
	odds: null,
	venue: null,
	network: null,
	possession: null,
	situation: null,
	...over,
})

describe("gamesByTeam", () => {
	it("gives both teams the same game from their own side, with how each is doing", () => {
		const m = gamesByTeam([game({ id: "401" })], NOW)
		expect(m.BUF).toMatchObject({ gameId: "401", atHome: false, me: { abbr: "BUF", score: 21 }, opp: { abbr: "KC", score: 17 }, outcome: "winning", status: "Q3 4:12" })
		expect(m.KC).toMatchObject({ atHome: true, me: { score: 17 }, opp: { abbr: "BUF", score: 21 }, outcome: "losing" })
		expect(m.KC.href).toBe("/live?game=401")
	})

	it("calls a level game tied, and a finished one won, lost or tie", () => {
		expect(gamesByTeam([game({ id: "1", home: team("KC", "Kansas City Chiefs", 20), away: team("BUF", "Buffalo Bills", 20) })], NOW).KC.outcome).toBe("tied")
		const fin = gamesByTeam([game({ id: "2", state: "post", detail: "Final", shortDetail: "Final", period: 4, clockSeconds: 0 })], NOW)
		expect(fin.BUF.outcome).toBe("won")
		expect(fin.KC.outcome).toBe("lost")
		expect(fin.BUF.status).toBe("Final")
		expect(gamesByTeam([game({ id: "3", state: "post", period: 5, home: team("KC", "Kansas City Chiefs", 20), away: team("BUF", "Buffalo Bills", 20) })], NOW).KC).toMatchObject({ outcome: "tie", status: "Final/OT" })
	})

	it("has no outcome before kickoff", () => {
		const m = gamesByTeam([game({ id: "4", state: "pre", kickoff: new Date(NOW + 3600_000).toISOString(), home: team("KC", "Kansas City Chiefs", 0), away: team("BUF", "Buffalo Bills", 0) })], NOW)
		expect(m.BUF.outcome).toBeNull()
		expect(m.BUF.state).toBe("pre")
	})

	it("drops a final from last week and a game more than a week away", () => {
		const old = game({ id: "5", state: "post", kickoff: new Date(NOW - 6 * 24 * 3600_000).toISOString() })
		const far = game({ id: "6", state: "pre", kickoff: new Date(NOW + 9 * 24 * 3600_000).toISOString() })
		expect(gamesByTeam([old, far], NOW)).toEqual({})
	})

	it("copes with no games", () => {
		expect(gamesByTeam(null, NOW)).toEqual({})
		expect(gamesByTeam([], NOW)).toEqual({})
	})
})

describe("pollDelay", () => {
	it("polls every 20 seconds while a game is on, and counts the live games", () => {
		const games = [game({ id: "1" }), game({ id: "2", state: "post" })]
		expect(pollDelay(games, NOW)).toBe(LIVE_POLL_MS)
		expect(liveCount(games)).toBe(1)
	})

	it("stops when nothing is left to wait for", () => {
		expect(pollDelay([game({ id: "1", state: "post" })], NOW)).toBeNull()
		expect(pollDelay([], NOW)).toBeNull()
		expect(pollDelay(undefined, NOW)).toBeNull()
	})

	it("checks every minute in the hour before kickoff, and wakes up ahead of it otherwise", () => {
		const soon = game({ id: "1", state: "pre", kickoff: new Date(NOW + 20 * 60_000).toISOString() })
		expect(pollDelay([soon], NOW)).toBe(60_000)
		const later = game({ id: "2", state: "pre", kickoff: new Date(NOW + 5 * 3600_000).toISOString() })
		expect(pollDelay([later], NOW)).toBe(15 * 60_000)
		const nearer = game({ id: "3", state: "pre", kickoff: new Date(NOW + 70 * 60_000).toISOString() })
		expect(pollDelay([nearer], NOW)).toBe(10 * 60_000)
	})
})

describe("sharing", () => {
	const ranks = { BUF: 2, KC: 5 }
	it("puts the leader first, with both ranks", () => {
		const m = gamesByTeam([game({ id: "401" })], NOW)
		expect(gameShareText(m.KC, ranks)).toBe("Q3 4:12: No. 2 Bills 21, No. 5 Chiefs 17.")
		expect(gameShareText(m.BUF, ranks)).toBe("Q3 4:12: No. 2 Bills 21, No. 5 Chiefs 17.")
	})

	it("says Final, drops a rank the board doesn't have, and words a game that hasn't started", () => {
		const fin = gamesByTeam([game({ id: "2", state: "post" })], NOW)
		expect(gameShareText(fin.BUF, { BUF: 2 })).toBe("Final: No. 2 Bills 21, Chiefs 17.")
		const pre = gamesByTeam([game({ id: "3", state: "pre", shortDetail: "Sun 1:25 PM", detail: "Sun 1:25 PM", kickoff: new Date(NOW + 3600_000).toISOString(), home: team("KC", "Kansas City Chiefs", 0), away: team("BUF", "Buffalo Bills", 0) })], NOW)
		expect(gameShareText(pre.KC, ranks)).toMatch(/^No\. 2 Bills at No\. 5 Chiefs, /)
	})

	it("builds the page and card addresses, stamped by the minute", () => {
		expect(gamePagePath("401", 12)).toBe("/live?game=401&v=12")
		expect(gameCardPath("401", 12)).toBe("/api/og?type=live&game=401&v=12")
		expect(gameCardPath("401")).toBe("/api/og?type=live&game=401")
		expect(minuteStamp(60_000 * 7 + 5)).toBe(7)
	})
})

describe("stripGames", () => {
	it("orders live first, then finals (latest first), then upcoming (soonest first), and drops stale ones", () => {
		const live = game({ id: "L" })
		const fin1 = game({ id: "F1", state: "post", kickoff: new Date(NOW - 5 * 3600_000).toISOString() })
		const fin2 = game({ id: "F2", state: "post", kickoff: new Date(NOW - 26 * 3600_000).toISOString() })
		const soon = game({ id: "S1", state: "pre", kickoff: new Date(NOW + 2 * 3600_000).toISOString() })
		const later = game({ id: "S2", state: "pre", kickoff: new Date(NOW + 30 * 3600_000).toISOString() })
		const old = game({ id: "O", state: "post", kickoff: new Date(NOW - 8 * 24 * 3600_000).toISOString() })
		expect(stripGames([later, fin2, old, soon, fin1, live], NOW).map((g) => g.id)).toEqual(["L", "F1", "F2", "S1", "S2"])
		expect(stripGames(null, NOW)).toEqual([])
	})
})
