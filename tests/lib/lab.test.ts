import { describe, expect, it } from "vitest"

import { framesForDrive, downLabel, resultLabel, resultTone, yardLineName } from "../../lib/lab/drive"
import { gameSlug, getGameBySlug, getGames, getSeason, neighbours } from "../../lib/lab/data"
import type { Drive, DrivePlay, KeyPlay, WpPoint } from "../../lib/lab/types"
import { biggestSwing, clockAt, formatSwing, gameStory, kindTag, maxTime, pct, playAt, scoreAt, swingPoints, wpAt } from "../../lib/lab/wp"

describe("clockAt", () => {
	it("maps elapsed seconds to quarter and clock", () => {
		expect(clockAt(0)).toEqual({ q: "Q1", clock: "15:00" })
		expect(clockAt(1)).toEqual({ q: "Q1", clock: "14:59" })
		expect(clockAt(899)).toEqual({ q: "Q1", clock: "0:01" })
		expect(clockAt(900)).toEqual({ q: "Q2", clock: "15:00" })
		expect(clockAt(3599)).toEqual({ q: "Q4", clock: "0:01" })
		expect(clockAt(3600)).toEqual({ q: "OT", clock: "10:00" })
		expect(clockAt(3601)).toEqual({ q: "OT", clock: "9:59" })
		expect(clockAt(4199)).toEqual({ q: "OT", clock: "0:01" })
		expect(clockAt(4200)).toEqual({ q: "OT", clock: "0:00" })
		expect(clockAt(4201)).toEqual({ q: "OT2", clock: "9:59" })
	})

	it("calls the last second of a regulation game the end of the fourth quarter", () => {
		expect(clockAt(3600, { overtime: false })).toEqual({ q: "Q4", clock: "0:00" })
		expect(clockAt(3000, { overtime: false })).toEqual({ q: "Q4", clock: "10:00" })
	})
})

describe("win probability helpers", () => {
	const series: WpPoint[] = [
		[0, 0.5],
		[100, 0.6],
		[200, 0.2],
		[3600, 1],
	]

	it("interpolates between plays and clamps at the ends", () => {
		expect(wpAt(series, -5)).toBe(0.5)
		expect(wpAt(series, 50)).toBeCloseTo(0.55)
		expect(wpAt(series, 150)).toBeCloseTo(0.4)
		expect(wpAt(series, 9999)).toBe(1)
		expect(wpAt([], 10)).toBe(0.5)
	})

	it("maxTime is at least regulation and extends into overtime", () => {
		expect(maxTime([[0, 0.5]])).toBe(3600)
		expect(maxTime([[0, 0.5], [4100, 1]])).toBe(4100)
	})

	it("reads the score from the log, so extra points count", () => {
		const log: [number, number, number][] = [
			[100, 3, 0],
			[400, 3, 6],
			[401, 3, 7],
		]
		expect(scoreAt(log, 50)).toEqual([0, 0])
		expect(scoreAt(log, 100)).toEqual([3, 0])
		expect(scoreAt(log, 400)).toEqual([3, 6])
		expect(scoreAt(log, 9999)).toEqual([3, 7])
	})

	it("formats swings with a real minus sign and rounds to whole points", () => {
		expect(swingPoints({ wpBefore: 0.4, wpAfter: 0.693 })).toBe(29)
		expect(swingPoints({ wpBefore: null, wpAfter: 0.5 })).toBeNull()
		expect(formatSwing(29)).toBe("+29 pts")
		expect(formatSwing(-9)).toBe("−9 pts")
		expect(formatSwing(0)).toBe("0 pts")
		expect(formatSwing(null)).toBe("")
		expect(pct(0.1349)).toBe("13%")
		expect(pct(1.4)).toBe("100%")
	})

	it("uses one tag for both kinds of turnover", () => {
		expect(kindTag("INT")).toBe("TO")
		expect(kindTag("FUM")).toBe("TO")
		expect(kindTag("TD")).toBe("TD")
	})

	const play = (el: number, kind: KeyPlay["kind"], before: number, after: number, score: [number, number]): KeyPlay => ({
		el, q: 1, clock: "1:00", kind, team: "LV", wpBefore: before, wpAfter: after, text: "x", score,
	})

	it("summarises a game: lead changes, deficit, lowest point, biggest swing", () => {
		const plays = [
			play(100, "TD", 0.5, 0.45, [0, 7]), // opponent leads
			play(200, "FG", 0.4, 0.42, [3, 7]),
			play(300, "TD", 0.3, 0.6, [10, 7]), // lead change 1
			play(400, "TD", 0.5, 0.4, [10, 14]), // lead change 2
			play(500, "INT", 0.3, 0.9, [10, 14]),
		]
		const wp: WpPoint[] = [[0, 0.5], [250, 0.12], [3600, 1]]
		const story = gameStory(wp, plays)
		expect(story.leadChanges).toBe(2)
		expect(story.maxDeficit).toBe(7)
		expect(story.maxLead).toBe(3)
		expect(story.low).toEqual({ p: 0.12, el: 250 })
		expect(story.swing?.kind).toBe("INT")
		expect(biggestSwing([])).toBeUndefined()
		expect(playAt(plays, 250)?.el).toBe(200)
		expect(playAt(plays, 50)).toBeUndefined()
	})
})

