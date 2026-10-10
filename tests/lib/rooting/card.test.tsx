import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { buildRootingSpec, renderRootingCard, rootingCardSize } from "@/lib/og/rootingCard"
import { rootingSpec } from "@/lib/og/rootingSpec"
import { insightSpec } from "@/lib/og/insightSpecs"
import { renderCard, cardSize } from "@/lib/og/cards"
import { getRooting } from "@/lib/rooting/data"
import { buildRooting } from "@/lib/rooting/build"
import { pctText, pointsText } from "@/lib/rooting/guide"
import { GOALS } from "@/lib/rooting/types"
import { buildView, topThree } from "@/lib/rooting/view"
import { lateSeason } from "./helpers"

const data = getRooting()!
const games = getGames()
const TEAMS = NFL_LEAGUE.teams.map((t) => t.id)
const viewFor = (team: string, goal: (typeof GOALS)[number]) => buildView({ data, schedule: games, query: { team, goal, week: null, scope: "week" }, season: 2026 })

describe("the share card's spec", () => {
	it("is built for every team and goal from the same view as the page, top three first, in whole points", () => {
		for (const team of TEAMS) {
			for (const goal of GOALS) {
				const view = viewFor(team, goal)
				const spec = buildRootingSpec(view, { season: 2026, size: "wide" })
				expect(spec.type).toBe("rooting")
				expect(spec.team).toBe(team)
				expect(spec.goal).toBe(goal)
				expect(spec.week).toBe(view.week)
				expect(spec.picks.length).toBeLessThanOrEqual(3)
				expect(spec.picks.map((p) => p.abbr)).toEqual(topThree(view).map((r) => r.rootFor))
				spec.picks.forEach((p, i) => {
					expect(p.rank).toBe(i + 1)
					expect(p.big).toMatch(/^(\+\d+|\d+)$/)
					expect(p.then).toBeGreaterThanOrEqual(0)
					expect(p.then).toBeLessThanOrEqual(100)
					expect(["vs", "at"]).toContain(p.venue)
					expect(p.opp).not.toBe(p.abbr)
				})
				// The hero number is the same as the goal tile on the page.
				if (view.status === "live") expect(spec.hero.small).toBe("%")
			}
		}
	})

	it("never lists the team's own game as a game to root for; it is shown as the team's own stakes instead", () => {
		for (const team of TEAMS) {
			for (const goal of GOALS) {
				const view = viewFor(team, goal)
				const spec = buildRootingSpec(view, { season: 2026, size: "wide" })
				for (const p of spec.picks) {
					expect([p.abbr, p.opp], `${team} ${goal}`).not.toContain(team)
					expect(p.yours).toBe(false)
				}
				const mine = view.recs.find((r) => r.yours)
				expect(spec.own !== null).toBe(Boolean(mine && mine.pHome !== null && mine.pAway !== null))
				if (spec.own && mine) {
					const home = mine.home === team
					expect(spec.own.opp).toBe(home ? mine.away : mine.home)
					expect(spec.own.venue).toBe(home ? "vs" : "at")
				}
			}
		}
	})

	it("says what a win and a loss are each worth to the team in its own game, from its side", () => {
		const view = viewFor("LV", "playoffs")
		const mine = view.recs.find((r) => r.yours)!
		const spec = buildRootingSpec(view, { season: 2026, size: "wide" })
		const homeIsLV = mine.home === "LV"
		const win = (homeIsLV ? mine.pHome : mine.pAway) as number
		const loss = (homeIsLV ? mine.pAway : mine.pHome) as number
		expect(spec.own!.win).toEqual({ text: pctText(win), delta: pointsText(win - mine.baseline) })
		expect(spec.own!.loss).toEqual({ text: pctText(loss), delta: pointsText(loss - mine.baseline) })
		expect(win).toBeGreaterThan(loss)
	})

	it("shows the same chance the page shows for the goal, and a '+N' that is the gain over now", () => {
		const view = viewFor("LV", "playoffs")
		const spec = buildRootingSpec(view, { season: 2026, size: "tall" })
		const g = view.goals.find((x) => x.goal === "playoffs")!
		expect(spec.hero.big + spec.hero.small).toBe(g.text)
		const first = topThree(view)[0]
		expect(spec.picks[0].big).toBe(`+${Math.round((first.gain as number) * 100)}`)
		expect(spec.picks[0].nowText).toBe(g.text)
	})

	it("says a team that has clinched or is out has nothing to root for, rather than showing odds", () => {
		const late = lateSeason(6)
		const built = buildRooting(late, { season: 2026, generatedAt: "2026-12-30T12:00:00Z", source: "test", tieSims: 100, swingSims: 100, historySims: 100, completedWeeks: 1 })
		let clinched = false
		let out = false
		for (const team of TEAMS) {
			const view = buildView({ data: built, schedule: late, query: { team, goal: "playoffs", week: null, scope: "week" }, season: 2026 })
			const spec = buildRootingSpec(view, { season: 2026, size: "wide" })
			if (view.status === "clinched") {
				clinched = true
				expect(spec.hero.big).toBe("IN")
				expect(spec.picks).toHaveLength(0)
				expect(spec.message).toMatch(/clinched/)
			}
			if (view.status === "out") {
				out = true
				expect(spec.hero.big).toBe("OUT")
				expect(spec.hero.muted).toBe(true)
				expect(spec.message).toMatch(/eliminated/)
			}
		}
		expect(clinched && out).toBe(true)
	}, 60_000)

	it("sizes the card for the link preview and for the picture", () => {
		const view = viewFor("LV", "playoffs")
		expect(rootingCardSize({ size: "wide" })).toEqual({ width: 1200, height: 630 })
		expect(rootingCardSize({ size: "tall" })).toEqual({ width: 1080, height: 1350 })
		const tall = buildRootingSpec(view, { season: 2026, size: "tall" })
		expect(cardSize(tall)).toEqual({ width: 1080, height: 1350 })
		expect(renderCard(tall)).toBeTruthy()
		expect(renderRootingCard(buildRootingSpec(view, { season: 2026, size: "wide" }))).toBeTruthy()
	})
})

describe("the card request", () => {
	it("reads team, goal, week and size from the query, and falls back to something true", () => {
		const spec = rootingSpec({ team: "kc", goal: "bye", week: "5", size: "tall" })
		expect(spec).toMatchObject({ type: "rooting", team: "KC", goal: "bye", size: "tall" })
		expect(rootingSpec({ team: "ZZZ", goal: "?", size: "huge" })).toMatchObject({ team: "LV", goal: "playoffs", size: "wide" })
	})

	it("is chosen for type=rooting by the same router as the other insight cards", () => {
		const q = { type: "rooting", slug: "", view: "", rank: "", opp: "", week: "", team: "DEN", goal: "division" }
		expect(insightSpec(q)).toMatchObject({ type: "rooting", team: "DEN", goal: "division" })
	})
})
