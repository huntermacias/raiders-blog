import { describe, expect, it } from "vitest"

import { getFourthDown, getGames, getScouting } from "../../lib/lab/data"
import { VERDICTS, boldest, costliest, explain, fourthGameFor, gameLine, ptsText, seasonTotals, spotText } from "../../lib/lab/fourthDown"
import { KEYS, formatValue, matchups, ordinal, sampleNote, standouts, teamScout, watchList } from "../../lib/lab/scouting"
import { playSentence, playWord, seasonTopPlays, swingText, topPlaysFor, whenText } from "../../lib/lab/topPlays"
import type { LabGame } from "../../lib/lab/types"

const games = getGames()

describe("top plays", () => {
	it("ranks a game's plays by how far they moved the game, whoever they favored", () => {
		for (const g of games) {
			const plays = topPlaysFor(g, "LV", 5)
			expect(plays.length).toBeGreaterThan(0)
			expect(plays.map((p) => p.rank)).toEqual(plays.map((_, i) => i + 1))
			for (let i = 1; i < plays.length; i++) expect(Math.abs(plays[i - 1].swing)).toBeGreaterThanOrEqual(Math.abs(plays[i].swing))
		}
	})

	it("signs the swing from the Raiders' side", () => {
		const drives = [
			{ n: 1, team: "LV", plays: [{ n: 1, wpa: 0.2, w0: 0.5, el: 100, type: "pass", td: false, yds: 10, x: 20, xe: 30, text: "a" }] },
			{ n: 2, team: "NO", plays: [{ n: 1, wpa: 0.3, w0: 0.5, el: 200, type: "pass", td: false, yds: 10, x: 20, xe: 30, text: "b" }] },
		]
		const g = { week: 9, opp: "NO", oppName: "Saints", drives } as unknown as LabGame
		const [first, second] = topPlaysFor(g, "LV", 5)
		expect(first.swing).toBeCloseTo(-0.3)
		expect(first.byRaiders).toBe(false)
		expect(first.before).toBe(0.5)
		expect(first.after).toBeCloseTo(0.2)
		expect(second.swing).toBeCloseTo(0.2)
		expect(second.after).toBeCloseTo(0.7)
	})

	it("keeps the win probability after a play between 0 and 1", () => {
		const drives = [{ n: 1, team: "LV", plays: [{ n: 1, wpa: 0.6, w0: 0.8, el: 100, type: "run", td: true, yds: 5, x: 95, xe: 100, text: "x" }] }]
		const [p] = topPlaysFor({ week: 1, opp: "X", oppName: "X", drives } as unknown as LabGame, "LV")
		expect(p.after).toBe(1)
	})

	it("finds the biggest plays of the season across games", () => {
		const season = seasonTopPlays(games, "LV", 10)
		expect(season.length).toBeLessThanOrEqual(10)
		for (let i = 1; i < season.length; i++) expect(Math.abs(season[i - 1].swing)).toBeGreaterThanOrEqual(Math.abs(season[i].swing))
		expect(new Set(season.map((p) => p.week)).size).toBeGreaterThan(1)
	})

	it("describes a play in words and whole points", () => {
		const p = topPlaysFor(games[2], "LV", 1)[0]
		expect(swingText(p)).toMatch(/^[+−]\d+ pts$/)
		expect(playWord(p).length).toBeGreaterThan(2)
		expect(whenText(p)).toMatch(/^(Q[1-4]|OT) · \d+:\d\d$/)
		expect(playSentence(p)).toContain(swingText(p))
	})

	it("names the common kinds of play", () => {
		const w = (text: string, type = "pass", td = false, yards = 10) => playWord({ text, type, td, yards })
		expect(w("T.Shough pass INTERCEPTED by H.Masses")).toBe("Interception")
		expect(w("pass INTERCEPTED by H.Masses for a TOUCHDOWN", "pass", true)).toBe("Pick-six")
		expect(w("J.Smith sacked at LV 20 for -7 yards", "pass")).toBe("Sack")
		expect(w("B.Lance pass incomplete deep left", "pass", false, 0)).toBe("Incomplete pass")
		expect(w("M.Gay 52 yard field goal is No Good", "field_goal")).toBe("Missed field goal")
		expect(w("A.Cole punts 40 yards", "punt")).toBe("Punt")
		expect(w("A.Jeanty up the middle for 12 yards", "run", false, 12)).toBe("12-yard run")
	})
})

