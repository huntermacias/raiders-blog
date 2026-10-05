// @vitest-environment node
import { describe, expect, it } from "vitest"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

import { CLIP_VERSION, KINDS, clipHash, clipPath, staleGames, type ClipManifest } from "../../lib/clips/manifest"
import { CLIP_SIZES, FPS, buildClipSpec, layoutFor, planFrames, scoreAt, segments, seriesUpTo, wpAt, renderClipFrame, type ClipKind } from "../../lib/clips/story"
import { getGames } from "../../lib/lab/data"
import { ogFonts } from "../../lib/og/fonts"
import type { WpPoint } from "../../lib/lab/types"

const games = getGames()

describe("planFrames", () => {
	const spec = { maxT: 3600, low: { el: 3000, p: 0.1, title: "", value: "", sub: "" }, swing: { el: 1200, p: 0.6, title: "", value: "", sub: "" } }

	it("opens with the kickoff, ends on the final, and walks forward in time", () => {
		const { frames, seconds } = planFrames(spec)
		expect(frames[0]).toMatchObject({ phase: "intro", el: 0 })
		expect(frames[frames.length - 1]).toMatchObject({ phase: "end", el: 3600 })
		const els = frames.map((f) => f.el)
		for (let i = 1; i < els.length; i++) expect(els[i]).toBeGreaterThanOrEqual(els[i - 1])
		expect(seconds).toBeGreaterThan(10)
		expect(seconds).toBeLessThan(18)
	})

	it("pauses on each marker long enough to read it, and nowhere else mid-game", () => {
		const { frames } = planFrames(spec)
		const holds = frames.filter((f) => f.phase === "play" && f.hold > 0.5)
		expect(holds.map((f) => f.el)).toEqual([1200, 3000])
		expect(frames.filter((f) => f.phase === "play" && f.hold <= 0.5).every((f) => Math.abs(f.hold - 1 / FPS) < 1e-9)).toBe(true)
	})

	it("does not pause twice for markers that nearly coincide", () => {
		const { frames } = planFrames({ ...spec, swing: { ...spec.swing, el: 3030 } })
		expect(frames.filter((f) => f.phase === "play" && f.hold > 0.5)).toHaveLength(1)
	})

	it("copes with a game that has no biggest swing and with overtime", () => {
		const { frames } = planFrames({ maxT: 4200, low: spec.low, swing: null })
		expect(frames[frames.length - 1].el).toBe(4200)
		expect(frames.filter((f) => f.hold > 0.5 && f.phase === "play")).toHaveLength(1)
	})
})

describe("curve helpers", () => {
	const series: WpPoint[] = [[0, 0.5], [100, 0.7], [200, 0.3], [300, 0.9]]

	it("cuts the series at a time, ending on an interpolated point", () => {
		expect(seriesUpTo(series, 150)).toEqual([[0, 0.5], [100, 0.7], [150, 0.5]])
		expect(seriesUpTo(series, 0)).toEqual([[0, 0.5]])
		expect(seriesUpTo(series, 999)).toEqual(series)
		expect(wpAt(series, 150)).toBeCloseTo(0.5)
		expect(wpAt([], 10)).toBe(0.5)
	})

	it("reads the running score from the changes so far", () => {
		const scores: [number, number, number][] = [[100, 7, 0], [200, 7, 3], [400, 10, 3]]
		expect(scoreAt(scores, 50)).toEqual([0, 0])
		expect(scoreAt(scores, 100)).toEqual([7, 0])
		expect(scoreAt(scores, 399)).toEqual([7, 3])
		expect(scoreAt(scores, 1000)).toEqual([10, 3])
	})

	it("splits the line where it crosses 50% so each side can wear its own color", () => {
		const box = { x: 0, y: 0, w: 300, h: 100 }
		const segs = segments(series, 300, box)
		expect(segs.map((s) => s.raiders)).toEqual([true, false, true])
		// The segments meet on the 50% line (y = 50), so the drawn line has no gaps.
		for (let i = 1; i < segs.length; i++) {
			const prev = segs[i - 1].pts[segs[i - 1].pts.length - 1]
			expect(segs[i].pts[0]).toEqual(prev)
			expect(prev.y).toBeCloseTo(50)
		}
	})
})

