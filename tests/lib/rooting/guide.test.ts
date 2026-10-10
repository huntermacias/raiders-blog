import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { buildRooting, finishedWeeks } from "@/lib/rooting/build"
import { resultsKey, gamesThroughWeek } from "@/lib/rooting/engine"
import { actionable, completedFor, impactOf, pctText, pointsText, rankGames, relation, sinceLastWeek, tieTargets, whyText, TIE_TOP } from "@/lib/rooting/guide"
import { getRooting } from "@/lib/rooting/data"
import { GOALS } from "@/lib/rooting/types"

const data = getRooting()!

describe("words", () => {
	it("never shows an estimate as certain, and uses a real minus sign for points", () => {
		expect(pctText(0.0004)).toBe("<1%")
		expect(pctText(0.9996)).toBe(">99%")
		expect(pctText(1, true)).toBe("100%")
		expect(pctText(0.714)).toBe("71%")
		expect(pointsText(0.083)).toBe("+8 pts")
		expect(pointsText(-0.031)).toBe("−3 pts")
		expect(pointsText(0.001)).toBe("0 pts")
		expect(pointsText(0.012)).toBe("+1 pt")
		expect(pointsText(-0.01)).toBe("\u22121 pt")
	})
})

describe("what counts as an impact", () => {
	it("is none under a point, none when within the sampling error, and tiered above", () => {
		expect(impactOf(0.005, 0, true)).toBe("none")
		expect(impactOf(0.02, 0.02, false)).toBe("none")
		expect(impactOf(0.02, 0.005, false)).toBe("minor")
		expect(impactOf(0.05, 0.005, false)).toBe("notable")
		expect(impactOf(0.2, 0.005, false)).toBe("major")
		// The same spread counts when every ending was added up, since there is no error.
		expect(impactOf(0.02, 0, true)).toBe("minor")
	})
})

describe("ranking", () => {
	it("puts a team's own games where they matter, for every goal", () => {
		for (const goal of GOALS) {
			const recs = rankGames(data, "LV", goal)
			expect(recs).toHaveLength(data.games.length)
			for (let i = 1; i < recs.length; i++) expect(recs[i - 1].spread).toBeGreaterThanOrEqual(recs[i].spread)
			const own = recs.filter((r) => r.yours)
			expect(own.length).toBeGreaterThan(0)
		}
	})

	it("states the best and the worst result in points against the baseline, so gain and loss are on one scale", () => {
		const rec = actionable(rankGames(data, "LV", "playoffs"))[0]
		expect(rec.gain! - rec.loss!).toBeCloseTo(rec.spread, 10)
		expect(rec.bestP! - rec.baseline).toBeCloseTo(rec.gain!, 10)
		expect(rec.worstP! - rec.baseline).toBeCloseTo(rec.loss!, 10)
		expect(rec.baseline).toBeGreaterThan(0)
	})

	it("marks a side too rare to measure instead of quoting it", () => {
		const g = data.games[0]
		const thin = { ...data, games: [{ ...g, n: [30, 5000] as [number, number] }, ...data.games.slice(1)] }
		const rec = rankGames(thin, "LV", "playoffs").find((r) => r.gameId === g.id)!
		expect(rec.thin).toBe(true)
		expect(rec.pHome).toBeNull()
		expect(rec.rootFor).toBeNull()
		expect(rec.impact).toBe("none")
	})

	it("works out tie scenarios only for the games a fan is shown", () => {
		const targets = tieTargets(data)
		expect(Object.keys(data.ties).sort()).toEqual(targets)
		// Each team and goal's top games are covered.
		for (const t of ["LV", "KC", "DEN"]) for (const goal of GOALS) for (const r of actionable(rankGames(data, t, goal)).slice(0, TIE_TOP)) expect(r.pTie, `${t} ${goal}`).not.toBeNull()
	})
})

