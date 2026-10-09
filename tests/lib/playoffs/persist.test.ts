import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { PREFS_KEY, SCENARIO_KEY, STORAGE_VERSION, loadPrefs, loadScenario, savePrefs, saveScenario } from "@/lib/playoffs/persist"
import { actualOutcome } from "@/lib/playoffs/season"
import { scenarioSummary, statusLabel } from "@/lib/playoffs/summary"
import { simulateSeason } from "@/lib/playoffs/simulator"
import { buildBracket, reseed } from "@/lib/playoffs/bracket"

const games = getGames()
const open = games.filter((g) => actualOutcome(g) === null)

function memory(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial))
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k),
		data,
	}
}

describe("saved picks", () => {
	it("come back as they were saved", () => {
		const store = memory()
		const picks = { [open[0].id]: "H" as const, [open[5].id]: "T" as const }
		saveScenario(store, 2026, picks, 1234)
		expect(loadScenario(store, 2026, games)).toEqual(picks)
		expect(JSON.parse(store.data.get(SCENARIO_KEY) as string)).toMatchObject({ v: STORAGE_VERSION, season: 2026, savedAt: 1234 })
	})

	it("are removed from storage when the last pick is taken back", () => {
		const store = memory()
		saveScenario(store, 2026, { [open[0].id]: "H" })
		saveScenario(store, 2026, {})
		expect(store.data.has(SCENARIO_KEY)).toBe(false)
		expect(loadScenario(store, 2026, games)).toBeNull()
	})

	it("are ignored if they were saved for another season or an older format", () => {
		const picks = { [open[0].id]: "H" }
		expect(loadScenario(memory({ [SCENARIO_KEY]: JSON.stringify({ v: STORAGE_VERSION, season: 2025, picks }) }), 2026, games)).toBeNull()
		expect(loadScenario(memory({ [SCENARIO_KEY]: JSON.stringify({ v: STORAGE_VERSION + 1, season: 2026, picks }) }), 2026, games)).toBeNull()
		expect(loadScenario(memory({ [SCENARIO_KEY]: JSON.stringify({ season: 2026, picks }) }), 2026, games)).toBeNull()
	})

	it("drop picks for games that have been played or are gone, and keep the rest", () => {
		const finished = games.find((g) => g.status === "final")!
		const store = memory({ [SCENARIO_KEY]: JSON.stringify({ v: STORAGE_VERSION, season: 2026, picks: { [finished.id]: "H", gone: "A", [open[2].id]: "A", [open[3].id]: "Z" } }) })
		expect(loadScenario(store, 2026, games)).toEqual({ [open[2].id]: "A" })
	})

	it("never throw: corrupt values, missing storage or a storage that refuses", () => {
		expect(loadScenario(memory({ [SCENARIO_KEY]: "{not json" }), 2026, games)).toBeNull()
		expect(loadScenario(memory({ [SCENARIO_KEY]: "null" }), 2026, games)).toBeNull()
		expect(loadScenario(memory({ [SCENARIO_KEY]: JSON.stringify({ v: 1, season: 2026, picks: 5 }) }), 2026, games)).toBeNull()
		expect(loadScenario(null, 2026, games)).toBeNull()
		const refuses = {
			getItem: () => {
				throw new Error("blocked")
			},
			setItem: () => {
				throw new Error("full")
			},
			removeItem: () => {
				throw new Error("blocked")
			},
		}
		expect(loadScenario(refuses, 2026, games)).toBeNull()
		expect(() => saveScenario(refuses, 2026, { [open[0].id]: "H" })).not.toThrow()
		expect(() => saveScenario(null, 2026, {})).not.toThrow()
	})

	it("keep the Raiders mode setting on its own", () => {
		const store = memory()
		expect(loadPrefs(store)).toBeNull()
		savePrefs(store, { raiders: false })
		expect(loadPrefs(store)).toEqual({ v: STORAGE_VERSION, raiders: false })
		expect(loadPrefs(memory({ [PREFS_KEY]: JSON.stringify({ v: 9, raiders: true }) }))).toBeNull()
		expect(loadPrefs(memory({ [PREFS_KEY]: JSON.stringify({ v: 1, raiders: "yes" }) }))).toBeNull()
	})
})

