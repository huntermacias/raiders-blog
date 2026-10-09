// @vitest-environment node
import { describe, expect, it } from "vitest"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

import { getGames, getSchedule } from "@/lib/playoffs/data"
import { PAGE_SIMS, simulateOdds } from "@/lib/playoffs/odds"
import { pickHomeTeams, pickTeamGames } from "@/lib/playoffs/picks"
import { encodeScenario } from "@/lib/playoffs/share"
import { simulateSeason } from "@/lib/playoffs/simulator"
import { scenarioStory } from "@/lib/playoffs/summary"
import type { Predictions } from "@/lib/playoffs/types"
import { OG_HEIGHT, OG_WIDTH, cardSize, renderCard } from "@/lib/og/cards"
import { ogFonts } from "@/lib/og/fonts"
import { buildPlayoffsSpec } from "@/lib/og/playoffsCard"
import { playoffsSpec } from "@/lib/og/playoffsSpec"

const games = getGames()
const schedule = getSchedule()
const ctx = { season: schedule.season, throughWeek: schedule.throughWeek }

function spec(team: string, picks: Predictions, size: "wide" | "tall" = "wide", withOdds = true) {
	const sim = simulateSeason({ games, predictions: picks })
	const odds = withOdds ? simulateOdds({ games, predictions: picks, sims: 300, track: team }) : null
	return buildPlayoffsSpec({ sim, odds, team, picks: Object.keys(picks).length, size, ...ctx })!
}

const full = (team: string, result: "W" | "L"): Predictions => pickHomeTeams(games, pickTeamGames(games, {}, team, result), { keepPicks: true })

describe("the playoff machine card's spec", () => {
	it("is the state of the race when nothing is picked: the team's odds, seed and the real bracket", () => {
		const s = spec("LV", {})
		expect(s.picks).toBe(0)
		expect(s.team).toBe("LV")
		expect(s.nick).toBe("Raiders")
		expect(s.conference).toBe("AFC")
		expect(s.odds).not.toBeNull()
		expect(s.odds as number).toBeGreaterThan(0)
		expect(s.odds as number).toBeLessThan(1)
		expect(s.complete).toBe(false)
		const sim = simulateSeason({ games })
		expect(s.seed).toBe(sim.teams.LV.seed)
		expect(s.record).toBe(`${sim.teams.LV.overall.w}-${sim.teams.LV.overall.l}`)
	})

	it("draws the same bracket the simulation made: one bye, 2 hosts 7, 3 hosts 6, 4 hosts 5", () => {
		const s = spec("LV", {})
		const sim = simulateSeason({ games })
		expect(s.bracket.byes.map((b) => b.abbr)).toEqual(sim.bracket.AFC.byes.map((b) => b.team))
		expect(s.bracket.games.map((g) => [g.home.seed, g.away.seed])).toEqual([[2, 7], [3, 6], [4, 5]])
		expect(s.bracket.games.map((g) => [g.home.abbr, g.away.abbr])).toEqual(sim.bracket.AFC.wildCard.map((g) => [g.home, g.away]))
		const seats = [...s.bracket.byes, ...s.bracket.games.flatMap((g) => [g.home, g.away])]
		expect(seats.filter((x) => x.me).map((x) => x.abbr)).toEqual(sim.teams.LV.seed ? ["LV"] : [])
		expect(s.other.conference).toBe("NFC")
		expect(s.other.seeds.map((x) => x.seed)).toEqual([1, 2, 3, 4, 5, 6, 7])
	})

	it("says what a scenario produced, from the simulation: the bye for a team that wins out", () => {
		const picks = full("LV", "W")
		const s = spec("LV", picks, "wide", false)
		const sim = simulateSeason({ games, predictions: picks })
		expect(s.picks).toBe(Object.keys(picks).length)
		expect(s.complete).toBe(true)
		expect(s.odds).toBeNull()
		expect(s.seed).toBe(sim.teams.LV.seed)
		expect(s.story).toBe(scenarioStory(sim, "LV"))
		expect(s.story).toContain("Raiders")
	})

	it("shows a team that loses out as out, with no odds and no seat in the bracket", () => {
		const s = spec("LV", full("LV", "L"), "wide", false)
		expect(s.seed).toBeNull()
		expect(s.story).toMatch(/miss the playoffs/)
		const seats = [...s.bracket.byes, ...s.bracket.games.flatMap((g) => [g.home, g.away])]
		expect(seats.some((x) => x.me)).toBe(false)
		expect(seats).toHaveLength(7)
	})

	it("follows any team: the card is about that team, in its conference", () => {
		const s = spec("GB", {})
		expect(s.nick).toBe("Packers")
		expect(s.conference).toBe("NFC")
		expect(s.other.conference).toBe("AFC")
		expect(spec("KC", {}).conference).toBe("AFC")
	})

	it("returns nothing for a team that is not in the league", () => {
		const sim = simulateSeason({ games })
		expect(buildPlayoffsSpec({ sim, odds: null, team: "XXX", picks: 0, size: "wide", ...ctx })).toBeNull()
	})

	it("leaves odds out when the season is complete, even if odds were handed in", () => {
		const picks = full("LV", "W")
		const sim = simulateSeason({ games, predictions: picks })
		const odds = simulateOdds({ games, predictions: picks, sims: 50 })
		expect(odds.exact).toBe(true)
		expect(buildPlayoffsSpec({ sim, odds, team: "LV", picks: 1, size: "wide", ...ctx })!.odds).toBeNull()
	})

	it("gives the odds the page shows: the same number of simulated seasons, so the card and the page agree", () => {
		const fromCard = playoffsSpec({}) as ReturnType<typeof spec>
		const page = simulateOdds({ games, sims: PAGE_SIMS, track: "LV" })
		expect(fromCard.odds).toBe(page.teams.LV.playoffs)
	})
})

