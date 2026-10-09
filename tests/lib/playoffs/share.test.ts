import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { pickRandom, seededRandom } from "@/lib/playoffs/picks"
import { SCENARIO_PARAM, decodeScenario, encodeScenario, scenarioLink, scheduleFingerprint } from "@/lib/playoffs/share"
import { actualOutcome } from "@/lib/playoffs/season"
import { simulateSeason } from "@/lib/playoffs/simulator"
import type { Outcome } from "@/lib/playoffs/types"

const games = getGames()
const open = games.filter((g) => actualOutcome(g) === null)

describe("scenario codes", () => {
	it("round-trips every kind of pick", () => {
		const picks: Record<string, Outcome> = {}
		open.forEach((g, i) => (picks[g.id] = (["H", "A", "T"] as const)[i % 3]))
		const code = encodeScenario(games, picks)
		const back = decodeScenario(games, code)
		expect(back).toEqual({ ok: true, predictions: picks })
	})

	it("round-trips a random full season and gives the same standings", () => {
		const picks = pickRandom(games, {}, seededRandom(42))
		const back = decodeScenario(games, encodeScenario(games, picks))
		expect(back.ok).toBe(true)
		if (back.ok) expect(simulateSeason({ games, predictions: back.predictions })).toEqual(simulateSeason({ games, predictions: picks }))
	})

	it("is short: a whole season of picks fits in a normal link", () => {
		const code = encodeScenario(games, pickRandom(games, {}, seededRandom(1)))
		expect(code.length).toBeLessThan(100)
		expect(code).toMatch(/^[0-9A-Za-z_-]+$/)
	})

	it("is shorter still when only the next weeks are picked", () => {
		const week6 = open.filter((g) => g.week === 6)
		const picks = Object.fromEntries(week6.map((g) => [g.id, "H" as const]))
		const short = encodeScenario(games, picks)
		const full = encodeScenario(games, pickRandom(games, {}, seededRandom(1)))
		expect(short.length).toBeLessThan(full.length)
		expect(short.length).toBeLessThan(40)
	})

	it("has no code for no picks", () => {
		expect(encodeScenario(games, {})).toBe("")
		expect(decodeScenario(games, "")).toEqual({ ok: false, reason: "empty" })
		expect(decodeScenario(games, null)).toEqual({ ok: false, reason: "empty" })
	})

	it("does not spend any of the code on games that have been played", () => {
		const played = games.find((g) => g.status === "final")!
		expect(encodeScenario(games, { [played.id]: "H" })).toBe("")
	})

	it("always makes the same code for the same picks", () => {
		const picks = pickRandom(games, {}, seededRandom(9))
		expect(encodeScenario(games, picks)).toBe(encodeScenario(games, { ...picks }))
		expect(encodeScenario([...games].reverse(), picks)).toBe(encodeScenario(games, picks))
	})

	it("still works after more games are played, because those picks are simply dropped", () => {
		const picks = pickRandom(games, {}, seededRandom(4))
		const code = encodeScenario(games, picks)
		const later = games.map((g, _i) => (g.id === open[0].id ? { ...g, status: "final" as const, homeScore: 20, awayScore: 10, winner: g.homeTeam } : g))
		const back = decodeScenario(later, code)
		expect(back.ok).toBe(true)
		if (back.ok) {
			expect(back.predictions[open[0].id]).toBeUndefined()
			expect(back.predictions[open[1].id]).toBe(picks[open[1].id])
		}
	})

	it("turns away a code made for a different schedule", () => {
		const code = encodeScenario(games, pickRandom(games, {}, seededRandom(2)))
		const other = games.slice(1)
		expect(scheduleFingerprint(other)).not.toBe(scheduleFingerprint(games))
		expect(decodeScenario(other, code)).toEqual({ ok: false, reason: "schedule" })
	})

	it("turns away codes that are damaged, from a newer version, or not codes at all", () => {
		const good = encodeScenario(games, pickRandom(games, {}, seededRandom(3)))
		expect(decodeScenario(games, "2" + good.slice(1))).toEqual({ ok: false, reason: "version" })
		expect(decodeScenario(games, "x" + good.slice(1)).ok).toBe(false)
		expect(decodeScenario(games, good.slice(0, 5) + "!!!").ok).toBe(false)
		expect(decodeScenario(games, good + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toEqual({ ok: false, reason: "malformed" })
		expect(decodeScenario(games, "1ab")).toEqual({ ok: false, reason: "malformed" })
		expect(decodeScenario(games, "<script>")).toEqual({ ok: false, reason: "malformed" })
	})

	it("builds the link", () => {
		expect(scenarioLink("https://www.raidersrundown.com", "/lab/playoff-machine", "1abcdXYZ")).toBe(`https://www.raidersrundown.com/lab/playoff-machine?${SCENARIO_PARAM}=1abcdXYZ`)
		expect(scenarioLink("https://www.raidersrundown.com", "/lab/playoff-machine", "")).toBe("https://www.raidersrundown.com/lab/playoff-machine")
	})
})
