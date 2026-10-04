import { describe, expect, it } from "vitest"

import {
	type FlagPlant,
	type GamePrediction,
	SEASON_GAMES,
	gradeGame,
	involvesRaiders,
	isFinal,
	predictedWinner,
	readerLean,
	seasonStanding,
	seasonSummary,
	summarize,
	summarizeFlags,
	summarizeKeys,
	tallyKeys,
} from "../../lib/predictions"

let n = 0
/** A game with the Raiders at home; override anything. */
function game(over: Partial<GamePrediction> = {}): GamePrediction {
	n += 1
	return {
		_id: `g${n}`,
		week: n,
		awayTeam: "Kansas City Chiefs",
		homeTeam: "Las Vegas Raiders",
		kickoff: `2026-09-${String(10 + n).padStart(2, "0")}T20:00:00Z`,
		predictedAwayScore: 20,
		predictedHomeScore: 27,
		...over,
	}
}
const final = (away: number, home: number): Partial<GamePrediction> => ({ actualAwayScore: away, actualHomeScore: home })

describe("isFinal / involvesRaiders / predictedWinner", () => {
	it("is final only when both scores are numbers (0 counts)", () => {
		expect(isFinal(game())).toBe(false)
		expect(isFinal(game({ actualAwayScore: 10 }))).toBe(false)
		expect(isFinal(game({ actualAwayScore: null, actualHomeScore: 10 }))).toBe(false)
		expect(isFinal(game(final(0, 0)))).toBe(true)
	})

	it("spots Raiders games on either side", () => {
		expect(involvesRaiders(game())).toBe(true)
		expect(involvesRaiders(game({ awayTeam: "Las Vegas Raiders", homeTeam: "Denver Broncos" }))).toBe(true)
		expect(involvesRaiders(game({ awayTeam: "Buffalo Bills", homeTeam: "Miami Dolphins" }))).toBe(false)
	})

	it("picks the higher predicted score", () => {
		expect(predictedWinner(game({ predictedAwayScore: 10, predictedHomeScore: 17 }))).toBe("home")
		expect(predictedWinner(game({ predictedAwayScore: 24, predictedHomeScore: 21 }))).toBe("away")
	})
})

describe("gradeGame", () => {
	it("stays pending until there is a final score", () => {
		expect(gradeGame(game())).toEqual({ final: false, result: "pending", marginError: null, readers: "pending" })
	})

	it("calls a right winner a hit and measures how far off the margin was", () => {
		// predicted Raiders by 7; actually Raiders by 3
		const g = gradeGame(game(final(24, 27)))
		expect(g.final).toBe(true)
		expect(g.result).toBe("hit")
		expect(g.marginError).toBe(4)
	})

	it("calls a wrong winner a miss", () => {
		const g = gradeGame(game(final(31, 17)))
		expect(g.result).toBe("miss")
		// predicted +7 home, actual -14 home => 21 off
		expect(g.marginError).toBe(21)
	})

	it("treats a tie as a push, never a hit or miss", () => {
		expect(gradeGame(game(final(20, 20))).result).toBe("push")
	})

	it("reports a perfect margin as zero", () => {
		expect(gradeGame(game(final(20, 27))).marginError).toBe(0)
	})

	it("grades the reader majority on the same game", () => {
		expect(gradeGame(game({ ...final(17, 24), readerVotesHome: 9, readerVotesAway: 3 })).readers).toBe("hit")
		expect(gradeGame(game({ ...final(17, 24), readerVotesHome: 3, readerVotesAway: 9 })).readers).toBe("miss")
	})

	it("ignores readers when the vote was level, empty, or the game tied", () => {
		expect(gradeGame(game({ ...final(17, 24), readerVotesHome: 4, readerVotesAway: 4 })).readers).toBe("none")
		expect(gradeGame(game(final(17, 24))).readers).toBe("none")
		expect(gradeGame(game({ ...final(20, 20), readerVotesHome: 9, readerVotesAway: 1 })).readers).toBe("none")
	})
})

describe("readerLean", () => {
	it("leans toward the side with more votes and is null when level", () => {
		expect(readerLean(game({ readerVotesAway: 5, readerVotesHome: 2 }))).toBe("away")
		expect(readerLean(game({ readerVotesAway: 1, readerVotesHome: 2 }))).toBe("home")
		expect(readerLean(game({ readerVotesAway: 2, readerVotesHome: 2 }))).toBeNull()
		expect(readerLean(game())).toBeNull()
	})
})

