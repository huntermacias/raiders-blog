import { describe, expect, it } from "vitest"

import { driveStats, fmtEpa, fmtWpa, framesForDrive, isFiltering, kindLetter, matchesFilter, NO_FILTER, playAnalytics, playFacts, playKind } from "../../lib/lab/drive"
import { COMPACT, WIDE, viewFrom } from "../../lib/lab/field"
import { easeInOut, glideMs, MOVE_FROM, MOVE_TO, posAtScrub, scrubValue, stateAt } from "../../lib/lab/timeline"
import type { Drive, DrivePlay } from "../../lib/lab/types"

const play = (over: Partial<DrivePlay>): DrivePlay => ({ n: 1, dn: 1, ytg: 10, x: 25, xe: 30, yds: 5, type: "run", fd: false, td: false, text: "run", ...over })
const drive = (plays: DrivePlay[]): Drive => ({ n: 1, team: "LV", q: 1, clock: "10:00", result: "Touchdown", start: 25, yards: 75, top: "5:00", plays })

describe("timeline: one position through a drive", () => {
	it("sets the ball, moves it, then holds the result, play after play", () => {
		expect(stateAt(0, 3)).toMatchObject({ done: 0, moving: null })
		const mid = stateAt(MOVE_FROM + (MOVE_TO - MOVE_FROM) / 2, 3)
		expect(mid.moving).toBe(0)
		expect(mid.done).toBe(0)
		expect(mid.progress).toBeCloseTo(0.5)
		expect(stateAt(MOVE_TO + 0.01, 3)).toMatchObject({ done: 1, moving: null })
		expect(stateAt(1 + MOVE_FROM + 0.05, 3).moving).toBe(1)
	})

	it("is finished at the end and clamps anything outside the drive", () => {
		expect(stateAt(3, 3)).toMatchObject({ done: 3, moving: null, progress: 1 })
		expect(stateAt(99, 3).done).toBe(3)
		expect(stateAt(-4, 3).done).toBe(0)
		expect(stateAt(1, 0).done).toBe(0)
	})

	it("eases the ball back to the line of scrimmage during the set phase only", () => {
		expect(stateAt(1, 3).settle).toBe(0)
		const part = stateAt(1 + MOVE_FROM / 2, 3).settle
		expect(part).toBeGreaterThan(0)
		expect(part).toBeLessThan(1)
		expect(stateAt(MOVE_TO + 0.2, 3).settle).toBe(0)
	})

	it("matches dragging to what you see: the thumb sits where the fill ends", () => {
		for (const v of [0, 0.3, 1, 1.5, 2.9, 3]) {
			const s = stateAt(posAtScrub(v, 3), 3)
			expect(scrubValue(s)).toBeCloseTo(v, 6)
		}
	})

	it("glides longer for longer jumps, but never forever", () => {
		expect(glideMs(1)).toBeLessThan(glideMs(6))
		expect(glideMs(500)).toBeLessThanOrEqual(1100)
		expect(easeInOut(0)).toBe(0)
		expect(easeInOut(1)).toBe(1)
		expect(easeInOut(0.5)).toBeCloseTo(0.5)
	})
})

