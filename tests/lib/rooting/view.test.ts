import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { teamByAbbr } from "@/lib/nfl"
import { pointsText, rankGames } from "@/lib/rooting/guide"
import { getRooting } from "@/lib/rooting/data"
import { settledGames } from "@/lib/rooting/live"
import { type GuideQuery, readQuery } from "@/lib/rooting/share"
import { GOALS, SCALE } from "@/lib/rooting/types"
import { isRootingData } from "@/lib/rooting/validate"
import { buildView, guideWeek, isStale, shareText, topThree } from "@/lib/rooting/view"
import { buildRooting } from "@/lib/rooting/build"
import { resultsKey } from "@/lib/rooting/engine"
import { lateSeason } from "./helpers"

const data = getRooting()!
const games = getGames()
const TEAMS = NFL_LEAGUE.teams.map((t) => t.id)
const q = (team: string, goal: GuideQuery["goal"] = "playoffs", scope: GuideQuery["scope"] = "week", week: number | null = null): GuideQuery => ({ team, goal, week, scope })

describe("the stored guide", () => {
	it("is valid and was built from the schedule file in the repo, so nothing is stale", () => {
		expect(data).not.toBeNull()
		expect(isRootingData(data)).toBe(true)
		expect(isStale(data, games)).toBe(false)
		expect(data.teams).toHaveLength(32)
		expect(data.baseline).toHaveLength(96)
	})

	it("is rejected when it is damaged or from an older model", () => {
		expect(isRootingData(null)).toBe(false)
		expect(isRootingData({})).toBe(false)
		expect(isRootingData({ ...data, version: data.version + 1 })).toBe(false)
		expect(isRootingData({ ...data, baseline: data.baseline.slice(1) })).toBe(false)
		expect(isRootingData({ ...data, games: [{ ...data.games[0], H: [1] }] })).toBe(false)
		expect(isRootingData({ ...data, ties: { x: [1, 2] } })).toBe(false)
	})

	it("has every probability in range and the open games match the schedule", () => {
		for (const v of data.baseline) expect(v >= 0 && v <= SCALE).toBe(true)
		const open = games.filter((g) => g.status !== "final").map((g) => g.id).sort()
		expect(data.games.map((g) => g.id).sort()).toEqual(open)
		for (const g of data.games) {
			for (const v of [...g.H, ...g.A]) expect(v >= 0 && v <= SCALE).toBe(true)
		}
	})

	it("has each division won by exactly one team on average: the division baselines of a division add to 100%", () => {
		const byDivision = new Map<string, number>()
		for (const t of TEAMS) byDivision.set(teamByAbbr(t).division, (byDivision.get(teamByAbbr(t).division) ?? 0) + data.baseline[data.teams.indexOf(t) * 3 + 1])
		for (const [div, total] of Array.from(byDivision.entries())) expect(Math.abs(total / SCALE - 1), div).toBeLessThan(1e-3)
	})
})

