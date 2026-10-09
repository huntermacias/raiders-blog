import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { clearPicks, pickRandom, seededRandom, setPick } from "@/lib/playoffs/picks"
import { NFL_LEAGUE, actualOutcome } from "@/lib/playoffs/season"
import { simulateSeason } from "@/lib/playoffs/simulator"
import type { Conference, Game, Outcome, Predictions } from "@/lib/playoffs/types"
import { MINI, beat, played, seasonOf, tied } from "./fixtures"

const games = getGames()
const openGames = games.filter((g) => actualOutcome(g) === null)

function deepFreeze<T>(o: T): T {
	if (o && typeof o === "object" && !Object.isFrozen(o)) {
		Object.freeze(o)
		for (const v of Object.values(o as object)) deepFreeze(v)
	}
	return o
}

/** A whole season with every game played: the strongest team always wins. Ranks are fixed by a seeded shuffle. */
function strengthSeason(seed: number) {
	const rand = seededRandom(seed)
	const order = [...NFL_LEAGUE.teams.map((t) => t.id)].sort(() => rand() - 0.5)
	const strength = new Map(order.map((id, i) => [id, i]))
	const out: Game[] = []
	let n = 0
	for (const conf of ["AFC", "NFC"] as Conference[]) {
		const ids = NFL_LEAGUE.teams.filter((t) => t.conference === conf).map((t) => t.id)
		for (let i = 0; i < ids.length; i++)
			for (let j = i + 1; j < ids.length; j++) {
				const [w, l] = (strength.get(ids[i]) as number) < (strength.get(ids[j]) as number) ? [ids[i], ids[j]] : [ids[j], ids[i]]
				out.push(played(w, l, 27, 20, 1 + (n++ % 17)))
			}
	}
	return { games: out, strength }
}

describe("the schedule in the repo", () => {
	it("has every team playing 17 games, with unique game ids", () => {
		const count = new Map<string, number>()
		for (const g of games) for (const t of [g.homeTeam, g.awayTeam]) count.set(t, (count.get(t) ?? 0) + 1)
		expect(count.size).toBe(32)
		expect(Array.from(count.values()).every((n) => n === 17)).toBe(true)
		expect(new Set(games.map((g) => g.id)).size).toBe(games.length)
		expect(games).toHaveLength(272)
		for (const t of Array.from(count.keys())) expect(NFL_LEAGUE.teams.some((x) => x.id === t)).toBe(true)
	})

	it("matches the played games to a final status, a score, and a winner or a tie", () => {
		for (const g of games) {
			if (g.status === "final") {
				expect(typeof g.homeScore).toBe("number")
				expect(g.tie).toBe(g.homeScore === g.awayScore)
				expect(g.winner).toBe(g.tie ? null : (g.homeScore as number) > (g.awayScore as number) ? g.homeTeam : g.awayTeam)
			} else {
				expect(g.winner).toBeNull()
				expect(g.homeScore).toBeNull()
			}
		}
	})
})

