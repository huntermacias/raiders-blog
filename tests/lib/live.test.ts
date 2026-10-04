import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { cached, clearCache } from "../../lib/live/cache"
import { parseClock, parseEvent, parseOdds, parseScoreboard, parseSummary, siteAbbr } from "../../lib/live/espn"
import { allPlays, biggestSwings, currentHomeWp, feedOf, wpSeries } from "../../lib/live/series"
import { featuredGame } from "../../lib/live/service"
import { elapsedSeconds, expectedPoints, homeWinProbability, normalCdf, secondsLeftIn } from "../../lib/live/winprob"
import type { LabSeason } from "../../lib/lab/types"

import { scoreboard, summary } from "../stubs/liveFeed"

describe("parseClock", () => {
	it("reads minute:second text and plain numbers", () => {
		expect(parseClock("3:32")).toBe(212)
		expect(parseClock("0:00")).toBe(0)
		expect(parseClock("14:54")).toBe(894)
		expect(parseClock(75)).toBe(75)
		expect(parseClock("nope")).toBeNull()
		expect(parseClock(undefined)).toBeNull()
	})
})

describe("parseScoreboard", () => {
	const games = parseScoreboard(scoreboard)

	it("returns games in kickoff order with the site's team abbreviations", () => {
		expect(games.map((g) => g.id)).toEqual(["401872964", "401872965", "401872980"])
		expect(games[1].home.abbr).toBe("WAS")
		expect(siteAbbr("WSH")).toBe("WAS")
	})

	it("reads state, score, clock and venue", () => {
		const g = games.find((x) => x.id === "401872980")!
		expect(g).toMatchObject({ state: "in", period: 3, clockSeconds: 252, venue: "Allegiant Stadium", network: "CBS" })
		expect(g.home).toMatchObject({ abbr: "KC", score: 17, record: "2-1", name: "Kansas City Chiefs" })
		expect(g.away).toMatchObject({ abbr: "LV", score: 20 })
		expect(games[0].state).toBe("post")
		expect(games[1].state).toBe("pre")
	})

	it("works out who has the ball from ESPN's team id, and the down and distance", () => {
		const g = games.find((x) => x.id === "401872980")!
		expect(g.possession).toBe("LV")
		expect(g.situation).toMatchObject({ down: 2, distance: 7, yardsToGoal: 38, redZone: false, text: "2nd & 7 at KC 38" })
		expect(games[0].situation).toBeNull()
	})

	it("skips events missing a side and survives junk", () => {
		expect(parseScoreboard({ events: [{ id: "1" }, null, 5, { id: "2", competitions: [{ competitors: [] }] }] })).toEqual([])
		expect(parseScoreboard(null)).toEqual([])
		expect(parseScoreboard({})).toEqual([])
		expect(parseEvent(undefined)).toBeNull()
	})
})

describe("parseOdds", () => {
	it("reads the favorite from the label", () => {
		expect(parseOdds([{ details: "KC -3.5", overUnder: 47.5 }], "KC", "LV")).toMatchObject({ homeSpread: -3.5, overUnder: 47.5, label: "KC -3.5" })
		expect(parseOdds([{ details: "KC -3.5" }], "LV", "KC")).toMatchObject({ homeSpread: 3.5 })
		expect(parseOdds([{ details: "EVEN" }], "KC", "LV")?.homeSpread).toBe(0)
	})
	it("falls back to the number and the favorite flag", () => {
		expect(parseOdds([{ spread: -2, homeTeamOdds: { favorite: true } }], "KC", "LV")?.homeSpread).toBe(-2)
		expect(parseOdds([{ spread: -2, homeTeamOdds: { favorite: false } }], "KC", "LV")?.homeSpread).toBe(2)
	})
	it("returns null with no odds", () => {
		expect(parseOdds(undefined, "KC", "LV")).toBeNull()
		expect(parseOdds([], "KC", "LV")).toBeNull()
	})
})

