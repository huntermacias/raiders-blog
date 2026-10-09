import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { DEFAULT_SIMS, MIN_BUCKET, homeChance, oddsRun, ratingsFor, simulateOdds, uniform } from "@/lib/playoffs/odds"
import { pickTeamGames } from "@/lib/playoffs/picks"
import { actualOutcome } from "@/lib/playoffs/season"
import { simulateSeason } from "@/lib/playoffs/simulator"
import type { Game, Predictions } from "@/lib/playoffs/types"
import { MINI, played, scheduled } from "./fixtures"

const games = getGames()
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function freeze<T>(x: T): T {
	if (x && typeof x === "object") {
		Object.freeze(x)
		for (const v of Object.values(x as Record<string, unknown>)) freeze(v)
	}
	return x
}

/** MINI league: A1 is 14-0 and C4 is 0-14 against the NFC, with three games each still to play. */
function lopsided(): Game[] {
	const ids = MINI.teams.filter((t) => t.conference === "AFC").map((t) => t.id)
	const NFC = ["N1", "N2", "N3", "N4"]
	const out: Game[] = []
	const rec = (team: string, w: number, l: number) => {
		for (let i = 0; i < w; i++) out.push(played(team, NFC[i % 4], 30, 10, 1 + (i % 14)))
		for (let i = 0; i < l; i++) out.push(played(NFC[i % 4], team, 30, 10, 1 + (i % 14)))
	}
	for (const id of ids) rec(id, id === "A1" ? 14 : id === "C4" ? 0 : 5, id === "A1" ? 0 : id === "C4" ? 14 : 9)
	const rounds: [number, number][][] = [
		[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i, i + 8] as [number, number]),
		[0, 1, 2, 3, 8, 9, 10, 11].map((i) => [i, i + 4] as [number, number]),
		[0, 1, 4, 5, 8, 9, 12, 13].map((i) => [i, i + 2] as [number, number]),
	]
	rounds.forEach((pairs, r) => pairs.forEach(([a, b]) => out.push(scheduled(ids[a], ids[b], 15 + r))))
	return out
}

describe("the dice", () => {
	it("gives the same number for the same simulation and game, always in [0, 1)", () => {
		expect(uniform(7, 3)).toBe(uniform(7, 3))
		expect(uniform(7, 3)).not.toBe(uniform(8, 3))
		expect(uniform(7, 3)).not.toBe(uniform(7, 4))
		let lo = 1
		let hi = 0
		let total = 0
		const n = 40000
		for (let i = 0; i < n; i++) {
			const u = uniform(i % 2000, Math.floor(i / 2000))
			lo = Math.min(lo, u)
			hi = Math.max(hi, u)
			total += u
		}
		expect(lo).toBeGreaterThanOrEqual(0)
		expect(hi).toBeLessThan(1)
		expect(total / n).toBeGreaterThan(0.49)
		expect(total / n).toBeLessThan(0.51)
	})

	it("is spread evenly enough that a 70% chance wins about 70% of the time", () => {
		let wins = 0
		for (let s = 0; s < 20000; s++) if (uniform(s, 11) < 0.7) wins++
		expect(wins / 20000).toBeGreaterThan(0.69)
		expect(wins / 20000).toBeLessThan(0.71)
	})
})

describe("ratings", () => {
	it("rate winners above losers and leave teams that have not played at 1500", () => {
		const r = ratingsFor(lopsided())
		expect(r.A1).toBeGreaterThan(1500)
		expect(r.C4).toBeLessThan(1500)
		expect(ratingsFor([scheduled("A1", "A2")]).A1).toBeUndefined()
	})

	it("make the home team the favorite when the teams are level, and by more when the visitors are weak", () => {
		expect(homeChance({}, { homeTeam: "A1", awayTeam: "A2" })).toBeGreaterThan(0.5)
		expect(homeChance({ A1: 1600, A2: 1400 }, { homeTeam: "A1", awayTeam: "A2" })).toBeGreaterThan(homeChance({ A1: 1500, A2: 1500 }, { homeTeam: "A1", awayTeam: "A2" }))
	})
})

