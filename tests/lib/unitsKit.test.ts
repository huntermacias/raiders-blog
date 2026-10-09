import { describe, expect, it } from "vitest"
import {
	GROUPS,
	boardRows,
	canonicalPair,
	coachTape,
	edgeSentence,
	kickoffText,
	leaderLine,
	marketLine,
	statLines,
	tierLabel,
	viewOf,
	watchPlayers,
	GROUP_ORDER,
	PAIRS,
	atsText,
	groupInjuries,
	groupsOfPair,
	headline,
	heat,
	isGameStatus,
	matchupRows,
	injuryNote,
	missingStarters,
	practiceOf,
	practiceTrend,
	reportedStarters,
	trailText,
	updatedText,
	ordinal,
	paperEdge,
	pairBoard,
	percentile,
	recText,
	reportNote,
	rowSentence,
	share,
	sideOf,
	statValue,
	styleTrait,
	tally,
	tierOf,
	topEdges,
} from "../../lib/lab/unitsKit"
import { fakeUnits, hurt } from "../helpers/unitsFake"

describe("percentile and tiers", () => {
	it("maps first to 100 and last to 0", () => {
		expect(percentile(1, 32)).toBe(100)
		expect(percentile(32, 32)).toBe(0)
		expect(percentile(16, 31)).toBeCloseTo(50)
		expect(percentile(1, 1)).toBe(50)
	})
	it("calls 12 points an edge and 30 a big one, in either direction", () => {
		expect(tierOf(5)).toBe("even")
		expect(tierOf(-11.9)).toBe("even")
		expect(tierOf(12)).toBe("edge")
		expect(tierOf(-29)).toBe("edge")
		expect(tierOf(30)).toBe("big")
		expect(tierOf(-80)).toBe("big")
	})
})

describe("the catalog", () => {
	it("puts every group on one side of the ball and gives every stat a direction", () => {
		expect(GROUP_ORDER).toHaveLength(7)
		for (const g of GROUP_ORDER) {
			expect(["off", "def"]).toContain(GROUPS[g].side)
			for (const info of Object.values(GROUPS[g].stats)) expect(["high", "low"]).toContain(info.better)
		}
	})
	it("formats stats the way fans read them", () => {
		expect(statValue("qb", "epaDb", 0.148)).toBe("+0.15")
		expect(statValue("qb", "epaDb", -0.2)).toBe("−0.20")
		expect(statValue("ol", "pressure", 0.2583)).toBe("26%")
		expect(statValue("ol", "sackRate", 0.0331)).toBe("3.3%")
		expect(statValue("ol", "ybc", 1.386)).toBe("1.4")
		expect(statValue("qb", "cpoe", 1.945)).toBe("+1.9")
		expect(statValue("cov", "rating", 88.87)).toBe("88.9")
	})
	it("says ordinals right", () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 32].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "32nd"])
	})
})