describe("summarize", () => {
	it("is empty and null-safe before anything is graded", () => {
		const s = summarize([game(), game()])
		expect(s).toMatchObject({ hits: 0, misses: 0, pushes: 0, graded: 0, accuracy: null, avgMarginError: null, throughWeek: null })
		expect(s.streak).toEqual({ kind: null, length: 0 })
		expect(s.recent).toEqual([])
	})

	it("counts hits, misses and pushes, and excludes pushes from accuracy", () => {
		const s = summarize([
			game(final(17, 24)), // hit
			game(final(30, 20)), // miss
			game(final(21, 21)), // push
			game(final(10, 27)), // hit
		])
		expect(s).toMatchObject({ hits: 2, misses: 1, pushes: 1, graded: 4 })
		expect(s.accuracy).toBeCloseTo(2 / 3)
	})

	it("averages the margin error across every graded game, pushes included", () => {
		const s = summarize([game(final(20, 27)), game(final(20, 20))]) // 0 off, 7 off
		expect(s.avgMarginError).toBe(3.5)
	})

	it("finds the current streak from the most recent game, skipping pushes", () => {
		const s = summarize([
			game({ ...final(30, 20), kickoff: "2026-09-01T00:00:00Z" }), // miss
			game({ ...final(17, 24), kickoff: "2026-09-08T00:00:00Z" }), // hit
			game({ ...final(20, 20), kickoff: "2026-09-15T00:00:00Z" }), // push (ignored)
			game({ ...final(10, 27), kickoff: "2026-09-22T00:00:00Z" }), // hit
		])
		expect(s.streak).toEqual({ kind: "hit", length: 2 })
	})

	it("reports a miss streak when the latest games were wrong", () => {
		const s = summarize([
			game({ ...final(17, 24), kickoff: "2026-09-01T00:00:00Z" }),
			game({ ...final(30, 20), kickoff: "2026-09-08T00:00:00Z" }),
			game({ ...final(31, 20), kickoff: "2026-09-15T00:00:00Z" }),
		])
		expect(s.streak).toEqual({ kind: "miss", length: 2 })
	})

	it("orders games by kickoff, not by the order they were passed in", () => {
		const late = game({ ...final(10, 27), kickoff: "2026-12-01T00:00:00Z" }) // hit
		const early = game({ ...final(30, 20), kickoff: "2026-09-01T00:00:00Z" }) // miss
		const s = summarize([late, early])
		expect(s.recent.map((r) => r.id)).toEqual([early._id, late._id])
		expect(s.streak).toEqual({ kind: "hit", length: 1 })
	})

	it("keeps a separate record for Raiders games", () => {
		const s = summarize([
			game(final(17, 24)), // Raiders game, hit
			game({ awayTeam: "Buffalo Bills", homeTeam: "Miami Dolphins", ...final(30, 20) }), // not Raiders, miss
			game({ ...final(31, 20) }), // Raiders game, miss
		])
		expect(s.raiders).toEqual({ hits: 1, misses: 1 })
		expect(s.hits).toBe(1)
		expect(s.misses).toBe(2)
	})

	it("compares me with the readers on the same games, skipping games with no clear reader favorite", () => {
		const s = summarize([
			game({ ...final(17, 24), readerVotesHome: 5, readerVotesAway: 1 }), // me hit, readers hit
			game({ ...final(30, 20), readerVotesHome: 5, readerVotesAway: 1 }), // me miss, readers miss
			game({ ...final(17, 24), readerVotesHome: 1, readerVotesAway: 5 }), // me hit, readers miss
			game({ ...final(17, 24) }), // no votes: excluded
		])
		expect(s.readers).toEqual({ hits: 1, misses: 2, meHits: 2, meMisses: 1 })
	})

	it("labels recent picks by opponent, or by matchup when the Raiders aren't playing", () => {
		const s = summarize([
			game({ awayTeam: "Buffalo Bills", homeTeam: "Miami Dolphins", ...final(30, 20), kickoff: "2026-09-01T00:00:00Z" }),
			game({ awayTeam: "Las Vegas Raiders", homeTeam: "Denver Broncos", ...final(17, 24), kickoff: "2026-09-08T00:00:00Z" }),
			game({ ...final(17, 24), kickoff: "2026-09-15T00:00:00Z" }),
		])
		expect(s.recent.map((r) => r.opponentLabel)).toEqual(["Buffalo Bills @ Miami Dolphins", "Denver Broncos", "Kansas City Chiefs"])
	})

	it("keeps only the last 12 graded picks and reports the latest week", () => {
		const picks = Array.from({ length: 15 }, (_, i) => game({ ...final(10, 27), week: i + 1, kickoff: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z` }))
		const s = summarize(picks)
		expect(s.recent).toHaveLength(12)
		expect(s.recent[0].week).toBe(4)
		expect(s.recent[11].week).toBe(15)
		expect(s.throughWeek).toBe(15)
	})
})

describe("seasonStanding", () => {
	const row = (over: Record<string, unknown>) => ({ team: "Las Vegas Raiders", ...over })

	it("has no status when there is no prediction", () => {
		const s = seasonStanding(row({ wins: 3 }))
		expect(s.status).toBe("none")
		expect(s.predictedWins).toBeNull()
		expect(s.predictedLosses).toBeNull()
	})

	it("derives losses and games remaining from the 17-game season", () => {
		const s = seasonStanding(row({ predictedWins: 10, wins: 2, losses: 1, ties: 0 }))
		expect(SEASON_GAMES).toBe(17)
		expect(s).toMatchObject({ played: 3, remaining: 14, predictedWins: 10, predictedLosses: 7 })
	})

	it("stays alive and says what the team still needs", () => {
		const s = seasonStanding(row({ predictedWins: 10, wins: 3, losses: 1 }))
		expect(s.status).toBe("alive")
		expect(s.detail).toBe("Needs 7 of 13 remaining")
	})

	it("says must-win-out when every remaining game is needed", () => {
		// 17 games, 5-5 so far leaves 7, and 12 wins needs all 7
		const s = seasonStanding(row({ predictedWins: 12, wins: 5, losses: 5 }))
		expect(s.status).toBe("alive")
		expect(s.detail).toBe("Must win out (7 to play)")
	})

	it("says a team can't win another game once it has reached its pick", () => {
		const s = seasonStanding(row({ predictedWins: 10, wins: 10, losses: 3 }))
		expect(s.status).toBe("alive")
		expect(s.detail).toBe("Can't win another game (4 to play)")
	})

	it("marks a pick dead once the team has more wins than predicted", () => {
		const s = seasonStanding(row({ predictedWins: 8, wins: 9, losses: 2 }))
		expect(s.status).toBe("over")
		expect(s.detail).toBe("1 win past the pick")
		expect(seasonStanding(row({ predictedWins: 8, wins: 10, losses: 2 })).detail).toBe("2 wins past the pick")
	})

	it("marks a pick dead once losses (ties count as not-wins) pass what the pick allows", () => {
		// predicted 8 wins allows 9 non-wins; 10 losses is one past
		const s = seasonStanding(row({ predictedWins: 8, wins: 2, losses: 10 }))
		expect(s.status).toBe("under")
		expect(s.detail).toBe("1 loss past the pick")
		expect(seasonStanding(row({ predictedWins: 8, wins: 2, losses: 9, ties: 2 })).detail).toBe("2 losses past the pick")
	})

	it("grades exactly when the season is over: nailed, off by one, missed", () => {
		expect(seasonStanding(row({ predictedWins: 11, wins: 11, losses: 6 })).status).toBe("hit")
		expect(seasonStanding(row({ predictedWins: 11, wins: 10, losses: 7 })).status).toBe("close")
		expect(seasonStanding(row({ predictedWins: 11, wins: 12, losses: 5 })).status).toBe("close")
		expect(seasonStanding(row({ predictedWins: 11, wins: 7, losses: 10 })).status).toBe("miss")
	})

	it("grades early when the season is marked final, even with games unplayed", () => {
		expect(seasonStanding(row({ predictedWins: 11, wins: 11, losses: 3 }), true).status).toBe("hit")
	})
})

describe("seasonSummary", () => {
	it("tallies the standing of every team", () => {
		const counts = seasonSummary([
			{ team: "a", predictedWins: 10, wins: 3, losses: 1 },
			{ team: "b", predictedWins: 8, wins: 9, losses: 2 },
			{ team: "c" },
			{ team: "d", predictedWins: 12, wins: 12, losses: 5 },
		])
		expect(counts).toMatchObject({ alive: 1, over: 1, none: 1, hit: 1, under: 0, close: 0, miss: 0 })
	})
})

describe("keys to the game", () => {
	it("tallies hit, miss and still-open keys", () => {
		expect(tallyKeys([{ text: "a", result: "hit" }, { text: "b", result: "miss" }, { text: "c" }, { text: "d", result: null }])).toEqual({
			hit: 1,
			miss: 1,
			open: 2,
			total: 4,
		})
		expect(tallyKeys(null)).toEqual({ hit: 0, miss: 0, open: 0, total: 0 })
	})

	it("summarizes hit rate across games and counts only games with a graded key", () => {
		const s = summarizeKeys([
			game({ keys: [{ text: "a", result: "hit" }, { text: "b", result: "hit" }, { text: "c", result: "miss" }] }),
			game({ keys: [{ text: "a" }, { text: "b" }] }), // nothing graded yet
			game({ keys: [{ text: "a", result: "miss" }] }),
			game(),
		])
		expect(s).toMatchObject({ hit: 2, miss: 2, games: 2 })
		expect(s.rate).toBe(0.5)
	})

	it("has a null rate until a key is graded", () => {
		expect(summarizeKeys([game({ keys: [{ text: "a" }] })]).rate).toBeNull()
	})
})

describe("flags planted", () => {
	const flag = (result?: "hit" | "miss" | null): FlagPlant => ({ _id: String(Math.random()), week: 1, text: "x", result })

	it("counts hits, misses and open flags", () => {
		const s = summarizeFlags([flag("hit"), flag("hit"), flag("miss"), flag(null), flag(undefined)])
		expect(s).toMatchObject({ hit: 2, miss: 1, open: 2 })
		expect(s.rate).toBeCloseTo(2 / 3)
	})

	it("has a null rate when nothing is decided", () => {
		expect(summarizeFlags([flag(null)]).rate).toBeNull()
		expect(summarizeFlags([]).rate).toBeNull()
	})
})