describe("the view, for all 32 teams and every goal", () => {
	it("builds without error and tells a coherent story", () => {
		for (const team of TEAMS) {
			for (const goal of GOALS) {
				const v = buildView({ data, schedule: games, query: q(team, goal, "all"), season: 2026 })
				expect(v.team, team).toBe(team)
				expect(v.goals).toHaveLength(3)
				expect(v.standing.record, team).toMatch(/^\d+-\d+(-\d+)?$/)
				expect(v.week).toBe(guideWeek(data))
				// Ranked by spread, never recommending a game without saying who to root for.
				for (let i = 1; i < v.recs.length; i++) expect(v.recs[i - 1].spread).toBeGreaterThanOrEqual(v.recs[i].spread)
				for (const r of v.recs) {
					expect(r.rootFor, `${team} ${goal} ${r.gameId}`).toBeTruthy()
					expect([r.home, r.away]).toContain(r.rootFor)
					expect(r.rootAgainst).not.toBe(r.rootFor)
					expect(r.impact).not.toBe("none")
					expect(r.gain!).toBeGreaterThanOrEqual(-1e-9)
					expect(r.bestP!).toBeGreaterThanOrEqual(r.worstP!)
				}
				// A team's own games are marked as such.
				for (const r of v.recs) expect(r.yours).toBe(r.home === team || r.away === team)
			}
		}
	})

	it("scopes to the current week by default and to every week with scope=all", () => {
		const week = buildView({ data, schedule: games, query: q("LV"), season: 2026 })
		const all = buildView({ data, schedule: games, query: q("LV", "playoffs", "all"), season: 2026 })
		expect(week.recs.every((r) => r.week === week.week)).toBe(true)
		expect(all.recs.length).toBeGreaterThanOrEqual(week.recs.length)
		expect(all.recs.length).toBe(all.remaining)
	})

	it("matches the share text to the top of the list, in points", () => {
		const v = buildView({ data, schedule: games, query: q("LV", "playoffs", "all"), season: 2026 })
		const text = shareText(v)
		expect(text).toContain("rooting guide")
		const top = topThree(v)
		expect(top.length).toBeLessThanOrEqual(3)
		expect(text).toContain(`1. ${teamByAbbr(top[0].rootFor as string).nick} win (${pointsText(top[0].gain ?? 0)})`)
		expect(text).not.toContain("%")
	})

	it("says when a link was made for another week, and shows the current one", () => {
		const v = buildView({ data, schedule: games, query: q("LV", "playoffs", "week", 3), season: 2026 })
		expect(v.week).not.toBe(3)
		expect(v.weekNote).toMatch(/Week 3/)
		expect(buildView({ data, schedule: games, query: q("LV", "playoffs", "week", v.week), season: 2026 }).weekNote).toBeNull()
	})

	it("notes a guide built for another season", () => {
		const v = buildView({ data, schedule: games, query: q("LV"), season: 2025 })
		expect(v.notes.join(" ")).toMatch(/different season/)
	})
})

describe("a result that arrives before the guide is rebuilt", () => {
	const open = data.games[0]
	const finalized = games.map((g) => (g.id === open.id ? { ...g, status: "final" as const, homeScore: 27, awayScore: 20, winner: g.homeTeam } : g))

	it("is stale as soon as a final score is in the schedule, because the key no longer matches", () => {
		expect(isStale(data, finalized)).toBe(true)
		expect(resultsKey(finalized)).not.toBe(resultsKey(games))
	})

	it("comes off the actionable list when the schedule says it is over", () => {
		const settled = settledGames(data, finalized)
		expect(settled.map((s) => s.gameId)).toEqual([open.id])
		const v = buildView({ data, schedule: finalized, query: q(open.home, "playoffs", "all"), settled, season: 2026 })
		expect(v.recs.map((r) => r.gameId)).not.toContain(open.id)
		expect(v.stale).toBe(true)
		expect(v.notes.join(" ")).toMatch(/final score has come in/)
		expect(v.notes.join(" ")).toMatch(/just ended/)
	})

	it("comes off the list when ESPN says it is over, matched by teams, and ignores games not over", () => {
		const settled = settledGames(data, games, [
			{ state: "post", home: { abbr: open.home, score: 31 }, away: { abbr: open.away, score: 10 } },
			{ state: "in", home: { abbr: data.games[1].home, score: 3 }, away: { abbr: data.games[1].away, score: 0 } },
			{ state: "post", home: { abbr: "XXX", score: 1 }, away: { abbr: "YYY", score: 0 } },
		])
		expect(settled).toHaveLength(1)
		expect(settled[0]).toMatchObject({ gameId: open.id, homeScore: 31, awayScore: 10, source: "espn" })
	})

	it("does not list a game twice when the schedule and ESPN both know it", () => {
		const settled = settledGames(data, finalized, [{ state: "post", home: { abbr: open.home, score: 27 }, away: { abbr: open.away, score: 20 } }])
		expect(settled).toHaveLength(1)
		expect(settled[0].source).toBe("schedule")
	})

	it("moves the guide to the next week once the last game of the week is over", () => {
		const week = guideWeek(data)!
		const thisWeek = data.games.filter((g) => g.week === week)
		const settled = thisWeek.map((g) => ({ gameId: g.id, away: g.away, home: g.home, awayScore: 0, homeScore: 1, source: "espn" as const }))
		expect(guideWeek(data, settled)).toBeGreaterThan(week)
	})

	it("is not stale when the schedule is unchanged", () => {
		expect(buildView({ data, schedule: games, query: q("LV"), season: 2026 }).stale).toBe(false)
	})
})