describe("describing a play", () => {
	const frame = (over: Partial<DrivePlay>) => framesForDrive(drive([play(over)]))[0]

	it("names the kind of play and where it went", () => {
		expect(playKind(frame({ loc: "L", gap: "E" }))).toBe("Run left end")
		expect(playKind(frame({ loc: "M" }))).toBe("Run up the middle")
		expect(playKind(frame({ type: "pass", loc: "R", ay: 8 }))).toBe("Pass right")
		expect(playKind(frame({ type: "pass", loc: "L", ay: 15, yds: 0, text: "pass deep left incomplete" }))).toBe("Incomplete pass left")
		expect(playKind(frame({ type: "pass", yds: -7, xe: 18, text: "K.Cousins sacked for -7 yards" }))).toBe("Sack")
		expect(playKind(frame({ type: "punt", xe: null, text: "punts 40 yards" }))).toBe("Punt")
	})

	it("lists short facts: down, field position, yards, first down", () => {
		const facts = playFacts(frame({ type: "pass", loc: "R", ay: 6, yac: 4, yds: 10, fd: true, xe: 35, x: 25, text: "pass short right for 10 yards" }))
		expect(facts).toContain("1st & 10")
		expect(facts).toContain("own 25 → own 35")
		expect(facts).toContain("+10 yds")
		expect(facts).toContain("6 air yds")
		expect(facts).toContain("4 after catch")
		expect(facts).toContain("First down")
	})

	it("says touchdown instead of first down on a score", () => {
		const facts = playFacts(frame({ x: 94, xe: 100, yds: 6, td: true, fd: true, text: "TOUCHDOWN" }))
		expect(facts).toContain("Touchdown")
		expect(facts).not.toContain("First down")
	})

	it("gives each play a letter for the scrubber", () => {
		expect(kindLetter(frame({}))).toBe("R")
		expect(kindLetter(frame({ type: "pass", loc: "M", ay: 5 }))).toBe("P")
		expect(kindLetter(frame({ type: "punt", xe: null, text: "punts 40 yards" }))).toBe("K")
		expect(kindLetter(frame({ type: "qb_kneel", text: "kneels" }))).toBe("X")
	})
})

describe("highlighting plays", () => {
	const frames = framesForDrive(
		drive([
			play({ n: 1, dn: 1, type: "run", loc: "M" }),
			play({ n: 2, dn: 2, type: "pass", loc: "L", ay: 7 }),
			play({ n: 3, dn: 3, type: "pass", loc: "R", ay: 12, yds: 0, text: "pass deep right incomplete" }),
			play({ n: 4, dn: 4, type: "punt", xe: null, text: "punts 40 yards" }),
		])
	)
	const count = (f: Parameters<typeof matchesFilter>[1]) => frames.filter((x) => matchesFilter(x, f)).length

	it("matches everything when nothing is selected", () => {
		expect(isFiltering(NO_FILTER)).toBe(false)
		expect(count(NO_FILTER)).toBe(4)
	})

	it("filters by kind and by down, and both together", () => {
		expect(count({ kind: "run", down: 0 })).toBe(1)
		expect(count({ kind: "pass", down: 0 })).toBe(2)
		expect(count({ kind: "kick", down: 0 })).toBe(1)
		expect(count({ kind: "all", down: 3 })).toBe(1)
		expect(count({ kind: "pass", down: 3 })).toBe(1)
		expect(count({ kind: "run", down: 3 })).toBe(0)
		expect(isFiltering({ kind: "pass", down: 0 })).toBe(true)
	})
})

describe("drive totals", () => {
	it("counts runs, passes, sacks, first downs and conversions", () => {
		const s = driveStats(
			framesForDrive(
				drive([
					play({ n: 1, dn: 1, type: "run", yds: 4, loc: "M" }),
					play({ n: 2, dn: 2, type: "pass", yds: 3, loc: "L", ay: 3, text: "pass short left for 3 yards" }),
					play({ n: 3, dn: 3, ytg: 3, type: "pass", yds: 11, fd: true, loc: "R", ay: 9, text: "pass short right for 11 yards" }),
					play({ n: 4, dn: 1, type: "pass", yds: 0, loc: "L", ay: 10, text: "pass deep left incomplete" }),
					play({ n: 5, dn: 2, type: "pass", yds: -6, text: "K.Cousins sacked for -6 yards" }),
					play({ n: 6, dn: 3, ytg: 16, type: "run", yds: 2, loc: "M" }),
					play({ n: 7, dn: 4, ytg: 14, type: "punt", xe: null, text: "punts 40 yards" }),
				])
			)
		)
		expect(s.plays).toBe(7)
		expect(s.runs).toEqual({ n: 2, yds: 6 })
		expect(s.passes).toEqual({ att: 3, comp: 2, yds: 8 })
		expect(s.sacks).toBe(1)
		expect(s.firstDowns).toBe(1)
		expect(s.thirdDowns).toEqual({ att: 2, conv: 1 })
		expect(s.fourthDowns).toEqual({ att: 0, conv: 0 })
	})

	it("does not count an interception as a completion", () => {
		const s = driveStats(framesForDrive(drive([play({ type: "pass", yds: 0, loc: "M", ay: 12, text: "pass INTERCEPTED by Smith" })])))
		expect(s.passes).toEqual({ att: 1, comp: 0, yds: 0 })
	})
})

