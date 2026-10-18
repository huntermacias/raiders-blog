import { beforeEach, describe, expect, it, vi } from "vitest"

import { clearCache } from "../../lib/live/cache"
import { overlayRecords, parseStandings, recordsAsOf } from "../../lib/live/standings"
import type { SeasonGame } from "../../lib/math/season"
import { TEAMS } from "../../lib/nfl"

const entry = (abbr: string, w: number, l: number, t = 0) => ({ team: { abbreviation: abbr }, stats: [{ name: "losses", value: l }, { name: "ties", value: t }, { name: "wins", value: w }, { name: "gamesPlayed", value: w + l + t }] })
// ESPN nests conferences, then divisions (or lists entries directly under a conference).
const league = (patch: Record<string, [number, number, number?]> = {}) => {
	const all = TEAMS.map((t) => {
		const p = patch[t.abbr] ?? [1, 1]
		return entry(t.abbr === "WAS" ? "WSH" : t.abbr, p[0], p[1], p[2] ?? 0)
	})
	return { children: [{ children: [{ standings: { entries: all.slice(0, 16) } }] }, { standings: { entries: all.slice(16) } }] }
}

describe("parseStandings", () => {
	it("reads every team's record by the site's team names, however the feed nests them", () => {
		const r = parseStandings(league({ LV: [3, 1], KC: [4, 0], PHI: [2, 1, 1] }))
		expect(r["Las Vegas Raiders"]).toEqual({ w: 3, l: 1, t: 0 })
		expect(r["Kansas City Chiefs"]).toEqual({ w: 4, l: 0, t: 0 })
		expect(r["Philadelphia Eagles"]).toEqual({ w: 2, l: 1, t: 1 })
		expect(Object.keys(r)).toHaveLength(32)
		expect(r["Washington Commanders"]).toBeDefined() // ESPN's WSH
	})
	it("returns nothing for junk or a partial feed", () => {
		expect(parseStandings(null)).toEqual({})
		expect(parseStandings({ children: [{ standings: { entries: [entry("LV", 3, 1)] } }] })).toEqual({})
	})
})

describe("overlayRecords", () => {
	it("lays ESPN's record over typed ones and leaves unknown teams alone", () => {
		const rows = [{ team: "Las Vegas Raiders", wins: 0, losses: 0 }, { team: "Mystery FC", wins: 5, losses: 2 }]
		const out = overlayRecords(rows, { "Las Vegas Raiders": { w: 3, l: 1, t: 0 } })
		expect(out[0]).toMatchObject({ wins: 3, losses: 1, ties: 0 })
		expect(out[1]).toBe(rows[1])
	})
})

describe("withEspnRecords", () => {
	beforeEach(() => {
		clearCache()
		vi.resetModules()
		vi.unstubAllGlobals()
	})
	it("fetches the standings once and overlays them", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => (urls.push(url), { ok: true, json: async () => league({ LV: [3, 1] }) }))
		const { withEspnRecords } = await import("../../lib/live/service")
		const out = await withEspnRecords([{ team: "Las Vegas Raiders", wins: 0, losses: 0 }])
		expect(out[0]).toMatchObject({ wins: 3, losses: 1 })
		await withEspnRecords([{ team: "Las Vegas Raiders" }])
		expect(urls).toHaveLength(1)
		expect(urls[0]).toContain("/apis/v2/sports/football/nfl/standings?season=2026")
	})
	it("keeps the typed records when ESPN is down", async () => {
		vi.stubGlobal("fetch", async () => {
			throw new Error("down")
		})
		const { withEspnRecords } = await import("../../lib/live/service")
		const rows = [{ team: "Las Vegas Raiders", wins: 2, losses: 2 }]
		expect(await withEspnRecords(rows)).toEqual(rows)
	})
})

describe("getSeasonResults", () => {
	beforeEach(() => {
		clearCache()
		vi.resetModules()
		vi.unstubAllGlobals()
	})
	const event = (id: string, state: string, hs: number, as: number) => ({
		id,
		date: "2026-09-13T20:25Z",
		competitions: [
			{
				status: { type: { state } },
				competitors: [
					{ homeAway: "home", score: String(hs), team: { id: "13", abbreviation: "LV" } },
					{ homeAway: "away", score: String(as), team: { id: "12", abbreviation: "KC" } },
				],
			},
		],
	})

	it("collects finished games for each week, one request per week", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => (urls.push(url), { ok: true, json: async () => ({ events: [event("1", "post", 27, 20), event("2", "pre", 0, 0)] }) }))
		const { getSeasonResults } = await import("../../lib/live/service")
		const games = await getSeasonResults(3)
		expect(urls).toHaveLength(3)
		expect(urls[2]).toContain("dates=2026&seasontype=2&week=3")
		expect(games?.map((g) => [g.week, g.home, g.homeScore])).toEqual([[1, "LV", 27], [2, "LV", 27], [3, "LV", 27]])
	})

	it("returns null when any week can't be read", async () => {
		vi.stubGlobal("fetch", async (url: string) => {
			if (url.includes("week=2")) throw new Error("down")
			return { ok: true, json: async () => ({ events: [] }) }
		})
		const { getSeasonResults } = await import("../../lib/live/service")
		expect(await getSeasonResults(3)).toBeNull()
		expect(await getSeasonResults(0)).toBeNull()
	})
})

