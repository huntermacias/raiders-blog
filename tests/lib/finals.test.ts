import { beforeEach, describe, expect, it, vi } from "vitest"

import { clearCache } from "../../lib/live/cache"
import { parseEvent } from "../../lib/live/espn"
import { candidates, mergeFinals, windowFor } from "../../lib/live/finals"
import { hubState } from "../../lib/home"
import type { ScheduleRow } from "../../lib/schedule"

const ev = (id: string, date: string, state: "pre" | "in" | "post", lv: number, kc: number, lvHome = true) => ({
	id,
	date,
	competitions: [
		{
			status: { type: { state, detail: state, shortDetail: state }, period: state === "pre" ? 0 : 4, displayClock: "0:00" },
			competitors: [
				{ homeAway: lvHome ? "home" : "away", score: String(lv), team: { id: "13", abbreviation: "LV", displayName: "Las Vegas Raiders" } },
				{ homeAway: lvHome ? "away" : "home", score: String(kc), team: { id: "12", abbreviation: "KC", displayName: "Kansas City Chiefs" } },
			],
		},
	],
})
const info = (...a: Parameters<typeof ev>) => parseEvent(ev(...a))!

const NOW = Date.parse("2026-10-05T03:00:00Z")
// The real kickoff was 2026-10-04T20:25Z; Studio had it as 06:41Z the next morning, and no score.
const doc = { _id: "g4", week: 4, awayTeam: "Kansas City Chiefs", homeTeam: "Las Vegas Raiders", kickoff: "2026-10-05T06:41:00Z" }

describe("candidates / windowFor", () => {
	it("picks ungraded games near now and skips graded, old and far-off ones", () => {
		const graded = { ...doc, _id: "a", actualAwayScore: 30, actualHomeScore: 27 }
		const old = { ...doc, _id: "b", kickoff: "2026-08-01T20:00:00Z" }
		const far = { ...doc, _id: "c", kickoff: "2026-12-01T20:00:00Z" }
		expect(candidates([graded, old, far, doc], NOW)).toEqual([doc])
	})
	it("covers a day either side of the candidates", () => {
		expect(windowFor([doc])).toEqual({ from: Date.parse(doc.kickoff) - 86_400_000, to: Date.parse(doc.kickoff) + 86_400_000 })
		expect(windowFor([])).toBeNull()
	})
})

describe("mergeFinals", () => {
	it("fills the final score and the real kickoff when ESPN says the game is over", () => {
		const [g] = mergeFinals([doc], [info("1", "2026-10-04T20:25:00Z", "post", 27, 30)], NOW)
		expect(g).toMatchObject({ actualAwayScore: 30, actualHomeScore: 27, kickoff: "2026-10-04T20:25:00Z" })
	})
	it("matches by team, not by home/away, so a swapped home/away in Studio still lines up", () => {
		const swapped = { ...doc, awayTeam: "Las Vegas Raiders", homeTeam: "Kansas City Chiefs" }
		const [g] = mergeFinals([swapped], [info("1", "2026-10-04T20:25:00Z", "post", 27, 30)], NOW)
		expect(g).toMatchObject({ actualAwayScore: 27, actualHomeScore: 30 })
	})
	it("never overrides a score Hunter typed", () => {
		const typed = { ...doc, actualAwayScore: 31, actualHomeScore: 27 }
		expect(mergeFinals([typed], [info("1", "2026-10-04T20:25:00Z", "post", 27, 30)], NOW)[0]).toBe(typed)
	})
	it("leaves a game ESPN hasn't finished ungraded, but corrects its kickoff", () => {
		const [live] = mergeFinals([doc as typeof doc & { actualAwayScore?: number }], [info("1", "2026-10-04T20:25:00Z", "in", 20, 17)], NOW)
		expect(live.actualAwayScore).toBeUndefined()
		expect(live.kickoff).toBe("2026-10-04T20:25:00Z")
	})
	it("ignores other games and events too far from the doc's kickoff", () => {
		const other = { ...ev("2", "2026-09-27T20:25:00Z", "post", 10, 13) }
		expect(mergeFinals([doc], [parseEvent(other)!], NOW)[0]).toBe(doc)
	})
})