describe("drive frames", () => {
	const base: DrivePlay = { n: 1, dn: 1, ytg: 10, x: 25, xe: 30, yds: 5, type: "run", fd: false, td: false, text: "run" }
	const drive = (plays: Partial<DrivePlay>[]): Drive => ({
		n: 1, team: "LV", q: 1, clock: "10:00", result: "Punt", start: 25, yards: 0, top: null,
		plays: plays.map((p, i) => ({ ...base, ...p, n: i + 1 })),
	})

	it("classifies and positions each kind of play", () => {
		const frames = framesForDrive(
			drive([
				{ type: "run", yds: 5, xe: 30 },
				{ type: "pass", yds: 0, xe: 30, text: "pass incomplete short left" },
				{ type: "no_play", yds: 0, xe: 30, text: "PENALTY on LV, False Start" },
				{ type: "punt", x: 40, xe: null, text: "A.Cole punts 47 yards to NO 13" },
				{ type: "field_goal", x: 80, xe: null, text: "M.Gay 41 yard field goal is GOOD" },
				{ type: "field_goal", x: 80, xe: null, text: "M.Gay 41 yard field goal is No Good, Wide Left" },
				{ type: "pass", x: 90, xe: 100, yds: 10, td: true, text: "pass to X for 10 yards, TOUCHDOWN" },
			])
		)
		expect(frames.map((f) => f.outcome)).toEqual(["gain", "incomplete", "penalty", "punt", "fieldgoal-good", "fieldgoal-miss", "touchdown"])
		expect(frames[1].to).toBe(frames[1].from)
		expect(frames[3].to).toBe(87)
		expect(frames[4].to).toBe(100)
		expect(frames[6].to).toBe(100)
		expect(frames.every((f) => f.to >= 0 && f.to <= 100 && f.from >= 0 && f.from <= 100)).toBe(true)
	})

	it("falls back to 40 yards when a punt does not say how far", () => {
		expect(framesForDrive(drive([{ type: "punt", x: 20, xe: null, text: "punt blocked" }]))[0].to).toBe(60)
	})

	it("puts the first-down marker at the line to gain, and nowhere inside the goal line", () => {
		const [a, b] = framesForDrive(drive([{ x: 25, ytg: 10 }, { x: 95, ytg: 5, dn: 3 }]))
		expect(a.firstDownAt).toBe(35)
		expect(b.firstDownAt).toBeNull()
		expect(b.downLabel).toBe("3rd & Goal")
	})

	it("labels downs, results and yard lines", () => {
		expect(downLabel(1, 10, 25)).toBe("1st & 10")
		expect(downLabel(4, 2, 40)).toBe("4th & 2")
		expect(downLabel(null, 0, 30)).toBe("")
		expect(resultLabel("Field goal")).toBe("Field goal")
		expect(resultLabel("Opp touchdown")).toBe("Opponent touchdown")
		expect(resultLabel("Something new")).toBe("Something new")
		expect(resultTone("Touchdown")).toBe("score")
		expect(resultTone("Punt")).toBe("stop")
		expect(resultTone("End of half")).toBe("neutral")
		expect(yardLineName(25)).toBe("own 25")
		expect(yardLineName(50)).toBe("50")
		expect(yardLineName(70)).toBe("opp 30")
	})
})