describe("phone field", () => {
	it("is taller and narrower than the wide field, and keeps the field inside the picture", () => {
		expect(COMPACT.W).toBeLessThan(WIDE.W)
		expect(COMPACT.H).toBeGreaterThan(WIDE.H)
		const v = viewFrom(20, COMPACT)
		for (const yard of [20, 30, 60, 80]) {
			expect(v.pt(yard, -0.5).x).toBeGreaterThanOrEqual(0)
			expect(v.pt(yard, 0.5).x).toBeLessThanOrEqual(COMPACT.W)
			expect(v.pt(yard, 0).y).toBeLessThanOrEqual(COMPACT.BOTTOM + 1)
			expect(v.pt(yard, 0).y).toBeGreaterThanOrEqual(COMPACT.TOP - 1)
		}
	})

	it("leaves room under the near edge for the lane labels", () => {
		expect(COMPACT.H - COMPACT.BOTTOM).toBeGreaterThan(24)
	})
})

describe("how plays were valued and set up", () => {
	const frame = (over: Partial<DrivePlay>) => framesForDrive(drive([play(over)]))[0]

	it("formats expected points and win probability with a sign", () => {
		expect(fmtEpa(0.456)).toBe("+0.46")
		expect(fmtEpa(-1.2)).toBe("\u22121.20")
		expect(fmtEpa(0)).toBe("0.00")
		expect(fmtWpa(0.0214)).toBe("+2.1%")
		expect(fmtWpa(-0.1)).toBe("\u221210.0%")
	})

	it("lists what the log says about a play, and only that", () => {
		const a = playAnalytics(frame({ type: "pass", loc: "L", ay: 8, epa: 0.72, wpa: 0.018, sg: 1, nh: 1, xp: 0.49 }))
		expect(a).toEqual([
			{ label: "Expected points added", value: "+0.72" },
			{ label: "Win probability", value: "+1.8%" },
			{ label: "Pass odds before the snap", value: "49%" },
			{ label: "Setup", value: "Shotgun, No huddle" },
		])
		expect(playAnalytics(frame({ epa: -0.3 })).map((x) => x.label)).toEqual(["Expected points added", "Setup"])
		expect(playAnalytics(frame({ epa: -0.3 })).find((x) => x.label === "Setup")?.value).toBe("Under center")
		// A punt has no setup to describe.
		expect(playAnalytics(frame({ type: "punt", xe: null, text: "punts 40 yards", epa: 0.1 })).map((x) => x.label)).toEqual(["Expected points added"])
	})

	it("calls a deep pass deep", () => {
		expect(playKind(frame({ type: "pass", loc: "R", ay: 25, pl: "D" }))).toBe("Deep pass right")
		expect(playKind(frame({ type: "pass", loc: "R", ay: 22, pl: "D", yds: 0, text: "pass deep right incomplete" }))).toBe("Incomplete deep pass right")
	})

	it("totals EPA, success rate, win probability and explosive plays for a drive", () => {
		const s = driveStats(
			framesForDrive(
				drive([
					play({ n: 1, type: "run", loc: "M", yds: 12, epa: 0.8, wpa: 0.01 }),
					play({ n: 2, type: "run", loc: "L", yds: 2, epa: -0.4, wpa: -0.004 }),
					play({ n: 3, dn: 2, type: "pass", loc: "R", ay: 25, yds: 26, epa: 1.4, wpa: 0.03, text: "pass deep right for 26 yards" }),
					play({ n: 4, dn: 1, type: "no_play", yds: 0, epa: -0.2, text: "PENALTY False Start" }),
				])
			)
		)
		expect(s.epa).toBeCloseTo(1.6)
		expect(s.wpa).toBeCloseTo(0.036)
		expect(s.success).toEqual({ good: 2, of: 3 })
		expect(s.explosive).toBe(2)
	})

	it("leaves EPA empty when the log has none", () => {
		const s = driveStats(framesForDrive(drive([play({})])))
		expect(s.epa).toBeNull()
		expect(s.wpa).toBeNull()
		expect(s.success).toEqual({ good: 0, of: 0 })
	})
})