describe("pairings", () => {
	it("scores a side by the mean percentile of the stats it uses", () => {
		const data = fakeUnits()
		const board = pairBoard(data, PAIRS[0], "off")
		expect(board.AAA.rank).toBe(1)
		expect(board.HHH.rank).toBe(8)
		expect(board.AAA.score).toBe(100)
		expect(board.HHH.score).toBe(0)
	})
	it("ranks by the stats in the pairing, not the whole group", () => {
		// BBB is last at the line's run blocking but first at its pass protection.
		const data = fakeUnits({ rank: (a, g, s) => (a === "BBB" && g === "ol" ? (s === "ybc" || s === "stuffed" ? 8 : 1) : undefined) })
		const prot = pairBoard(data, PAIRS.find((p) => p.id === "protection")!, "off")
		const ground = pairBoard(data, PAIRS.find((p) => p.id === "ground")!, "off")
		expect(prot.BBB.score).toBe(100)
		expect(ground.BBB.score).toBeLessThan(prot.BBB.score - 25)
	})
	it("makes eight rows for a game: each offense against the other defense", () => {
		const rows = matchupRows(fakeUnits(), "AAA", "HHH")
		expect(rows).toHaveLength(8)
		expect(rows.filter((r) => r.attacker === "AAA")).toHaveLength(4)
		expect(rows.filter((r) => r.attacker === "HHH").every((r) => r.defender === "AAA")).toBe(true)
	})
	it("gives AAA's attack a big edge over HHH and HHH's attack a big deficit", () => {
		const rows = matchupRows(fakeUnits(), "AAA", "HHH")
		for (const r of rows.filter((x) => x.attacker === "AAA")) {
			expect(r.edge).toBe(100)
			expect(r.tier).toBe("big")
			expect(sideOf(r, "AAA")).toBe(1)
			expect(sideOf(r, "HHH")).toBe(-1)
		}
		for (const r of rows.filter((x) => x.attacker === "HHH")) {
			expect(r.edge).toBe(-100)
			expect(sideOf(r, "AAA")).toBe(1)
		}
	})
	it("calls neighbors even and says so", () => {
		const rows = matchupRows(fakeUnits({ rank: (a) => (a === "EEE" ? 4 : undefined) }), "DDD", "EEE")
		expect(rows.every((r) => r.tier === "even")).toBe(true)
		expect(rows.every((r) => sideOf(r, "DDD") === 0)).toBe(true)
		expect(headline(rows, "DDD", "EEE", { DDD: "Ds", EEE: "Es" })).toMatch(/even in every/)
	})
	it("returns nothing for a team that is not in the table", () => {
		expect(matchupRows(fakeUnits(), "AAA", "ZZZ")).toEqual([])
		expect(headline([], "AAA", "ZZZ", {})).toMatch(/stack up/)
	})
	it("sums the paper edge from the first team's point of view", () => {
		const data = fakeUnits()
		expect(paperEdge(matchupRows(data, "AAA", "HHH"), "AAA")).toBe(200)
		expect(paperEdge(matchupRows(data, "AAA", "HHH"), "HHH")).toBe(-200)
		expect(paperEdge(matchupRows(fakeUnits({ rank: (a) => (a === "EEE" ? 4 : undefined) }), "DDD", "EEE"), "DDD")).toBeCloseTo(0, 5)
	})
	it("counts edges for and against", () => {
		const t = tally(matchupRows(fakeUnits(), "AAA", "HHH"), "AAA")
		expect(t).toEqual({ edges: 8, against: 0, even: 0 })
		expect(tally(matchupRows(fakeUnits(), "AAA", "HHH"), "HHH")).toEqual({ edges: 0, against: 8, even: 0 })
	})
	it("lists the biggest edges first and only those in a team's favor", () => {
		const data = fakeUnits({ rank: (a, g) => (a === "BBB" && g === "rush" ? 1 : a === "AAA" && g === "ol" ? 8 : undefined) })
		const rows = matchupRows(data, "AAA", "BBB")
		const top = topEdges(rows, "BBB", 2)
		expect(top[0].pair.id).toBe("protection")
		expect(top.every((r) => sideOf(r, "BBB") === 1)).toBe(true)
		expect(topEdges(rows, "BBB", 99).length).toBeLessThanOrEqual(rows.length)
	})
	it("words a row with both ranks and the headline with the biggest mismatch", () => {
		const names = { AAA: "Aces", HHH: "Hawks" }
		const rows = matchupRows(fakeUnits(), "AAA", "HHH")
		expect(rowSentence(rows[0], names)).toBe("The Aces pass protection ranks 1st. The Hawks pass rush ranks 8th.")
		expect(headline(rows, "AAA", "HHH", names)).toMatch(/biggest mismatch: the Aces .* \(1st\) against the Hawks .* \(8th\)/)
	})
	it("knows which groups each side of a pairing draws on", () => {
		expect(groupsOfPair(PAIRS.find((p) => p.id === "ground")!, "off").sort()).toEqual(["ol", "run"])
		expect(groupsOfPair(PAIRS.find((p) => p.id === "targets")!, "def")).toEqual(["cov"])
	})
})