describe("how it reads late in the season (a full season played out with six games left)", () => {
	const late = lateSeason(6)
	const built = buildRooting(late, { season: 2026, generatedAt: "2026-12-30T12:00:00Z", source: "test", tieSims: 300, swingSims: 200, historySims: 200, completedWeeks: 1 })
	const view = (team: string, goal: GuideQuery["goal"], scope: GuideQuery["scope"] = "all") => buildView({ data: built, schedule: late, query: q(team, goal, scope), season: 2026 })

	it("counts every ending exactly, with no error bars", () => {
		expect(built.exact).toBe(true)
		expect(built.sims).toBe(0)
		expect(built.open).toBe(6)
		for (const r of rankGames(built, "LV", "playoffs")) expect(r.se).toBe(0)
		expect(isStale(built, late)).toBe(false)
	})

	it("finds clinched and eliminated teams, and shows an explanation instead of a list and a probability", () => {
		let clinched: ReturnType<typeof view> | null = null
		let out: ReturnType<typeof view> | null = null
		for (const t of TEAMS) {
			const v = view(t, "playoffs")
			if (v.status === "clinched" && !clinched) clinched = v
			if (v.status === "out" && !out) out = v
		}
		expect(clinched, "some team has clinched").not.toBeNull()
		expect(out, "some team is out").not.toBeNull()
		expect(clinched!.empty).toBe("clinched")
		expect(clinched!.recs).toHaveLength(0)
		expect(clinched!.emptyText).toMatch(/clinched/)
		expect(clinched!.goals.find((g) => g.goal === "playoffs")!.text).toBe("Clinched")
		expect(out!.empty).toBe("out")
		expect(out!.recs).toHaveLength(0)
		expect(out!.emptyText).toMatch(/eliminated/)
		expect(out!.goals.find((g) => g.goal === "playoffs")!.text).toBe("Eliminated")
		expect(shareText(out!)).toMatch(/eliminated/)
	})

	it("never shows a 0% or 100% for something still open, and shows clinched ones as the standings prove them", () => {
		for (const t of TEAMS) {
			for (const goal of GOALS) {
				const v = view(t, goal)
				const g = v.goals.find((x) => x.goal === goal)!
				if (g.status === "live") {
					expect(g.text, `${t} ${goal}`).not.toBe("Clinched")
					expect(g.text).not.toBe("Eliminated")
				}
				if (g.status !== "live") expect(v.recs).toHaveLength(0)
			}
		}
	})

	it("agrees with the proof: a team that is out has an exact probability of zero, and a clinched one of one", () => {
		for (const t of TEAMS) {
			const v = view(t, "playoffs")
			const p = built.baseline[built.teams.indexOf(t) * 3] / SCALE
			if (v.status === "clinched") expect(p, t).toBeCloseTo(1, 3)
			if (v.status === "out") expect(p, t).toBeCloseTo(0, 3)
		}
	})

	it("finds the games that matter: a live team's own game is ranked first or has a real effect", () => {
		let seen = 0
		for (const t of TEAMS) {
			const v = view(t, "playoffs")
			if (v.status !== "live" || !v.recs.length) continue
			seen++
			expect(v.recs[0].spread).toBeGreaterThan(0.01)
		}
		expect(seen).toBeGreaterThan(0)
	})

	it("has an empty state for a week with nothing that matters, or none left", () => {
		const done = lateSeason(0)
		const finished = buildRooting(done, { season: 2026, generatedAt: "2026-12-30T12:00:00Z", source: "test", tieSims: 10, swingSims: 50, historySims: 50, completedWeeks: 1 })
		const v = buildView({ data: finished, schedule: done, query: q("LV", "playoffs"), season: 2026 })
		expect(v.week).toBeNull()
		expect(v.empty).toBe("season-over")
		expect(v.recs).toHaveLength(0)
	}, 60_000)
})

describe("the share link works for every team", () => {
	it("reads straight back to the same team", () => {
		for (const t of TEAMS) expect(readQuery({ team: t }, new Set(TEAMS)).team).toBe(t)
	})
})