// The numbers on the page come from data/lab/season.json, which a weekly job
// rewrites. These checks run on every deploy, so a bad data pull fails the build
// and the last good site stays live.
describe("data/lab/season.json", () => {
	const season = getSeason()
	const games = getGames()

	it("has the basics and credits the source", () => {
		expect(season.team).toBe("LV")
		expect(games.length).toBeGreaterThan(0)
		expect(season.source).toMatch(/nflverse/i)
		expect(Number.isNaN(Date.parse(season.generatedAt))).toBe(false)
	})

	it("has one game per week with unique slugs", () => {
		const weeks = games.map((g) => g.week)
		expect(new Set(weeks).size).toBe(weeks.length)
		const slugs = games.map(gameSlug)
		expect(new Set(slugs).size).toBe(slugs.length)
		for (const g of games) expect(getGameBySlug(gameSlug(g))).toBe(g)
		expect(getGameBySlug("week-99")).toBeUndefined()
	})

	it("links each game to its neighbours", () => {
		const first = neighbours(gameSlug(games[0]))
		expect(first.prev).toBeUndefined()
		if (games.length > 1) expect(first.next).toBe(games[1])
		expect(neighbours("nope")).toEqual({})
	})

	describe.each(games.map((g) => [gameSlug(g), g] as const))("%s", (_slug, g) => {
		it("has a win probability line that moves forward in time and stays between 0 and 1", () => {
			expect(g.wp.length).toBeGreaterThan(50)
			for (let i = 0; i < g.wp.length; i++) {
				expect(g.wp[i][1]).toBeGreaterThanOrEqual(0)
				expect(g.wp[i][1]).toBeLessThanOrEqual(1)
				if (i > 0) expect(g.wp[i][0]).toBeGreaterThanOrEqual(g.wp[i - 1][0])
			}
			expect(g.wp[g.wp.length - 1][0]).toBeGreaterThanOrEqual(3600)
		})

		it("ends at the result the score says", () => {
			const last = g.wp[g.wp.length - 1][1]
			expect(last).toBe(g.score[0] > g.score[1] ? 1 : g.score[0] < g.score[1] ? 0 : 0.5)
			expect(g.result).toBe(g.score[0] > g.score[1] ? "W" : g.score[0] < g.score[1] ? "L" : "T")
		})

		it("has a score log that only goes up and ends on the final score", () => {
			expect(g.scores.length).toBeGreaterThan(0)
			let prev: [number, number, number] = [0, 0, 0]
			for (const s of g.scores) {
				expect(s[0]).toBeGreaterThanOrEqual(prev[0])
				expect(s[1]).toBeGreaterThanOrEqual(prev[1])
				expect(s[2]).toBeGreaterThanOrEqual(prev[2])
				prev = s
			}
			expect([prev[1], prev[2]]).toEqual(g.score)
		})

		it("lists key plays in order, each inside the game", () => {
			expect(g.keyPlays.length).toBeGreaterThan(0)
			for (let i = 0; i < g.keyPlays.length; i++) {
				const k = g.keyPlays[i]
				expect(k.text.length).toBeGreaterThan(0)
				expect(k.el).toBeGreaterThanOrEqual(0)
				expect(k.el).toBeLessThanOrEqual(g.wp[g.wp.length - 1][0])
				if (i > 0) expect(k.el).toBeGreaterThanOrEqual(g.keyPlays[i - 1].el)
			}
		})

		it("has drives whose plays stay on the field", () => {
			expect(g.drives.length).toBeGreaterThan(5)
			for (const d of g.drives) {
				expect(d.plays.length).toBeGreaterThan(0)
				for (const p of d.plays) {
					expect(p.x).toBeGreaterThanOrEqual(0)
					expect(p.x).toBeLessThanOrEqual(100)
					if (p.xe != null) {
						expect(p.xe).toBeGreaterThanOrEqual(0)
						expect(p.xe).toBeLessThanOrEqual(100)
					}
				}
				for (const f of framesForDrive(d)) {
					expect(f.to).toBeGreaterThanOrEqual(0)
					expect(f.to).toBeLessThanOrEqual(100)
				}
			}
		})

		it("shows readable play text: no clock prefix and no jersey numbers", () => {
			const texts = [...g.keyPlays.map((k) => k.text), ...g.drives.flatMap((d) => d.plays.map((p) => p.text))]
			for (const t of texts) {
				expect(t).not.toMatch(/^\(\d{0,2}:\d{2}\)/)
				expect(t).not.toMatch(/(^|\s)\d{1,2}-[A-Z]\.[A-Za-z]/)
			}
		})
	})
})
