import { Resvg } from "@resvg/resvg-js"
import satori from "satori"
import { describe, expect, it } from "vitest"

import type { LeagueData } from "../../lib/league"
import { OG_HEIGHT, OG_WIDTH, renderCard } from "../../lib/og/cards"
import { ogFonts } from "../../lib/og/fonts"
import { type LeagueCardSpec, buildLeagueSpec } from "../../lib/og/leagueCard"

const game = (id: string, week: number, pa: number, ph: number, aa: number | null, ah: number | null) => ({
	_id: id, week, awayTeam: "Las Vegas Raiders", homeTeam: "Opponent", kickoff: `2026-09-${10 + week}T20:00:00Z`,
	predictedAwayScore: pa, predictedHomeScore: ph, actualAwayScore: aa, actualHomeScore: ah,
})
// The blogger picked Raiders 24-20 and 17-24, and the Raiders won 27-20 and 26-14.
const games = [game("g1", 1, 24, 20, 27, 20), game("g2", 2, 17, 24, 26, 14), game("g3", 3, 20, 20, null, null)]
const player = (h: string, i: number) => ({ handle: h, lower: h.toLowerCase(), joinedAt: `2026-09-0${i + 1}T00:00:00Z` })
const exact = (who: string, g: (typeof games)[number]) => ({ player: who.toLowerCase(), predictionId: g._id, awayScore: g.actualAwayScore as number, homeScore: g.actualHomeScore as number })
const wrong = (who: string, g: (typeof games)[number]) => ({ player: who.toLowerCase(), predictionId: g._id, awayScore: 0, homeScore: 50 })

function data(over: Partial<LeagueData> = {}): LeagueData {
	return {
		games,
		players: [player("Ann", 0), player("Bo", 1), player("Cy", 2)],
		picks: [exact("Ann", games[0]), exact("Ann", games[1]), exact("Bo", games[0]), wrong("Bo", games[1]), wrong("Cy", games[0])],
		...over,
	}
}

describe("buildLeagueSpec: the league's own card", () => {
	it("lists the leaderboard with the blogger placed among the players by points", () => {
		const spec = buildLeagueSpec(data(), 2026)!
		expect(spec.type).toBe("league")
		expect(spec.handle).toBeUndefined()
		expect(spec.players).toBe(3)
		expect(spec.week).toBe(2)
		const names = (spec.board ?? []).map((r) => r.handle)
		expect(names[0]).toBe("Ann")
		expect(names).toContain("The blogger")
		const b = spec.board!.find((r) => r.blogger)!
		expect(b.rank).toBeNull()
		// Everything above the blogger has more points; everything below has no more than he does.
		const at = spec.board!.indexOf(b)
		spec.board!.slice(0, at).forEach((r) => expect(r.points).toBeGreaterThan(b.points))
		spec.board!.slice(at + 1).forEach((r) => expect(r.points).toBeLessThanOrEqual(b.points))
	})

	it("sorts the board by points, best first, with real ranks for players", () => {
		const players = (buildLeagueSpec(data(), 2026)!.board ?? []).filter((r) => !r.blogger)
		expect(players.map((r) => r.points)).toEqual([...players.map((r) => r.points)].sort((a, b) => b - a))
		expect(players[0].rank).toBe(1)
	})

	it("caps the board at six rows (five players plus the blogger)", () => {
		const many = Array.from({ length: 12 }, (_, i) => player(`P${i}`, i))
		const picks = many.map((p, i) => (i % 2 ? exact(p.handle, games[0]) : wrong(p.handle, games[0])))
		const spec = buildLeagueSpec({ games, players: many, picks }, 2026)!
		expect(spec.board!.length).toBeLessThanOrEqual(6)
		expect(spec.players).toBe(12)
	})

	it("shows an empty board, with no blogger line, before anything is graded", () => {
		const spec = buildLeagueSpec({ games: [game("g3", 3, 20, 20, null, null)], players: [player("Ann", 0)], picks: [] }, 2026)!
		expect(spec.board).toEqual([])
		expect(spec.week).toBeNull()
		expect(spec.players).toBe(1)
	})

	it("still gives a card for an empty league", () => {
		const spec = buildLeagueSpec({ games: [], players: [], picks: [] }, 2026)!
		expect(spec.board).toEqual([])
		expect(spec.players).toBe(0)
	})
})

