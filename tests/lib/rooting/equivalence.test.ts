// Scenario equivalence and dice independence: the claims the audit found broken, checked directly.
//
//  - With team strength fixed (sigma 0), "the seasons in which this game went home" and "this game forced to go home, the rest played
//    as usual" are the same experiment, so the conditional table and an explicit forced scenario must agree exactly.
//  - With team strength uncertain, a result also says something about the team that produced it, so the conditional swing is at
//    least what forcing gives (it never hides leverage), and the baseline is still the average of the two sides.
//  - A game's dice belong to its id and its teams, not to its position in a list, so adding, removing or reordering other games
//    cannot change how it was played.

import { describe, expect, it } from "vitest"

import { keyOf, rollerFor, uniform } from "@/lib/playoffs/odds"
import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { makeContext, scenarios, simulateConditional } from "@/lib/rooting/engine"
import { lateSeason } from "./helpers"

function forcedOdds(ctx: ReturnType<typeof makeContext>, index: number, code: 0 | 1, opts: { sims: number; exact: boolean }): number[] {
	const hits = new Float64Array(ctx.size)
	let total = 0
	scenarios(ctx, { ...opts, forced: { index, code } }, (_c, w, flags) => {
		total += w
		for (let f = 0; f < ctx.size; f++) if (flags[f]) hits[f] += w
	})
	return Array.from(hits, (v) => v / total)
}

describe("with team strength fixed, conditioning and forcing are the same experiment", () => {
	const games = lateSeason(8)
	const ctx = makeContext(games, NFL_LEAGUE, { sigma: 0 })
	const cond = simulateConditional(ctx)

	it("enumerates exactly", () => {
		expect(cond.exact).toBe(true)
		expect(ctx.open).toHaveLength(8)
	})

	it("gives, for every open game and every team and goal, the forced scenario's answer to rounding error", () => {
		let checked = 0
		for (let i = 0; i < ctx.open.length; i++) {
			const home = forcedOdds(ctx, i, 0, { sims: 0, exact: true })
			const away = forcedOdds(ctx, i, 1, { sims: 0, exact: true })
			for (let f = 0; f < ctx.size; f++) {
				expect(cond.games[i].H[f], `${ctx.open[i].id} #${f} home`).toBeCloseTo(home[f], 10)
				expect(cond.games[i].A[f], `${ctx.open[i].id} #${f} away`).toBeCloseTo(away[f], 10)
				checked++
			}
		}
		expect(checked).toBe(8 * ctx.size)
	})

	it("agrees when sampled instead of enumerated, within simulation error", () => {
		const sims = 6000
		const sampled = simulateConditional(ctx, { sims, exactMax: 0 })
		expect(sampled.exact).toBe(false)
		const i = 0
		const forcedH = forcedOdds(ctx, i, 0, { sims, exact: false })
		const forcedA = forcedOdds(ctx, i, 1, { sims, exact: false })
		const [nH, nA] = sampled.games[i].n
		for (let f = 0; f < ctx.size; f++) {
			const se = (p: number, n: number) => Math.sqrt((Math.max(p * (1 - p), 0.0025)) / n)
			expect(Math.abs(sampled.games[i].H[f] - forcedH[f]), `#${f} home`).toBeLessThan(5 * se(forcedH[f], nH))
			expect(Math.abs(sampled.games[i].A[f] - forcedA[f]), `#${f} away`).toBeLessThan(5 * se(forcedA[f], nA))
		}
	}, 120_000)
})

describe("in the last week, where no team plays twice, strength uncertainty changes nothing", () => {
	it("still enumerates exactly, and matches the version with strength fixed", () => {
		const games = lateSeason(10)
		const withShocks = makeContext(games, NFL_LEAGUE)
		const fixed = makeContext(games, NFL_LEAGUE, { sigma: 0 })
		expect(withShocks.sigma).toBeGreaterThan(0)
		const a = simulateConditional(withShocks)
		const b = simulateConditional(fixed)
		expect(a.exact).toBe(true)
		for (let f = 0; f < a.baseline.length; f++) expect(a.baseline[f]).toBeCloseTo(b.baseline[f], 10)
	})
})

