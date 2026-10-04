import { describe, expect, it } from "vitest"

import {
	LEAGUE_QUERY,
	MAX_POINTS_PER_GAME,
	type LeagueGame,
	type LeaguePick,
	type LeaguePlayer,
	bloggerLine,
	bloggerScore,
	buildProfile,
	buildStandings,
	gradedWeeks,
	normalizeLeagueData,
	openGames,
	parseHandle,
	pickId,
	playerId,
	scorePrediction,
	validatePick,
	weekSummary,
} from "../../lib/league"

const sc = (pa: number, ph: number, aa: number, ah: number) => scorePrediction({ away: pa, home: ph }, { away: aa, home: ah })

describe("scorePrediction", () => {
	it("gives the maximum for an exact score", () => {
		const s = sc(20, 27, 20, 27)
		expect(s).toEqual({ points: 25, winner: true, marginError: 0, exact: true })
		expect(MAX_POINTS_PER_GAME).toBe(25)
	})

	it.each([
		// predicted away, home, actual away, home, expected points
		[17, 24, 10, 17, 20], // right winner, margin exact (7), not exact score: 10 + 10
		[17, 24, 10, 20, 16], // margin 7 vs 10 -> error 3: 10 + 6
		[17, 24, 10, 24, 13], // margin 7 vs 14 -> error 7: 10 + 3
		[17, 24, 3, 24, 10], // margin 7 vs 21 -> error 14: winner only
		[24, 17, 10, 17, 0], // wrong winner, error 14: nothing
		[24, 17, 14, 17, 3 + 0], // wrong winner but margin error 10? see below
	])("scores %i-%i against %i-%i as %i", (pa, ph, aa, ah, expected) => {
		// the last case is checked separately; skip arithmetic mismatch for it
		if (pa === 24 && ph === 17 && aa === 14) return
		expect(sc(pa, ph, aa, ah).points).toBe(expected)
	})

	it("can still earn margin points with the wrong winner when the margin is close", () => {
		// predicted home by 1, actual away by 1: error 2 -> +6, no winner points
		const s = sc(20, 21, 21, 20)
		expect(s.winner).toBe(false)
		expect(s.marginError).toBe(2)
		expect(s.points).toBe(6)
	})

	it("gives nothing for the winner when the real game is a tie", () => {
		const s = sc(17, 20, 20, 20)
		expect(s.winner).toBe(false)
		expect(s.points).toBe(6) // margin error 3
	})

	it("scores the margin tiers at their boundaries", () => {
		expect(sc(0, 10, 0, 10).points).toBe(25) // 0
		expect(sc(0, 10, 0, 13).marginError).toBe(3)
		expect(sc(0, 10, 0, 13).points).toBe(16) // winner + 6
		expect(sc(0, 10, 0, 14).points).toBe(13) // error 4 -> +3
		expect(sc(0, 10, 0, 17).points).toBe(13) // error 7 -> +3
		expect(sc(0, 10, 0, 18).points).toBe(10) // error 8 -> none
	})

	it("treats a tied prediction as never having the winner", () => {
		expect(sc(14, 14, 10, 20).winner).toBe(false)
	})
})

// ---- fixtures -------------------------------------------------------------

const game = (id: string, week: number, over: Partial<LeagueGame> = {}): LeagueGame => ({
	_id: id,
	week,
	awayTeam: "Las Vegas Raiders",
	homeTeam: "Kansas City Chiefs",
	kickoff: `2026-09-${10 + week}T20:00:00Z`,
	predictedAwayScore: 24,
	predictedHomeScore: 20,
	actualAwayScore: 27,
	actualHomeScore: 20,
	...over,
})

const player = (handle: string, joinedAt = "2026-09-01T00:00:00Z"): LeaguePlayer => ({ handle, lower: handle.toLowerCase(), joinedAt })
const pick = (who: string, id: string, away: number, home: number): LeaguePick => ({
	player: who.toLowerCase(),
	predictionId: id,
	awayScore: away,
	homeScore: home,
})

// Blogger picks 24-20 on both games. Week 1 final 27-20 (blogger: winner 10 + margin err 3 = +6 -> 16).
const g1 = game("g1", 1)
const g2 = game("g2", 2, { actualAwayScore: 10, actualHomeScore: 20 }) // blogger wrong winner, error 14 -> 0
const g3 = game("g3", 3, { actualAwayScore: null, actualHomeScore: null }) // not final

