import { describe, expect, it } from "vitest"

import { getPlayers } from "../../lib/lab/data"
import { getPlayerHistory } from "../../lib/lab/playerHistoryData"
import { careerKeys, careerLine, careerOf, allSeasons, hasSeason, seasonData, seasonsOf, type PlayerHistory } from "../../lib/lab/seasonKit"
import { contextOf, signalFor, signalOf, statOf, yardOf, type PlayerRow, type Slice, type Yard } from "../../lib/lab/playersKit"

const data = getPlayers()
const history = getPlayerHistory()
// A man with every earlier season on file, at a job with an overall grade.
const vet = data.players.find((p) => p.group === "qb" && seasonsOf(data, history, p.slug, "qb").length >= 4 && p.stats.some((s) => s.season.hn))!

describe("which seasons can be looked at", () => {
	it("lists the earlier seasons in the file, then the one being played", () => {
		expect(allSeasons(data, history)).toEqual([...history.seasons.filter((s) => s < data.season), data.season])
		expect(allSeasons(data, null)).toEqual([data.season])
		expect(hasSeason(data, history, history.seasons[0])).toBe(true)
		expect(hasSeason(data, history, 1999)).toBe(false)
	})

	it("lists the seasons a man has a line in, oldest first, the current one included", () => {
		const s = seasonsOf(data, history, vet.slug, vet.group)
		expect(s[s.length - 1]).toBe(data.season)
		expect(s).toEqual([...s].sort((a, b) => a - b))
		expect(seasonsOf(data, history, "nobody")).toEqual([])
		expect(seasonsOf(data, null, vet.slug)).toEqual([data.season])
	})
})

describe("an earlier season as a season of data", () => {
	const y = history.seasons.filter((s) => s < data.season).pop()!
	const view = seasonData(data, history, y)

	it("is the current data for the current season, for no history and for a season that is not on file", () => {
		expect(seasonData(data, history, data.season)).toBe(data)
		expect(seasonData(data, null, y)).toBe(data)
		expect(seasonData(data, history, null)).toBe(data)
		expect(seasonData(data, history, 1999)).toBe(data)
	})

	it("has that season's league yardstick and the players who played it, with the slugs of today's pages", () => {
		expect(view.season).toBe(y)
		expect(view.yard).toBe(history.yard[String(y)])
		expect(view.players.length).toBeGreaterThan(100)
		const slugs = new Set(data.players.map((p) => p.slug))
		for (const p of view.players.slice(0, 200)) expect(slugs.has(p.slug)).toBe(true)
		const mine = view.players.find((p) => p.id === vet.id && p.group === vet.group)!
		expect(mine.stats.length).toBeGreaterThan(3)
		expect(mine.stats[0].season.n).toBeGreaterThan(0)
	})

	it("is made once and handed back again", () => {
		expect(seasonData(data, history, y)).toBe(view)
	})

	it("keeps the league's own order of jobs and every row has the stats it was given", () => {
		const hp = history.players[vet.id]
		const row = hp.r.find((r) => r[0] === y && r[1] === vet.group)!
		const mine = view.players.find((p) => p.id === vet.id && p.group === vet.group)!
		expect(mine.stats.map((s) => s.k)).toEqual(row[5].map((s) => s[0]))
	})
})