describe("injuries", () => {
	it("keeps game-day starters apart from practice notes and bench players", () => {
		const data = fakeUnits()
		const team = data.teams.AAA
		team.injuries.players = [hurt(), hurt({ name: "Bench Ben", starter: false }), hurt({ name: "Limited Larry", status: "Limited" }), hurt({ name: "Wide Walt", group: "rec", pos: "WR", status: "Questionable" })]
		expect(missingStarters(team).map((p) => p.name)).toEqual(["Hurt Harry", "Wide Walt"])
		expect(missingStarters(team, ["ol"]).map((p) => p.name)).toEqual(["Hurt Harry"])
		expect(groupInjuries(team, ["ol"]).map((p) => p.name)).toEqual(["Hurt Harry", "Bench Ben", "Limited Larry"])
		expect(isGameStatus("Out") && isGameStatus("Doubtful") && isGameStatus("Questionable")).toBe(true)
		expect(isGameStatus("DNP")).toBe(false)
	})
	it("reads how a player practiced, from the new field or an older file's status", () => {
		expect(practiceOf(hurt({ status: "Out", practice: "DNP" }))).toBe("DNP")
		expect(practiceOf(hurt({ status: "Questionable" }))).toBeNull()
		expect(practiceOf(hurt({ status: "Limited" }))).toBe("Limited")
		expect(practiceOf(hurt({ status: "Questionable", practice: null }))).toBeNull()
	})
	it("flags starters who are limited or out of practice as well as those on the game report", () => {
		const team = fakeUnits().teams.AAA
		team.injuries.players = [
			hurt({ name: "Out Otis", status: "Out", practice: "DNP" }),
			hurt({ name: "Limited Lou", status: "Limited", practice: "Limited" }),
			hurt({ name: "Back Bo", status: "Full", practice: "Full" }),
			hurt({ name: "Bench Ben", status: "Limited", practice: "Limited", starter: false }),
			hurt({ name: "Quest Quinn", status: "Questionable", practice: "Full" }),
		]
		expect(reportedStarters(team).map((p) => p.name)).toEqual(["Out Otis", "Limited Lou", "Quest Quinn"])
		expect(missingStarters(team).map((p) => p.name)).toEqual(["Out Otis", "Quest Quinn"])
		expect(injuryNote(team.injuries.players[0])).toBe("out, did not practice, knee")
		expect(injuryNote(team.injuries.players[1])).toBe("limited in practice, knee")
	})
	it("tells a player's practice week from our looks at it, and which way it is going", () => {
		const step = (at: string, practice: "DNP" | "Limited" | "Full", status = practice as string) => ({ at, practice, status })
		const p = hurt({
			status: "Questionable",
			practice: "Limited",
			trail: [step("2026-10-07T20:00:00Z", "DNP"), step("2026-10-08T20:00:00Z", "Limited"), step("2026-10-09T20:00:00Z", "Limited", "Questionable")],
		})
		expect(trailText(p)).toBe("Wed DNP → Thu Limited → Fri Limited (questionable)")
		expect(practiceTrend(p)).toBeNull()
		expect(practiceTrend(hurt({ trail: [step("2026-10-08T20:00:00Z", "Limited"), step("2026-10-09T20:00:00Z", "Full")] }))).toBe("up")
		expect(practiceTrend(hurt({ trail: [step("2026-10-08T20:00:00Z", "Limited"), step("2026-10-09T20:00:00Z", "DNP", "Out")] }))).toBe("down")
		expect(practiceTrend(hurt({ trail: [step("2026-10-09T20:00:00Z", "Full")] }))).toBeNull()
		expect(trailText(hurt())).toBe("")
	})
	it("writes the update time in Eastern time, whatever the reader's zone", () => {
		expect(updatedText("2026-10-09T23:24:30Z")).toBe("Fri, Oct 9, 7:24 PM ET")
		expect(updatedText("2027-01-03T02:00:00Z")).toBe("Sat, Jan 2, 9:00 PM ET")
		expect(updatedText("nonsense")).toBe("")
	})
	it("notes a report that is older than the game", () => {
		const team = fakeUnits().teams.AAA
		expect(reportNote(team, 5)).toMatch(/from Week 4; the Week 5 report is not out yet/)
		expect(reportNote(team, 4)).toBeNull()
		expect(reportNote(team, null)).toBeNull()
		team.injuries.week = null
		expect(reportNote(team, 5)).toBe("No report yet.")
	})
})

