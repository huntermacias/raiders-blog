// @vitest-environment node
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { describe, expect, it, vi } from "vitest"

import type { StandingGrade } from "../../lib/league2/domain"
import type { CompetitionData, EventView } from "../../lib/league2/services/read"
import { buildNflWeek } from "../../lib/league2/view/nfl"
import { buildConfidenceWeek, buildUpsetWeek } from "../../lib/league2/view/nflFormats"
import { cardSize, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { buildNflLeagueSpec } from "../../lib/og/nflLeagueCard"

vi.setConfig({ testTimeout: 120_000 })

const NOW = Date.parse("2026-10-17T12:00:00Z")
const TEAMS = ["Kansas City Chiefs", "Las Vegas Raiders", "Denver Broncos", "Los Angeles Chargers", "Buffalo Bills", "New York Jets", "Detroit Lions", "Chicago Bears", "Dallas Cowboys", "Washington Commanders", "Miami Dolphins", "New England Patriots", "Seattle Seahawks", "San Francisco 49ers", "Green Bay Packers", "Minnesota Vikings"]
// Eight games that kicked off yesterday (week 6, all final) and one next week's (open).
const games: EventView[] = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, legacyId: null, nflGameId: `g${i}`, week: 6, awayTeam: TEAMS[i * 2], homeTeam: TEAMS[i * 2 + 1], kickoff: "2026-10-16T17:00:00Z", lockAt: null, state: "final" as const, result: { away: 20, home: i % 2 === 0 ? 24 : 13 }, blogger: null }))
games.push({ id: "open", legacyId: null, nflGameId: "open", week: 6, awayTeam: "Philadelphia Eagles", homeTeam: "Atlanta Falcons", kickoff: "2026-10-18T17:00:00Z", lockAt: null, state: "scheduled", result: null, blogger: null })
const grade = (playerId: string, eventId: string, correct: boolean, points: number): StandingGrade => ({ playerId, eventId, points, voided: false, detail: { correct, marginError: null, exact: false }, week: 6, submittedAt: "2026-10-01T00:00:00Z" })
const base = (over: Partial<CompetitionData> = {}): CompetitionData => ({
	competitionId: "x",
	events: games,
	players: [{ id: "a", handle: "AnnRaider", joinedAt: "2026-09-01T00:00:00Z", disabled: false }, { id: "b", handle: "Bobby_B", joinedAt: "2026-09-01T00:00:00Z", disabled: false }],
	grades: [],
	mine: [],
	tallies: {},
	...over,
})
const entry = (eventId: string, payload: unknown) => ({ entryId: "e" + eventId, eventId, payload, firstSubmittedAt: "2026-10-10T00:00:00Z", submittedAt: "2026-10-10T00:00:00Z", revisions: 1 })

// Home wins the even games, away the odd ones. Pick home everywhere: right on 0,2,4,6.
const winnersMine = games.map((g) => entry(g.id, { pick: "home" }))
const winnersGrades = games.slice(0, 8).flatMap((g, i) => [grade("a", g.id, i % 2 === 0, i % 2 === 0 ? 1 : 0), grade("b", g.id, false, 0)])
const confMine = games.map((g, i) => entry(g.id, { pick: "home", rank: i + 1 }))
const confGrades = games.slice(0, 8).map((g, i) => grade("a", g.id, i % 2 === 0, i % 2 === 0 ? i + 1 : 0))
const lines = Object.fromEntries(games.slice(0, 8).map((g, i) => [g.id, { underdog: "home" as const, favouriteWinChance: i === 0 ? 0.85 : 0.6 }]))

const winners = () => ({ mode: "winners" as const, view: buildNflWeek(base({ mine: winnersMine, grades: winnersGrades }), 2026, { id: "a" }, NOW, 6)! })
const conf = () => ({ mode: "confidence" as const, view: buildConfidenceWeek(base({ mine: confMine, grades: confGrades }), 2026, { id: "a" }, NOW, 6)! })
const upset = () => ({ mode: "upset" as const, view: buildUpsetWeek(base({ lines, maxUpsets: 5, mine: [entry("g0", { pick: "home" }), entry("g1", { pick: "home" }), entry("open", { pick: "home" })], grades: [grade("a", "g0", true, 3), grade("a", "g1", false, 0)] }), 2026, { id: "a" }, NOW, 6)! })

async function png(spec: ReturnType<typeof buildNflLeagueSpec>) {
	const { width, height } = cardSize(spec)
	const svg = await satori(renderCard(spec), { width, height, fonts: ogFonts() })
	const out = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng()
	const v = new DataView(out.buffer, out.byteOffset, out.byteLength)
	return { dims: [v.getUint32(16), v.getUint32(20)], svg }
}