describe("parseSummary", () => {
	const info = parseScoreboard(scoreboard).find((g) => g.id === "401872980")!
	const game = parseSummary(summary, info)

	it("keeps drives oldest first with the current drive last", () => {
		expect(game.drives.map((d) => d.id)).toEqual(["d1", "d2", "d3"])
		expect(game.drives[0]).toMatchObject({ team: "LV", result: "Touchdown", yards: 75 })
	})

	it("drops timeouts and other non-plays but keeps kickoffs", () => {
		const ids = game.drives[0].plays.map((p) => p.id)
		expect(ids).toEqual(["p0", "p1", "p2", "p4"])
	})

	it("classifies plays and flags the ones worth highlighting", () => {
		const byId = Object.fromEntries(allPlays(game).map((p) => [p.id, p]))
		expect(byId.p1).toMatchObject({ kind: "run", big: false, team: "LV", from: 25, to: 27 })
		expect(byId.p2).toMatchObject({ kind: "pass", big: true, firstDown: true, yards: 32 })
		expect(byId.p4).toMatchObject({ scoring: true, touchdown: true, big: true, away: 7 })
		expect(byId.p5).toMatchObject({ turnover: true, big: true })
		expect(byId.p0.kind).toBe("kick")
	})

	it("does not trust an end spot on the other team's side of a turnover", () => {
		const p5 = allPlays(game).find((p) => p.id === "p5")!
		expect(p5.from).toBe(30)
		expect(p5.to).toBeNull()
	})

	it("reads team stats for both sides", () => {
		expect(game.stats).toEqual([
			{ label: "Total yards", away: "301", home: "250" },
			{ label: "First downs", away: "17", home: "14" },
			{ label: "Time of possession", away: "31:50", home: "28:10" },
		])
	})

	it("builds the feed newest first, or only the big plays", () => {
		expect(feedOf(game, false)[0].id).toBe("p6")
		expect(feedOf(game, true).map((p) => p.id)).toEqual(["p5", "p4", "p2"])
	})

	it("survives an empty or odd summary", () => {
		expect(parseSummary({}, info).drives).toEqual([])
		expect(parseSummary(null, info).stats).toEqual([])
		expect(parseSummary({ drives: { previous: [null, 4, { plays: "x" }] } }, info).drives).toEqual([])
	})

	it("fills in the situation from the last play when the scoreboard has none", () => {
		const bare = { ...info, situation: null, possession: null }
		const g = parseSummary(summary, bare)
		expect(g.info.situation?.yardsToGoal).toBe(73)
		expect(g.info.possession).toBe("LV")
	})
})

describe("win probability", () => {
	it("is a coin flip between even teams at kickoff, and follows the spread", () => {
		expect(homeWinProbability({ lead: 0, secondsLeft: 3600, ball: 0 })).toBeCloseTo(0.5, 2)
		const fav = homeWinProbability({ lead: 0, secondsLeft: 3600, ball: 0, homeSpread: -7 })
		expect(fav).toBeGreaterThan(0.65)
		expect(fav).toBeLessThan(0.75)
		expect(homeWinProbability({ lead: 0, secondsLeft: 3600, ball: 0, homeSpread: 7 })).toBeCloseTo(1 - fav, 2)
	})

	it("rises with the lead and as the clock runs down on a lead", () => {
		const at = (lead: number, secondsLeft: number) => homeWinProbability({ lead, secondsLeft, ball: 0 })
		expect(at(3, 1800)).toBeGreaterThan(at(0, 1800))
		expect(at(7, 1800)).toBeGreaterThan(at(3, 1800))
		expect(at(7, 300)).toBeGreaterThan(at(7, 1800))
		expect(at(7, 30)).toBeGreaterThan(0.97)
		expect(at(-7, 30)).toBeLessThan(0.03)
	})

	it("values the ball, more the closer it is to scoring, and less with no time", () => {
		const ball = (yardsToGoal: number, secondsLeft = 1800) => homeWinProbability({ lead: 0, secondsLeft, ball: 1, yardsToGoal, down: 1 })
		expect(ball(10)).toBeGreaterThan(ball(50))
		expect(ball(50)).toBeGreaterThan(ball(90))
		expect(ball(10, 1800)).toBeGreaterThan(0.5)
		expect(homeWinProbability({ lead: 0, secondsLeft: 1800, ball: -1, yardsToGoal: 10, down: 1 })).toBeLessThan(0.5)
		expect(ball(10, 5)).toBeLessThan(ball(10, 1800))
	})

	it("stays inside 0 to 1 and is symmetric", () => {
		for (const lead of [-40, -3, 0, 3, 40]) {
			for (const secondsLeft of [0, 20, 900, 3600]) {
				const p = homeWinProbability({ lead, secondsLeft, ball: 0 })
				expect(p).toBeGreaterThan(0)
				expect(p).toBeLessThan(1)
				expect(p + homeWinProbability({ lead: -lead, secondsLeft, ball: 0 })).toBeCloseTo(1, 6)
			}
		}
	})

	it("handles overtime", () => {
		expect(homeWinProbability({ lead: 3, secondsLeft: 0, ball: 0, overtime: true })).toBeGreaterThan(0.9)
		expect(homeWinProbability({ lead: 0, secondsLeft: 0, ball: 1, overtime: true })).toBeGreaterThan(0.5)
	})

	it("has the helper pieces right", () => {
		expect(normalCdf(0)).toBeCloseTo(0.5, 6)
		expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
		expect(expectedPoints(75)).toBeCloseTo(0.5, 6)
		expect(expectedPoints(1)).toBeGreaterThan(expectedPoints(50))
		expect(secondsLeftIn(1, 900)).toBe(3600)
		expect(secondsLeftIn(4, 0)).toBe(0)
		expect(secondsLeftIn(3, 252)).toBe(1152)
		expect(secondsLeftIn(5, 300)).toBe(0)
		expect(elapsedSeconds(1, 900)).toBe(0)
		expect(elapsedSeconds(3, 252)).toBe(3600 - 1152)
		expect(elapsedSeconds(5, 600)).toBe(3600)
	})

	// The same score-and-clock model, checked against nflverse's win probability on every play of the
	// Raiders' games this season. Without possession or field position it should still land close.
	it("stays close to nflverse on this season's games", () => {
		const season = JSON.parse(readFileSync(join(__dirname, "../../data/lab/season.json"), "utf8")) as LabSeason
		let total = 0
		let count = 0
		for (const g of season.games) {
			// nflverse's spread is points the home team is favored by.
			for (const [el, wp] of g.wp) {
				let r = 0
				let o = 0
				for (const [t, rs, os] of g.scores) if (t <= el) [r, o] = [rs, os]
				const homeLead = g.home ? r - o : o - r
				const homeP = homeWinProbability({ lead: homeLead, secondsLeft: Math.max(0, 3600 - el), ball: 0, homeSpread: g.spread == null ? null : -g.spread })
				total += Math.abs((g.home ? homeP : 1 - homeP) - wp)
				count++
			}
		}
		expect(count).toBeGreaterThan(100)
		expect(total / count).toBeLessThan(0.09)
	})
})