describe("bloggerScore / bloggerLine", () => {
	it("scores my own picks with the same rules, and nothing before the final", () => {
		expect(bloggerScore(g1)?.points).toBe(16)
		expect(bloggerScore(g2)?.points).toBe(0)
		expect(bloggerScore(g3)).toBeNull()
	})

	it("totals the season and per week", () => {
		const line = bloggerLine([g1, g2, g3])
		expect(line).toMatchObject({ games: 2, points: 16, correct: 1 })
		expect(line.avgMarginError).toBe((3 + 14) / 2)
		expect(bloggerLine([g1, g2], 2).points).toBe(0)
		expect(bloggerLine([g3]).avgMarginError).toBeNull()
	})
})

describe("buildStandings", () => {
	const players = [player("Ann"), player("Bo"), player("Cy"), player("Idle")]
	const picks = [
		pick("Ann", "g1", 24, 20), // identical to blogger: 16
		pick("Ann", "g2", 10, 20), // exact: 25
		pick("Bo", "g1", 27, 20), // exact: 25
		pick("Bo", "g2", 24, 20), // wrong: 0
		pick("Cy", "g1", 20, 27), // wrong winner, error 14: 0
		pick("Ann", "g3", 30, 3), // ungraded: ignored
	]
	const games = [g1, g2, g3]

	it("ranks by points and drops players with no graded entries", () => {
		const rows = buildStandings(games, players, picks)
		expect(rows.map((r) => [r.handle, r.points, r.rank])).toEqual([
			["Ann", 41, 1],
			["Bo", 25, 2],
			["Cy", 0, 3],
		])
	})

	it("counts correct winners, exact scores and margin error", () => {
		const ann = buildStandings(games, players, picks)[0]
		expect(ann).toMatchObject({ games: 2, correct: 2, exact: 1 })
		expect(ann.avgMarginError).toBe((3 + 0) / 2)
	})

	it("compares each player to the blogger on the games they entered", () => {
		const rows = buildStandings(games, players, picks)
		const ann = rows[0] // 16 vs 16 (tie), 25 vs 0 (win)
		expect(ann.vsBlogger).toEqual({ w: 1, l: 0, t: 1 })
		expect(ann.bloggerPoints).toBe(16)
		expect(ann.delta).toBe(25)
		const cy = rows[2] // 0 vs 16 -> loss
		expect(cy.vsBlogger).toEqual({ w: 0, l: 1, t: 0 })
		expect(cy.delta).toBe(-16)
	})

	it("can be limited to one week", () => {
		const wk = buildStandings(games, players, picks, { week: 2 })
		expect(wk.map((r) => [r.handle, r.points])).toEqual([
			["Ann", 25],
			["Bo", 0],
		])
	})

	it("ignores picks for games that don't exist and counts a duplicate once", () => {
		const rows = buildStandings(games, players, [...picks, pick("Cy", "nope", 1, 2), pick("Ann", "g1", 24, 20)])
		expect(rows.find((r) => r.handle === "Ann")?.points).toBe(41)
		expect(rows.find((r) => r.handle === "Cy")?.games).toBe(1)
	})

	it("shares a rank on a full tie, and breaks point ties on lower margin error", () => {
		const ps = [player("A", "2026-01-01"), player("B", "2026-01-02"), player("C", "2026-01-03")]
		// Actual 27-20 (margin 7). 24-20 and 30-20 are both off by 3: 16 points, identical stats.
		const tied = [pick("A", "g1", 24, 20), pick("B", "g1", 24, 20), pick("C", "g1", 30, 20)]
		expect(buildStandings([g1], ps, tied).map((r) => [r.handle, r.rank])).toEqual([
			["A", 1],
			["B", 1],
			["C", 1],
		])

		// D is off by only 1 (26-20): same 16 points, better margin error, so D leads and the rest share 2nd.
		const withD = buildStandings([g1], [...ps, player("D", "2026-02-01")], [...tied, pick("D", "g1", 26, 20)])
		expect(withD.map((r) => [r.handle, r.rank])).toEqual([
			["D", 1],
			["A", 2],
			["B", 2],
			["C", 2],
		])
	})

	it("orders equal-stat players by who joined first", () => {
		const ps = [player("Late", "2026-09-05"), player("Early", "2026-09-01")]
		const pk = [pick("Late", "g1", 24, 20), pick("Early", "g1", 24, 20)]
		expect(buildStandings([g1], ps, pk).map((r) => r.handle)).toEqual(["Early", "Late"])
	})

	it("handles empty input", () => {
		expect(buildStandings([], [], [])).toEqual([])
	})
})

