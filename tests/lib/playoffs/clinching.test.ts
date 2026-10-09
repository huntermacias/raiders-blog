import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { pickRandom, seededRandom } from "@/lib/playoffs/picks"
import { actualOutcome } from "@/lib/playoffs/season"
import { simulateSeason } from "@/lib/playoffs/simulator"
import type { Game, Outcome, Predictions } from "@/lib/playoffs/types"
import { MINI, played, scheduled } from "./fixtures"

const games = getGames()

describe("clinching and elimination", () => {
	it("says nothing is decided this early in the season", () => {
		const sim = simulateSeason({ games })
		expect(sim.clinchedTeams).toEqual([])
		expect(sim.eliminatedTeams).toEqual([])
	})

	it("clinches the top seed, the division and a berth for a team that cannot be caught, and eliminates one that cannot catch up", () => {
		const ids = MINI.teams.filter((t) => t.conference === "AFC").map((t) => t.id)
		const NFC = ["N1", "N2", "N3", "N4"]
		const out: Game[] = []
		const rec = (team: string, w: number, l: number) => {
			for (let i = 0; i < w; i++) out.push(played(team, NFC[i % 4], 30, 10, 1 + (i % 14)))
			for (let i = 0; i < l; i++) out.push(played(NFC[i % 4], team, 30, 10, 1 + (i % 14)))
		}
		for (const id of ids) rec(id, id === "A1" ? 14 : id === "C4" ? 0 : 5, id === "A1" ? 0 : id === "C4" ? 14 : 9)
		// Three games left for everyone: three perfect matchings of the 16 teams.
		const rounds: [number, number][][] = [
			[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i, i + 8] as [number, number]),
			[0, 1, 2, 3, 8, 9, 10, 11].map((i) => [i, i + 4] as [number, number]),
			[0, 1, 4, 5, 8, 9, 12, 13].map((i) => [i, i + 2] as [number, number]),
		]
		rounds.forEach((pairs, r) => pairs.forEach(([a, b]) => out.push(scheduled(ids[a], ids[b], 15 + r))))
		const sim = simulateSeason({ games: out, league: MINI })

		expect(sim.teams.A1).toMatchObject({ clinchedTopSeed: true, clinchedDivision: true, clinchedPlayoff: true, eliminated: false, exact: false })
		expect(sim.teams.C4).toMatchObject({ eliminated: true, clinchedPlayoff: false })
		expect(sim.teams.C4.berth).toBe("out")
		expect(sim.teams.B1).toMatchObject({ clinchedPlayoff: false, eliminated: false, clinchedDivision: false })
		expect(sim.eliminatedTeams).toContain("C4")
		expect(sim.clinchedTeams).toContain("A1")
	})

	it("does not clinch on a tie it might lose", () => {
		// Level on wins with one rival who can still reach the same number: not clinched, whatever the tiebreakers say.
		const ids = ["A1", "A2"]
		const NFC = ["N1", "N2"]
		const out: Game[] = []
		for (let i = 0; i < 10; i++) out.push(played("A1", NFC[i % 2], 30, 10))
		for (let i = 0; i < 9; i++) out.push(played("A2", NFC[i % 2], 30, 10))
		out.push(scheduled("A2", "N3", 17), scheduled("A1", "N4", 17))
		const sim = simulateSeason({ games: out, league: MINI })
		expect(ids.every((t) => sim.teams[t].clinchedDivision === false)).toBe(true)
	})

	it("is exact once every game has a result", () => {
		const rand = seededRandom(77)
		const sim = simulateSeason({ games, predictions: pickRandom(games, {}, rand) })
		expect(sim.complete).toBe(true)
		for (const t of Object.values(sim.teams)) {
			expect(t.exact).toBe(true)
			expect(t.clinchedPlayoff).toBe(t.seed !== null)
			expect(t.eliminated).toBe(t.seed === null)
		}
	})
})

describe("clinching never says something that could turn out wrong", () => {
	// Fill the season with picks except ten games in the last week, then play out all 1,024 ways those ten could go
	// and check every claim against every one of them.
	const lastWeek = games.filter((g) => g.week === 18)
	const OPEN = lastWeek.slice(0, 10)

	for (const seed of [21, 22, 23]) {
		it(`holds across every ending (shuffle ${seed})`, { timeout: 60000 }, () => {
			const base = pickRandom(
				games.filter((g) => !OPEN.some((o) => o.id === g.id)),
				{},
				seededRandom(seed),
			)
			const status = simulateSeason({ games, predictions: base })
			expect(status.openGames).toBe(10)

			const everyIn = new Set(Object.keys(status.teams))
			const everyOut = new Set(Object.keys(status.teams))
			const everyDivision = new Set(Object.keys(status.teams))
			const everyTop = new Set(Object.keys(status.teams))
			for (let mask = 0; mask < 1 << OPEN.length; mask++) {
				const preds: Record<string, Outcome> = { ...base }
				OPEN.forEach((g, i) => (preds[g.id] = mask & (1 << i) ? "H" : "A"))
				const end = simulateSeason({ games, predictions: preds as Predictions })
				for (const t of Object.values(end.teams)) {
					if (t.seed === null) everyIn.delete(t.team)
					else everyOut.delete(t.team)
					if (t.berth !== "division") everyDivision.delete(t.team)
					if (t.seed !== 1) everyTop.delete(t.team)
				}
			}
			for (const t of Object.values(status.teams)) {
				if (t.clinchedPlayoff) expect(everyIn.has(t.team), `${t.team} was said to clinch a berth`).toBe(true)
				if (t.eliminated) expect(everyOut.has(t.team), `${t.team} was said to be eliminated`).toBe(true)
				if (t.clinchedDivision) expect(everyDivision.has(t.team), `${t.team} was said to clinch the division`).toBe(true)
				if (t.clinchedTopSeed) expect(everyTop.has(t.team), `${t.team} was said to clinch the top seed`).toBe(true)
			}
			// The check is only worth something if the claims being checked exist.
			const claims = Object.values(status.teams).filter((t) => t.clinchedPlayoff || t.eliminated).length
			expect(claims).toBeGreaterThan(0)
		})
	}
})

describe("what the open games are", () => {
	it("counts a game as open only if it is neither played nor picked", () => {
		const open = games.filter((g) => actualOutcome(g) === null)
		const sim = simulateSeason({ games, predictions: { [open[0].id]: "H", [open[1].id]: "T" } })
		expect(sim.openGames).toBe(open.length - 2)
		expect(sim.pickedGames).toBe(2)
	})
})
