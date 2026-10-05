import { describe, expect, it } from "vitest"

import { framesForDrive, downLabel, HASH, resultLabel, resultTone, yardLineName } from "../../lib/lab/drive"
import { cameraFor, pathFor, pointAlong, ribbon, sliceTo, viewFrom } from "../../lib/lab/field"
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

	it("does not call the result of a loss the lowest point of the game", () => {
		// The last sample is the final whistle (0% in a loss), not a moment in the game.
		const wp: WpPoint[] = [[0, 0.5], [3000, 0.71], [3500, 0.12], [3600, 0]]
		expect(gameStory(wp, []).low).toEqual({ p: 0.12, el: 3500 })
		// A win's last sample is 100%, and a series that never ends in 0 or 1 is read in full.
		expect(gameStory([[0, 0.5], [100, 0.3], [3600, 1]], []).low).toEqual({ p: 0.3, el: 100 })
		expect(gameStory([[0, 0.5], [3600, 0.2]], []).low).toEqual({ p: 0.2, el: 3600 })
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

describe("where on the field a play went", () => {
	const play = (over: Partial<DrivePlay>): DrivePlay => ({ n: 1, dn: 1, ytg: 10, x: 25, xe: 30, yds: 5, type: "run", fd: false, td: false, text: "run", ...over })
	const drive = (plays: DrivePlay[]): Drive => ({ n: 1, team: "LV", q: 1, clock: "10:00", result: "Punt", start: 25, yards: 5, top: null, plays })

	it("draws runs toward their lane, wider for an end than for a guard gap", () => {
		const [left, right, mid, guard] = framesForDrive(
			drive([play({ loc: "L", gap: "E" }), play({ loc: "R", gap: "T" }), play({ loc: "M" }), play({ loc: "L", gap: "G" })])
		)
		expect(left.y1).toBeLessThan(0) // offense's left is the top of the screen
		expect(right.y1).toBeGreaterThan(0)
		expect(mid.y1).toBe(0)
		expect(Math.abs(left.y1)).toBeGreaterThan(Math.abs(guard.y1))
		expect(Math.abs(right.y1)).toBeGreaterThan(Math.abs(guard.y1))
	})

	it("snaps the next play between the hashes, wherever the last one ended", () => {
		const f = framesForDrive(drive([play({ loc: "R", gap: "E" }), play({ loc: "L", gap: "E" }), play({})]))
		expect(f[0].y0).toBe(0)
		expect(f[1].y0).toBeCloseTo(HASH) // spotted at the right hash, not out by the sideline
		expect(f[2].y0).toBeCloseTo(-HASH)
	})

	it("sends a pass to its side and to its catch point, then runs it after the catch", () => {
		const [f] = framesForDrive(drive([play({ type: "pass", loc: "L", ay: 12, yac: 4, xe: 41, yds: 16 })]))
		expect(f.catchAt).toBe(37)
		expect(f.yc).toBeLessThan(0)
		expect(f.y1).toBe(f.yc)
		expect(f.arc).toBe(true)
	})

	it("sends an incomplete pass to where it was thrown and leaves the ball where it was", () => {
		const f = framesForDrive(drive([play({ type: "pass", loc: "R", ay: 15, yds: 0, text: "pass deep right incomplete" }), play({})]))
		expect(f[0].outcome).toBe("incomplete")
		expect(f[0].incompleteTo).toBe(40)
		expect(f[1].y0).toBe(f[0].y0)
	})

	it("sends a play that went out of bounds to the sideline", () => {
		const [f] = framesForDrive(drive([play({ type: "pass", loc: "R", ay: 6, text: "pass short right to Tucker pushed ob at LV 40 for 6 yards" })]))
		expect(f.y1).toBeGreaterThan(0.4)
	})

	it("leaves plays without a lane in place (sacks, kneels) and kicks down the middle", () => {
		const f = framesForDrive(drive([play({ type: "run", loc: "R", gap: "E" }), play({ type: "pass", yds: -5, xe: 25, text: "sacked" }), play({ type: "punt", xe: null, text: "punts 40 yards" })]))
		expect(f[1].y1).toBe(f[1].y0)
		expect(f[1].catchAt).toBeNull()
		expect(f[2].y1).toBe(0)
	})
})

describe("field view and paths", () => {
	const base = { n: 1, down: 1, ytg: 10, from: 25, to: 40, firstDownAt: 35, outcome: "gain", type: "run", arc: false, downLabel: "1st & 10", text: "", yards: 15, lane: null, gap: null, catchAt: null, incompleteTo: null, y0: 0, yc: 0, y1: 0, ay: null, yac: null, firstDown: false, sack: false, epa: null, wpa: null, shotgun: false, noHuddle: false, xpass: null, deep: false } as const

	it("looks down the field: farther yards sit higher on screen, smaller and narrower", () => {
		const v = viewFrom(20)
		const near = v.pt(20, 0)
		const far = v.pt(60, 0)
		expect(far.y).toBeLessThan(near.y)
		expect(far.s).toBeLessThan(near.s)
		expect(v.pt(60, 0.5).x - v.pt(60, -0.5).x).toBeLessThan(v.pt(20, 0.5).x - v.pt(20, -0.5).x)
		// The offense's left is the left of the picture.
		expect(v.pt(40, -0.3).x).toBeLessThan(v.pt(40, 0.3).x)
	})

	it("raises a thrown ball off the ground", () => {
		const v = viewFrom(20)
		expect(v.pt(40, 0, 50).y).toBeLessThan(v.pt(40, 0).y)
	})

	it("keeps the camera behind the ball and inside the field", () => {
		expect(cameraFor(25)).toBe(9)
		expect(cameraFor(-5)).toBe(-10)
		expect(cameraFor(105)).toBe(50)
	})

	it("draws a run as one straight bar from the snap to where it ended", () => {
		const p = pathFor({ ...base, y1: 0.2 })
		expect(p.samples.every((s) => s.lift === 0)).toBe(true)
		expect(p.start).toEqual({ yard: 25, u: 0 })
		expect(p.end).toEqual({ yard: 40, u: 0.2 })
		expect(pointAlong(p, 0).yard).toBeCloseTo(25)
		expect(pointAlong(p, 1).u).toBeCloseTo(0.2)
	})

	it("lifts the ball in the air on a pass, sets it down at the catch, then runs it after the catch", () => {
		const p = pathFor({ ...base, type: "pass", arc: true, catchAt: 35, yc: -0.28, y1: -0.28 })
		expect(p.catchSpot).toEqual({ yard: 35, u: -0.28 })
		const peak = Math.max(...p.samples.map((s) => s.lift))
		expect(peak).toBeGreaterThan(20)
		expect(p.samples[0].lift).toBe(0)
		expect(p.samples[p.samples.length - 1].lift).toBe(0)
		// Progress is measured along the route, so halfway is not the end.
		const half = pointAlong(p, 0.5)
		expect(half.yard).toBeGreaterThan(25)
		expect(half.yard).toBeLessThan(40)
	})

	it("slices a path at a fraction, ending exactly there", () => {
		const p = pathFor({ ...base, y1: 0.2 })
		const part = sliceTo(p, 0.5)
		expect(part[part.length - 1].at).toBeCloseTo(p.total * 0.5)
		expect(sliceTo(p, 1)).toBe(p.samples)
	})

	it("builds a tapered ribbon polygon that gets wider as the ball travels", () => {
		const p = pathFor({ ...base, type: "pass", arc: true, catchAt: 40, yc: 0.2, y1: 0.2 })
		const d = ribbon(p.samples, viewFrom(20), 14, true)
		expect(d.startsWith("M")).toBe(true)
		expect(d.endsWith("Z")).toBe(true)
		expect(ribbon([p.samples[0]], viewFrom(20), 14)).toBe("")
	})

	it("keeps every route inside the field's width", () => {
		const frames = framesForDrive({
			n: 1, team: "LV", q: 1, clock: "1:00", result: "Touchdown", start: 20, yards: 80, top: null,
			plays: [
				{ n: 1, dn: 1, ytg: 10, x: 20, xe: 30, yds: 10, type: "run", fd: true, td: false, text: "ran ob", loc: "L", gap: "E" },
				{ n: 2, dn: 1, ytg: 10, x: 30, xe: 60, yds: 30, type: "pass", fd: true, td: false, text: "pass deep right", loc: "R", ay: 22, yac: 8 },
			],
		})
		for (const f of frames) {
			expect(Math.abs(f.y1)).toBeLessThanOrEqual(0.5)
			for (const s of pathFor(f).samples) expect(Math.abs(s.u)).toBeLessThanOrEqual(0.5)
		}
	})
})

describe("lane data in season.json", () => {
	it("gives most runs and passes a lane, with only valid values", () => {
		const plays = getGames().flatMap((g) => g.drives.flatMap((d) => d.plays)).filter((p) => p.type === "run" || p.type === "pass")
		expect(plays.length).toBeGreaterThan(50)
		const withLane = plays.filter((p) => p.loc)
		expect(withLane.length / plays.length).toBeGreaterThan(0.8)
		for (const p of plays) {
			if (p.loc) expect(["L", "M", "R"]).toContain(p.loc)
			if (p.gap) expect(["E", "T", "G"]).toContain(p.gap)
			if (p.gap) expect(p.type).toBe("run")
		}
		// Not everything went up the middle.
		expect(new Set(withLane.map((p) => p.loc)).size).toBe(3)
	})
})

describe("play value data in season.json", () => {
	const plays = () => getGames().flatMap((g) => g.drives.flatMap((d) => d.plays))

	it("values almost every play, with sane numbers", () => {
		const all = plays()
		expect(all.filter((p) => p.epa != null).length / all.length).toBeGreaterThan(0.95)
		for (const p of all) {
			if (p.epa != null) expect(Math.abs(p.epa)).toBeLessThan(10)
			if (p.wpa != null) expect(Math.abs(p.wpa)).toBeLessThan(1)
			if (p.xp != null) {
				expect(p.xp).toBeGreaterThanOrEqual(0)
				expect(p.xp).toBeLessThanOrEqual(1)
			}
			if (p.sg != null) expect(p.sg).toBe(1)
			if (p.nh != null) expect(p.nh).toBe(1)
			if (p.pl != null) {
				expect(["S", "D"]).toContain(p.pl)
				expect(p.type).toBe("pass")
			}
		}
	})

	it("has both shotgun and under-center plays, and some deep passes", () => {
		const scrim = plays().filter((p) => p.type === "run" || p.type === "pass")
		expect(scrim.some((p) => p.sg === 1)).toBe(true)
		expect(scrim.some((p) => p.sg == null)).toBe(true)
		expect(scrim.some((p) => p.pl === "D")).toBe(true)
	})
})
