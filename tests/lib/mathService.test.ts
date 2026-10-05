import { beforeEach, describe, expect, it, vi } from "vitest"

import { clearCache } from "../../lib/live/cache"
import type { SeasonGame } from "../../lib/math/season"
import { ABBRS } from "../stubs/seasonSchedule"

beforeEach(() => {
	clearCache()
	vi.resetModules()
	vi.unstubAllGlobals()
})

const event = (id: string, state: string, home: string, away: string, hs: number, as: number, date = "2026-09-13T20:25Z") => ({
	id,
	date,
	competitions: [
		{
			status: { type: { state } },
			competitors: [
				{ homeAway: "home", score: String(hs), team: { id: "13", abbreviation: home } },
				{ homeAway: "away", score: String(as), team: { id: "12", abbreviation: away } },
			],
		},
	],
})

describe("getSeasonSchedule", () => {
	it("carries each game's id and kickoff, and no score until it is final", async () => {
		vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ events: [event("11", "post", "LV", "KC", 27, 30), event("12", "pre", "DEN", "SEA", 0, 0, "2026-09-20T17:00Z")] }) }))
		const { getSeasonSchedule } = await import("../../lib/live/service")
		const sched = await getSeasonSchedule(1)
		const w1 = sched!.games.filter((g) => g.week === 1)
		expect(w1[0]).toMatchObject({ id: "11", home: "LV", away: "KC", homeScore: 27, awayScore: 30 })
		expect(w1[0].kickoff).toContain("2026-09-13")
		expect(w1[1]).toMatchObject({ id: "12", homeScore: null, awayScore: null })
	})
})

describe("getPriorRatings", () => {
	/** Eighteen weeks of sixteen finished games: the first team in each pair always wins by ten. */
	const lastSeason = (url: string) => {
		const week = Number(/week=(\d+)/.exec(url)?.[1])
		return { ok: true, json: async () => ({ events: Array.from({ length: 16 }, (_, i) => event(`${week}-${i}`, "post", ABBRS[2 * i], ABBRS[2 * i + 1], 27, 17)) }) }
	}

	it("plays last season's games and pulls the final ratings a third of the way back to average", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => (urls.push(url), lastSeason(url)))
		const { getPriorRatings } = await import("../../lib/live/service")
		const { runElo } = await import("../../lib/math/elo")
		const prior = await getPriorRatings()
		expect(urls).toHaveLength(18)
		expect(urls.every((u) => u.includes("dates=2025&seasontype=2"))).toBe(true)
		expect(prior![ABBRS[0]]).toBeGreaterThan(1500)
		expect(prior![ABBRS[1]]).toBeLessThan(1500)
		// The same games with no carry-over are further from 1500 than the prior is.
		const finished = Array.from({ length: 18 }, (_, w) => Array.from({ length: 16 }, (_, i) => ({ week: w + 1, home: ABBRS[2 * i], away: ABBRS[2 * i + 1], homeScore: 27, awayScore: 17 }))).flat()
		const raw = runElo(finished).ratings
		expect(Math.abs(prior![ABBRS[0]] - 1500)).toBeLessThan(Math.abs(raw[ABBRS[0]] - 1500))
	})

	it("keeps the answer for a day, so it isn't asked for again", async () => {
		const fetch = vi.fn(async (url: string) => lastSeason(url))
		vi.stubGlobal("fetch", fetch)
		const { getPriorRatings } = await import("../../lib/live/service")
		await getPriorRatings()
		await getPriorRatings()
		expect(fetch).toHaveBeenCalledTimes(18)
	})

	it("is null when a week can't be read or last season is incomplete, and doesn't hammer ESPN after a failure", async () => {
		const fetch = vi.fn(async (url: string) => {
			if (url.includes("week=9")) throw new Error("down")
			return lastSeason(url)
		})
		vi.stubGlobal("fetch", fetch)
		const { getPriorRatings } = await import("../../lib/live/service")
		expect(await getPriorRatings(1_000)).toBeNull()
		const calls = fetch.mock.calls.length
		expect(await getPriorRatings(2_000)).toBeNull()
		expect(fetch.mock.calls.length).toBe(calls)

		vi.resetModules()
		clearCache()
		vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ events: [event("1", "post", "LV", "KC", 27, 17)] }) }))
		const again = await import("../../lib/live/service")
		expect(await again.getPriorRatings()).toBeNull() // 18 games is not a season
	})
})