describe("fourth-down report", () => {
	const data = getFourthDown()

	it("has a report for each played game with consistent counts", () => {
		expect(data.games.length).toBe(games.length)
		for (const g of data.games) {
			expect(g.summary.decisions).toBe(g.decisions.length)
			expect(g.summary.graded).toBe(g.decisions.filter((d) => d.verdict).length)
			expect(g.summary.bestOrClose).toBeLessThanOrEqual(g.summary.graded)
			expect(fourthGameFor(g.week)).toBe(g)
		}
	})

	it("only calls a decision costly or questionable when the best option beats it by the stated margin", () => {
		for (const g of data.games) for (const d of g.decisions) {
			if (!d.verdict || !d.best) continue
			const cost = (d.options[d.best]?.wp ?? 0) - (d.options[d.chosen]?.wp ?? 0)
			if (d.verdict === "best") expect(d.best === d.chosen || cost <= 0.015).toBe(true)
			if (d.verdict === "toss-up") expect(cost).toBeLessThan(0.015 + 1e-9)
			if (d.verdict === "questionable") expect(cost).toBeGreaterThanOrEqual(0.015 - 1e-9)
			if (d.verdict === "costly") expect(cost).toBeGreaterThanOrEqual(0.04 - 1e-9)
		}
	})

	it("writes the spot, the verdict and the sentence under it", () => {
		expect(spotText({ ytg: 2, yl: 29 })).toBe("4th & 2 · opp 29")
		expect(spotText({ ytg: 11, yl: 65 })).toBe("4th & 11 · own 35")
		expect(spotText({ ytg: 1, yl: 50 })).toBe("4th & 1 · midfield")
		expect(ptsText(0.035)).toBe("3.5 pts")
		expect(ptsText(0.12)).toBe("12 pts")
		const questionable = data.games.flatMap((g) => g.decisions).find((d) => d.verdict === "questionable")!
		expect(explain(questionable)).toMatch(/better/)
		expect(VERDICTS[questionable.verdict!].label).toBe("Questionable")
		const ungraded = { verdict: null } as never
		expect(explain(ungraded)).toMatch(/Not graded/)
	})

	it("picks the decisions to show: costliest first, bold calls when nothing was wrong", () => {
		for (const g of data.games) {
			const c = costliest(g, 3)
			for (let i = 1; i < c.length; i++) expect(c[i - 1].cost ?? 0).toBeGreaterThanOrEqual(c[i].cost ?? 0)
			for (const d of boldest(g, 3)) expect(d.chosen).toBe("go")
			expect(gameLine(g).length).toBeGreaterThan(5)
		}
	})

	it("adds up a season", () => {
		const t = seasonTotals(data.games)
		expect(t.decisions).toBe(data.games.reduce((n, g) => n + g.decisions.length, 0))
		expect(t.converted).toBeLessThanOrEqual(t.wentFor)
	})
})

describe("scouting", () => {
	const data = getScouting()

	it("covers every team, with ranks from 1 to 32 on each measure", () => {
		expect(Object.keys(data.teams)).toHaveLength(32)
		for (const key of KEYS) for (const side of ["off", "def"] as const) {
			const ranks = Object.values(data.teams).map((t) => t[side][key]?.rank).filter((r): r is number => typeof r === "number")
			expect(ranks).toHaveLength(32)
			expect(new Set(ranks).size).toBeGreaterThan(25)
			expect(Math.min(...ranks)).toBe(1)
			expect(Math.max(...ranks)).toBe(32)
		}
	})

	it("ranks the best value first: a better offense and a tougher defense both get 1st", () => {
		const t = Object.values(data.teams)
		const bestOff = t.reduce((a, b) => (b.off.epa!.v > a.off.epa!.v ? b : a))
		const bestDef = t.reduce((a, b) => (b.def.epa!.v < a.def.epa!.v ? b : a))
		expect(bestOff.off.epa!.rank).toBe(1)
		expect(bestDef.def.epa!.rank).toBe(1)
	})

	it("pairs each Raiders unit with the opponent's, most lopsided first", () => {
		const m = matchups("KC", "Chiefs")
		expect(m).toHaveLength(KEYS.length * 2)
		for (let i = 1; i < m.length; i++) expect(m[i - 1].edge).toBeGreaterThanOrEqual(m[i].edge)
		const one = m.find((x) => x.unit === "ours" && x.key === "epa")!
		expect(one.edge).toBe(teamScout("KC")!.def.epa!.rank - teamScout("LV")!.off.epa!.rank)
		expect(one.text).toMatch(/^Our offense ranks \d+(st|nd|rd|th)\. The Chiefs defense ranks/)
	})

	it("lists up to three things to watch, each backed by a real strength", () => {
		for (const abbr of Object.keys(data.teams).filter((a) => a !== "LV")) {
			const w = watchList(abbr, abbr)
			expect(w.length).toBeLessThanOrEqual(3)
			expect(new Set(w.map((x) => x.detail)).size).toBe(w.length)
		}
		expect(watchList("ZZZ")).toEqual([])
	})

	it("names strengths and weaknesses", () => {
		const s = standouts("LV", "off")
		expect(s.strengths).toHaveLength(3)
		expect(s.strengths[0].rank).toBeLessThanOrEqual(s.weaknesses[0].rank)
		expect(standouts("ZZZ", "off")).toEqual({ strengths: [], weaknesses: [] })
	})

	it("formats numbers and ranks plainly", () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 32].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "32nd"])
		expect(formatValue("epa", 0.1523)).toBe("+0.15")
		expect(formatValue("epa", -0.2)).toBe("−0.20")
		expect(formatValue("third", 0.4038)).toBe("40%")
		expect(formatValue("sackRate", 0.0331)).toBe("3.3%")
		expect(formatValue("points", 28.75)).toBe("28.8")
	})

	it("says how much data there is behind a ranking", () => {
		expect(sampleNote(2)).toMatch(/first look/)
		expect(sampleNote(5)).toMatch(/small/)
		expect(sampleNote(12)).toBe("12 games of play-by-play.")
	})
})
