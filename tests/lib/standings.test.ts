import { beforeEach, describe, expect, it, vi } from "vitest"

import { clearCache } from "../../lib/live/cache"
import { overlayRecords, parseStandings } from "../../lib/live/standings"
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