describe("style, coaching and the board", () => {
	it("describes a team only when it sits at an extreme", () => {
		expect(styleTrait("blitz", 2, 32)).toBe("sends extra rushers often")
		expect(styleTrait("blitz", 31, 32)).toBe("rarely blitzes")
		expect(styleTrait("blitz", 16, 32)).toBeNull()
		expect(styleTrait("nope", 1, 32)).toBeNull()
	})
	it("writes records", () => {
		expect(recText({ w: 3, l: 1, t: 0 })).toBe("3-1")
		expect(recText({ w: 3, l: 1, t: 1 })).toBe("3-1-1")
		expect(atsText({ w: 4, l: 0, p: 0 })).toBe("4-0")
		expect(atsText({ w: 4, l: 2, p: 1 })).toBe("4-2-1")
		expect(share({ w: 0, l: 0, t: 0 })).toBeNull()
		expect(share({ w: 3, l: 1, t: 0 })).toBe(0.75)
	})
	it("turns a rank into heat from 0 to 1", () => {
		expect(heat(1, 32)).toBe(1)
		expect(heat(32, 32)).toBe(0)
		expect(heat(undefined, 32)).toBeNull()
	})
})

describe("the board and the slate", () => {
	it("makes one light row per team with the seven group ranks and an overall rank", () => {
		const rows = boardRows(fakeUnits())
		expect(rows).toHaveLength(8)
		const aaa = rows.find((r) => r.abbr === "AAA")!
		expect(aaa.record).toBe("3-1")
		expect(Object.keys(aaa.groups).sort()).toEqual([...GROUP_ORDER].sort())
		expect(aaa.compositeRank).toBe(1)
		expect(rows.find((r) => r.abbr === "HHH")!.compositeRank).toBe(8)
		// Nothing but ranks and short strings, so it is cheap to send to the browser.
		expect(JSON.stringify(rows).length).toBeLessThan(2500)
	})
	it("gives a pairing one address whichever way it is asked for", () => {
		expect(canonicalPair("NE", "LV")).toEqual(["LV", "NE"])
		expect(canonicalPair("LV", "NE")).toEqual(["LV", "NE"])
		expect(canonicalPair("NE", "KC")).toEqual(["KC", "NE"])
		expect(canonicalPair("KC", "NE")).toEqual(["KC", "NE"])
	})
	it("reads the spread as the home team's favoritism", () => {
		const names = { LV: "Raiders", NE: "Patriots" }
		const game = { away: "LV", home: "NE", day: "2026-10-11", time: "13:00", spread: 3.5, total: 45.5 }
		expect(marketLine(game, names)).toBe("Patriots favored by 3.5")
		expect(marketLine({ ...game, spread: -3 }, names)).toBe("Raiders favored by 3")
		expect(marketLine({ ...game, spread: 0 }, names)).toBe("Pick 'em")
		expect(marketLine({ ...game, spread: null }, names)).toBeNull()
	})
	it("writes kickoff times in plain English", () => {
		expect(kickoffText("2026-10-11", "13:00")).toBe("Sun, Oct 11 · 1:00 PM ET")
		expect(kickoffText("2026-10-08", "20:15")).toBe("Thu, Oct 8 · 8:15 PM ET")
		expect(kickoffText("2026-10-11", "09:30")).toBe("Sun, Oct 11 · 9:30 AM ET")
		expect(kickoffText("2026-10-11", "00:05")).toBe("Sun, Oct 11 · 12:05 AM ET")
		expect(kickoffText("2026-10-11", null)).toBe("Sun, Oct 11")
		expect(kickoffText("soon", "13:00")).toBe("soon")
	})
})