describe("series", () => {
	const info = parseScoreboard(scoreboard).find((g) => g.id === "401872980")!
	const game = parseSummary(summary, info)

	it("starts at kickoff and moves with each play", () => {
		const s = wpSeries(game)
		expect(s[0]).toMatchObject({ el: 0, text: "Kickoff" })
		expect(s.length).toBe(allPlays(game).filter((p) => p.period > 0).length + 1)
		// KC is favored at home, so it starts above a coin flip; the Raiders' touchdown then flips it down.
		expect(s[0].home).toBeGreaterThan(0.5)
		const td = s.find((x) => x.text.includes("Touchdown pass"))!
		expect(td.home).toBeLessThan(s[0].home)
		expect(s.every((x, i) => i === 0 || x.el >= s[i - 1].el)).toBe(true)
	})

	it("finds the biggest swing", () => {
		const swings = biggestSwings(wpSeries(game), 2)
		expect(swings).toHaveLength(2)
		expect(Math.abs(swings[0].delta)).toBeGreaterThanOrEqual(Math.abs(swings[1].delta))
	})

	it("is exact for a finished game and follows the spread before one", () => {
		const done = parseScoreboard(scoreboard)[0]
		expect(done.state).toBe("post")
		expect(currentHomeWp(done)).toBe(1)
		expect(currentHomeWp({ ...done, home: { ...done.home, score: 3 }, away: { ...done.away, score: 3 } })).toBe(0.5)
		const pre = parseScoreboard(scoreboard)[1]
		expect(currentHomeWp(pre)).toBeCloseTo(0.5, 2)
		expect(currentHomeWp({ ...pre, odds: { homeSpread: -6, overUnder: null, label: null } })).toBeGreaterThan(0.6)
	})

	it("ends a finished game at its real result", () => {
		const done = parseScoreboard(scoreboard)[0]
		const s = wpSeries({ info: done, drives: [], stats: [] })
		expect(s).toHaveLength(1)
		const withPlay = wpSeries({ info: done, drives: [{ id: "x", team: "CLE", description: "", result: "", yards: 0, plays: allPlays(game).slice(0, 2) }], stats: [] })
		expect(withPlay[withPlay.length - 1]).toMatchObject({ text: "Final", home: 1 })
	})
})

describe("featuredGame", () => {
	const games = parseScoreboard(scoreboard)
	it("leads with the Raiders, else a live game, else the next", () => {
		expect(featuredGame(games)?.id).toBe("401872980")
		const noLv = games.filter((g) => g.id !== "401872980")
		expect(featuredGame(noLv)?.id).toBe("401872965")
		expect(featuredGame([])).toBeNull()
	})
})

describe("cached", () => {
	beforeEach(() => clearCache())

	it("shares one load among callers inside the window", async () => {
		const load = vi.fn(async () => 5)
		const a = await Promise.all([cached("k", 1000, load), cached("k", 1000, load)])
		await cached("k", 1000, load)
		expect(load).toHaveBeenCalledTimes(1)
		expect(a[0].value).toBe(5)
	})

	it("reloads after the window and serves the last good answer if the reload fails", async () => {
		let t = 0
		const now = () => t
		const load = vi.fn<() => Promise<number>>().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(3)
		expect((await cached("k", 100, load, now)).value).toBe(1)
		t = 500
		const stale = await cached("k", 100, load, now)
		expect(stale).toMatchObject({ value: 1, stale: true })
		t = 1000
		expect(await cached("k", 100, load, now)).toMatchObject({ value: 3, stale: false })
	})

	it("throws when there is nothing to fall back to", async () => {
		await expect(cached("fresh", 100, async () => Promise.reject(new Error("down")))).rejects.toThrow("down")
	})
})