describe("buildLeagueSpec: a player's card", () => {
	it("carries rank, points, record against the blogger and a chip per graded game, oldest first", () => {
		const spec = buildLeagueSpec(data(), 2026, "ann")!
		expect(spec.handle).toBe("Ann")
		expect(spec.rank).toBe(1)
		expect(spec.ranked).toBe(3)
		expect(spec.points).toBeGreaterThan(0)
		expect(spec.games).toBe(2)
		expect(spec.correct).toBe(2)
		expect(spec.vs).toEqual(expect.objectContaining({ w: expect.any(Number) }))
		expect((spec.chips ?? []).map((c) => c.week)).toEqual([1, 2])
		expect(spec.delta).toBeGreaterThan(0)
	})

	it("keeps only the most recent eight chips", () => {
		const gs = Array.from({ length: 11 }, (_, i) => game(`g${i}`, i + 1, 20, 17, 27, 20))
		const spec = buildLeagueSpec({ games: gs, players: [player("Ann", 0)], picks: gs.map((g) => exact("Ann", g)) }, 2026, "Ann")!
		expect(spec.chips).toHaveLength(8)
		expect(spec.chips![7].week).toBe(11)
		expect(spec.chips![0].week).toBe(4)
	})

	it("never shows picks that aren't graded yet", () => {
		const spec = buildLeagueSpec({ ...data(), picks: [exact("Ann", games[0]), { player: "ann", predictionId: "g3", awayScore: 21, homeScore: 20 }] }, 2026, "Ann")!
		expect(spec.chips).toHaveLength(1)
		expect(JSON.stringify(spec)).not.toContain("21")
	})

	it("has no rank and no chips for a player whose games aren't graded", () => {
		const spec = buildLeagueSpec({ games: [games[2]], players: [player("Ann", 0)], picks: [{ player: "ann", predictionId: "g3", awayScore: 21, homeScore: 20 }] }, 2026, "Ann")!
		expect(spec.rank).toBeNull()
		expect(spec.chips).toEqual([])
		expect(spec.points).toBeNull()
	})

	it("is null for a handle that isn't a player or isn't a handle", () => {
		expect(buildLeagueSpec(data(), 2026, "ghost")).toBeNull()
		expect(buildLeagueSpec(data(), 2026, "../../x")).toBeNull()
		expect(buildLeagueSpec(data(), 2026, "a b")).toBeNull()
	})
})

// ---- rendering --------------------------------------------------------------------------

async function draw(spec: LeagueCardSpec) {
	const svg = await satori(renderCard(spec), { width: OG_WIDTH, height: OG_HEIGHT, fonts: ogFonts() })
	const img = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } }).render()
	return { svg, width: img.width, height: img.height, bytes: img.asPng().length }
}

describe("renderCard for league specs", () => {
	it("draws the league's own card at 1200x630", async () => {
		const r = await draw(buildLeagueSpec(data(), 2026)!)
		expect([r.width, r.height]).toEqual([1200, 630])
		expect(r.bytes).toBeGreaterThan(5000)
	})

	it("draws the empty league", async () => {
		const r = await draw(buildLeagueSpec({ games: [], players: [], picks: [] }, 2026)!)
		expect([r.width, r.height]).toEqual([1200, 630])
	})

	it("draws a player's card, a new player's card, and a very long handle", async () => {
		for (const [d, h] of [
			[data(), "Ann"],
			[{ games: [games[2]], players: [player("Ann", 0)], picks: [] } as LeagueData, "Ann"],
			[{ ...data(), players: [player("SilverAndBlack16", 0), ...data().players] } as LeagueData, "SilverAndBlack16"],
		] as [LeagueData, string][]) {
			const spec = buildLeagueSpec(d, 2026, h)!
			const r = await draw(spec)
			expect([r.width, r.height]).toEqual([1200, 630])
		}
	})

	it("draws three-digit ranks without falling over", async () => {
		const spec: LeagueCardSpec = { type: "league", season: 2026, handle: "Zed", rank: 128, ranked: 400, points: 12, vs: { w: 0, l: 2, t: 1 }, games: 3, correct: 1, avgMiss: 8.2, delta: -9, chips: [{ week: 1, vs: "L" }, { week: 2, vs: "T" }, { week: 3, vs: "L" }] }
		expect((await draw(spec)).bytes).toBeGreaterThan(5000)
	})

	it("works for the older spec shape too (no board, no chips)", async () => {
		const spec: LeagueCardSpec = { type: "league", season: 2026, players: 4 }
		expect((await draw(spec)).bytes).toBeGreaterThan(5000)
		const mine: LeagueCardSpec = { type: "league", season: 2026, handle: "Ann", rank: 2, ranked: 9, points: 40, vs: { w: 1, l: 0, t: 0 } }
		expect((await draw(mine)).bytes).toBeGreaterThan(5000)
	})
})

// ---- invite and challenge cards -------------------------------------------------------------