describe("reading a row from one side", () => {
	it("flips the point of view and the sign of the edge", () => {
		const rows = matchupRows(fakeUnits(), "AAA", "HHH")
		const row = rows.find((r) => r.attacker === "HHH" && r.pair.id === "protection")!
		const mine = viewOf(row, "AAA")
		expect(mine.mine).toEqual({ name: "pass rush", rank: 1 })
		expect(mine.theirs).toEqual({ name: "pass protection", rank: 8 })
		expect(mine.edge).toBe(100)
		expect(viewOf(row, "HHH").edge).toBe(-100)
		expect(edgeSentence(row, "AAA", { AAA: "Aces", HHH: "Hawks" })).toBe("Aces pass rush (1st) against the Hawks pass protection (8th)")
		expect(tierLabel(row, { AAA: "Aces", HHH: "Hawks" })).toBe("Aces big edge")
		expect(tierLabel({ ...row, tier: "even", edge: 0 }, {})).toBe("Even")
	})
	it("lists the stats and the players behind a side of a pairing", () => {
		const team = fakeUnits().teams.AAA
		const lines = statLines(team, PAIRS.find((p) => p.id === "ground")!.off)
		expect(lines.map((l) => l.key)).toEqual(["epaRush", "success", "yco", "explosive", "ybc", "stuffed"])
		expect(lines[0]).toMatchObject({ group: "run", rank: 1 })
		expect(watchPlayers(team, PAIRS[0].off).map((p) => p.group)).toEqual(["ol"])
	})
	it("describes each kind of leader", () => {
		expect(leaderLine({ name: "Q", pos: "QB", stat: "epaDb", v: 0.152, n: 148 })).toBe("+0.15 per dropback on 148")
		expect(leaderLine({ name: "R", pos: "RB", stat: "epaRush", v: -0.278, n: 77 })).toBe("−0.28 per run on 77")
		expect(leaderLine({ name: "L", pos: "T", stat: "snapPct", v: 0.977, n: 196 })).toBe("98% of snaps")
		expect(leaderLine({ name: "E", pos: "DE", stat: "pressures", v: 18, x: 2 })).toBe("18 pressures, 2 sacks")
		expect(leaderLine({ name: "E", pos: "DE", stat: "pressures", v: 6, x: 0 })).toBe("6 pressures")
		expect(leaderLine({ name: "B", pos: "LB", stat: "tackles", v: 33, x: 7 })).toBe("33 tackles, 7 missed")
		expect(leaderLine({ name: "C", pos: "CB", stat: "rating", v: 87.5, n: 22 })).toBe("87.5 passer rating allowed on 22 targets")
		expect(leaderLine({ name: "?", pos: "", stat: "nope", v: 1 })).toBe("")
	})
})

describe("the coaches side by side", () => {
	it("compares each coach from his own side", () => {
		const data = fakeUnits()
		const tape = coachTape("AAA", "BBB", data)
		expect(tape[0]).toEqual({ label: "Head coach", a: "Coach AAA", b: "Coach BBB" })
		expect(tape.find((r) => r.label === "Head coach against head coach")).toMatchObject({ a: "1-2 against Coach BBB", b: "1-2 against Coach AAA" })
		expect(tape.find((r) => r.label === "Against the spread, this season")).toMatchObject({ a: "3-1", b: "3-1" })
		expect(tape.find((r) => r.label === "Team against team since 1999")).toMatchObject({ a: "5-6" })
	})
	it("says so when a coach is in his first year, or the coaches have never met", () => {
		const data = fakeUnits()
		data.teams.AAA.coach!.career = { w: 3, l: 1, t: 0, n: 4 }
		data.teams.AAA.coach!.vs.BBB.coachMeet = { w: 0, l: 0, t: 0, n: 0 }
		data.teams.AAA.coach!.bye = { w: 0, l: 0, t: 0 }
		const tape = coachTape("AAA", "BBB", data)
		expect(tape.find((r) => r.label === "Record as a head coach")!.a).toBe("3-1 in 4 games (first year)")
		expect(tape.find((r) => r.label === "Head coach against head coach")!.a).toBe("Have not met")
		expect(tape.find((r) => r.label === "Coming off a bye")!.a).toBe("none yet")
	})
	it("has nothing to show when a team has no coach on file", () => {
		const data = fakeUnits()
		data.teams.AAA.coach = null
		expect(coachTape("AAA", "BBB", data)).toEqual([])
	})
})