describe("with team strength uncertain", () => {
	const games = lateSeason(20)
	const ctx = makeContext(games, NFL_LEAGUE)
	const sims = 3000
	const cond = simulateConditional(ctx, { sims })
	// The closest games, where both sides happen often enough to compare; each one costs two more passes.
	const closest = ctx.open.map((_, i) => i).sort((a, b) => Math.abs(ctx.chances[a] - 0.5) - Math.abs(ctx.chances[b] - 0.5)).slice(0, 5)

	it("is sampled, since a team's strength is shared between its games", () => {
		expect(ctx.sigma).toBeGreaterThan(0)
		expect(cond.exact).toBe(false)
	})

	it("still has a baseline equal to the two sides weighted by how often each happened", () => {
		for (const g of cond.games) {
			const [nH, nA] = g.n
			expect(nH + nA).toBe(sims)
			for (let f = 0; f < ctx.size; f++) expect(cond.baseline[f]).toBeCloseTo((nH * g.H[f] + nA * g.A[f]) / sims, 8)
		}
	})

	it("never shows less leverage for a game's own teams than forcing the result would", () => {
		// A team that wins a game is more likely to be a strong one, which helps it again later, so its swing can only be larger.
		let gap = 0
		let compared = 0
		for (const i of closest) {
			const g = ctx.open[i]
			const [nH, nA] = cond.games[i].n
			if (nH < 600 || nA < 600) continue
			const forcedH = forcedOdds(ctx, i, 0, { sims, exact: false })
			const forcedA = forcedOdds(ctx, i, 1, { sims, exact: false })
			for (const [team, sign] of [[g.homeTeam, 1], [g.awayTeam, -1]] as const) {
				const f = ctx.teamIndex.get(team)! * 3
				const c = sign * (cond.games[i].H[f] - cond.games[i].A[f])
				const x = sign * (forcedH[f] - forcedA[f])
				// Per-comparison noise is a point or two; the claim is about the direction on average, with a margin for a single game.
				expect(c, `${g.id} ${team}`).toBeGreaterThan(x - 0.04)
				gap += c - x
				compared++
			}
		}
		expect(compared).toBeGreaterThan(5)
		expect(gap / compared).toBeGreaterThan(-0.005)
	}, 120_000)
})

describe("dice belong to ids", () => {
	const mk = (id: string, home: string, away: string) => ({ id, homeTeam: home, awayTeam: away })
	const all = [mk("g1", "KC", "LV"), mk("g2", "DEN", "LAC"), mk("g3", "LV", "DEN"), mk("g4", "BUF", "MIA")]
	const logit = (id: string) => ({ g1: 0.4, g2: -0.2, g3: 0.1, g4: 0.9 })[id as "g1"]
	const outcomes = (games: typeof all, sigma: number, sims = 300) => {
		const roll = rollerFor(games, games.map((g) => logit(g.id)), sigma)
		const out = new Map<string, number[]>(games.map((g) => [g.id, []]))
		const won = new Uint8Array(games.length)
		for (let s = 0; s < sims; s++) {
			roll(s, won)
			games.forEach((g, i) => out.get(g.id)!.push(won[i]))
		}
		return out
	}

	for (const sigma of [0, 0.485]) {
		it(`gives a game the same results whatever else is in the list (sigma ${sigma})`, () => {
			const full = outcomes(all, sigma)
			const reversed = outcomes([...all].reverse(), sigma)
			const without = outcomes(all.filter((g) => g.id !== "g2" && g.id !== "g4"), sigma)
			for (const id of ["g1", "g3"]) {
				expect(reversed.get(id), id).toEqual(full.get(id))
				expect(without.get(id), id).toEqual(full.get(id))
			}
		})
	}

	it("gives different games different dice", () => {
		const a = outcomes(all, 0).get("g1")!
		const b = outcomes(all, 0).get("g4")!
		expect(a).not.toEqual(b)
		expect(new Set(all.map((g) => keyOf(g.id))).size).toBe(all.length)
	})

	it("shares a team's strength between its games", () => {
		// LV plays g1 (away) and g3 (home): with big strength shocks its results in the two games are linked.
		const sigma = 2
		const roll = rollerFor(all, all.map(() => 0), sigma)
		const won = new Uint8Array(all.length)
		let both = 0
		let n = 4000
		for (let s = 0; s < n; s++) {
			roll(s, won)
			// LV wins g1 when the home team loses; LV wins g3 when the home team wins.
			if (won[0] === 0 && won[2] === 1) both++
		}
		// Independent fair flips would give 25%; a shared strength draw pushes the two the same way.
		expect(both / n).toBeGreaterThan(0.3)
	})

	it("is uniform, and moves with the simulation number", () => {
		const xs = Array.from({ length: 20000 }, (_, s) => uniform(s, keyOf("g1")))
		const mean = xs.reduce((a, b) => a + b, 0) / xs.length
		expect(Math.abs(mean - 0.5)).toBeLessThan(0.01)
		expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
		expect(Math.max(...xs)).toBeLessThan(1)
	})
})