describe("the bracket", () => {
	it("pairs 2 v 7, 3 v 6 and 4 v 5, with the 1 seed resting", () => {
		const b = buildBracket("AFC", ["BUF", "KC", "BAL", "HOU", "LV", "CIN", "PIT"])
		expect(b.byes).toEqual([{ seed: 1, team: "BUF" }])
		expect(b.wildCard.map((g) => `#${g.awaySeed} ${g.away} @ #${g.homeSeed} ${g.home}`)).toEqual(["#7 PIT @ #2 KC", "#6 CIN @ #3 BAL", "#5 LV @ #4 HOU"])
	})

	it("reseeds the next round so the best seed hosts the worst", () => {
		expect(reseed([1, 4, 5, 6])).toEqual([
			[1, 6],
			[4, 5],
		])
		expect(reseed([6, 1])).toEqual([[1, 6]])
		expect(reseed([3])).toEqual([])
	})
})

describe("the scenario summary a share card would use", () => {
	it("is read from the simulation, never typed in", () => {
		const sim = simulateSeason({ games })
		const s = scenarioSummary(sim, "LV")!
		expect(s.record).toBe(`${sim.teams.LV.overall.w}-${sim.teams.LV.overall.l}${sim.teams.LV.overall.t ? `-${sim.teams.LV.overall.t}` : ""}`)
		expect(s.conference).toBe("AFC")
		expect(s.seed).toBe(sim.teams.LV.seed)
		expect(s.wildCardRound).toHaveLength(3)
		expect(s.wildCardRound[0]).toMatch(/^#7 [A-Z]+ @ #2 [A-Z]+$/)
		expect(scenarioSummary(sim, "XXX")).toBeNull()
	})

	it("names each status", () => {
		expect(statusLabel("division", 1)).toBe("Division leader, top seed")
		expect(statusLabel("division", 3)).toBe("Division leader")
		expect(statusLabel("wildcard", 6)).toBe("Wild card")
		expect(statusLabel("hunt", null)).toBe("In the hunt")
		expect(statusLabel("out", null)).toBe("Eliminated")
	})
})

describe("words for the table", () => {
	it("says the strongest true thing about a team", async () => {
		const { standingLabel, describeTie } = await import("@/lib/playoffs/summary")
		const base = { berth: "wildcard" as const, eliminated: false, clinchedPlayoff: false, clinchedDivision: false, clinchedTopSeed: false }
		expect(standingLabel(base)).toBe("Wild card")
		expect(standingLabel({ ...base, berth: "division" })).toBe("Division leader")
		expect(standingLabel({ ...base, berth: "hunt" })).toBe("In the hunt")
		expect(standingLabel({ ...base, clinchedPlayoff: true })).toBe("Clinched playoff berth")
		expect(standingLabel({ ...base, clinchedPlayoff: true, clinchedDivision: true })).toBe("Clinched division")
		expect(standingLabel({ ...base, clinchedPlayoff: true, clinchedDivision: true, clinchedTopSeed: true })).toBe("Clinched No. 1 seed")
		expect(standingLabel({ ...base, berth: "out", eliminated: true })).toBe("Eliminated")
		expect(describeTie({ kind: "wildcard", placed: "KC", over: ["LV"], step: "head-to-head" })).toBe("KC over LV (wild-card tie): head-to-head record.")
		const stuck = describeTie({ kind: "division", placed: "A", over: ["B"], step: "unresolved", blockedBy: "conference-points-rank", stillTied: ["A", "B"] })
		expect(stuck).toMatch(/still level/)
		expect(stuck).toMatch(/projected game does not have/)
		expect(stuck).not.toMatch(/head-to-head/)
	})
})