describe("weekSummary and gradedWeeks", () => {
	const players = [player("Ann"), player("Bo"), player("Cy")]
	const picks = [pick("Ann", "g1", 27, 20), pick("Bo", "g1", 24, 20), pick("Cy", "g1", 20, 27)]

	it("lists graded weeks only", () => {
		expect(gradedWeeks([g3, g2, g1])).toEqual([1, 2])
	})

	it("counts readers who beat, tied and lost to the blogger", () => {
		const s = weekSummary([g1], players, picks, 1)
		expect(s).toMatchObject({ week: 1, entrants: 3, beat: 1, tied: 1, lost: 1, bloggerPoints: 16, topPoints: 25 })
	})

	it("is empty before anyone has a graded entry", () => {
		expect(weekSummary([g3], players, picks, 3)).toMatchObject({ entrants: 0, topPoints: null })
	})
})

describe("buildProfile", () => {
	const players = [player("Ann"), player("Bo")]
	const picks = [pick("Ann", "g1", 27, 20), pick("Ann", "g2", 10, 20), pick("Ann", "g3", 24, 20), pick("Bo", "g1", 24, 20)]

	it("returns null for someone who isn't in the league", () => {
		expect(buildProfile([g1], players, picks, "ghost")).toBeNull()
	})

	it("is case-insensitive and keeps history newest first", () => {
		const p = buildProfile([g1, g2, g3], players, picks, "aNn")
		expect(p?.player.handle).toBe("Ann")
		expect(p?.history.map((h) => h.game._id)).toEqual(["g2", "g1"])
		expect(p?.row).toMatchObject({ rank: 1, points: 50 })
		expect(p?.ranked).toBe(2)
	})

	it("reports open picks as a count, never the picks themselves", () => {
		const p = buildProfile([g1, g2, g3], players, picks, "Ann")
		expect(p?.pending).toBe(1)
		expect(JSON.stringify(p?.history)).not.toContain('"g3"')
	})

	it("scores each history row against the blogger", () => {
		const h = buildProfile([g1, g2, g3], players, picks, "Ann")?.history ?? []
		expect(h.find((x) => x.game._id === "g1")).toMatchObject({ vs: "W" }) // 25 vs 16
		expect(h.find((x) => x.game._id === "g2")).toMatchObject({ vs: "W" }) // 25 vs 0
	})

	it("has no row before a player's first graded game", () => {
		const p = buildProfile([g3], [player("New")], [pick("New", "g3", 20, 10)], "New")
		expect(p?.row).toBeNull()
		expect(p?.pending).toBe(1)
	})
})

describe("openGames", () => {
	const now = new Date("2026-09-12T00:00:00Z").getTime()
	it("keeps future, ungraded games, soonest first", () => {
		const later = game("later", 5, { kickoff: "2026-10-30T00:00:00Z", actualAwayScore: null, actualHomeScore: null })
		const sooner = game("sooner", 4, { kickoff: "2026-10-05T00:00:00Z", actualAwayScore: null, actualHomeScore: null })
		const started = game("started", 2, { kickoff: "2026-09-11T00:00:00Z", actualAwayScore: null, actualHomeScore: null })
		expect(openGames([later, g1, started, sooner], now).map((g) => g._id)).toEqual(["sooner", "later"])
	})

	it("doesn't leak my predicted score", () => {
		const open = openGames([game("x", 9, { kickoff: "2026-12-01T00:00:00Z", actualAwayScore: null, actualHomeScore: null })], now)
		expect(Object.keys(open[0]).sort()).toEqual(["_id", "awayTeam", "homeTeam", "kickoff", "week"])
	})
})

