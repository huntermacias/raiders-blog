import { describe, expect, it } from "vitest"

import { framesForDrive, type Frame } from "../../lib/lab/drive"
import { BAR_LIFT, POST_YARD, UPRIGHT_U, cameraFor, goalZoom, kickLift, pathFor } from "../../lib/lab/field"
import { clockText, scoreAt, wpAround } from "../../lib/lab/hud"
import type { Drive, DrivePlay } from "../../lib/lab/types"

const play = (over: Partial<DrivePlay>): DrivePlay => ({ n: 1, dn: null, ytg: 0, x: 72, xe: null, yds: 0, type: "field_goal", fd: false, td: false, text: "", ...over })
const frameOf = (p: Partial<DrivePlay>): Frame => {
	const d: Drive = { n: 1, team: "LV", q: 1, clock: "10:00", result: "Field goal", start: 70, yards: 0, top: null, plays: [play(p)] }
	return framesForDrive(d)[0]
}

describe("kicks", () => {
	it("reads the length of a field goal and how a miss missed", () => {
		const good = frameOf({ text: "M.Gay 47 yard field goal is GOOD, Center-A.Ward, Holder-A.Cole." })
		expect(good.outcome).toBe("fieldgoal-good")
		expect(good.kickYards).toBe(47)
		expect(good.miss).toBeUndefined()
		const left = frameOf({ text: "R.Patterson 41 yard field goal is No Good, Wide Left, Center-T.Addington." })
		expect(left.miss).toBe("left")
		const right = frameOf({ text: "C.Dicker 58 yard field goal is No Good, Hit Right Upright, Center-J.Harris." })
		expect(right.miss).toBe("right")
		expect(right.upright).toBe(true)
		expect(frameOf({ text: "X 50 yard field goal is No Good, Blocked." }).miss).toBe("blocked")
		expect(frameOf({ text: "X 55 yard field goal is No Good, Short." }).miss).toBe("short")
	})

	it("sends a good kick through the uprights, over the crossbar", () => {
		const f = frameOf({ text: "M.Gay 47 yard field goal is GOOD" })
		const p = pathFor(f)
		expect(p.end).toEqual({ yard: POST_YARD, u: 0 })
		const last = p.samples[p.samples.length - 1]
		expect(last.lift).toBeGreaterThan(BAR_LIFT)
		// It climbs well above the bar on the way.
		expect(Math.max(...p.samples.map((s) => s.lift))).toBeGreaterThan(last.lift)
	})

	it("sends a miss wide, off an upright, or short", () => {
		const wide = pathFor(frameOf({ text: "X 41 yard field goal is No Good, Wide Left" }))
		expect(wide.end.u).toBeLessThan(-UPRIGHT_U)
		const wideR = pathFor(frameOf({ text: "X 41 yard field goal is No Good, Wide Right" }))
		expect(wideR.end.u).toBeGreaterThan(UPRIGHT_U)
		const post = pathFor(frameOf({ text: "X 58 yard field goal is No Good, Hit Right Upright" }))
		expect(post.end.u).toBeCloseTo(UPRIGHT_U, 5)
		const short = pathFor(frameOf({ text: "X 55 yard field goal is No Good, Short" }))
		expect(short.end.yard).toBeLessThan(POST_YARD)
		expect(short.samples[short.samples.length - 1].lift).toBe(0)
	})

	it("lofts a punt higher than a pass of the same length, within a cap", () => {
		expect(kickLift(40)).toBeGreaterThan(100)
		expect(kickLift(200)).toBe(200)
	})
})

describe("camera", () => {
	it("pushes in near the goal line and not at midfield", () => {
		expect(goalZoom(40)).toBe(1)
		expect(goalZoom(70)).toBe(1)
		expect(goalZoom(100)).toBeCloseTo(1.4, 5)
		expect(goalZoom(85)).toBeGreaterThan(1.1)
		expect(goalZoom(85)).toBeLessThan(1.4)
	})

	it("keeps the goalposts in view when pushed in", () => {
		const depth = 60 / goalZoom(110)
		expect(cameraFor(110, depth) + depth).toBeGreaterThanOrEqual(110)
	})
})

describe("overlay numbers", () => {
	const scores: [number, number, number][] = [
		[600, 0, 6],
		[1800, 7, 6],
	]
	it("counts a score on the play after it, not before", () => {
		expect(scoreAt(scores, 600, false)).toEqual([0, 0])
		expect(scoreAt(scores, 600, true)).toEqual([0, 6])
		expect(scoreAt(scores, 1700, true)).toEqual([0, 6])
		expect(scoreAt(scores, 2000, false)).toEqual([7, 6])
		expect(scoreAt(undefined, 10, true)).toEqual([0, 0])
	})

	it("works out the win chance after a play from the side that had the ball", () => {
		const f = { w0: 0.5, wpa: 0.1 } as Frame
		expect(wpAround(f, true)).toEqual({ before: 0.5, after: 0.6 })
		const opp = wpAround(f, false)!
		expect(opp.after).toBeCloseTo(0.4, 10)
		expect(wpAround({ w0: 0.95, wpa: 0.2 } as Frame, true)!.after).toBe(1)
		expect(wpAround({ w0: undefined, wpa: 0.2 } as unknown as Frame, true)).toBeNull()
		expect(wpAround({ w0: 0.4, wpa: null } as Frame, true)).toEqual({ before: 0.4, after: 0.4 })
	})

	it("prints the clock, with overtime", () => {
		expect(clockText({ q: 2, clk: "8:41" })).toBe("Q2 8:41")
		expect(clockText({ q: 5, clk: "4:12" })).toBe("OT 4:12")
		expect(clockText({})).toBe("")
	})
})