describe("why a result helps", () => {
	const rec = (over: Partial<ReturnType<typeof rankGames>[number]>) => ({ ...actionable(rankGames(data, "LV", "playoffs"))[0], ...over })

	it("says it is the team's own game", () => {
		expect(whyText(rec({ yours: true }), "LV", "playoffs")).toMatch(/own game/)
	})

	it("explains a division rival, a conference rival and a cross-conference game differently", () => {
		const base = rec({ yours: false, home: "KC", away: "NYG", rootFor: "NYG", rootAgainst: "KC", best: "A" })
		expect(whyText(base, "LV", "playoffs")).toMatch(/AFC West/)
		expect(whyText({ ...base, home: "BUF", away: "NYG", rootFor: "NYG", rootAgainst: "BUF", best: "A" }, "LV", "playoffs")).toMatch(/chasing the same AFC seeds/)
		expect(whyText({ ...base, home: "DAL", away: "NYG", rootFor: "NYG", rootAgainst: "DAL", best: "A" }, "LV", "playoffs")).toMatch(/other conference/)
		expect(whyText({ ...base, home: "DAL", away: "BUF", rootFor: "BUF", rootAgainst: "DAL", best: "A" }, "LV", "playoffs")).toMatch(/across conferences/)
	})

	it("is empty when there is nothing to recommend", () => {
		expect(whyText(rec({ rootFor: null, best: null }), "LV", "playoffs")).toBe("")
	})

	it("relates teams by division and conference", () => {
		expect(relation("LV", "LV")).toBe("self")
		expect(relation("LV", "KC")).toBe("division")
		expect(relation("LV", "BUF")).toBe("conference")
		expect(relation("LV", "DAL")).toBe("other")
	})
})

describe("completed games and history", () => {
	it("scores recent finals against the other team having won, for the team and goal", () => {
		expect(data.completed.length).toBeGreaterThan(0)
		const done = completedFor(data, "LV", "playoffs")
		expect(done.length).toBeGreaterThan(0)
		for (const c of done) {
			expect(["helped", "hurt", "neutral"]).toContain(c.effect)
			if (c.effect === "helped") expect(c.swing).toBeGreaterThan(0)
			if (c.effect === "hurt") expect(c.swing).toBeLessThan(0)
		}
		for (let i = 1; i < done.length; i++) expect(Math.abs(done[i - 1].swing)).toBeGreaterThanOrEqual(Math.abs(done[i].swing))
		// A team's own win is worth something to it.
		const own = done.find((c) => c.yours && c.winner === "LV")
		if (own) expect(own.swing).toBeGreaterThanOrEqual(0)
	})

	it("says how the odds changed since the last full week", () => {
		const s = sinceLastWeek(data, "LV", "playoffs")
		if (data.history.length) {
			expect(s).not.toBeNull()
			expect(s!.change).toBeCloseTo(s!.now - s!.before, 10)
		}
		expect(sinceLastWeek({ ...data, history: [] }, "LV", "playoffs")).toBeNull()
	})
})

describe("rebuilding", () => {
	const games = getGames()
	const small = { season: 2026, generatedAt: "2026-10-05T12:00:00Z", source: "t", sims: 300, tieSims: 50, swingSims: 50, historySims: 100, completedWeeks: 1 }

	it("finds the weeks that are completely played", () => {
		const weeks = finishedWeeks(games)
		expect(weeks.length).toBeGreaterThan(0)
		for (const w of weeks) expect(games.filter((g) => g.week === w).every((g) => g.status === "final")).toBe(true)
	})

	it("reuses a snapshot whose results have not changed, and the guide's key follows the results", () => {
		const first = buildRooting(games, small)
		const again = buildRooting(games, { ...small, previous: first })
		expect(again.history).toEqual(first.history)
		expect(again.resultsKey).toBe(first.resultsKey)
		expect(first.resultsKey).toBe(resultsKey(games, { sims: 300, tieSims: 50 }))
		// A snapshot is the same as simulating the schedule as it was at the end of that week.
		const w = first.history[0].week
		expect(resultsKey(gamesThroughWeek(games, w), { sims: 100, tieSims: 0 })).toBe(first.history[0].key)
	}, 60_000)

	it("is the same file twice: the build has no clock or randomness in the numbers", () => {
		const a = buildRooting(games, small)
		const b = buildRooting(games, small)
		expect(b).toEqual(a)
	}, 60_000)
})