describe("choosing the card from a request", () => {
	it("reads the scenario, the team and the size", () => {
		const picks = full("KC", "W")
		const code = encodeScenario(games, picks)
		const s = playoffsSpec({ s: code, t: "kc", size: "tall" }) as ReturnType<typeof spec>
		expect(s.type).toBe("playoffs")
		expect(s.team).toBe("KC")
		expect(s.size).toBe("tall")
		expect(s.picks).toBe(Object.keys(picks).length)
		expect(cardSize(s)).toEqual({ width: 1080, height: 1350 })
	})

	it("is the plain wide Raiders card for a request with nothing in it, and for an unknown size or team", () => {
		for (const q of [{}, { size: "huge" }, { t: "ZZZ" }, { t: "" }]) {
			const s = playoffsSpec(q) as ReturnType<typeof spec>
			expect(s.team).toBe("LV")
			expect(s.size).toBe("wide")
			expect(cardSize(s)).toEqual({ width: OG_WIDTH, height: OG_HEIGHT })
		}
	})

	it("shows the race as it stands for a code from another schedule or a damaged code, never an error", () => {
		for (const code of ["1zzzzAAAA", "garbage", "9abcd", "1"]) {
			const s = playoffsSpec({ s: code }) as ReturnType<typeof spec>
			expect(s.picks).toBe(0)
			expect(s.team).toBe("LV")
		}
	})
})

describe("drawing the card", () => {
	const png = async (s: ReturnType<typeof spec>) => {
		const { width, height } = cardSize(s)
		const svg = await satori(renderCard(s), { width, height, fonts: ogFonts() as never })
		return { bytes: new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng(), svg }
	}

	it("renders the wide card for the race as it stands, and for a scenario where the team is out", async () => {
		const a = await png(spec("LV", {}))
		expect(a.bytes.subarray(1, 4).toString()).toBe("PNG")
		const b = await png(spec("LV", full("LV", "L"), "wide", false))
		expect(b.bytes.subarray(1, 4).toString()).toBe("PNG")
	}, 60000)

	it("renders the tall card for a team in the other conference", async () => {
		const c = await png(spec("GB", full("GB", "W"), "tall", false))
		expect(c.bytes.subarray(1, 4).toString()).toBe("PNG")
	}, 60000)
})
