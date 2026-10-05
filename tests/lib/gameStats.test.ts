import { beforeEach, describe, expect, it, vi } from "vitest"

import { mergeStats, parseGameStats } from "../../lib/live/gamestats"
import { clearCache } from "../../lib/live/cache"
import { finalBox } from "../stubs/espnBox"

describe("parseGameStats", () => {
	const auto = parseGameStats(finalBox)!

	it("reads the line score from the Raiders' side, whichever side they were on", () => {
		expect(auto.quarterScores.map((q) => [q.quarter, q.raiders, q.opponent])).toEqual([["Q1", 7, 7], ["Q2", 6, 3], ["Q3", 0, 0], ["Q4", 14, 20]])
	})

	it("builds team rows with the Raiders first and skips stats ESPN didn't send", () => {
		expect(auto.teamStats.map((r) => [r.stat, r.raiders, r.opponent])).toEqual([
			["Total Yards", "437", "399"],
			["Passing Yards", "365", "210"],
			["Rushing Yards", "72", "189"],
			["Turnovers", "2", "0"],
			["Time of Possession", "35:42", "24:18"],
		])
	})

	it("builds readable Raiders player lines", () => {
		const line = (player: string, category?: string) => auto.playerStats.find((p) => p.player === player && (!category || p.category === category))?.line
		expect(line("Kirk Cousins")).toBe("31/52, 365 YDS, 2 TD, 1 INT")
		expect(line("Ashton Jeanty")).toBe("15 CAR, 58 YDS, long 19")
		expect(line("Brock Bowers")).toBe("6 REC, 86 YDS, 1 TD, 11 TGT")
		expect(line("Maxx Crosby")).toBe("5 TOT, 2 SACKS, 2 TFL")
		expect(line("Matt Gay")).toBe("4/4 FG, 1/1 XP, 13 PTS, long 48")
		expect(line("AJ Cole")).toBe("3 punts, 47.3 avg, 1 inside the 20")
		expect(line("Dylan Laube", "Special Teams")).toBe("2 KR, 76 YDS, long 53")
	})

	it("leaves out opponents, zero-tackle defenders and quiet returners", () => {
		const names = auto.playerStats.map((p) => p.player)
		expect(names).not.toContain("Patrick Mahomes")
		expect(names).not.toContain("Practice Squad Guy")
		expect(names).not.toContain("Malik Benson")
	})

	it("flags the three biggest performances as standouts", () => {
		const stars = auto.playerStats.filter((p) => p.standout).map((p) => p.player)
		expect(stars).toHaveLength(3)
		expect(stars).toContain("Kirk Cousins")
	})

	it("refuses a game that isn't over and survives junk", () => {
		const live = JSON.parse(JSON.stringify(finalBox))
		live.header.competitions[0].status.type.completed = false
		expect(parseGameStats(live)).toBeNull()
		expect(parseGameStats(null)).toBeNull()
		expect(parseGameStats({})).toBeNull()
		expect(parseGameStats(finalBox, "DEN")).toBeNull()
	})
})

describe("mergeStats", () => {
	const auto = parseGameStats(finalBox)!
	const manualRow = { _key: "m1", category: "Passing", player: "K. Cousins", line: "31/52, 365 YDS, 2 TD, 1 INT, 1 fumble", standout: false } as PlayerStatRow

	it("passes the writer's own rows straight through when there is no ESPN data", () => {
		const m = mergeStats({ playerStats: [manualRow], teamStats: [] }, null)
		expect(m).toMatchObject({ fromEspn: false, playerStats: [manualRow], teamStats: [], quarterScores: [] })
	})

	it("lets a typed team stat replace ESPN's in place, and keeps extra typed rows", () => {
		const m = mergeStats({ teamStats: [{ _key: "t1", stat: "total yards", raiders: "438", opponent: "399" }, { _key: "t2", stat: "Explosive plays", raiders: "9", opponent: "6" }] }, auto)
		expect(m.teamStats[0]).toMatchObject({ _key: "t1", raiders: "438" })
		expect(m.teamStats.filter((r) => /total yards/i.test(r.stat))).toHaveLength(1)
		expect(m.teamStats[m.teamStats.length - 1].stat).toBe("Explosive plays")
		expect(m.teamStats).toHaveLength(auto.teamStats.length + 1)
	})

	it("matches players by last name within a category, so 'K. Cousins' replaces 'Kirk Cousins'", () => {
		const m = mergeStats({ playerStats: [manualRow] }, auto)
		const cousins = m.playerStats.filter((p) => p.category === "Passing")
		expect(cousins).toEqual([expect.objectContaining({ _key: "m1", line: expect.stringContaining("1 fumble") })])
	})

	it("lets a typed quarter win and appends an overtime row ESPN doesn't have", () => {
		const m = mergeStats({ quarterScores: [{ _key: "q4", quarter: "Q4", raiders: 15, opponent: 20 }, { _key: "ot", quarter: "OT", raiders: 3, opponent: 0 }] }, auto)
		expect(m.quarterScores.find((q) => q.quarter === "Q4")?.raiders).toBe(15)
		expect(m.quarterScores.map((q) => q.quarter)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT"])
	})

	it("steps ESPN's standout picks aside when the writer flags their own", () => {
		const mine = { _key: "m2", category: "Defense", player: "Maxx Crosby", line: "5 TOT, 2 SACKS, big plays", standout: true } as PlayerStatRow
		const m = mergeStats({ playerStats: [mine] }, auto)
		expect(m.playerStats.filter((p) => p.standout).map((p) => p.player)).toEqual(["Maxx Crosby"])
	})
})

describe("getReportStats", () => {
	beforeEach(() => {
		clearCache()
		vi.resetModules()
		vi.unstubAllGlobals()
	})

	it("finds the game by date and opponent, then reads its box score", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => {
			urls.push(url)
			const ok = (body: unknown) => ({ ok: true, json: async () => body })
			if (url.includes("/scoreboard")) {
				return ok({ events: [{ id: "401872976", date: "2026-10-05T01:25Z", competitions: [{ competitors: [{ homeAway: "home", team: { id: "13", abbreviation: "LV" } }, { homeAway: "away", team: { id: "12", abbreviation: "KC" } }] }] }] })
			}
			return ok(finalBox)
		})
		const { getReportStats } = await import("../../lib/live/service")
		const auto = await getReportStats({ opponent: "Kansas City Chiefs", gameDate: "2026-10-05T01:25:00Z" })
		expect(auto?.espnId).toBe("401872976")
		expect(auto?.teamStats.length).toBeGreaterThan(0)
		// ESPN scoreboard days are US Eastern days, and a date range returns nothing, so it asks for the one day.
		expect(urls[0]).toContain("scoreboard?dates=20261004")
	})

	it("uses an explicit ESPN id without touching the scoreboard", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => (urls.push(url), { ok: true, json: async () => finalBox }))
		const { getReportStats } = await import("../../lib/live/service")
		expect((await getReportStats({ espnGameId: "401872976" }))?.espnId).toBe("401872976")
		expect(urls).toHaveLength(1)
		expect(urls[0]).toContain("summary?event=401872976")
	})

	it("returns null instead of throwing when the feed is down", async () => {
		vi.stubGlobal("fetch", async () => {
			throw new Error("network")
		})
		const { getReportStats } = await import("../../lib/live/service")
		expect(await getReportStats({ opponent: "Kansas City Chiefs", gameDate: "2026-10-05T01:25:00Z" })).toBeNull()
		expect(await getReportStats({ espnGameId: "not-a-number" })).toBeNull()
	})
})
