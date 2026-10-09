import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { crossedMilestone, newlyCompletedWeeks } from "@/lib/playoffs/events"
import {
	clearPicks,
	favoritesAvailable,
	firstOpenWeek,
	pickFavorites,
	pickHomeTeams,
	pickRandom,
	pickTeamGames,
	sanitizePicks,
	seededRandom,
	setPick,
	weekProgress,
} from "@/lib/playoffs/picks"
import { actualOutcome } from "@/lib/playoffs/season"
import type { Game, Predictions } from "@/lib/playoffs/types"

const games = getGames()
const open = games.filter((g) => actualOutcome(g) === null)
const week = (w: number) => open.filter((g) => g.week === w)

describe("making picks", () => {
	it("picks a winner, switches it, and takes it back when the same team is tapped again", () => {
		const g = open[0]
		const a = setPick(games, {}, g.id, "H")
		expect(a[g.id]).toBe("H")
		expect(setPick(games, a, g.id, "A")[g.id]).toBe("A")
		expect(setPick(games, a, g.id, "H")[g.id]).toBeUndefined()
	})

	it("never changes the object it was given", () => {
		const before: Predictions = Object.freeze({ [open[0].id]: "H" })
		expect(() => setPick(games, before, open[1].id, "A")).not.toThrow()
		expect(before).toEqual({ [open[0].id]: "H" })
	})

	it("cannot pick a game that was played, or one that does not exist", () => {
		const finished = games.find((g) => g.status === "final")!
		expect(setPick(games, {}, finished.id, "H")).toEqual({})
		expect(setPick(games, {}, "nope", "H")).toEqual({})
	})

	it("cleans out picks that no longer apply", () => {
		const finished = games.find((g) => g.status === "final")!
		const dirty = { [finished.id]: "H", nope: "A", [open[0].id]: "T", [open[1].id]: "X" } as unknown as Predictions
		expect(sanitizePicks(games, dirty)).toEqual({ [open[0].id]: "T" })
		expect(sanitizePicks(games, null)).toEqual({})
	})
})

describe("filling in many games", () => {
	it("picks the home team in every open game and leaves played games alone", () => {
		const picks = pickHomeTeams(games, {})
		expect(Object.keys(picks)).toHaveLength(open.length)
		expect(Object.values(picks).every((v) => v === "H")).toBe(true)
	})

	it("can be limited to a week, and keeps picks from other weeks", () => {
		const before = { [week(7)[0].id]: "A" as const }
		const picks = pickHomeTeams(games, before, { weeks: [6] })
		expect(Object.keys(picks)).toHaveLength(week(6).length + 1)
		expect(picks[week(7)[0].id]).toBe("A")
	})

	it("can fill in only the games that have no pick yet", () => {
		const mine = { [week(6)[0].id]: "A" as const, [week(7)[0].id]: "T" as const }
		const home = pickHomeTeams(games, mine, { keepPicks: true })
		expect(home[week(6)[0].id]).toBe("A")
		expect(home[week(7)[0].id]).toBe("T")
		expect(Object.keys(home)).toHaveLength(open.length)
		const rand = pickRandom(games, mine, seededRandom(1), { keepPicks: true, weeks: [6] })
		expect(rand[week(6)[0].id]).toBe("A")
		expect(Object.keys(rand)).toHaveLength(week(6).length + 1)
		// Without it, the fill replaces what was there.
		expect(pickHomeTeams(games, mine)[week(6)[0].id]).toBe("H")
	})

	it("randomizes the same way for the same seed and differently for another", () => {
		const a = pickRandom(games, {}, seededRandom(7))
		const b = pickRandom(games, {}, seededRandom(7))
		const c = pickRandom(games, {}, seededRandom(8))
		expect(a).toEqual(b)
		expect(a).not.toEqual(c)
		expect(Object.values(a).every((v) => v === "H" || v === "A")).toBe(true)
		const homes = Object.values(a).filter((v) => v === "H").length
		expect(homes).toBeGreaterThan(open.length * 0.35)
		expect(homes).toBeLessThan(open.length * 0.65)
	})

	it("picks favorites only where the schedule has a real spread, and never guesses the rest", () => {
		const withLines: Game[] = games.map((g) => g)
		const lined = open.filter((g) => typeof g.spread === "number" && g.spread !== 0)
		expect(favoritesAvailable(withLines)).toBe(lined.length)
		const picks = pickFavorites(withLines, {})
		expect(Object.keys(picks)).toHaveLength(lined.length)
		for (const g of lined) expect(picks[g.id]).toBe((g.spread as number) > 0 ? "H" : "A")
		// A game with no line is not picked, even though the button was pressed.
		const noLine = open.find((g) => g.spread === null || g.spread === undefined)!
		expect(picks[noLine.id]).toBeUndefined()
	})

	it("resets everything, or just some weeks", () => {
		const all = pickHomeTeams(games, {})
		expect(clearPicks(games, all)).toEqual({})
		const partial = clearPicks(games, all, { weeks: [6] })
		expect(Object.keys(partial)).toHaveLength(open.length - week(6).length)
	})
})