describe("the NFL league card spec", () => {
	it("shows a winners week as correct picks of those decided, one row per started game", () => {
		const s = buildNflLeagueSpec(winners(), { size: "wide", view: "me", handle: "AnnRaider" })
		expect(s).toMatchObject({ type: "nflleague", mode: "winners", view: "me", big: "4", unit: "correct", note: "of 8 final", rank: 1, ranked: 2, handle: "AnnRaider" })
		expect(s.rows).toHaveLength(6)
		expect(s.more).toBe(2)
		expect(s.rows[0]).toMatchObject({ result: "hit", points: "+1", lead: "" })
		expect(s.rows[1].result).toBe("miss")
	})

	it("never puts a pick on a game that has not started", () => {
		const everything = buildNflLeagueSpec(winners(), { size: "tall", view: "me", handle: "AnnRaider" })
		expect(everything.rows.length + everything.more).toBe(8)
		expect(JSON.stringify(everything)).not.toMatch(/PHI|ATL/)
		const u = buildNflLeagueSpec(upset(), { size: "tall", view: "me", handle: "AnnRaider" })
		expect(u.rows.map((r) => r.abbr).join(",")).not.toMatch(/ATL/)
	})

	it("lists confidence picks boldest first with the points they earned", () => {
		const s = buildNflLeagueSpec(conf(), { size: "tall", view: "me", handle: "AnnRaider" })
		expect(s.big).toBe(String(1 + 3 + 5 + 7))
		expect(s.unit).toBe("points")
		expect(s.note).toBe("of 45 possible")
		expect(s.rows.map((r) => r.lead)).toEqual(["8", "7", "6", "5", "4", "3"])
		expect(s.rows.find((r) => r.lead === "7")).toMatchObject({ result: "hit", points: "+7" })
		expect(s.rows.find((r) => r.lead === "8")).toMatchObject({ result: "miss", points: "0" })
		expect(s.more).toBe(2)
	})

	it("lists upset calls with what each was worth, and counts hits", () => {
		const s = buildNflLeagueSpec(upset(), { size: "wide", view: "me", handle: "AnnRaider" })
		expect(s).toMatchObject({ big: "3", unit: "points", note: "1 of 2 upsets hit" })
		expect(s.rows).toEqual([
			expect.objectContaining({ lead: "+3", result: "hit", points: "+3" }),
			expect.objectContaining({ lead: "+1", result: "miss", points: "0" }),
		])
	})

	it("builds the standings and the upset of the week, and falls back to the invite look when there is nothing to draw", () => {
		const board = buildNflLeagueSpec(winners(), { size: "wide", view: "board" })
		expect(board.view).toBe("board")
		expect(board.board.map((r) => [r.rank, r.handle, r.value])).toEqual([[1, "AnnRaider", "4"], [2, "Bobby_B", "0"]])
		const alert = buildNflLeagueSpec(upset(), { size: "wide", view: "alert" })
		expect(alert.view).toBe("alert")
		expect(alert.alert).toMatchObject({ chance: 85, value: 3, score: "24-20", underdog: "LV" })
		expect(buildNflLeagueSpec(winners(), { size: "wide", view: "alert" }).view).toBe("invite")
		expect(buildNflLeagueSpec(winners(), { size: "wide", view: "me", handle: null }).view).toBe("invite")
		const nobody = { mode: "confidence" as const, view: buildConfidenceWeek(base(), 2026, { id: "a" }, NOW, 6)! }
		expect(buildNflLeagueSpec(nobody, { size: "wide", view: "me", handle: "AnnRaider" }).view).toBe("invite")
		expect(buildNflLeagueSpec(nobody, { size: "wide", view: "board" }).view).toBe("invite")
	})

	it("is 1200x630 wide and 1080x1350 tall", () => {
		expect(cardSize(buildNflLeagueSpec(winners(), { size: "wide", view: "board" }))).toEqual({ width: 1200, height: 630 })
		expect(cardSize(buildNflLeagueSpec(winners(), { size: "tall", view: "board" }))).toEqual({ width: 1080, height: 1350 })
	})
})

describe("drawing the NFL league cards", () => {
	const cases: [string, () => ReturnType<typeof buildNflLeagueSpec>][] = []
	for (const size of ["wide", "tall"] as const) {
		for (const [name, src] of [["winners", winners], ["confidence", conf], ["upset", upset]] as const) {
			cases.push([`${name} me ${size}`, () => buildNflLeagueSpec(src(), { size, view: "me", handle: "AnnRaider" })])
			cases.push([`${name} board ${size}`, () => buildNflLeagueSpec(src(), { size, view: "board" })])
			cases.push([`${name} invite ${size}`, () => buildNflLeagueSpec(src(), { size, view: "invite" })])
		}
		cases.push([`upset alert ${size}`, () => buildNflLeagueSpec(upset(), { size, view: "alert" })])
	}
	it.each(cases)("%s draws at the right size", async (_n, make) => {
		const spec = make()
		const { dims, svg } = await png(spec)
		expect(dims).toEqual([cardSize(spec).width, cardSize(spec).height])
		expect(svg.length).toBeGreaterThan(3000)
	})
})
