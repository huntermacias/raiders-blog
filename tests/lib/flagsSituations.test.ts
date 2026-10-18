import { describe, expect, it } from "vitest"

import { getFlagFiles } from "../../lib/lab/flagsData"
import { DIMENSIONS, baselineOf, compareEdges, dimension, isDim, pctText, secondsLeft, situation, situationMix, standout, teamProfile, teamProfiles, typeMatrix, typeRows } from "../../lib/lab/flagsSituations"
import { TEAMS } from "../../lib/nfl"
import { flag } from "../helpers/flags"

const dim = (id: string) => dimension(id)!

describe("buckets", () => {
	it("puts the score into five spots from the committing team's side", () => {
		const of = (mg: number) => dim("score").of(flag({ mg }))
		expect([-20, -9, -8, -1, 0, 1, 8, 9, 30].map(of)).toEqual(["t9", "t9", "t1", "t1", "tie", "l1", "l1", "l9", "l9"])
	})

	it("puts a distance in short, medium, long and very long, and leaves a kick out", () => {
		const of = (dn: number | null, yd: number | null) => dim("distance").of(flag({ dn, yd }))
		expect([of(3, 1), of(3, 3), of(2, 4), of(1, 7), of(1, 10), of(2, 11), of(4, 25)]).toEqual(["s", "s", "m", "m", "l", "x", "x"])
		expect(of(null, null)).toBeNull()
		expect(of(3, null)).toBeNull()
	})

	it("puts the ball in one of four zones by yards from the team's own goal, and leaves out a flag with no spot", () => {
		const of = (yl: number | null) => dim("field").of(flag({ yl }))
		expect([of(1), of(20), of(21), of(49), of(50), of(79), of(80), of(99)]).toEqual(["own20", "own20", "own", "own", "opp", "opp", "rz", "rz"])
		expect(of(null)).toBeNull()
	})

	it("calls the last two minutes of the second and fourth quarters the two-minute drill, and nothing else", () => {
		const of = (q: number, tm: string) => dim("clock").of(flag({ q, tm }))
		expect([of(2, "02:00"), of(2, "02:01"), of(4, "00:30"), of(1, "00:30"), of(3, "01:00"), of(4, "10:00")]).toEqual(["two", "rest", "two", "rest", "rest", "rest"])
		expect(secondsLeft("08:12")).toBe(492)
	})

	it("sorts down, quarter, venue and unit simply", () => {
		expect(dim("down").of(flag({ dn: null }))).toBe("0")
		expect(dim("down").of(flag({ dn: 4 }))).toBe("4")
		expect(dim("quarter").of(flag({ q: 5 }))).toBe("5")
		expect(dim("venue").of(flag({ hm: 0 }))).toBe("away")
		expect(dim("unit").of(flag({ u: "special" }))).toBe("special")
		expect(isDim("score")).toBe(true)
		expect(isDim("nope")).toBe(false)
		expect(isDim(null)).toBe(false)
	})

	it("gives every dimension distinct buckets, so a flag lands in at most one", () => {
		for (const d of DIMENSIONS) {
			const ids = d.buckets.map((b) => b.id)
			expect(new Set(ids).size, d.id).toBe(ids.length)
			for (const f of getFlagFiles()[0].flags.slice(0, 400)) {
				const id = d.of(f)
				if (id != null) expect(ids, `${d.id} ${f.id}`).toContain(id)
			}
		}
	})
})