describe("simulateSeason on the real schedule", () => {
	it("with no picks, shows exactly the real records so far", () => {
		const sim = simulateSeason({ games })
		const wins = new Map<string, number>()
		for (const g of games) if (g.status === "final" && g.winner) wins.set(g.winner, (wins.get(g.winner) ?? 0) + 1)
		for (const t of NFL_LEAGUE.teams) expect(sim.teams[t.id].overall.w).toBe(wins.get(t.id) ?? 0)
		expect(sim.pickedGames).toBe(0)
		expect(sim.openGames).toBe(openGames.length)
		expect(sim.complete).toBe(false)
	})

	it("seeds seven teams in each conference, four of them division winners from four different divisions", () => {
		const sim = simulateSeason({ games })
		for (const conf of ["AFC", "NFC"] as Conference[]) {
			const seeds = sim.conferences[conf].seeds
			expect(seeds).toHaveLength(7)
			expect(new Set(seeds).size).toBe(7)
			const winners = seeds.slice(0, 4)
			expect(new Set(winners.map((t) => sim.teams[t].division)).size).toBe(4)
			expect(winners.every((t) => sim.teams[t].berth === "division")).toBe(true)
			expect(seeds.slice(4).every((t) => sim.teams[t].berth === "wildcard")).toBe(true)
			expect(seeds.every((t, i) => sim.teams[t].seed === i + 1)).toBe(true)
		}
		expect(sim.playoffTeams).toHaveLength(14)
	})

	it("gives the same answer every time, whatever order the games come in", () => {
		const preds = pickRandom(games, {}, seededRandom(11))
		const a = simulateSeason({ games, predictions: preds })
		const b = simulateSeason({ games, predictions: preds })
		const shuffled = [...games].sort((x, y) => (x.id < y.id ? 1 : -1))
		const c = simulateSeason({ games: shuffled, predictions: preds })
		expect(b).toEqual(a)
		expect(c).toEqual(a)
	})

	it("never changes what it is given", () => {
		const frozenGames = deepFreeze(structuredClone(games))
		const preds = deepFreeze(pickRandom(games, {}, seededRandom(5)))
		expect(() => simulateSeason({ games: frozenGames, predictions: preds })).not.toThrow()
	})

	it("adds a pick to the record, and changing it moves the record the other way", () => {
		const g = openGames[0]
		const base = simulateSeason({ games })
		const home = simulateSeason({ games, predictions: { [g.id]: "H" } })
		const away = simulateSeason({ games, predictions: { [g.id]: "A" } })
		const tie = simulateSeason({ games, predictions: { [g.id]: "T" } })
		expect(home.teams[g.homeTeam].overall.w).toBe(base.teams[g.homeTeam].overall.w + 1)
		expect(home.teams[g.awayTeam].overall.l).toBe(base.teams[g.awayTeam].overall.l + 1)
		expect(away.teams[g.awayTeam].overall.w).toBe(base.teams[g.awayTeam].overall.w + 1)
		expect(tie.teams[g.homeTeam].overall.t).toBe(1)
		expect(home.pickedGames).toBe(1)
	})

	it("counts a division game and a conference game in the right records", () => {
		const div = openGames.find((g) => NFL_LEAGUE.teams.find((t) => t.id === g.homeTeam)?.division === NFL_LEAGUE.teams.find((t) => t.id === g.awayTeam)?.division) as Game
		const sim0 = simulateSeason({ games })
		const sim1 = simulateSeason({ games, predictions: { [div.id]: "H" } })
		expect(sim1.teams[div.homeTeam].divisionRecord.w).toBe(sim0.teams[div.homeTeam].divisionRecord.w + 1)
		expect(sim1.teams[div.homeTeam].conferenceRecord.w).toBe(sim0.teams[div.homeTeam].conferenceRecord.w + 1)
		expect(sim1.teams[div.awayTeam].divisionRecord.l).toBe(sim0.teams[div.awayTeam].divisionRecord.l + 1)
	})

	it("locks a game that has been played: a pick for it changes nothing", () => {
		const finished = games.find((g) => g.status === "final") as Game
		const wrong: Outcome = finished.winner === finished.homeTeam ? "A" : "H"
		const base = simulateSeason({ games })
		const withPick = simulateSeason({ games, predictions: { [finished.id]: wrong } })
		expect(withPick).toEqual(base)
		expect(withPick.pickedGames).toBe(0)
		expect(setPick(games, {}, finished.id, wrong)).toEqual({})
	})

	it("reset removes picks and keeps the real results", () => {
		const preds = pickRandom(games, {}, seededRandom(3))
		const full = simulateSeason({ games, predictions: preds })
		expect(full.complete).toBe(true)
		const reset = simulateSeason({ games, predictions: clearPicks(games, preds) })
		expect(reset).toEqual(simulateSeason({ games }))
		expect(reset.teams.LV.overall).toEqual(simulateSeason({ games }).teams.LV.overall)
	})

	it("ignores picks for games that are not in the schedule", () => {
		const sim = simulateSeason({ games, predictions: { nope: "H" } })
		expect(sim).toEqual(simulateSeason({ games }))
	})

	it("refuses a schedule with a team that is not in the league", () => {
		expect(() => simulateSeason({ games: [beat("A1", "ZZZ")], league: MINI })).toThrow(/not in the league/)
	})
})

