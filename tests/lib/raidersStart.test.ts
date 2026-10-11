import { beforeEach, describe, expect, it, vi } from "vitest"

// The replay log is rebuilt weekly and the grades through the week, so for a while the grades can count a game the log does not have.
const state = vi.hoisted(() => ({ games: [] as { result: string }[], lv: { g: 0, w: 0, l: 0, t: 0 } as { g: number; w: number; l: number; t: number } | undefined }))
vi.mock("../../lib/lab/data", () => ({
	getGames: () => state.games,
	getUnits: () => ({ teams: state.lv ? { LV: state.lv } : {} }),
}))

import { raidersStart } from "../../lib/lab/raidersStart"

const log = (...r: string[]) => r.map((result) => ({ result }))

beforeEach(() => {
	state.games = log("W", "W", "W", "L")
	state.lv = { g: 5, w: 3, l: 2, t: 0 }
})

describe("raidersStart", () => {
	it("reads the record from the game log when it has every game", () => {
		expect(raidersStart(4)).toEqual({ wins: 3, losses: 1 })
		expect(raidersStart(2)).toEqual({ wins: 2, losses: 0 })
	})

	it("falls back to the grades' record when the log is a game behind", () => {
		expect(raidersStart(5)).toEqual({ wins: 3, losses: 2 })
	})

	it("says nothing when neither source covers that many games, or a game was tied", () => {
		expect(raidersStart(6)).toBeNull()
		state.games = log("W", "T", "W", "L")
		expect(raidersStart(4)).toBeNull()
		state.lv = { g: 5, w: 3, l: 1, t: 1 }
		expect(raidersStart(5)).toBeNull()
		state.lv = undefined
		expect(raidersStart(5)).toBeNull()
	})
})