describe("situation tables", () => {
	const flags = [
		flag({ mg: -10, c: 3, ty: "Offensive Holding", tg: ["big"] }),
		flag({ mg: -10, c: 1, ty: "Offensive Holding" }),
		flag({ mg: 0, c: 2, ty: "False Start" }),
		flag({ mg: 3, c: 0, ty: "False Start" }),
	]

	it("counts flags per bucket with shares, costs, and the penalties that come most", () => {
		const rows = situation(flags, dim("score"))
		expect(rows.map((r) => r.id)).toEqual(["t9", "t1", "tie", "l1", "l9"])
		expect(rows[0]).toMatchObject({ flags: 2, share: 0.5, costly: 1, cost: 4, avg: 2 })
		expect(rows[0].top).toEqual([{ type: "Offensive Holding", flags: 2 }])
		expect(rows[1]).toMatchObject({ flags: 0, share: 0, avg: 0, top: [] })
		expect(rows.reduce((s, r) => s + r.flags, 0)).toBe(4)
	})

	it("leaves flags with no value out of the shares", () => {
		const rows = situation([flag({ yl: null }), flag({ yl: 30 })], dim("field"))
		expect(rows.find((r) => r.id === "own")!.share).toBe(1)
	})

	it("reads a group against the league: an index of 1 is the league's habit, and a thin sample has none", () => {
		const league = baselineOf(flags)
		const mine = situationMix(flags.slice(0, 2), dim("score"), league, 2)
		expect(mine[0].index).toBe(2)
		expect(mine[2].index).toBe(0)
		expect(situationMix(flags.slice(0, 2), dim("score"), league, 20)[0].index).toBeNull()
		expect(situationMix(flags, dim("score"), null, 1)[0].index).toBeNull()
		expect(standout(mine, 2)?.id).toBe("t9")
		expect(standout(mine, 5)).toBeNull()
	})

	it("ranks the penalty names: costliest first, with the average yards, average cost and share that count like a turnover", () => {
		const rows = typeRows(flags)
		expect(rows.map((r) => r.type)).toEqual(["Offensive Holding", "False Start"])
		expect(rows[0]).toMatchObject({ flags: 2, cost: 4, avg: 2, costly: 1, costlyShare: 0.5, share: 0.5, avgYards: 10, yards: 20 })
	})

	it("lays the most common penalties against a dimension", () => {
		const m = typeMatrix(flags, dim("score"), 1)
		expect(m.types).toEqual(["False Start"].length ? [m.types[0]] : [])
		expect(m.cells).toHaveLength(1)
		expect(m.totals).toEqual([2, 0, 1, 1, 0])
		const two = typeMatrix(flags, dim("score"), 2)
		expect(two.cells[two.types.indexOf("Offensive Holding")][0]).toBe(2)
		expect(two.cells[two.types.indexOf("False Start")][2]).toBe(1)
	})
})

describe("team profiles", () => {
	const flags = [flag({ t: "LV", c: 2, g: "g1" }), flag({ t: "LV", c: 4, g: "g2", tg: ["gift"] }), flag({ t: "KC", c: 1, g: "g1", ck: "qb" }), flag({ t: "KC", c: 0.5, g: "g1", ck: "team", pid: null })]

	it("sums a team's flags, rates them per game and finds the worst", () => {
		const p = teamProfile(flags, "LV", 2)
		expect(p).toMatchObject({ team: "LV", games: 2, flags: 2, cost: 6, costly: 1, gifts: 1, players: 2, quarterbacks: 0, coaches: 0 })
		expect(p.perGame).toEqual({ flags: 1, yards: 10, cost: 3 })
		expect(p.worst?.c).toBe(4)
		expect(p.types[0].type).toBe("Offensive Holding")
		expect(p.dims.down).toHaveLength(5)
	})

	it("falls back to the games it can see when the file has no count, and handles a team with no flags", () => {
		expect(teamProfile(flags, "LV", 0).games).toBe(2)
		const none = teamProfile(flags, "DEN", 3)
		expect(none).toMatchObject({ flags: 0, cost: 0, worst: null })
		expect(none.perGame.cost).toBe(0)
	})

	it("ranks teams by what their flags cost per game", () => {
		const all = teamProfiles(flags, ["LV", "KC", "DEN"], { LV: 2, KC: 1, DEN: 1 })
		expect(all.LV.rank).toEqual({ cost: 1, flags: 2, of: 3 })
		expect(all.KC.rank.flags).toBe(1)
		expect(all.KC.rank.cost).toBe(2)
		expect(all.DEN.rank.cost).toBe(3)
	})
})

