import { describe, expect, it } from "vitest"

import fixture from "../../fixtures/ratings-parity.json"
import { getModel } from "@/lib/ratings/data"
import { type Coefs, coefsOf, currentWeek, eloRatings, homeLogit, homeProbability, logistic, marketRatings, normalQuantile, seasonOf, strengthFor, stretch } from "@/lib/ratings/model"
import type { Game } from "@/lib/playoffs/types"

type FxGame = { id: string; week: number; home: string; away: string; neutral: boolean; homeScore?: number; awayScore?: number; spread?: number }
const fx = fixture as unknown as {
	season: number
	playedThrough: number
	teams: string[]
	startElo: number[]
	startMarket: number[]
	games: FxGame[]
	elo: number[]
	market: number[]
	pHome: Record<string, number>
	model: { far: number[]; line: number; sigma: number; elo: { k: number; hfa: number; carry: number }; market: { lambda: number; carry: number; halfLife: number } }
}

const games: Game[] = fx.games.map((g) => {
	const final = g.homeScore !== undefined
	return {
		id: g.id,
		week: g.week,
		homeTeam: g.home,
		awayTeam: g.away,
		homeScore: final ? (g.homeScore as number) : null,
		awayScore: final ? (g.awayScore as number) : null,
		status: final ? "final" : "scheduled",
		winner: null,
		tie: false,
		spread: g.spread ?? null,
		...(g.neutral ? { neutral: true } : {}),
	}
})
const model = { ...getModel(), elo: fx.model.elo, market: fx.model.market }
const coefs: Coefs = { home: fx.model.far[0], elo: fx.model.far[1], market: fx.model.far[2], line: fx.model.line, sigma: fx.model.sigma }
const byTeam = (list: number[]) => Object.fromEntries(fx.teams.map((t, i) => [t, list[i]]))

describe("the TypeScript model matches the Python fit", () => {
	it("reproduces the Elo ratings after the same weeks", () => {
		const r = eloRatings(games, model, byTeam(fx.startElo))
		fx.teams.forEach((t, i) => expect(r[t]).toBeCloseTo(fx.elo[i], 4))
	})

	it("reproduces the market ratings from the same spreads", () => {
		const week = currentWeek(games)
		expect(week).toBe(fx.playedThrough + 1)
		const m = marketRatings(games, model, week, byTeam(fx.startMarket))
		fx.teams.forEach((t, i) => expect(m[t]).toBeCloseTo(fx.market[i], 4))
	})

	it("prices every open game the way the fit does: the spread where there is one, the ratings elsewhere", () => {
		const week = currentWeek(games)
		const strength = {
			model,
			elo: eloRatings(games, model, byTeam(fx.startElo)),
			market: marketRatings(games, model, week, byTeam(fx.startMarket)),
			week,
			primed: true,
		}
		let withLine = 0
		let without = 0
		for (const g of games.filter((x) => x.status !== "final")) {
			expect(homeProbability(strength, g, coefs), g.id).toBeCloseTo(fx.pHome[g.id], 5)
			if (typeof g.spread === "number") withLine++
			else without++
		}
		expect(withLine).toBeGreaterThan(10)
		expect(without).toBeGreaterThan(100)
	})
})

