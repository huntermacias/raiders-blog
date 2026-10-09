import { describe, expect, it } from "vitest"

import { simulateSeason } from "@/lib/playoffs/simulator"
import type { Game } from "@/lib/playoffs/types"
import { MINI, beat, played, scheduled } from "./fixtures"

const N = ["N1", "N2", "N3", "N4"]

/** Gives a team a record by playing (and beating or losing to) the NFC teams, so it does not touch any AFC record. */
function record(team: string, wins: number, losses: number): Game[] {
	const out: Game[] = []
	for (let i = 0; i < wins; i++) out.push(played(team, N[i % 4], 30, 10, 1 + (i % 17)))
	for (let i = 0; i < losses; i++) out.push(played(N[i % 4], team, 30, 10, 1 + (i % 17)))
	return out
}

/** Every AFC team gets a record. `table` is team -> [wins, losses]. */
function league(table: Record<string, [number, number]>, extra: Game[] = []): Game[] {
	return [...Object.entries(table).flatMap(([t, [w, l]]) => record(t, w, l)), ...extra]
}

const BASE: Record<string, [number, number]> = {
	D1: [14, 3],
	C1: [13, 4],
	B1: [12, 5],
	A1: [8, 9],
	D2: [12, 5],
	B2: [11, 6],
	C2: [10, 7],
	A2: [7, 10],
	A3: [6, 11],
	A4: [5, 12],
	B3: [9, 8],
	B4: [4, 13],
	C3: [3, 14],
	C4: [2, 15],
	D3: [1, 16],
	D4: [0, 17],
}

describe("seeding a conference", () => {
	it("seeds the four division winners first, even if a wild card has a better record", () => {
		const sim = simulateSeason({ games: league(BASE), league: MINI })
		// A1 is 8-9 but wins its division, so it is the 4 seed ahead of 12-5 D2 and 11-6 B2.
		expect(sim.conferences.AFC.seeds).toEqual(["D1", "C1", "B1", "A1", "D2", "B2", "C2"])
		expect(sim.teams.A1.berth).toBe("division")
		expect(sim.teams.D2.berth).toBe("wildcard")
		expect(sim.teams.B3.berth).toBe("out")
		expect(sim.teams.A1.seed).toBe(4)
		expect(sim.teams.D2.seed).toBe(5)
	})

	it("fills the bracket from the seeds: 1 rests, then 2 v 7, 3 v 6, 4 v 5", () => {
		const sim = simulateSeason({ games: league(BASE), league: MINI })
		const b = sim.bracket.AFC
		expect(b.byes).toEqual([{ seed: 1, team: "D1" }])
		expect(b.wildCard.map((g) => `${g.away}@${g.home}`)).toEqual(["C2@C1", "B2@B1", "D2@A1"])
	})

	it("breaks a tie between two division winners with the wild-card procedure (head-to-head)", () => {
		// D1 and C1 finish 12-4. C1 beat D1.
		const table = { ...BASE, D1: [12, 3] as [number, number], C1: [11, 4] as [number, number] }
		const games = league(table, [beat("C1", "D1")])
		const sim = simulateSeason({ games, league: MINI })
		expect(sim.teams.D1.overall).toMatchObject({ w: 12, l: 4 })
		expect(sim.teams.C1.overall).toMatchObject({ w: 12, l: 4 })
		expect(sim.conferences.AFC.seeds.slice(0, 2)).toEqual(["C1", "D1"])
		expect(sim.ties).toContainEqual(expect.objectContaining({ kind: "wildcard", placed: "C1", step: "head-to-head" }))
	})

	it("hands the last wild card to the team that swept a three-way tie", () => {
		// C2, A2 and B3 are all 10-7 for the last spot, from three different divisions. C2 beat the other two.
		const table: Record<string, [number, number]> = { ...BASE, A1: [11, 6], C2: [8, 7], A2: [10, 6], B3: [10, 6], D2: [13, 4] }
		const games = league(table, [beat("C2", "A2"), beat("C2", "B3")])
		const sim = simulateSeason({ games, league: MINI })
		expect(sim.teams.C2.overall).toMatchObject({ w: 10, l: 7 })
		expect(sim.teams.A2.overall).toMatchObject({ w: 10, l: 7 })
		expect(sim.teams.B3.overall).toMatchObject({ w: 10, l: 7 })
		expect(sim.conferences.AFC.seeds[6]).toBe("C2")
		expect(sim.teams.A2.berth).not.toBe("wildcard")
		expect(sim.ties).toContainEqual(expect.objectContaining({ kind: "wildcard", placed: "C2", step: "head-to-head-sweep" }))
	})
})

describe("a season that has barely started", () => {
	it("still gives a full, stable table when nothing has been played", () => {
		const games = [scheduled("A1", "B1", 1), scheduled("C1", "D1", 1)]
		const sim = simulateSeason({ games, league: MINI })
		expect(sim.conferences.AFC.seeds).toHaveLength(7)
		expect(sim.eliminatedTeams).toEqual([])
		// (The NFC in this small league has only four teams for seven berths, so all of them are in.)
		expect(sim.clinchedTeams.filter((t) => sim.teams[t].conference === "AFC")).toEqual([])
		expect(sim.ties.some((d) => d.step === "unresolved")).toBe(true)
		expect(simulateSeason({ games, league: MINI })).toEqual(sim)
	})
})