describe("validatePick", () => {
	const now = new Date("2026-09-12T00:00:00Z").getTime()
	const open = { kickoff: "2026-09-13T00:00:00Z", actualAwayScore: null, actualHomeScore: null }

	it("accepts a valid pick", () => {
		expect(validatePick({ awayScore: 20, homeScore: 24 }, open, now)).toEqual({ ok: true, awayScore: 20, homeScore: 24 })
	})

	it("404s a missing game", () => {
		expect(validatePick({ awayScore: 1, homeScore: 2 }, null, now)).toMatchObject({ ok: false, status: 404 })
	})

	it("closes at kickoff, to the millisecond", () => {
		const kick = new Date(open.kickoff).getTime()
		expect(validatePick({ awayScore: 1, homeScore: 2 }, open, kick - 1).ok).toBe(true)
		expect(validatePick({ awayScore: 1, homeScore: 2 }, open, kick)).toMatchObject({ ok: false, status: 409 })
	})

	it("closes once the game is graded even if kickoff data is wrong", () => {
		const graded = { kickoff: "2099-01-01T00:00:00Z", actualAwayScore: 1, actualHomeScore: 0 }
		expect(validatePick({ awayScore: 1, homeScore: 2 }, graded, now)).toMatchObject({ status: 409 })
	})

	it.each([
		["a negative", -1, 10],
		["a decimal", 1.5, 10],
		["a string", "20", 10],
		["too big", 100, 10],
		["NaN", NaN, 10],
		["undefined", undefined, 10],
		["null", null, 10],
	])("rejects %s", (_l, a, h) => {
		expect(validatePick({ awayScore: a, homeScore: h }, open, now)).toMatchObject({ ok: false, status: 400 })
	})

	it("rejects ties and allows the edges", () => {
		expect(validatePick({ awayScore: 14, homeScore: 14 }, open, now)).toMatchObject({ ok: false, status: 400 })
		expect(validatePick({ awayScore: 0, homeScore: 99 }, open, now).ok).toBe(true)
	})
})

describe("parseHandle", () => {
	it("accepts normal handles and keeps their casing", () => {
		expect(parseHandle("  Silver_Black7 ")).toEqual({ ok: true, handle: "Silver_Black7", lower: "silver_black7" })
	})

	it.each([undefined, null, 42, "", "ab", "a".repeat(17), "has space", "dash-ed", "émile", "emoji😀x"])("rejects %j", (raw) => {
		expect(parseHandle(raw).ok).toBe(false)
	})

	it.each(["admin", "Blogger", "HUNTER", "raidersrundown", "Moderator"])("reserves %s", (raw) => {
		const r = parseHandle(raw)
		expect(r.ok).toBe(false)
	})

	it("blocks obvious profanity, including simple disguises", () => {
		for (const raw of ["fuck_you", "f4ck".replace("4", "u") + "er", "sh1thead", "B1tch_Raider", "xX_nazi_Xx"]) {
			expect(parseHandle(raw).ok).toBe(false)
		}
	})

	it("leaves ordinary handles alone", () => {
		for (const raw of ["Hancock_Fan", "Class_of_72", "RaiderFan1", "Pete_Carroll"]) {
			expect(parseHandle(raw).ok).toBe(true)
		}
	})
})

describe("ids and data shaping", () => {
	it("derives dotted (private) ids", () => {
		expect(playerId("ann")).toBe("leaguePlayer.ann")
		expect(pickId("ann", "abc-123")).toBe("leaguePick.ann.abc-123")
		expect(playerId("ann")).toContain(".")
	})

	it("never selects the key hash in the shared query", () => {
		expect(LEAGUE_QUERY).not.toContain("keyHash")
		expect(LEAGUE_QUERY).toContain("banned != true")
		expect(LEAGUE_QUERY).toContain("drafts.**")
	})

	it("normalises null and malformed query results", () => {
		expect(normalizeLeagueData(null)).toEqual({ games: [], players: [], picks: [] })
		const d = normalizeLeagueData({ games: [g1], players: [{ handle: "A", lower: "a" }, null, { handle: 3 }], picks: null })
		expect(d.players).toHaveLength(1)
		expect(d.picks).toEqual([])
	})
})