describe("the invite card", () => {
	const future = (id: string, week: number, kickoff: string) => ({ ...game(id, week, 24, 17, null, null), awayTeam: "Las Vegas Raiders", homeTeam: "Indianapolis Colts", kickoff })
	const now = Date.parse("2026-10-03T12:00:00Z")

	it("is the default look for the league and names the next open game in Pacific time", () => {
		const spec = buildLeagueSpec({ ...data(), games: [...games, future("g5", 5, "2026-10-11T20:25:00Z")] }, 2026, null, { now })!
		expect(spec.kind).toBe("invite")
		expect(spec.next).toEqual({
			week: 5,
			away: expect.objectContaining({ abbr: "LV" }),
			home: expect.objectContaining({ abbr: "IND" }),
			kickoff: "Sun 1:25 PM PT",
		})
	})

	it("picks the soonest open game, skipping games already kicked off or graded", () => {
		const gs = [future("g6", 6, "2026-10-18T20:25:00Z"), future("g5", 5, "2026-10-11T20:25:00Z"), future("g4", 4, "2026-10-01T20:25:00Z")]
		expect(buildLeagueSpec({ ...data(), games: gs }, 2026, null, { now })!.next!.week).toBe(5)
	})

	it("has no next game when none is open", () => {
		expect(buildLeagueSpec(data(), 2026, null, { now })!.next).toBeNull()
	})

	it("can still ask for the leaderboard look", () => {
		expect(buildLeagueSpec(data(), 2026, null, { view: "board" })!.kind).toBe("board")
		expect(buildLeagueSpec(data(), 2026, null, { view: "nonsense" })!.kind).toBe("invite")
	})

	it("draws with a game, without one, and for a one-player league", async () => {
		const withGame = buildLeagueSpec({ ...data(), games: [...games, future("g5", 5, "2026-10-11T20:25:00Z")] }, 2026, null, { now })!
		const without = buildLeagueSpec({ games: [], players: [], picks: [] }, 2026, null, { now })!
		const solo = buildLeagueSpec({ games: [future("g5", 5, "2026-10-11T20:25:00Z")], players: [player("Ann", 0)], picks: [] }, 2026, null, { now })!
		for (const spec of [withGame, without, solo]) {
			const r = await draw(spec)
			expect([r.width, r.height]).toEqual([1200, 630])
			expect(r.bytes).toBeGreaterThan(5000)
		}
	})

	it("draws the leaderboard look too", async () => {
		const r = await draw(buildLeagueSpec(data(), 2026, null, { view: "board" })!)
		expect([r.width, r.height]).toEqual([1200, 630])
	})
})

describe("a challenge card", () => {
	it("is a player's card marked as a challenge, with the same private-pick rules", () => {
		const spec = buildLeagueSpec(data(), 2026, "ann", { challenge: true })!
		expect(spec.challenge).toBe(true)
		expect(spec.handle).toBe("Ann")
		expect(spec.rank).toBe(1)
		expect(buildLeagueSpec(data(), 2026, "ann")!.challenge).toBe(false)
	})

	it("is null for someone who isn't a player", () => {
		expect(buildLeagueSpec(data(), 2026, "ghost", { challenge: true })).toBeNull()
	})

	it("draws for a ranked player, a brand-new player and a very long handle", async () => {
		for (const [d, h] of [
			[data(), "Ann"],
			[{ games: [games[2]], players: [player("Ann", 0)], picks: [] } as LeagueData, "Ann"],
			[{ ...data(), players: [player("SilverAndBlack16", 0), ...data().players] } as LeagueData, "SilverAndBlack16"],
		] as [LeagueData, string][]) {
			const r = await draw(buildLeagueSpec(d, 2026, h, { challenge: true })!)
			expect([r.width, r.height]).toEqual([1200, 630])
			expect(r.bytes).toBeGreaterThan(5000)
		}
	})
})

describe("the new league card numbers", () => {
	it("counts the players ahead of the blogger and carries the blogger's points", () => {
		const spec = buildLeagueSpec(data(), 2026)!
		const b = spec.board!.find((r) => r.blogger)!
		expect(spec.bloggerPoints).toBe(b.points)
		expect(spec.ahead).toBe(spec.board!.filter((r) => !r.blogger && r.points > b.points).length)
		expect(buildLeagueSpec({ games: [], players: [], picks: [] }, 2026)!.ahead).toBeNull()
	})

	it("gives a player's card the blogger's points on their games and an opponent on each chip", () => {
		const spec = buildLeagueSpec(data(), 2026, "Ann")!
		expect(spec.bloggerPoints).toBe((spec.points as number) - (spec.delta as number))
		expect(spec.chips!.every((c) => typeof c.opp === "string" && typeof c.you === "number" && typeof c.blogger === "number")).toBe(true)
		expect(spec.chips![0].opp).toBe("OPP")
	})
})
