// The committed guide's numbers checked against the rules probabilities must obey, so a bad build can never be published.

import { describe, expect, it } from "vitest"

import { TEAMS } from "@/lib/nfl"
import { getRooting } from "@/lib/rooting/data"
import { GOALS, SCALE } from "@/lib/rooting/types"

const data = getRooting()!
const conf = new Map(TEAMS.map((t) => [t.abbr, t.conference]))
const at = (team: string, goal: (typeof GOALS)[number]) => data.teams.indexOf(team) * GOALS.length + GOALS.indexOf(goal)
const sum = (conference: string, goal: (typeof GOALS)[number], xs: readonly number[]) =>
	data.teams.filter((t) => conf.get(t) === conference).reduce((s, t) => s + xs[at(t, goal)], 0) / SCALE
/** Each stored number is rounded to the nearest 1/SCALE, so a sum of 16 of them can be off by 8/SCALE. */
const ROUND = 16 / SCALE

describe("the guide's probabilities", () => {
	it("is a whole number between 0 and SCALE everywhere", () => {
		const lists: number[][] = [data.baseline, ...data.games.flatMap((g) => [g.H, g.A]), ...Object.values(data.ties), ...data.history.map((h) => h.p)]
		for (const xs of lists) {
			for (const v of xs) {
				expect(Number.isInteger(v)).toBe(true)
				expect(v).toBeGreaterThanOrEqual(0)
				expect(v).toBeLessThanOrEqual(SCALE)
			}
		}
		for (const g of data.games) {
			expect(g.pHome).toBeGreaterThan(0)
			expect(g.pHome).toBeLessThan(SCALE)
		}
	})

	it("has one entry per team and goal", () => {
		const F = data.teams.length * GOALS.length
		expect(data.teams).toHaveLength(32)
		expect(data.baseline).toHaveLength(F)
		for (const g of data.games) {
			expect(g.H).toHaveLength(F)
			expect(g.A).toHaveLength(F)
		}
	})

	it("fills each conference's slots: seven playoff teams, four division winners, one bye", () => {
		for (const c of ["AFC", "NFC"]) {
			expect(sum(c, "playoffs", data.baseline)).toBeCloseTo(7, 2)
			expect(sum(c, "division", data.baseline)).toBeCloseTo(4, 2)
			expect(sum(c, "bye", data.baseline)).toBeCloseTo(1, 2)
		}
		// The same must hold in every conditional world, or one side of a game would be missing teams.
		for (const g of data.games) {
			for (const xs of [g.H, g.A]) {
				for (const c of ["AFC", "NFC"]) {
					expect(Math.abs(sum(c, "playoffs", xs) - 7), g.id).toBeLessThan(ROUND)
					expect(Math.abs(sum(c, "division", xs) - 4), g.id).toBeLessThan(ROUND)
					expect(Math.abs(sum(c, "bye", xs) - 1), g.id).toBeLessThan(ROUND)
				}
			}
		}
	})

	it("never has a harder goal likelier than an easier one", () => {
		const lists: number[][] = [data.baseline, ...data.games.flatMap((g) => [g.H, g.A])]
		for (const xs of lists) {
			for (const t of data.teams) {
				expect(xs[at(t, "bye")]).toBeLessThanOrEqual(xs[at(t, "division")])
				expect(xs[at(t, "division")]).toBeLessThanOrEqual(xs[at(t, "playoffs")])
			}
		}
	})

	it("agrees with itself: the baseline is the average of a game's two sides, weighted by how often each happened", () => {
		for (const g of data.games) {
			const [nH, nA] = g.n
			if (nH + nA === 0) continue // played out exactly: the two sides are weighted by the game's own chance instead
			if (nH < 120 || nA < 120) continue // too few seasons on a side to compare
			for (let f = 0; f < data.baseline.length; f++) {
				const mix = (nH * g.H[f] + nA * g.A[f]) / (nH + nA)
				expect(Math.abs(mix - data.baseline[f]), `${g.id} #${f}`).toBeLessThanOrEqual(3)
			}
		}
	})

	it("simulated each game's home wins as often as its win chance says, within simulation error", () => {
		for (const g of data.games) {
			const n = g.n[0] + g.n[1]
			if (n === 0) continue
			const p = g.pHome / SCALE
			const se = Math.sqrt((p * (1 - p)) / n)
			expect(Math.abs(g.n[0] / n - p), g.id).toBeLessThan(5 * se + 1 / SCALE)
		}
	})

	it("keeps each game's swing inside the range it quotes for model error", () => {
		for (const g of data.games) {
			if (!g.swingLo.length) continue
			for (let f = 0; f < data.baseline.length; f++) {
				const swing = g.H[f] - g.A[f]
				expect(swing, `${g.id} #${f}`).toBeGreaterThanOrEqual(g.swingLo[f] - 2)
				expect(swing, `${g.id} #${f}`).toBeLessThanOrEqual(g.swingHi[f] + 2)
			}
		}
	})

	it("keeps the baseline inside its model-error range", () => {
		const r = data.range
		expect(r).not.toBeNull()
		for (let f = 0; f < data.baseline.length; f++) {
			expect(r!.lo[f]).toBeLessThanOrEqual(data.baseline[f] + 1)
			expect(r!.hi[f]).toBeGreaterThanOrEqual(data.baseline[f] - 1)
		}
	})

	it("only calls a team eliminated or clinched when its other numbers agree", () => {
		for (const t of data.teams) {
			const p = data.baseline[at(t, "playoffs")]
			if (p === 0) {
				expect(data.baseline[at(t, "division")]).toBe(0)
				expect(data.baseline[at(t, "bye")]).toBe(0)
			}
		}
	})

	it("keeps every completed game's swing a valid change in probability", () => {
		for (const c of data.completed) {
			if (!c.swing.length) continue
			for (const v of c.swing) {
				expect(v).toBeGreaterThanOrEqual(-SCALE)
				expect(v).toBeLessThanOrEqual(SCALE)
			}
		}
	})
})