describe("manifest", () => {
	it("fingerprints what a clip is drawn from, and nothing else", () => {
		const g = games[3]
		expect(clipHash(g)).toBe(clipHash({ ...g }))
		expect(clipHash(g)).not.toBe(clipHash({ ...g, score: [g.score[0] + 1, g.score[1]] }))
		expect(clipHash(g)).not.toBe(clipHash({ ...g, wp: [...g.wp, [9999, 0.5]] }))
		// Drive details do not change the story clip.
		expect(clipHash(g)).toBe(clipHash({ ...g, drives: [] }))
	})

	it("names files predictably", () => {
		expect(clipPath(4, "landscape")).toBe("/lab/clips/week-4-landscape.mp4")
		expect(clipPath(4, "vertical")).toBe("/lab/clips/week-4-vertical.mp4")
		expect(clipPath(4, "square")).toBe("/lab/clips/week-4-square.mp4")
		expect(clipPath(4, "gif")).toBe("/lab/clips/week-4.gif")
		expect(clipPath(4, "poster")).toBe("/lab/clips/week-4-poster.jpg")
		expect(KINDS).toEqual(["landscape", "vertical", "square"])
	})

	it("redraws only what is missing, out of date, or from an older look", () => {
		const entry = (g: (typeof games)[number]) => ({ week: g.week, hash: clipHash(g), seconds: 13, files: {} as never, bytes: {} as never })
		const manifest: ClipManifest = { version: CLIP_VERSION, generatedAt: "", games: { "1": entry(games[0]), "2": { ...entry(games[1]), hash: "old" } } }
		expect(staleGames(games, manifest).map((g) => g.week)).toEqual([2, 3, 4])
		expect(staleGames(games, null)).toHaveLength(games.length)
		expect(staleGames(games, { ...manifest, version: CLIP_VERSION - 1 })).toHaveLength(games.length)
	})
})

describe("frames", () => {
	const spec = buildClipSpec(games[3], "LV")!
	const fonts = ogFonts() as never

	it("builds from a played game and carries its running score", () => {
		expect(spec.slug).toBe("week-4")
		expect(spec.scores.length).toBeGreaterThan(5)
		expect(spec.low.p).toBeGreaterThan(0)
		expect(buildClipSpec({ ...games[3], wp: [] }, "LV")).toBeNull()
	})

	it("keeps every layout's chart and labels inside the frame", () => {
		for (const kind of KINDS) {
			const { w, h } = CLIP_SIZES[kind]
			const L = layoutFor(kind)
			expect(L.chart.x).toBeGreaterThan(0)
			expect(L.chart.x + L.chart.w).toBeLessThan(w)
			expect(L.chart.y + L.chart.h + 40).toBeLessThan(L.footY)
			expect(L.footY + 50).toBeLessThanOrEqual(h)
			expect(L.readoutY).toBeLessThan(L.chart.y)
		}
	})

	it.each(["landscape", "vertical", "square"] as ClipKind[])("draws the intro, a mid-game frame, a marker and the final in %s", async (kind) => {
		const { w, h } = CLIP_SIZES[kind]
		const plan = planFrames(spec)
		const pick = [plan.frames[0], plan.frames[Math.floor(plan.frames.length / 2)], plan.frames.filter((f) => f.hold > 1 && f.phase === "play")[0], plan.frames[plan.frames.length - 1]]
		for (const f of pick) {
			const svg = await satori(renderClipFrame(spec, kind, f), { width: w, height: h, fonts })
			const png = new Resvg(svg, { fitTo: { mode: "width", value: w } }).render()
			expect(png.width).toBe(w)
			expect(png.height).toBe(h)
			expect(new Uint8Array(png.asPng()).subarray(1, 4)).toEqual(new Uint8Array([80, 78, 71]))
		}
	}, 60_000)
})