describe("the shipped model file", () => {
	const m = getModel()

	it("has the fields the engine reads, and sensible values", () => {
		expect(m.priors.teams).toHaveLength(32)
		expect(m.priors.elo).toHaveLength(32)
		expect(m.priors.market).toHaveLength(32)
		expect(new Set(m.priors.teams).size).toBe(32)
		for (const v of [...m.priors.elo, ...m.priors.market]) expect(Number.isFinite(v)).toBe(true)
		expect(m.sigma).toBeGreaterThan(0.2)
		expect(m.sigma).toBeLessThan(0.9)
		expect(m.draws.length).toBeGreaterThanOrEqual(20)
		expect(m.far.elo).toBeGreaterThan(0)
		expect(m.far.market).toBeGreaterThan(0)
		expect(m.far.home).toBeGreaterThan(0)
		// A 7-point favourite wins about 73% of the time in the NFL.
		expect(logistic((m.line.slope * 7) / 10)).toBeGreaterThan(0.7)
		expect(logistic((m.line.slope * 7) / 10)).toBeLessThan(0.77)
	})

	it("beat the model it replaces on seasons it had never seen, and is calibrated", () => {
		expect(m.holdout.newModel.allGames.logLoss).toBeLessThan(m.holdout.previousModel.allGames.logLoss - 0.01)
		expect(m.holdout.newModel.nextWeek.logLoss).toBeLessThan(m.holdout.previousModel.nextWeek.logLoss - 0.02)
		expect(m.holdout.newModel.allGames.logLoss).toBeLessThan(m.holdout.coinFlip.logLoss)
		expect(Math.abs(m.leaveOneSeasonOut.recalibration.slope - 1)).toBeLessThan(0.05)
		expect(Math.abs(m.leaveOneSeasonOut.recalibration.intercept)).toBeLessThan(0.05)
		for (const bin of m.calibration.later.filter((b) => b.n >= 1000)) expect(Math.abs(bin.predicted - bin.observed), `${bin.lo}-${bin.hi}`).toBeLessThan(0.03)
	})

	it("gives every draw a full set of numbers, spread around the central fit", () => {
		const c = coefsOf(m)
		for (const d of m.draws) {
			expect(d.far).toHaveLength(3)
			expect(d.sigma).toBeGreaterThan(0)
		}
		const mean = m.draws.reduce((s, d) => s + d.line, 0) / m.draws.length
		expect(Math.abs(mean - c.line)).toBeLessThan(0.05)
		expect(coefsOf(m, 3).line).toBe(m.draws[3].line)
	})
})

describe("strength for a real schedule", () => {
	it("starts from last season's carried ratings only when the games are the model's season", () => {
		const mk = (id: string): Game => ({ id, week: 1, homeTeam: "KC", awayTeam: "LV", homeScore: null, awayScore: null, status: "scheduled", winner: null, tie: false })
		const m = getModel()
		const a = strengthFor([mk(`${m.priors.season}_01_LV_KC`)], m)
		expect(a.primed).toBe(true)
		const kc = m.priors.teams.indexOf("KC")
		expect(a.elo.KC).toBeCloseTo(m.priors.elo[kc], 6)
		const b = strengthFor([mk(`${m.priors.season + 1}_01_LV_KC`)], m)
		expect(b.primed).toBe(false)
		expect(b.elo.KC ?? 1500).toBe(1500)
		expect(strengthFor([mk("x1")], m).primed).toBe(false)
		expect(seasonOf([mk("2026_01_LV_KC"), mk("2025_01_LV_KC")])).toBeNull()
	})

	it("treats a neutral site as having no home field", () => {
		const m = getModel()
		const s = { model: m, elo: {}, market: {}, week: 1, primed: false }
		const home = homeLogit(s, { homeTeam: "A", awayTeam: "B", spread: null })
		const neutral = homeLogit(s, { homeTeam: "A", awayTeam: "B", spread: null, neutral: true })
		expect(home).toBeGreaterThan(0)
		expect(neutral).toBe(0)
		// A posted spread already prices the venue.
		expect(homeLogit(s, { homeTeam: "A", awayTeam: "B", spread: 3, neutral: true })).toBeCloseTo((m.line.slope * 3) / 10, 10)
	})
})

describe("team-strength shocks", () => {
	it("normalQuantile inverts the normal distribution", () => {
		expect(normalQuantile(0.5)).toBeCloseTo(0, 9)
		expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5)
		expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 5)
		expect(normalQuantile(0.2)).toBeCloseTo(-normalQuantile(0.8), 9)
	})

	it("keep each game's average chance at the calibrated forecast", () => {
		for (const sigma of [0.3, 0.485, 0.7]) {
			for (const p of [0.15, 0.3, 0.5, 0.65, 0.85]) {
				const z = Math.log(p / (1 - p)) * stretch(sigma)
				// Average over two independent normal shocks (home and away) on a fine grid.
				let sum = 0
				let wsum = 0
				for (let i = -40; i <= 40; i++) {
					const x = (i / 40) * 4 * Math.SQRT2 * sigma
					const w = Math.exp(-(x * x) / (4 * sigma * sigma))
					sum += w * logistic(z + x)
					wsum += w
				}
				expect(sum / wsum, `p ${p} sigma ${sigma}`).toBeCloseTo(p, 1)
				expect(Math.abs(sum / wsum - p), `p ${p} sigma ${sigma}`).toBeLessThan(0.012)
			}
		}
	})
})
