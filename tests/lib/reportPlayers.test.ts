import { describe, expect, it } from "vitest"

import type { BoxPlayers } from "../../lib/lab/types"
import { buildRoster, sidePerformers, standout } from "../../lib/report/players"

const roster = buildRoster([
	{ id: "00-1", name: "Kirk Cousins", pos: "QB", slug: "kirk-cousins", team: "LV", espn: 111 },
	{ id: "00-2", name: "Ashton Jeanty", pos: "RB", slug: "ashton-jeanty", team: "LV", shot: "aj.png" },
])

const box: BoxPlayers = {
	pass: [
		{ id: "00-3", name: "B.Backup", att: 2, cmp: 1, yds: 5, td: 0, int: 0, sacks: 0, dropbacks: 2, epa: 0.1, success: 0.5, cpoe: 0, adot: 4 },
		{ id: "00-1", name: "K.Cousins", att: 48, cmp: 26, yds: 295, td: 2, int: 0, sacks: 2, dropbacks: 50, epa: -0.15, success: 0.38, cpoe: -4, adot: 8.2 },
	],
	rush: [{ id: "00-2", name: "A.Jeanty", car: 8, yds: 15, td: 0, long: 8, epa: -0.44, success: 0.25, explosive: 0 }],
	rec: [
		{ id: "00-7", name: "T.Tucker", tgt: 12, rec: 5, yds: 103, td: 1, air: 80, yac: 23, epa: 0.23 },
		{ id: "00-8", name: "Z.Minor", tgt: 1, rec: 1, yds: 4, td: 0, air: 2, yac: 2, epa: 0.5 },
	],
	def: [{ id: "00-5", name: "M.Crosby", tkl: 4, sack: 1, hit: 2, tfl: 1, pd: 0, int: 0, ff: 0 }],
}

describe("sidePerformers", () => {
	const list = sidePerformers(box, "me", roster)

	it("picks the quarterback who played, not the backup who threw twice", () => {
		const qb = list.find((p) => p.kind === "pass")!
		expect(qb.id).toBe("00-1")
	})
	it("names players from the roster and falls back to the play-by-play name", () => {
		expect(list.find((p) => p.id === "00-1")).toMatchObject({ name: "Kirk Cousins", slug: "kirk-cousins", espn: 111, pos: "QB" })
		expect(list.find((p) => p.id === "00-7")).toMatchObject({ name: "T.Tucker", slug: null, pos: "WR" })
	})
	it("prints a box-score line", () => {
		expect(list.find((p) => p.id === "00-1")!.line).toBe("26/48, 295 YDS, 2 TD, 2 sacked")
		expect(list.find((p) => p.id === "00-2")!.line).toBe("8 CAR, 15 YDS, long 8")
		expect(list.find((p) => p.id === "00-7")!.line).toBe("5 REC, 103 YDS, 1 TD, 12 TGT")
		expect(list.find((p) => p.id === "00-5")!.line).toBe("4 TOT, 1 SACK, 1 TFL")
	})
	it("leaves out receivers with fewer than three targets", () => {
		expect(list.find((p) => p.id === "00-8")).toBeUndefined()
	})
	it("shows signed EPA with a proper minus", () => {
		expect(list.find((p) => p.id === "00-1")!.chips[0].value).toBe("−0.15")
		expect(list.find((p) => p.id === "00-7")!.chips[0].value).toBe("+0.23")
	})
	it("handles an empty side", () => {
		expect(sidePerformers({ pass: [], rush: [], rec: [], def: [] }, "opp", roster)).toEqual([])
	})
})

describe("standout", () => {
	it("picks the player who added the most expected points", () => {
		const s = standout(sidePerformers(box, "me", roster))
		expect(s?.performer.id).toBe("00-7")
		expect(s?.why.length).toBeGreaterThan(5)
	})
	it("is null with nobody, or when nobody added anything", () => {
		expect(standout([])).toBeNull()
		const bad = sidePerformers({ ...box, rec: [], def: [], rush: [] }, "me", roster)
		expect(standout(bad)).toBeNull()
	})
})
