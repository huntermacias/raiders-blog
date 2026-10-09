import { describe, expect, it } from "vitest"

import { teamByAbbr } from "@/lib/nfl"
import { getGames } from "@/lib/playoffs/data"
import { pickHomeTeams } from "@/lib/playoffs/picks"
import { simulateSeason } from "@/lib/playoffs/simulator"
import { scenarioStory } from "@/lib/playoffs/summary"

const games = getGames()

describe("the one-sentence story of a scenario", () => {
	// Every open game goes to the home team, which gives a spread of outcomes across the league: byes, division winners, wild cards and misses.
	const sim = simulateSeason({ games, predictions: pickHomeTeams(games, {}, { keepPicks: true }) })
	const teams = Object.keys(sim.teams)
	const stories = Object.fromEntries(teams.map((t) => [t, scenarioStory(sim, t) as string]))

	it("has a sentence for every team and none for a team that does not exist", () => {
		for (const t of teams) expect(stories[t], t).toMatch(/^The .+ \S+.*\.$/)
		expect(scenarioStory(sim, "XXX")).toBeNull()
	})

	it("names the team, its record and what the simulation did with it", () => {
		for (const t of teams) {
			const team = sim.teams[t]
			const nick = teamByAbbr(t).nick
			const story = stories[t]
			expect(story.startsWith(`The ${nick} `), t).toBe(true)
			expect(story, t).toContain(`${team.overall.w}-${team.overall.l}`)
			if (team.seed === null) {
				expect(story, t).toMatch(/miss the playoffs/)
			} else if (sim.bracket[team.conference].byes.some((b) => b.team === t)) {
				expect(story, t).toMatch(new RegExp(`take the No\\. ${team.seed} seed and a first-round bye`))
			} else if (team.berth === "division") {
				expect(story, t).toMatch(/win the .+ and host the No\. [2-7] seed/)
			} else {
				expect(story, t).toMatch(new RegExp(`get in as the No\\. ${team.seed} seed .+ and visit the No\\. [1-7] seed`))
			}
		}
	})

	it("names the opponent the bracket actually has, with the seed the bracket gives it", () => {
		for (const t of teams) {
			const team = sim.teams[t]
			if (team.seed === null) continue
			const game = sim.bracket[team.conference].wildCard.find((g) => g.home === t || g.away === t)
			if (!game) continue
			const home = game.home === t
			const opp = home ? game.away : game.home
			const oppSeed = home ? game.awaySeed : game.homeSeed
			expect(stories[t], t).toContain(`the No. ${oppSeed} seed, the ${teamByAbbr(opp).nick}`)
		}
	})

	it("covers every kind of ending across the league", () => {
		const all = Object.values(stories).join("\n")
		expect(all).toMatch(/first-round bye/)
		expect(all).toMatch(/win the .+ and host/)
		expect(all).toMatch(/get in as the No\. [5-7] seed/)
		expect(all).toMatch(/miss the playoffs/)
	})
})