describe("a career", () => {
	const career = careerOf(data, history, vet)!

	it("has a row for each season, oldest first, and marks the one being played", () => {
		expect(career.rows.length).toBeGreaterThanOrEqual(4)
		expect(career.rows.map((r) => r.season)).toEqual([...career.rows.map((r) => r.season)].sort((a, b) => a - b))
		expect(career.rows.filter((r) => r.current).map((r) => r.season)).toEqual([data.season])
		expect(career.keys).toEqual(careerKeys(vet.group))
		for (const r of career.rows) expect(r.cells).toHaveLength(career.keys.length)
	})

	it("grades every season against that season's league", () => {
		for (const r of career.rows) {
			if (r.overall !== null) expect(r.overall).toBeGreaterThanOrEqual(1)
			if (r.overall !== null) expect(r.overall).toBeLessThanOrEqual(99)
			if (r.place) expect(r.place.rank).toBeLessThanOrEqual(r.place.of)
			for (const c of r.cells) if (c && c.pct !== null) expect(c.pct).toBeGreaterThanOrEqual(0)
		}
	})

	it("is null with only one season, and for a man with no history", () => {
		expect(careerOf(data, null, vet)).toBeNull()
		const rookie = data.players.find((p) => seasonsOf(data, history, p.slug, p.group).length === 1)
		if (rookie) expect(careerOf(data, history, rookie)).toBeNull()
	})

	it("says how his Overall has moved in one plain sentence", () => {
		const line = careerLine(career, data)
		expect(line).toMatch(/His Overall/)
		expect(line).toContain(String(career.rows.find((r) => !r.current && r.overall !== null)!.season))
		expect(careerLine({ keys: [], rows: [] }, data)).toBe("")
	})

	it("describes three or more finished seasons as a run, and names a best year that is not the last", () => {
		const row = (season: number, overall: number | null, current = false) => ({ season, current, team: "AAA", games: 17, overall, place: null, cells: [] })
		const c = { keys: [], rows: [row(2022, 70), row(2023, 55), row(2024, 58), row(2025, 52), row(2026, 60, true)] }
		const line = careerLine(c, data)
		expect(line).toContain("went 70, 55, 58, 52 from 2022 to 2025")
		expect(line).toContain("best year was 2022")
		expect(line).toContain("It is 60 so far in 2026")
		expect(careerLine({ keys: [], rows: [row(2025, 60), row(2026, null, true)] }, data)).toBe("")
	})
})

describe("a number that has history behind it", () => {
	const slice = (extra: Partial<Slice>): Slice => ({ v: 0, n: 100, ...extra })

	it("is called settled once his earlier seasons pin it down, even when the league's spread on it is not yet", () => {
		const early: Yard = { ...(yardOf(data, vet.group, "epaDb") as Yard), rel: 0.05 }
		expect(signalOf(early)).toBe("luck")
		expect(signalFor(early, slice({}))).toBe("luck")
		expect(signalFor(early, slice({ hn: 900, rl: 0.8 }))).toBe("real")
		// Never less than what the league's own spread says.
		expect(signalFor({ ...early, rel: 0.7 }, slice({ hn: 900, rl: 0.1 }))).toBe("real")
	})

	it("is ignored without a yardstick or without a reliability", () => {
		expect(signalFor(null, slice({ hn: 900, rl: 0.8 }))).toBe("partial")
		expect(signalFor({ ...(yardOf(data, vet.group, "epaDb") as Yard), rel: 0.05 }, slice({ hn: 900 }))).toBe("luck")
	})

	it("is judged on the posterior in a stat's context: the range is narrower and the history is counted", () => {
		const s = statOf(vet as PlayerRow, "epaDb")!
		const c = contextOf(data, vet, s)!
		expect(c.history).toBe(s.season.hn)
		const plain = contextOf(data, vet, { ...s, season: { ...s.season, hn: undefined, rl: undefined, pe: undefined, a: undefined } })!
		expect(plain.history).toBe(0)
		if (c.range && plain.range) expect(c.range[1] - c.range[0]).toBeLessThanOrEqual(plain.range[1] - plain.range[0] + 1e-9)
	})
})

describe("a history file that is missing or empty", () => {
	it("changes nothing", () => {
		const none = { generatedAt: "", source: "", seasons: [], weeks: {}, yard: {}, model: {}, players: {} } as PlayerHistory
		expect(allSeasons(data, none)).toEqual([data.season])
		expect(seasonData(data, none, 2024)).toBe(data)
		expect(careerOf(data, none, vet)).toBeNull()
	})
})