describe("what two teams do differently", () => {
	const mk = (team: string, n: number, extra: Partial<Parameters<typeof flag>[0]> = {}) => Array.from({ length: n }, () => flag({ t: team, ...extra }))

	it("says who gets more flags and who they cost more, and flags only a real gap", () => {
		const flags = [...mk("LV", 20, { c: 2 }), ...mk("KC", 10, { c: 1 })]
		const a = teamProfile(flags, "LV", 5)
		const b = teamProfile(flags, "KC", 5)
		const edges = compareEdges(a, b, 6)
		expect(edges.find((e) => e.key === "flags")).toMatchObject({ worse: "a", text: "LV gets 4.0 flags a game, KC 2.0." })
		expect(edges.find((e) => e.key === "cost")?.text).toBe("LV's flags cost 8.0 points a game; KC's cost 2.0.")
		const even = compareEdges(teamProfile(mk("LV", 10), "LV", 5), teamProfile(mk("KC", 10), "KC", 5), 6)
		expect(even.find((e) => e.key === "flags")).toBeUndefined()
	})

	it("finds the spot where they differ most, and ignores a spot where one has too few flags", () => {
		const flags = [...mk("LV", 12, { dn: 3, yd: 8 }), ...mk("KC", 2, { dn: 3, yd: 8 }), ...mk("LV", 5, { dn: 1, yd: 10 }), ...mk("KC", 5, { dn: 1, yd: 10 })]
		const a = teamProfile(flags, "LV", 4)
		const b = teamProfile(flags, "KC", 4)
		const edges = compareEdges(a, b, 10, 5)
		expect(edges.some((e) => e.key === "down:3")).toBe(false)
		const more = compareEdges(teamProfile(flags, "LV", 4), teamProfile(flags, "KC", 4), 10, 2)
		expect(more.find((e) => e.key === "down:3")?.text).toMatch(/On 3rd down, LV gets 3\.00 flags a game and KC 0\.50/)
	})

	it("keeps to the number asked for, biggest gaps first, and says nothing about an empty comparison", () => {
		const flags = [...mk("LV", 30, { c: 3 }), ...mk("KC", 4, { c: 0.5 })]
		expect(compareEdges(teamProfile(flags, "LV", 5), teamProfile(flags, "KC", 5), 2)).toHaveLength(2)
		expect(compareEdges(teamProfile([], "LV", 5), teamProfile([], "KC", 5))).toEqual([])
		expect(pctText(1, 4)).toBe("25%")
		expect(pctText(1, 0)).toBe("0%")
	})
})

describe("on the real data", () => {
	const file = getFlagFiles()[0]
	const abbrs = TEAMS.map((t) => t.abbr)

	it("has a games count for every team, and a profile whose dimensions add up to the team's flags", () => {
		for (const a of abbrs) expect(file.games[a], a).toBeGreaterThan(0)
		const profiles = teamProfiles(file.flags, abbrs, file.games)
		for (const p of Object.values(profiles)) {
			expect(p.dims.score.reduce((s, r) => s + r.flags, 0), p.team).toBe(p.flags)
			expect(p.dims.down.reduce((s, r) => s + r.flags, 0), p.team).toBe(p.flags)
			expect(p.dims.unit.reduce((s, r) => s + r.flags, 0), p.team).toBe(p.flags)
			expect(p.players + p.quarterbacks + p.coaches, p.team).toBe(p.flags)
		}
		expect(new Set(Object.values(profiles).map((p) => p.rank.cost)).size).toBe(32)
	})

	it("sums to the league's flags", () => {
		const rows = situation(file.flags, dim("down"))
		expect(rows.reduce((s, r) => s + r.flags, 0)).toBe(file.flags.length)
	})
})
