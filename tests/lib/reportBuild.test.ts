import { describe, expect, it } from "vitest"

import { getGames, getPlayers } from "../../lib/lab/data"
import { composeReport, dateLabel, recordAfter, type ReportInput } from "../../lib/report/build"
import { buildRoster } from "../../lib/report/players"
import { realScore } from "../../lib/report/score"
import { HEAD_TO_HEAD, METRIC } from "../../lib/report/metrics"
import { findings, headToHead, placeOf } from "../../lib/report/stats"

const games = getGames()
const wk7 = games.find((g) => g.week === 7)
const roster = buildRoster(getPlayers().players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, slug: p.slug, team: p.team, espn: p.espn, shot: p.shot })))

// What the Studio had for week 7: the two scores typed the wrong way round.
const studio: ReportInput = {
	_id: "r7",
	title: "Rams 35, Raiders 21: The Film Is Worse Than the Score",
	opponent: "Los Angeles Rams",
	homeAway: "home",
	gameDate: "2026-10-26T01:25:00Z",
	raidersScore: 35,
	opponentScore: 21,
	body: [{ _type: "block", style: "normal", children: [{ _type: "span", text: "Week 7 Game Report | October 25" }] }, { _type: "block", style: "h2", _key: "a", children: [{ _type: "span", text: "The Final Word" }] }],
}

describe("composeReport", () => {
	it("builds every section from the Lab's game when there is one", () => {
		expect(wk7?.box).toBeTruthy()
		const v = composeReport("week-7-game-report", studio, wk7!, games, null, roster)
		expect(v.score).toMatchObject({ raiders: 21, opponent: 35, source: "lab", studioWrong: true })
		expect(v.result).toBe("L")
		expect(v.week).toBe(7)
		expect(v.record).toBe(recordAfter(wk7!, games))
		expect(v.venue).toBe("Allegiant Stadium")
		expect(v.opp.nick).toBe("Rams")
		expect(v.quarters.length).toBeGreaterThanOrEqual(4)
		expect(v.quarters.reduce((a, q) => a + q.me, 0)).toBe(21)
		expect(v.quarters.reduce((a, q) => a + q.opp, 0)).toBe(35)
		expect(v.head.length).toBeGreaterThan(8)
		expect(v.findings.length).toBeGreaterThan(0)
		expect(v.findings.length).toBeLessThanOrEqual(4)
		expect(v.turning.length).toBeGreaterThan(0)
		expect(v.drives.length).toBe(wk7!.drives.length)
		expect(v.performers.me.length).toBeGreaterThan(0)
		expect(v.performers.opp.length).toBeGreaterThan(0)
		expect(v.headings.map((h) => h.id)).toEqual(["the-final-word"])
		// The dateline that only repeats the page's own header is gone.
		expect(v.body).toHaveLength(1)
	})

	it("still makes a page for a game the Lab has not built", () => {
		const v = composeReport("week-9-game-report", studio, null, games, null, roster)
		expect(v.lab).toBeNull()
		expect(v.score.source).toBe("studio")
		expect(v.head).toEqual([])
		expect(v.drives).toEqual([])
		expect(v.driveTotals).toBeNull()
		expect(v.performers).toEqual({ me: [], opp: [], standout: null })
		expect(v.week).toBeNull()
	})

	it("calls a road game 'at' the opponent's name", () => {
		const v = composeReport("x", { ...studio, homeAway: "away" }, wk7!, games, null, roster)
		expect(v.venue.startsWith("at ")).toBe(true)
	})
})

describe("realScore", () => {
	it("corrects a swapped Studio score by finding the game in the Lab", () => {
		const s = realScore({ opponent: "Los Angeles Rams", gameDate: studio.gameDate, raidersScore: 35, opponentScore: 21 })
		expect(s).toMatchObject({ raiders: 21, opponent: 35 })
	})
	it("keeps the Studio score when the game is not in the Lab", () => {
		const s = realScore({ opponent: "Nobody FC", gameDate: "2026-01-01T00:00:00Z", raidersScore: 10, opponentScore: 3 })
		expect(s).toMatchObject({ raiders: 10, opponent: 3, source: "studio" })
	})
})

describe("dateLabel", () => {
	it("prints the day in Pacific time", () => {
		expect(dateLabel("2026-10-26T01:25:00Z")).toBe("Sunday, October 25, 2026")
	})
})

describe("head to head", () => {
	it("only lists measures the game has, and picks an edge by which way is better", () => {
		const rows = headToHead(wk7!, games, "LAR")
		expect(rows.map((r) => r.key).every((k) => (HEAD_TO_HEAD as readonly string[]).includes(k))).toBe(true)
		for (const r of rows) {
			if (r.me.value == null || r.opp.value == null) continue
			const better = METRIC[r.key].higherBetter
			if (r.edge && better != null) {
				const meBetter = better ? r.me.value > r.opp.value : r.me.value < r.opp.value
				expect(r.edge).toBe(meBetter ? "me" : "opp")
			}
			expect(r.min).toBeLessThanOrEqual(Math.min(r.me.value, r.opp.value))
			expect(r.max).toBeGreaterThanOrEqual(Math.max(r.me.value, r.opp.value))
		}
	})

	it("ranks a game among the others, and says nothing with fewer than four games", () => {
		expect(placeOf([1, 2, 3, 4, 5], 4, true)).toEqual({ place: 1, of: 5 })
		expect(placeOf([1, 2, 3, 4, 5], 4, false)).toEqual({ place: 5, of: 5 })
		expect(placeOf([1, 2, 3], 0, true)).toBeNull()
		expect(placeOf([1, null, 3, 4, 5], 1, true)).toBeNull()
	})

	it("reports only strong, plain findings", () => {
		for (const f of findings(wk7!, games, "Rams")) {
			expect(f.headline.length).toBeGreaterThan(5)
			expect(f.detail).toMatch(/\d/)
			expect(["good", "bad"]).toContain(f.tone)
		}
	})
})
