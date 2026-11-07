// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

import { getGames, getPlayers } from "../../lib/lab/data"
import { OG_TYPES, checkOg } from "../../lib/og/guard"
import { cardSize, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { buildReportSpec, renderReportCard, reportCardSize, reportImageUrls } from "../../lib/og/reportCards"
import { composeReport } from "../../lib/report/build"
import { buildRoster } from "../../lib/report/players"

vi.setConfig({ testTimeout: 60_000 })

const games = getGames()
const wk7 = games.find((g) => g.week === 7)!
const roster = buildRoster(getPlayers().players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, slug: p.slug, team: p.team, espn: p.espn, shot: p.shot })))
const input = { _id: "r7", title: "Rams 35, Raiders 21: The Film Is Worse Than the Score", opponent: "Los Angeles Rams", homeAway: "home" as const, gameDate: "2026-10-26T01:25:00Z", raidersScore: 35, opponentScore: 21, body: [] }
const view = composeReport("week-7-game-report", input, wk7, games, null, roster)
const bare = composeReport("week-9-game-report", input, null, games, null, roster)

describe("buildReportSpec", () => {
	it("is the real score, not the Studio one", () => {
		const spec = buildReportSpec(view, "final", "wide")
		expect(spec).toMatchObject({ type: "report", kind: "final", size: "wide", result: "L", week: 7 })
		expect(spec.me.score).toBe(21)
		expect(spec.opp.score).toBe(35)
		expect(spec.opp.code).toBe("LAR")
	})
	it("fits fewer measures and players on the wide card than on the tall one", () => {
		const wide = buildReportSpec(view, "stats", "wide")
		const tall = buildReportSpec(view, "stats", "tall")
		expect(wide.stats.length).toBeLessThanOrEqual(6)
		expect(tall.stats.length).toBeGreaterThan(wide.stats.length)
		expect(tall.stats.length).toBeLessThanOrEqual(9)
		const w = buildReportSpec(view, "players", "wide")
		const t = buildReportSpec(view, "players", "tall")
		expect(w.players.filter((p) => p.side === "me").length).toBeLessThanOrEqual(2)
		expect(t.players.filter((p) => p.side === "me").length).toBeLessThanOrEqual(4)
		expect(t.players.length).toBeGreaterThan(w.players.length)
	})
	it("keeps every bar inside its track", () => {
		for (const s of buildReportSpec(view, "stats", "tall").stats) {
			for (const b of [s.meBar, s.oppBar]) {
				expect(b).toBeGreaterThanOrEqual(0.02)
				expect(b).toBeLessThanOrEqual(1)
			}
		}
	})
	it("asks for both logos and a headshot for each player, and never for an empty address", () => {
		const spec = buildReportSpec(view, "players", "tall")
		const urls = reportImageUrls(spec)
		expect(urls.length).toBeGreaterThanOrEqual(2)
		expect(urls.every((u) => u.startsWith("http"))).toBe(true)
		expect(urls).toContain(spec.me.logoUrl)
		expect(urls).toContain(spec.opp.logoUrl)
	})
	it("has a plain spec for a game the Lab has not built", () => {
		const spec = buildReportSpec(bare, "final", "wide")
		expect(spec.stats).toEqual([])
		expect(spec.players).toEqual([])
		expect(spec.quarters).toEqual([])
	})
})

describe("drawing", () => {
	const draw = async (kind: "final" | "stats" | "players", size: "wide" | "tall") => {
		const spec = buildReportSpec(view, kind, size)
		const { width, height } = reportCardSize(spec)
		const svg = await satori(renderReportCard(spec), { width, height, fonts: ogFonts() as never })
		return { png: new Resvg(svg, { fitTo: { mode: "width", value: width } }).render(), width, height }
	}
	for (const kind of ["final", "stats", "players"] as const) {
		for (const size of ["wide", "tall"] as const) {
			it(`draws the ${kind} card at ${size} size`, async () => {
				const { png, width, height } = await draw(kind, size)
				expect(png.width).toBe(width)
				expect(png.height).toBe(height)
				expect(png.asPng().length).toBeGreaterThan(10_000)
			})
		}
	}
	it("is 1200x630 wide and 1080x1350 tall", () => {
		expect(reportCardSize(buildReportSpec(view, "final", "wide"))).toEqual({ width: 1200, height: 630 })
		expect(reportCardSize(buildReportSpec(view, "final", "tall"))).toEqual({ width: 1080, height: 1350 })
		expect(cardSize(buildReportSpec(view, "final", "tall") as never)).toEqual({ width: 1080, height: 1350 })
	})
	it("goes through the shared card renderer", () => {
		expect(renderCard(buildReportSpec(view, "final", "wide") as never)).toBeTruthy()
	})
	it("draws a game with no Lab data", async () => {
		const spec = buildReportSpec(bare, "final", "wide")
		const svg = await satori(renderReportCard(spec), { width: 1200, height: 630, fonts: ogFonts() as never })
		expect(svg.length).toBeGreaterThan(1000)
	})
})

describe("guard", () => {
	it("lets the route draw report cards", () => {
		expect(OG_TYPES as readonly string[]).toContain("report")
		expect(checkOg("?type=report&kind=final&slug=week-7-game-report", "Mozilla/5.0 (Macintosh) Safari/605.1.15")).toEqual({ action: "allow" })
	})
})