describe("odds on the real schedule", () => {
	const lv = (picks: Predictions = {}, sims = 800) => simulateOdds({ games, predictions: picks, sims, track: "LV", trackGames: 3 })

	it("is deterministic: the same schedule and picks give identical odds", () => {
		expect(lv()).toEqual(lv())
	})

	it("is the same whether it runs in one go or a few at a time", () => {
		const run = oddsRun({ games, sims: 500, track: "LV" })
		while (!run.done) run.step(70)
		expect(run.played).toBe(500)
		expect(run.result()).toEqual(simulateOdds({ games, sims: 500, track: "LV" }))
	})

	it("hands out exactly seven berths and four division titles per conference in every simulated season", () => {
		const res = lv()
		for (const conf of ["AFC", "NFC"]) {
			const ids = Object.keys(res.teams).filter((t) => simulateSeason({ games }).teams[t].conference === conf)
			expect(ids).toHaveLength(16)
			expect(sum(ids.map((t) => res.teams[t].playoffs))).toBeCloseTo(7, 6)
			expect(sum(ids.map((t) => res.teams[t].division))).toBeCloseTo(4, 6)
			expect(sum(ids.map((t) => res.teams[t].bye))).toBeCloseTo(1, 6)
		}
	})

	it("keeps every number a valid chance, with the seed odds adding up to the playoff odds", () => {
		const res = lv()
		for (const o of Object.values(res.teams)) {
			expect(o.playoffs).toBeGreaterThanOrEqual(0)
			expect(o.playoffs).toBeLessThanOrEqual(1)
			expect(o.division).toBeLessThanOrEqual(o.playoffs + 1e-9)
			expect(o.seeds).toHaveLength(7)
			expect(sum(o.seeds)).toBeCloseTo(o.playoffs, 9)
			expect(o.bye).toBeCloseTo(o.seeds[0], 9)
		}
	})

	it("scores the tracked team's next games in order, with the odds if it wins and if it loses", () => {
		const res = lv()
		expect(res.leverage).toHaveLength(3)
		const weeks = res.leverage.map((g) => g.week)
		expect(weeks).toEqual([...weeks].sort((a, b) => a - b))
		for (const g of res.leverage) {
			expect(g.pWin).toBeGreaterThan(0)
			expect(g.pWin).toBeLessThan(1)
			expect(g.ifWin).not.toBeNull()
			expect(g.ifLose).not.toBeNull()
			// Winning a game never hurts: allow a hair of noise from the seasons that fall in each bucket.
			expect(g.ifWin as number).toBeGreaterThan((g.ifLose as number) - 0.02)
		}
		expect(res.leverage.every((g) => g.opp !== "LV")).toBe(true)
	})

	it("scores nothing when no team is tracked, and ignores a team that is not in the league", () => {
		expect(simulateOdds({ games, sims: 100 }).leverage).toEqual([])
		expect(simulateOdds({ games, sims: 100, track: "XXX" }).leverage).toEqual([])
	})

	it("makes the Raiders likelier to get in when they win out than when they lose out", () => {
		const open = games.filter((g) => actualOutcome(g) === null)
		expect(open.length).toBeGreaterThan(0)
		const win = lv(pickTeamGames(games, {}, "LV", "W")).teams.LV.playoffs
		const mid = lv().teams.LV.playoffs
		const lose = lv(pickTeamGames(games, {}, "LV", "L")).teams.LV.playoffs
		expect(win).toBeGreaterThan(mid)
		expect(mid).toBeGreaterThan(lose)
		expect(win).toBeGreaterThan(0.9)
		expect(lose).toBeLessThan(0.1)
	})

	it("compares scenarios on the same simulated seasons: one pick can only move a team's odds in the direction of the pick", () => {
		const g = games.find((x) => actualOutcome(x) === null && (x.homeTeam === "LV" || x.awayTeam === "LV")) as Game
		const lvHome = g.homeTeam === "LV"
		const base = lv().teams.LV.playoffs
		const win = lv({ [g.id]: lvHome ? "H" : "A" }).teams.LV.playoffs
		const lose = lv({ [g.id]: lvHome ? "A" : "H" }).teams.LV.playoffs
		expect(win).toBeGreaterThanOrEqual(base - 0.01)
		expect(lose).toBeLessThanOrEqual(base + 0.01)
		expect(win - lose).toBeGreaterThan(0.03)
	})

	it("does not change the games or the picks it is given", () => {
		const frozenGames = freeze(structuredClone(games))
		const frozenPicks = freeze({ [games.filter((g) => actualOutcome(g) === null)[0].id]: "H" } as Predictions)
		expect(() => simulateOdds({ games: frozenGames, predictions: frozenPicks, sims: 60, track: "LV" })).not.toThrow()
	})

	it("runs the default number of simulations when not told otherwise", () => {
		const run = oddsRun({ games })
		expect(run.total).toBe(DEFAULT_SIMS)
	})
})

describe("odds when the answer is obvious", () => {
	const g = lopsided()

	it("gives the team that cannot be caught every simulated season, and the team that cannot catch up none", () => {
		const res = simulateOdds({ games: g, league: MINI, sims: 400, track: "A1" })
		expect(res.teams.A1.playoffs).toBe(1)
		expect(res.teams.A1.division).toBe(1)
		expect(res.teams.A1.bye).toBe(1)
		expect(res.teams.C4.playoffs).toBe(0)
		expect(res.teams.C4.seeds.every((v) => v === 0)).toBe(true)
	})

	it("leaves a side too small to quote as null rather than a number from a handful of seasons", () => {
		// A1 wins each of these about 82% of the time, so with 400 seasons well under MIN_BUCKET of them are losses.
		const res = simulateOdds({ games: g, league: MINI, sims: 400, track: "A1", trackGames: 3 })
		expect(res.leverage).toHaveLength(3)
		for (const x of res.leverage) {
			expect(x.pWin).toBeGreaterThan(0.75)
			expect(x.ifWin).toBe(1)
			expect(x.ifLose).toBeNull()
			expect(x.swing).toBeNull()
		}
		expect(MIN_BUCKET).toBeGreaterThan(400 * 0.2)
	})
})

describe("odds once the season is over", () => {
	it("is the table itself: one simulation, and every number 0 or 1", () => {
		const all: Predictions = Object.fromEntries(games.filter((x) => actualOutcome(x) === null).map((x) => [x.id, "H" as const]))
		const res = simulateOdds({ games, predictions: all, sims: 5000, track: "LV" })
		expect(res.exact).toBe(true)
		expect(res.sims).toBe(1)
		const sim = simulateSeason({ games, predictions: all })
		for (const t of Object.values(sim.teams)) {
			expect(res.teams[t.team].playoffs).toBe(t.seed === null ? 0 : 1)
			if (t.seed !== null) expect(res.teams[t.team].seeds[t.seed - 1]).toBe(1)
			expect(res.teams[t.team].division).toBe(t.berth === "division" ? 1 : 0)
		}
		expect(res.leverage).toEqual([])
	})
})
