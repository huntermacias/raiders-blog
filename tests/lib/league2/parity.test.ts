import { describe, expect, it } from "vitest"

import { type LeagueGame, type LeaguePick, type LeaguePlayer, bloggerScore, buildStandings, scorePrediction } from "../../../lib/league"
import { CLASSIC_TIEBREAKS, CLASSIC_V1, buildRows, buildRivalry, currentGrades, maxScorePickPoints, planGrading, scoreScoreline } from "../../../lib/league2/domain"

// A tiny deterministic generator so the "random" data is the same on every run.
function rng(seed: number) {
	let s = seed >>> 0
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0
		return s / 4294967296
	}
}

describe("Classic v1 reproduces today's League scoring", () => {
	it("has the same maximum", () => {
		expect(maxScorePickPoints(CLASSIC_V1.rules)).toBe(25)
	})

	it("scores edge cases the same way", () => {
		const cases: [number, number, number, number][] = [
			[17, 24, 17, 24],
			[17, 24, 20, 23],
			[24, 17, 17, 24],
			[0, 1, 1, 0],
			[10, 20, 14, 13],
			[10, 13, 13, 13],
			[30, 10, 31, 10],
			[99, 0, 0, 99],
			[20, 21, 20, 20],
		]
		for (const [pa, ph, aa, ah] of cases) {
			expect(scoreScoreline(CLASSIC_V1, { away: pa, home: ph }, { away: aa, home: ah })).toEqual(scorePrediction({ away: pa, home: ph }, { away: aa, home: ah }))
		}
	})

	it("matches on 40,000 sampled scorelines", () => {
		const r = rng(7)
		const n = () => Math.floor(r() * 50)
		for (let i = 0; i < 40000; i++) {
			const pred = { away: n(), home: n() }
			const actual = { away: n(), home: n() }
			expect(scoreScoreline(CLASSIC_V1, pred, actual)).toEqual(scorePrediction(pred, actual))
		}
	})
})

describe("the new pipeline reproduces today's standings and rivalry totals", () => {
	function league(seed: number) {
		const r = rng(seed)
		const players: LeaguePlayer[] = Array.from({ length: 14 }, (_, i) => ({ handle: `Player${i}`, lower: `player${i}`, joinedAt: `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00Z` }))
		const games: LeagueGame[] = Array.from({ length: 9 }, (_, i) => ({
			_id: `g${i}`,
			week: 1 + Math.floor(i / 2),
			awayTeam: "A",
			homeTeam: "B",
			kickoff: `2026-09-${String(10 + i).padStart(2, "0")}T17:00:00Z`,
			predictedAwayScore: Math.floor(r() * 35),
			predictedHomeScore: Math.floor(r() * 35),
			actualAwayScore: i < 8 ? Math.floor(r() * 40) : null,
			actualHomeScore: i < 8 ? Math.floor(r() * 40) : null,
		}))
		const picks: LeaguePick[] = []
		players.forEach((p) =>
			games.forEach((g) => {
				if (r() < 0.25) return // some games skipped
				let a = Math.floor(r() * 35)
				let h = Math.floor(r() * 35)
				if (a === h) h++
				picks.push({ player: p.lower, predictionId: g._id, awayScore: a, homeScore: h })
			})
		)
		return { players, games, picks }
	}

	function newGrades(games: LeagueGame[], picks: LeaguePick[], players: LeaguePlayer[]) {
		const idOf: Record<string, string> = {}
		players.forEach((p) => (idOf[p.lower] = p.lower))
		const out: ReturnType<typeof planGrading>["create"] = []
		const weekOf: Record<string, number> = {}
		games.forEach((g) => {
			weekOf[g._id] = g.week
			const entries = picks.filter((p) => p.predictionId === g._id).map((p) => ({ id: `${p.player}:${g._id}`, playerId: p.player, eventId: g._id, payload: { away: p.awayScore, home: p.homeScore } }))
			const plan = planGrading({
				event: { id: g._id, kickoff: g.kickoff, state: typeof g.actualAwayScore === "number" ? "final" : "scheduled", result: typeof g.actualAwayScore === "number" ? { away: g.actualAwayScore as number, home: g.actualHomeScore as number } : null },
				entries,
				existing: [],
				policy: CLASSIC_V1,
				now: "2026-10-01T00:00:00Z",
			})
			out.push(...plan.create)
		})
		return { grades: out, weekOf }
	}

	for (const seed of [1, 2, 3, 4, 5]) {
		it(`season and week standings match (seed ${seed})`, () => {
			const { players, games, picks } = league(seed)
			const { grades, weekOf } = newGrades(games, picks, players)
			const sg = currentGrades(grades).map((g) => ({ ...g, week: weekOf[g.eventId] }))
			const info = players.map((p) => ({ id: p.lower, handle: p.handle, joinedAt: p.joinedAt as string }))

			const old = buildStandings(games, players, picks)
			const next = buildRows(sg, info, CLASSIC_TIEBREAKS)
			expect(next.map((r) => [r.rank, r.playerId, r.points, r.games, r.correct, r.exact])).toEqual(old.map((r) => [r.rank, r.lower, r.points, r.games, r.correct, r.exact]))
			next.forEach((r, i) => expect(r.avgMarginError as number).toBeCloseTo(old[i].avgMarginError, 9))

			for (const week of [1, 2, 3, 4]) {
				const o = buildStandings(games, players, picks, { week })
				const n = buildRows(sg, info, CLASSIC_TIEBREAKS, { week })
				expect(n.map((r) => [r.rank, r.playerId, r.points])).toEqual(o.map((r) => [r.rank, r.lower, r.points]))
			}
		})

		it(`rivalry records and differentials match (seed ${seed})`, () => {
			const { players, games, picks } = league(seed)
			const { grades } = newGrades(games, picks, players)
			const cur = currentGrades(grades)
			const old = buildStandings(games, players, picks)
			const byGame: Record<string, LeagueGame> = {}
			games.forEach((g) => (byGame[g._id] = g))
			old.forEach((row) => {
				const mine = cur.filter((g) => g.playerId === row.lower)
				const riv = buildRivalry(
					mine.map((g) => ({
						eventId: g.eventId,
						season: 2026,
						week: byGame[g.eventId].week,
						kickoff: byGame[g.eventId].kickoff,
						playerPoints: g.points,
						bloggerPoints: (bloggerScore(byGame[g.eventId]) as { points: number }).points,
						marginError: g.detail.marginError,
					}))
				)
				expect(riv.record).toEqual(row.vsBlogger)
				expect(riv.differential).toBe(row.delta)
			})
		})
	}
})
