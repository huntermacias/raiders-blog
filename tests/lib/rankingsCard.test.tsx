// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server"
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { describe, expect, it, vi } from "vitest"

import { TEAMS } from "../../lib/nfl"
import { buildBoards } from "../../lib/rankings"
import { OG_HEIGHT, OG_WIDTH, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { buildRankingsSpec, renderRankingsCard } from "../../lib/og/rankingsCard"

vi.setConfig({ testTimeout: 60_000 })

const names = TEAMS.map((t) => t.name)
const LV = "Las Vegas Raiders"
const order = (lvAt: number) => {
	const rest = names.filter((n) => n !== LV)
	rest.splice(lvAt - 1, 0, LV)
	return rest
}
const board = (lvPrev: number | null, lvNow: number, headline: string | null = null) => {
	const docs = [
		...(lvPrev ? [{ _id: "a", season: 2026, week: 3, teams: order(lvPrev).map((team) => ({ team })) }] : []),
		{ _id: "b", season: 2026, week: lvPrev ? 4 : 3, headline, teams: order(lvNow).map((team) => ({ team })) },
	]
	const boards = buildBoards(docs as never)
	return boards[boards.length - 1]
}
const png = async (spec: ReturnType<typeof buildRankingsSpec>) => {
	const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() as never })
	return new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render().asPng()
}

describe("buildRankingsSpec", () => {
	it("takes the top five, the Raiders' move and the whole ladder", () => {
		const spec = buildRankingsSpec(board(15, 12, "  Chiefs on top  "), 2026)
		expect(spec).toMatchObject({ type: "rankings", season: 2026, week: 4, raidersRank: 12, change: 3, headline: "Chiefs on top" })
		expect(spec.top).toHaveLength(5)
		expect(spec.top!.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5])
		expect(spec.raiders).toMatchObject({ rank: 12, abbr: "LV", change: 3, raiders: true })
		expect(spec.ladder).toHaveLength(32)
	})

	it("leaves the Raiders in the top list, not repeated, when they are in the top five", () => {
		const spec = buildRankingsSpec(board(4, 2), 2026)
		expect(spec.raiders).toBeNull()
		expect(spec.top!.find((r) => r.raiders)).toMatchObject({ rank: 2, change: 2 })
	})

	it("has no move for a first week, and no Raiders when they are not ranked", () => {
		expect(buildRankingsSpec(board(null, 9), 2026)).toMatchObject({ raidersRank: 9, change: null, headline: null })
		const noLv = buildBoards([{ _id: "x", season: 2026, week: 1, teams: names.filter((n) => n !== LV).map((team) => ({ team })) }] as never)[0]
		const spec = buildRankingsSpec(noLv, 2026)
		expect(spec.raidersRank).toBeNull()
		expect(spec.raiders).toBeNull()
	})
})

describe("renderRankingsCard", () => {
	it("draws to a PNG for a low Raiders rank, a top-five rank, a first week and a tiny board", async () => {
		const tiny = buildBoards([{ _id: "t", season: 2026, week: 1, teams: [{ team: LV }] }] as never)[0]
		for (const b of [board(15, 12, "A long headline ".repeat(10)), board(4, 2), board(null, 30), tiny]) {
			const bytes = await png(buildRankingsSpec(b, 2026))
			expect(bytes.subarray(1, 4).toString()).toBe("PNG")
			expect(bytes.length).toBeGreaterThan(20_000)
		}
	})

	it("states the rankings in text, with the move in words and a sign", () => {
		const html = renderToStaticMarkup(renderRankingsCard(buildRankingsSpec(board(15, 12), 2026)) as never)
		for (const t of ["Power", "Rankings", "Week 4", "Raiders No. 12", "Up 3", "+3", "The ladder", "LV"]) expect(html).toContain(t)
	})

	it("still draws from the older spec shape (no ladder, no top)", async () => {
		const bytes = await png({ type: "rankings", season: 2026, week: 4, raidersRank: 22, change: 3 })
		expect(bytes.subarray(1, 4).toString()).toBe("PNG")
	})
})
