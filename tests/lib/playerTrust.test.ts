import { describe, expect, it } from "vitest"

import { getPlayers, getUnits } from "../../lib/lab/data"
import { getPlayerLogs } from "../../lib/lab/playerData"
import { UNIT_FOR, nextGame, teamSentence, teamView } from "../../lib/lab/playerTeam"
import {
	GROUP_META,
	STAT,
	arcChange,
	arcLine,
	arcOf,
	badgesFor,
	contextOf,
	isEarly,
	leaders,
	oneIn,
	percentileBars,
	scoutingRead,
	shareCount,
	signalOf,
	standouts,
	statInfo,
	styleLine,
	type PlayerRow,
} from "../../lib/lab/playersKit"

import { isV2Site } from "../../lib/lab/labMethod"
const data = getPlayers()
const logs = getPlayerLogs()
const logOf = (p: PlayerRow) => logs.logs[p.slug]?.[p.group]

describe("a stat that is mostly luck is never called elite or poor", () => {
	const lucky = data.players.flatMap((p) => p.stats.map((s) => ({ p, s, c: contextOf(data, p, s)! }))).filter((x) => x.c && x.c.info.higher !== null && x.c.signal === "luck")

	it("has some luck stats this early in the season, and gives none of them a tier, a badge, a standout or a read", () => {
		expect(lucky.length).toBeGreaterThan(0)
		for (const x of lucky) expect(x.c.tier).toBeNull()
		const stand = standouts(data, { top: 500, hi: 0, lo: 100 })
		const named = new Set([...stand.best, ...stand.worst].map((x) => `${x.player.id}:${x.player.group}:${x.stat.k}`))
		for (const x of lucky) expect(named.has(`${x.p.id}:${x.p.group}:${x.s.k}`)).toBe(false)
		for (const p of data.players.slice(0, 120)) {
			const luckKeys = new Set(lucky.filter((x) => x.p.id === p.id && x.p.group === p.group).map((x) => statInfo(p.group, x.s.k)!.path))
			for (const b of badgesFor(data, p, 100, 100)) if (b.kind === "stat") expect(luckKeys.has(b.path)).toBe(false)
		}
	})

	it("keeps the range for a true level inside what the stat can be", () => {
		for (const x of lucky) {
			const [lo, hi] = x.c.range ?? [0, 1]
			if (x.c.info.fmt(0.5).endsWith("%")) {
				expect(lo).toBeGreaterThanOrEqual(0)
				expect(hi).toBeLessThanOrEqual(1)
			}
		}
	})

	it("marks the percentile bars of a luck stat so the page can leave them unranked", () => {
		const some = data.players.find((p) => percentileBars(data, p).some((b) => b.signal === "luck"))!
		expect(some).toBeTruthy()
	})

	it.skipIf(isV2Site())("orders a graded board by the stabilized rank, so players tied on a raw 0% are not all first", () => {
		const board = { group: "cb", path: "missed-tackle-rate", label: "Missed tackles", kind: "stat", key: "missedPct" } as const
		const rows = leaders(data, board)
		const ranks = rows.map((r) => r.rank)
		expect(ranks).toEqual(ranks.slice().sort((a, b) => a - b))
		const zeros = rows.filter((r) => r.value === 0)
		expect(new Set(zeros.map((r) => r.rank)).size).toBeGreaterThan(1)
	})
})

describe("a style stat says what it counts", () => {
	it("turns a share into a count a fan can picture", () => {
		const kick = statInfo("k", "longRate")!
		expect(shareCount(kick, 1 / 12, 12)).toBe("12 tries, 1 of them from 50+ yards")
		expect(shareCount(kick, 0, 1)).toBe("1 try, 0 of them from 50+ yards")
		expect(shareCount(statInfo("k", "fgDist")!, 40, 12)).toBe("")
		expect(oneIn(0.25)).toBe("about 1 in 4")
		expect(oneIn(0.08)).toBe("about 1 in 13")
		expect(oneIn(0.6)).toBe("about 6 in 10")
	})

	it("writes the count, the comparison and the typical player for every style stat, and never says 'more so than'", () => {
		let seen = 0
		for (const p of data.players) {
			for (const s of p.stats) {
				const c = contextOf(data, p, s)
				if (!c || c.stylePct === null) continue
				const line = styleLine(data, p, s)
				expect(line).toMatch(/typical/i)
				expect(line).not.toMatch(/more so than/)
				if (c.info.part) expect(line).toMatch(/\d+ \w+, \d+ of them/)
				seen += 1
			}
		}
		expect(seen).toBeGreaterThan(100)
	})
})

describe("the read cites numbers", () => {
	it("opens with the grade and the box score, names a strength with its rank and what is typical, and flags what is too early", () => {
		let withStrength = 0
		for (const p of data.players.filter((x) => x.games >= 3).slice(0, 200)) {
			const read = scoutingRead(data, p, { log: logOf(p) })
			expect(read.length).toBeGreaterThan(0)
			const text = read.join(" ")
			expect(text).not.toMatch(/undefined|NaN/)
			if (/His strength:/.test(text)) {
				withStrength += 1
				expect(text).toMatch(/\d(st|nd|rd|th) of \d+/)
				expect(text).toMatch(/the typical /)
			}
		}
		expect(withStrength).toBeGreaterThan(10)
	})

	it("says a luck-only profile is a placeholder, not a verdict", () => {
		const p = data.players.find((x) => scoutingRead(data, x).some((r) => /is a placeholder rather than a verdict/.test(r)))
		if (p) expect(scoutingRead(data, p).join(" ")).not.toMatch(/His strength/)
	})
})