const game = (week: number, home: string, away: string, hs: number | null, as: number | null, kickoff: string): SeasonGame => ({ week, home, away, homeScore: hs, awayScore: as, kickoff })

describe("recordsAsOf", () => {
	const games = [
		game(1, "SF", "LV", 24, 17, "2026-09-13T20:25Z"),
		game(2, "SF", "KC", 20, 20, "2026-09-20T20:25Z"),
		game(6, "DEN", "SEA", 17, 14, "2026-10-16T00:15Z"), // Thursday night, over by the time the board was posted
		game(6, "JAX", "HOU", 31, 34, "2026-10-18T13:30Z"), // Sunday, after the board was posted
		game(6, "LV", "BUF", null, null, "2026-10-18T20:25Z"),
	]
	const posted = Date.parse("2026-10-16T05:26:12Z")

	it("starts every team at 0-0 so a team with no games still has a record", () => {
		const r = recordsAsOf([], 3, null)
		expect(Object.keys(r)).toHaveLength(32)
		expect(r["Las Vegas Raiders"]).toEqual({ w: 0, l: 0, t: 0 })
	})
	it("counts wins, losses and ties", () => {
		const r = recordsAsOf(games, 6, null)
		expect(r["San Francisco 49ers"]).toEqual({ w: 1, l: 0, t: 1 })
		expect(r["Las Vegas Raiders"]).toEqual({ w: 0, l: 1, t: 0 })
		expect(r["Kansas City Chiefs"]).toEqual({ w: 0, l: 0, t: 1 })
	})
	it("leaves out games after the week the rankings are for", () => {
		const r = recordsAsOf(games, 1, null)
		expect(r["Denver Broncos"]).toEqual({ w: 0, l: 0, t: 0 })
		expect(r["Kansas City Chiefs"]).toEqual({ w: 0, l: 0, t: 0 })
	})
	it("leaves out games that were not over when the rankings were posted, even in the same week", () => {
		const r = recordsAsOf(games, 6, posted)
		expect(r["Denver Broncos"]).toEqual({ w: 1, l: 0, t: 0 })
		expect(r["Seattle Seahawks"]).toEqual({ w: 0, l: 1, t: 0 })
		expect(r["Jacksonville Jaguars"]).toEqual({ w: 0, l: 0, t: 0 })
		expect(r["Houston Texans"]).toEqual({ w: 0, l: 0, t: 0 })
	})
	it("does not count a game that was still being played at the posting time", () => {
		const r = recordsAsOf(games, 6, Date.parse("2026-10-16T02:00:00Z"))
		expect(r["Denver Broncos"]).toEqual({ w: 0, l: 0, t: 0 })
	})
	it("reads Washington under the site's abbreviation or ESPN's", () => {
		const r = recordsAsOf([game(1, "WSH", "DAL", 10, 3, "2026-09-13T17:00Z"), game(2, "WAS", "NYG", 3, 10, "2026-09-20T17:00Z")], 2, null)
		expect(r["Washington Commanders"]).toEqual({ w: 1, l: 1, t: 0 })
	})
})

describe("gamesThrough", () => {
	beforeEach(() => {
		clearCache()
		vi.resetModules()
		vi.unstubAllGlobals()
	})
	const ev = (id: string, home: string, away: string, state: string, hs: number, as: number) => ({
		id,
		date: "2026-09-13T20:25Z",
		competitions: [
			{
				status: { type: { state, completed: state === "post" } },
				competitors: [
					{ homeAway: "home", score: String(hs), team: { id: home, abbreviation: home } },
					{ homeAway: "away", score: String(as), team: { id: away, abbreviation: away } },
				],
			},
		],
	})
	it("reads each week up to the one asked for", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => (urls.push(url), { ok: true, json: async () => ({ events: [ev(String(urls.length), "SF", "LV", "post", 24, 17)] }) }))
		const { gamesThrough } = await import("../../lib/live/service")
		const games = await gamesThrough(3)
		expect(games).toHaveLength(3)
		expect(urls.map((u) => /week=(\d+)/.exec(u)?.[1]).sort()).toEqual(["1", "2", "3"])
	})
	it("returns null, not a partial season, when any week fails", async () => {
		vi.stubGlobal("fetch", async (url: string) => {
			if (url.includes("week=2")) throw new Error("down")
			return { ok: true, json: async () => ({ events: [] }) }
		})
		const { gamesThrough } = await import("../../lib/live/service")
		expect(await gamesThrough(3)).toBeNull()
	})
})