describe("getBoxes", () => {
	const summary = (home: string, away: string) => ({
		header: { competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: "home", score: "27", team: { id: "1", abbreviation: home } }, { homeAway: "away", score: "20", team: { id: "2", abbreviation: away } }] }] },
		boxscore: { teams: [{ team: { id: "1" }, statistics: [{ name: "yardsPerPlay", displayValue: "5.5" }, { name: "turnovers", displayValue: "1" }] }, { team: { id: "2" }, statistics: [{ name: "yardsPerPlay", displayValue: "5.0" }, { name: "turnovers", displayValue: "2" }] }] },
	})
	const game = (i: number, over: Partial<SeasonGame> = {}): SeasonGame => ({ week: 1, id: `e${i}`, home: ABBRS[(2 * i) % 32], away: ABBRS[(2 * i + 1) % 32], homeScore: 27, awayScore: 20, ...over })

	it("fetches only finished games that have an id and are in the weeks asked for", async () => {
		const urls: string[] = []
		vi.stubGlobal("fetch", async (url: string) => (urls.push(url), { ok: true, json: async () => summary("LV", "KC") }))
		const { getBoxes } = await import("../../lib/live/service")
		const boxes = await getBoxes([game(0), game(1, { homeScore: null, awayScore: null }), game(2, { id: undefined }), game(3, { week: 5 }), game(4)], 4)
		expect(urls.map((u) => /event=(\w+)/.exec(u)?.[1]).sort()).toEqual(["e0", "e4"])
		expect(boxes).toHaveLength(2)
		expect(boxes[0]).toMatchObject({ home: "LV", away: "KC", homeYpp: 5.5, awayYpp: 5, week: 1 })
	})

	it("never fetches the same finished game twice", async () => {
		const fetch = vi.fn(async () => ({ ok: true, json: async () => summary("LV", "KC") }))
		vi.stubGlobal("fetch", fetch)
		const { getBoxes } = await import("../../lib/live/service")
		await getBoxes([game(0), game(1)], 4)
		await getBoxes([game(0), game(1), game(2)], 4)
		expect(fetch).toHaveBeenCalledTimes(3)
	})

	it("skips a game that fails and keeps the rest", async () => {
		vi.stubGlobal("fetch", async (url: string) => {
			if (url.includes("event=e1")) throw new Error("down")
			if (url.includes("event=e2")) return { ok: false, status: 500, json: async () => ({}) }
			return { ok: true, json: async () => summary("LV", "KC") }
		})
		const { getBoxes } = await import("../../lib/live/service")
		const boxes = await getBoxes([game(0), game(1), game(2), game(3)], 4)
		expect(boxes.map((b) => b.id)).toEqual(["e0", "e3"])
	})

	it("stops starting new batches once its time budget is spent", async () => {
		const fetch = vi.fn(async () => ({ ok: true, json: async () => summary("LV", "KC") }))
		vi.stubGlobal("fetch", fetch)
		const { getBoxes } = await import("../../lib/live/service")
		let t = 0
		const clock = () => (t += 4000) // every look at the clock costs four seconds
		const boxes = await getBoxes(Array.from({ length: 40 }, (_, i) => game(i)), 4, 6000, clock)
		expect(fetch.mock.calls.length).toBeLessThan(40)
		expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(16)
		expect(boxes.length).toBe(fetch.mock.calls.length)
	})

	it("passes nothing through for a game that is not final in ESPN's own summary", async () => {
		const live = summary("LV", "KC")
		live.header.competitions[0].status.type.completed = false
		vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => live }))
		const { getBoxes } = await import("../../lib/live/service")
		expect(await getBoxes([game(0)], 4)).toEqual([])
	})
})