describe("hubState with ESPN's board", () => {
	const row = (over: Partial<ScheduleRow> = {}): ScheduleRow => ({ week: 4, opponent: "Kansas City Chiefs", homeAway: "home", kickoff: "2026-10-05T06:41:00Z", pick: null, outcome: null, ...over })
	const next: ScheduleRow = { week: 5, opponent: "Denver Broncos", homeAway: "away", kickoff: "2026-10-11T20:25:00Z", pick: null, outcome: null }

	it("is live while ESPN says in progress, even when Studio's kickoff is wrong", () => {
		const s = hubState([row({ kickoff: "2026-10-05T06:41:00Z" }), next], Date.parse("2026-10-04T21:00:00Z"), [info("1", "2026-10-04T20:25:00Z", "in", 7, 7)])
		expect(s.kind).toBe("live")
	})
	it("is not live once ESPN says final, even before the score is in Studio, and moves to the next game", () => {
		const s = hubState([row({ kickoff: "2026-10-04T20:25:00Z" }), next], Date.parse("2026-10-04T23:30:00Z"), [info("1", "2026-10-04T20:25:00Z", "post", 27, 30)])
		expect(s).toMatchObject({ kind: "next", game: { week: 5 } })
	})
	it("is not live while ESPN says the game hasn't started, whatever the clock says", () => {
		const s = hubState([row({ kickoff: "2026-10-04T20:25:00Z" }), next], Date.parse("2026-10-04T20:40:00Z"), [info("1", "2026-10-04T21:25:00Z", "pre", 0, 0)])
		expect(s).toMatchObject({ kind: "next", game: { week: 4 } })
	})
	it("falls back to Studio's kickoff time with no board", () => {
		expect(hubState([row({ kickoff: "2026-10-04T20:25:00Z" }), next], Date.parse("2026-10-04T21:00:00Z")).kind).toBe("live")
		expect(hubState([row({ kickoff: "2026-10-04T20:25:00Z" }), next], Date.parse("2026-10-04T21:00:00Z"), null).kind).toBe("live")
	})
})

describe("withEspnFinals", () => {
	beforeEach(() => {
		clearCache()
		vi.resetModules()
		vi.unstubAllGlobals()
	})

	it("fetches one scoreboard window and fills the game", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => (urls.push(url), { ok: true, json: async () => ({ events: [ev("1", "2026-10-04T20:25:00Z", "post", 27, 30)] }) }))
		const { withEspnFinals } = await import("../../lib/live/service")
		const out = await withEspnFinals([doc], NOW)
		expect(out[0]).toMatchObject({ actualAwayScore: 30, actualHomeScore: 27 })
		expect(urls).toHaveLength(1)
		expect(urls[0]).toMatch(/scoreboard\?dates=\d{8}-\d{8}/)
	})

	it("doesn't call ESPN at all when every game is already graded", async () => {
		const spy = vi.fn()
		vi.stubGlobal("fetch", spy)
		const { withEspnFinals } = await import("../../lib/live/service")
		const graded = [{ ...doc, actualAwayScore: 30, actualHomeScore: 27 }]
		expect(await withEspnFinals(graded, NOW)).toBe(graded)
		expect(spy).not.toHaveBeenCalled()
	})

	it("returns the games untouched when ESPN fails, and doesn't retry for 30 seconds", async () => {
		const spy = vi.fn(async () => {
			throw new Error("down")
		})
		vi.stubGlobal("fetch", spy)
		const { withEspnFinals } = await import("../../lib/live/service")
		const games = [doc]
		expect(await withEspnFinals(games, NOW)).toBe(games)
		expect(await withEspnFinals(games, NOW + 10_000)).toBe(games)
		expect(spy).toHaveBeenCalledTimes(1)
		await withEspnFinals(games, NOW + 31_000)
		expect(spy).toHaveBeenCalledTimes(2)
	})
})
