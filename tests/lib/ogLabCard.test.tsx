// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

import { getGames, getSeason } from "../../lib/lab/data"
import type { LabGame } from "../../lib/lab/types"
import { CHART, FIELD, buildLabSpec, chartPoint, curvePaths, fieldX, fieldY, pickDrive, placeLabels, playPath, renderLabCard } from "../../lib/og/labCard"
import { framesForDrive } from "../../lib/lab/drive"
import { OG_HEIGHT, OG_WIDTH, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"

vi.setConfig({ testTimeout: 60_000 })

const team = getSeason().team
const games = getGames()
const wk3 = games.find((g) => g.week === 3)!

describe("buildLabSpec", () => {
	it("summarizes the game for the story card", () => {
		const spec = buildLabSpec(wk3, team)!
		expect(spec).toMatchObject({ type: "lab", kind: "story", week: 3, oppName: "Saints", result: "W", score: [35, 27], home: false })
		expect(spec.low.value).toMatch(/^\d+%$/)
		expect(spec.swing?.value).toMatch(/^\+\d+ pts$/)
		expect(spec.series.length).toBeGreaterThan(50)
		expect(spec.oppColor).toMatch(/^#[0-9a-f]{6}$/)
		expect(spec.drive).toBeNull()
		expect(spec.headline.length).toBeGreaterThan(5)
	})

	it("builds a drive card with the best Raiders drive when asked", () => {
		const spec = buildLabSpec(wk3, team, { view: "drive" })!
		expect(spec.kind).toBe("drive")
		expect(spec.drive!.frames.length).toBe(spec.drive!.plays)
		expect(spec.drive!.keyIndex).toBeGreaterThanOrEqual(0)
		expect(spec.drive!.keyIndex).toBeLessThan(spec.drive!.frames.length)
		expect(spec.drive!.keyLine.length).toBeGreaterThan(5)
	})

	it("picks a requested drive, and falls back to the best one for an unknown number", () => {
		const best = pickDrive(wk3, team)!
		const mine = wk3.drives.filter((d) => d.team === team && d.plays.length)
		const other = mine.find((d) => d.n !== best.n)!
		expect(pickDrive(wk3, team, other.n)!.n).toBe(other.n)
		expect(pickDrive(wk3, team, 9999)!.n).toBe(best.n)
		// the opponent's drives are never offered
		const theirs = wk3.drives.find((d) => d.team !== team)!
		expect(pickDrive(wk3, team, theirs.n)!.n).toBe(best.n)
	})

	it("returns null without a win probability series and falls back to the story without drives", () => {
		expect(buildLabSpec({ ...wk3, wp: [] }, team)).toBeNull()
		const noDrives = buildLabSpec({ ...wk3, drives: [] }, team, { view: "drive" })!
		expect(noDrives.kind).toBe("story")
		expect(noDrives.drive).toBeNull()
	})

	it("works for every game in the season, in both views", () => {
		for (const g of games) for (const view of ["story", "drive"]) expect(buildLabSpec(g, team, { view })).not.toBeNull()
	})
})

describe("geometry", () => {
	it("maps the start, the end and the extremes of the series onto the chart", () => {
		const a = chartPoint(0, 1, 3600)
		const b = chartPoint(3600, 0, 3600)
		expect(a).toEqual({ x: CHART.x, y: CHART.y })
		expect(b).toEqual({ x: CHART.x + CHART.w, y: CHART.y + CHART.h })
	})

	it("draws the curve and the two-tone area in chart coordinates", () => {
		const { line, area, mid } = curvePaths(wk3.wp, 3600)
		expect(line.startsWith("M")).toBe(true)
		expect(area.endsWith("Z")).toBe(true)
		expect(mid).toBeCloseTo(CHART.h / 2, 5)
		expect(curvePaths([], 3600).line).toBe("")
	})

	it("keeps marker labels inside the chart, apart, and off the line where it can", () => {
		const dots = [chartPoint(2354, 0.13, 3600), chartPoint(3300, 0.5, 3600)]
		const avoid = wk3.wp.map(([el, p]) => chartPoint(el, p, 3600))
		const at = placeLabels(dots, CHART, { w: 156, h: 62 }, avoid)
		expect(at).toHaveLength(2)
		for (const p of at) {
			expect(p.x).toBeGreaterThanOrEqual(CHART.x)
			expect(p.x + 156).toBeLessThanOrEqual(CHART.x + CHART.w)
			expect(p.y).toBeGreaterThanOrEqual(CHART.y)
			expect(p.y + 62).toBeLessThanOrEqual(CHART.y + CHART.h)
		}
		const apart = Math.abs(at[0].x - at[1].x) >= 164 || Math.abs(at[0].y - at[1].y) >= 70
		expect(apart).toBe(true)
	})

	it("places field points between the end zones and the sidelines", () => {
		expect(fieldX(-10)).toBe(FIELD.x)
		expect(fieldX(110)).toBe(FIELD.x + FIELD.w)
		expect(fieldY(0)).toBe(FIELD.y + FIELD.h / 2)
		const g = buildLabSpec(wk3, team, { view: "drive" })!
		for (const f of g.drive!.frames) {
			const { d, end } = playPath(f)
			expect(d.startsWith("M")).toBe(true)
			expect(Number.isFinite(end.x) && Number.isFinite(end.y)).toBe(true)
		}
	})
})

describe("renderLabCard", () => {
	const png = async (spec: NonNullable<ReturnType<typeof buildLabSpec>>) => {
		const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() as never })
		return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()
	}

	it("renders both cards to PNGs for every game", async () => {
		for (const g of games) {
			for (const view of ["story", "drive"]) {
				const bytes = await png(buildLabSpec(g, team, { view })!)
				expect(bytes.subarray(1, 4).toString()).toBe("PNG")
				expect(bytes.length).toBeGreaterThan(20_000)
			}
		}
	})

	it("renders an overtime game and a loss", async () => {
		const ot: LabGame = { ...wk3, result: "L", score: [27, 30], wp: [...wk3.wp, [3700, 0.4], [3900, 0.1]] }
		const spec = buildLabSpec(ot, team)!
		expect(spec.maxT).toBeGreaterThan(3600)
		expect((await png(spec)).subarray(1, 4).toString()).toBe("PNG")
	})

	it("states what the card shows in text", () => {
		const json = renderToStaticMarkup(renderLabCard(buildLabSpec(wk3, team)!) as never)
		for (const t of ["Raiders", "Saints", "Lowest point", "Biggest swing", "Lead changes", "nflverse", "CC BY 4.0", "raidersrundown.com/lab"]) expect(json).toContain(t)
		const drive = renderToStaticMarkup(renderLabCard(buildLabSpec(wk3, team, { view: "drive" })!) as never)
		for (const t of ["Best drive", "Key play", "Win prob added"]) expect(drive).toContain(t)
	})

	it("frames a drive the way the lab page does", () => {
		const d = pickDrive(wk3, team)!
		expect(framesForDrive(d).length).toBe(buildLabSpec(wk3, team, { view: "drive" })!.drive!.frames.length)
	})
})