describe("progress through the season", () => {
	it("finds the first week with something left to pick", () => {
		expect(firstOpenWeek(games)).toBe(Math.min(...open.map((g) => g.week)))
		expect(firstOpenWeek(games.filter((g) => g.status === "final"))).toBe(5)
	})

	it("counts played, picked and open games for each week", () => {
		const picks = { [week(6)[0].id]: "H" as const }
		const w6 = weekProgress(games, picks).find((w) => w.week === 6)!
		expect(w6).toMatchObject({ played: 0, picked: 1, total: week(6).length, open: week(6).length - 1 })
	})
})

describe("when analytics should hear about picks", () => {
	it("reports only at a few round numbers, and never going backwards", () => {
		expect(crossedMilestone(0, 1)).toBe(1)
		expect(crossedMilestone(1, 2)).toBeNull()
		expect(crossedMilestone(4, 5)).toBe(5)
		expect(crossedMilestone(0, 14)).toBe(10)
		expect(crossedMilestone(9, 8)).toBeNull()
		expect(crossedMilestone(200, 207)).toBeNull()
	})

	it("reports a week once, when its last open game gets a pick", () => {
		const w = week(6)
		const almost = Object.fromEntries(w.slice(1).map((g) => [g.id, "H" as const]))
		const done = { ...almost, [w[0].id]: "A" as const }
		expect(newlyCompletedWeeks(games, almost, done)).toEqual([6])
		expect(newlyCompletedWeeks(games, done, { ...done })).toEqual([])
		expect(newlyCompletedWeeks(games, {}, {})).toEqual([])
	})
})

describe("picking a team's games", () => {
  it("sends every open game a team plays its way, leaves the other games alone, and never touches played games", () => {
    const win = pickTeamGames(games, {}, "LV", "W")
    const lose = pickTeamGames(games, {}, "LV", "L")
    const mine = open.filter((g) => g.homeTeam === "LV" || g.awayTeam === "LV")
    expect(mine.length).toBeGreaterThan(5)
    expect(Object.keys(win).sort()).toEqual(mine.map((g) => g.id).sort())
    for (const g of mine) {
      const home = g.homeTeam === "LV"
      expect(win[g.id]).toBe(home ? "H" : "A")
      expect(lose[g.id]).toBe(home ? "A" : "H")
    }
    const other = open.find((g) => g.homeTeam !== "LV" && g.awayTeam !== "LV") as Game
    expect(pickTeamGames(games, { [other.id]: "T" }, "LV", "W")[other.id]).toBe("T")
    const playedGame = games.find((g) => actualOutcome(g) !== null && (g.homeTeam === "LV" || g.awayTeam === "LV")) as Game
    expect(pickTeamGames(games, {}, "LV", "W")[playedGame.id]).toBeUndefined()
  })

  it("honors a scope, and does not change the picks it was given", () => {
    const given = Object.freeze({}) as Predictions
    const w = pickTeamGames(games, given, "LV", "W", { weeks: [6] })
    expect(Object.keys(w).every((id) => (games.find((g) => g.id === id) as Game).week === 6)).toBe(true)
    expect(Object.keys(given)).toHaveLength(0)
    const first = open.find((g) => g.homeTeam === "LV" || g.awayTeam === "LV") as Game
    const kept = pickTeamGames(games, { [first.id]: "T" }, "LV", "W", { keepPicks: true })
    expect(kept[first.id]).toBe("T")
  })
})