describe("the season arc", () => {
	it("is the average of his graded stats' season-to-date percentiles by week, in week order", () => {
		const p = data.players.find((x) => arcOf(x, logOf(x)).length >= 3)!
		const arc = arcOf(p, logOf(p))
		expect(arc.map((a) => a.w)).toEqual(arc.map((a) => a.w).slice().sort((a, b) => a - b))
		for (const a of arc) {
			expect(a.pct).toBeGreaterThanOrEqual(0)
			expect(a.pct).toBeLessThanOrEqual(100)
		}
		const c = arcChange(arc)!
		expect(c.weeks).toBe(arc.length)
		expect(arcLine(arc)).toMatch(/holding|climbed|slipped/)
	})

	it("has nothing to say about a single week", () => {
		expect(arcChange([{ w: 3, pct: 50 }])).toBeNull()
		expect(arcLine([])).toBe("")
	})
})

describe("the team around a player", () => {
	const units = getUnits()
	it("gives each position a unit, and special teams none", () => {
		expect(UNIT_FOR.te).toBe("rec")
		expect(UNIT_FOR.ol).toBe("ol")
		expect(UNIT_FOR.k).toBeUndefined()
	})

	it("reports the club's record, its unit's rank and the room he shares, himself included", () => {
		const bowers = data.players.find((p) => p.name === "Brock Bowers" && p.group === "te")!
		const v = teamView(units, data, bowers)!
		expect(v.record).toMatch(/^\d+-\d+/)
		expect(v.unit?.key).toBe("rec")
		expect(v.unit!.rank).toBeGreaterThan(0)
		expect(v.unit!.lines.length).toBeGreaterThan(0)
		expect(v.room.some((m) => m.me)).toBe(true)
		expect(v.room.length).toBeLessThanOrEqual(6)
		expect(v.standing!.of).toBeGreaterThanOrEqual(v.standing!.rank)
		expect(teamSentence(v, bowers, GROUP_META.te.single, "Raiders")).toMatch(/Raiders/)
	})

	it("keeps the player in the room list even when many teammates out-grade him", () => {
		const line = data.players.filter((p) => p.team === "LV" && p.group === "ol")
		expect(line.length).toBeGreaterThanOrEqual(4)
		for (const p of line) expect(teamView(units, data, p, 2)!.room.some((m) => m.me)).toBe(true)
	})

	it("finds a team's next game on the slate and says nothing for a team that is not on it", () => {
		const slate = { week: 5, games: [{ away: "BAL", home: "ATL", day: "2026-10-11", time: "20:20", spread: 3.5, total: 44.5 }] }
		expect(nextGame(slate, "BAL")).toEqual({ week: 5, opp: "ATL", home: false, day: "2026-10-11", time: "20:20" })
		expect(nextGame(slate, "ATL")?.home).toBe(true)
		expect(nextGame(slate, "LV")).toBeNull()
		expect(nextGame(null, "LV")).toBeNull()
	})
})

describe("offensive linemen", () => {
	const ol = data.players.filter((p) => p.group === "ol")

	it("are in the data as their own group, with their own stats and box score", () => {
		expect(ol.length).toBeGreaterThan(100)
		expect(GROUP_META.ol.peers).toBe("offensive linemen")
		for (const k of ["runSucc", "sackRate", "penRate", "snapShare"]) expect(STAT.ol[k]).toBeTruthy()
		for (const p of ol) for (const s of p.stats) expect(statInfo("ol", s.k)).not.toBeNull()
	})

	it("mark the line's results as shared, and the flags as his own", () => {
		expect(STAT.ol.runSucc.unit).toBe(true)
		expect(STAT.ol.sackRate.unit).toBe(true)
		expect(STAT.ol.penRate.unit).toBeUndefined()
	})

	it("share one line number with the linemen who started beside them", () => {
		const lv = ol.filter((p) => p.team === "LV")
		const sack = lv.map((p) => p.stats.find((s) => s.k === "sackRate")?.season.v).filter((v): v is number => v !== undefined)
		// The linemen who started every game have the same team results; one who missed a game may differ.
		expect(new Set(sack).size).toBeLessThan(lv.length)
	})

	it("have a headshot, from the league's image id when the roster has no ESPN id", () => {
		expect(ol.filter((p) => p.espn || p.shot).length / ol.length).toBeGreaterThan(0.9)
	})
})

describe("an overall grade on stats that have not settled", () => {
	const hasHistory = (p: (typeof data.players)[number]) => p.stats.some((s) => Boolean(s.season.hn))

	it("is an early read for a player whose stats are all still mostly luck", () => {
		expect(data.players.filter((p) => isEarly(data, p)).length).toBeGreaterThan(0)
		// A man with nothing behind this season has only these few games to go on.
		const fresh = data.players.filter((p) => p.group === "te" && !hasHistory(p) && p.stats.length >= 4)
		expect(fresh.length).toBeGreaterThan(0)
		for (const p of fresh) expect(isEarly(data, p)).toBe(true)
	})

	it.skipIf(isV2Site())("is not an early read once his earlier seasons settle the stats behind it", () => {
		const bowers = data.players.find((p) => p.name === "Brock Bowers" && p.group === "te")!
		expect(hasHistory(bowers)).toBe(true)
		expect(isEarly(data, bowers)).toBe(false)
	})
})