describe("obvious seasons give obvious seeds", () => {
	for (const seed of [1, 2, 3, 4, 5]) {
		it(`when the stronger team always wins (shuffle ${seed})`, () => {
			const { games: season, strength } = strengthSeason(seed)
			const sim = simulateSeason({ games: season })
			expect(sim.complete).toBe(true)
			for (const conf of ["AFC", "NFC"] as Conference[]) {
				const teams = NFL_LEAGUE.teams.filter((t) => t.conference === conf)
				const byStrength = [...teams].sort((a, b) => (strength.get(a.id) as number) - (strength.get(b.id) as number))
				const winners = new Map<string, string>()
				for (const t of byStrength) if (!winners.has(t.division)) winners.set(t.division, t.id)
				const seeds = byStrength.filter((t) => winners.get(t.division) === t.id).map((t) => t.id)
				const wildCards = byStrength.filter((t) => winners.get(t.division) !== t.id).slice(0, 3).map((t) => t.id)
				expect(sim.conferences[conf].seeds).toEqual([...seeds, ...wildCards])
				// With records this clear nothing is decided by a tiebreaker.
				expect(sim.ties.filter((d) => teams.some((t) => t.id === d.placed))).toEqual([])
			}
		})
	}

	it("marks the table in the order a reader expects", () => {
		const { games: season } = strengthSeason(9)
		const sim = simulateSeason({ games: season })
		for (const conf of ["AFC", "NFC"] as Conference[]) {
			const table = sim.conferences[conf].table
			expect(table).toHaveLength(16)
			expect(sim.teams[table[0]].clinchedTopSeed).toBe(true)
			table.forEach((id, i) => expect(sim.teams[id].rank).toBe(i + 1))
			expect(table.slice(7).every((id) => sim.teams[id].eliminated)).toBe(true)
			expect(table.slice(0, 7).every((id) => sim.teams[id].clinchedPlayoff)).toBe(true)
		}
	})
})

describe("any complete season gives a valid bracket", () => {
	it("holds over 150 random seasons, ties included", () => {
		for (let i = 0; i < 150; i++) {
			const rand = seededRandom(1000 + i)
			const preds: Record<string, Outcome> = {}
			for (const g of openGames) {
				const r = rand()
				preds[g.id] = r < 0.02 ? "T" : r < 0.51 ? "H" : "A"
			}
			const sim = simulateSeason({ games, predictions: preds })
			expect(sim.complete).toBe(true)
			for (const conf of ["AFC", "NFC"] as Conference[]) {
				const { seeds, table } = sim.conferences[conf]
				expect(seeds).toHaveLength(7)
				expect(new Set(table).size).toBe(16)
				const t = (id: string) => sim.teams[id]
				// Seeds 1-4 (division winners) are in record order, and so are seeds 5-7 (wild cards).
				for (let s = 1; s < 4; s++) expect(t(seeds[s - 1]).pct).toBeGreaterThanOrEqual(t(seeds[s]).pct)
				for (let s = 5; s < 7; s++) expect(t(seeds[s - 1]).pct).toBeGreaterThanOrEqual(t(seeds[s]).pct)
				// A wild card has at least the record of every team left out that is not a division winner.
				const out = table.slice(7)
				for (const id of out) expect(t(seeds[6]).pct).toBeGreaterThanOrEqual(t(id).pct)
				// Every division winner has the best record in its division.
				for (const [division, order] of Object.entries(sim.conferences[conf].divisions)) {
					const best = Math.max(...order.map((id) => t(id).pct))
					expect(t(order[0]).pct).toBe(best)
					expect(t(order[0]).division).toBe(division)
				}
				// The bracket is built from the seeds.
				const b = sim.bracket[conf]
				expect(b.byes).toEqual([{ seed: 1, team: seeds[0] }])
				expect(b.wildCard.map((g) => [g.homeSeed, g.awaySeed])).toEqual([
					[2, 7],
					[3, 6],
					[4, 5],
				])
			}
			expect(sim.eliminatedTeams).toHaveLength(18)
			expect(sim.clinchedTeams).toHaveLength(14)
		}
	})
})

describe("tied games", () => {
	it("count as half a win in the table", () => {
		const season = seasonOf([beat("A1", "B1"), tied("A1", "C1"), beat("C2", "A1")])
		expect(season.records.get("A1")?.overall).toEqual({ w: 1, l: 1, t: 1 })
		const sim = simulateSeason({ games: [beat("A1", "B1"), tied("A1", "C1"), beat("A2", "B2")], league: MINI })
		expect(sim.teams.A1.pct).toBe(0.75)
		expect(sim.teams.A2.pct).toBe(1)
		expect(sim.teams.A2.divisionRank).toBe(1)
		expect(sim.teams.A1.divisionRank).toBe(2)
	})

	it("can be picked for an open game", () => {
		const g = openGames[0]
		const sim = simulateSeason({ games, predictions: { [g.id]: "T" } as Predictions })
		expect(sim.teams[g.homeTeam].overall.t).toBe(1)
		expect(sim.teams[g.awayTeam].overall.t).toBe(1)
	})
})
