import { describe, expect, it } from "vitest"

import { recordTiers } from "@/lib/playoffs/standings"
import { DIVISION_PROCEDURE, type TieDecision, breakDivisionTie, breakWildCardTie, pickBest, stepById, supportedSteps } from "@/lib/playoffs/tiebreakers"
import { TINY, beat, played, scheduled, seasonOf, tied } from "./fixtures"

function division(games: ReturnType<typeof beat>[], teams: string[]) {
	const decisions: TieDecision[] = []
	const order = breakDivisionTie(seasonOf(games), teams, decisions)
	return { order, decisions }
}

function wildCard(games: ReturnType<typeof beat>[], teams: string[]) {
	const decisions: TieDecision[] = []
	const order = breakWildCardTie(seasonOf(games), teams, decisions)
	return { order, decisions }
}

describe("division ties, two teams", () => {
	it("goes to the team that won the head-to-head", () => {
		const { order, decisions } = division([beat("A1", "A2"), beat("B1", "A1"), beat("A2", "C1")], ["A2", "A1"])
		expect(order).toEqual(["A1", "A2"])
		expect(decisions[0]).toMatchObject({ kind: "division", placed: "A1", over: ["A2"], step: "head-to-head" })
	})

	it("goes to division record when the teams split their games", () => {
		const games = [beat("A1", "A2"), beat("A2", "A1"), beat("A1", "A3"), beat("A2", "B1")]
		const { order, decisions } = division(games, ["A1", "A2"])
		expect(order[0]).toBe("A1")
		expect(decisions[0].step).toBe("division-record")
	})

	it("goes to common games after head-to-head and division record are level", () => {
		const games = [beat("A1", "A2"), beat("A2", "A1"), beat("A1", "B1"), beat("D1", "A1"), beat("B1", "A2"), beat("A2", "C1")]
		const { order, decisions } = division(games, ["A2", "A1"])
		expect(order).toEqual(["A1", "A2"])
		expect(decisions[0].step).toBe("common-games")
	})

	it("goes to conference record when common games are level too", () => {
		// Both lost to N1, the only common opponent. A1 went 2-1 in the conference and A2 went 1-1.
		const games = [beat("A1", "A2"), beat("A2", "A1"), beat("A1", "B1"), beat("N1", "A1"), beat("N1", "A2"), beat("A2", "N2")]
		const { order, decisions } = division(games, ["A2", "A1"])
		expect(order).toEqual(["A1", "A2"])
		expect(decisions[0].step).toBe("conference-record")
	})

	it("goes to strength of victory when no earlier step separates them", () => {
		// No common opponents, equal conference records. A1 beat B1 (who went on to win two more); A2 beat C1 (who lost).
		const games = [beat("A1", "A2"), beat("A2", "A1"), beat("A1", "B1"), beat("D3", "A1"), beat("A2", "C1"), beat("D4", "A2"), beat("B1", "D1"), beat("B1", "D2")]
		const { order, decisions } = division(games, ["A1", "A2"])
		expect(order).toEqual(["A1", "A2"])
		expect(decisions[0].step).toBe("strength-of-victory")
	})

	it("goes to strength of schedule when strength of victory is level", () => {
		const games = [beat("A1", "A2"), beat("A2", "A1"), beat("B1", "A1"), beat("C1", "A2"), beat("B1", "D1")]
		const { order, decisions } = division(games, ["A2", "A1"])
		expect(order).toEqual(["A1", "A2"])
		expect(decisions[0].step).toBe("strength-of-schedule")
	})

	it("treats a tie as half a win and half a loss", () => {
		const season = seasonOf([beat("A1", "B1"), tied("A1", "B2"), beat("A2", "B3"), beat("A2", "B4"), beat("A2", "C1"), beat("C2", "A2")])
		// A1 is 1-0-1 and A2 is 3-1: both .750, so they share a tier. A2 at 3-1 is not better than A1 at 1-0-1.
		expect(recordTiers(season, ["A1", "A2"])).toEqual([["A1", "A2"]])
		expect(season.records.get("A1")?.overall).toEqual({ w: 1, l: 0, t: 1 })
	})
})

describe("division ties, three teams", () => {
	it("uses the record among the three first, then starts again for the two that are left", () => {
		// A1 beat both others, A2 beat A3. Everyone is 2-2 overall.
		const games = [beat("A1", "A2"), beat("A1", "A3"), beat("A2", "A3"), beat("B1", "A1"), beat("C1", "A1"), beat("A2", "B2"), beat("D1", "A2"), beat("A3", "C2"), beat("A3", "C3")]
		const { order, decisions } = division(games, ["A3", "A2", "A1"])
		expect(order).toEqual(["A1", "A2", "A3"])
		expect(decisions.map((d) => [d.placed, d.step])).toEqual([
			["A1", "head-to-head"],
			["A2", "head-to-head"],
		])
	})

	it("is not the same as breaking two-team ties one after another", () => {
		// A circle: A1 beat A2, A2 beat A3, A3 beat A1. Head-to-head is level, so the division record decides, which
		// drops A3. A1 and A2 are then two teams again, and A1 won that game.
		const games = [beat("A1", "A2"), beat("A2", "A3"), beat("A3", "A1"), beat("A1", "A4"), beat("A2", "A4"), beat("A4", "A3")]
		const { order, decisions } = division(games, ["A3", "A2", "A1"])
		expect(order).toEqual(["A1", "A2", "A3"])
		// The three-team steps are level or drop A3; the step that finally names A1 is the two-team head-to-head.
		expect(decisions[0]).toMatchObject({ placed: "A1", step: "head-to-head" })
		expect([...decisions[0].over].sort()).toEqual(["A2", "A3"])
	})
})

describe("wild-card ties, two teams", () => {
	it("uses head-to-head first when they played", () => {
		const { order, decisions } = wildCard([beat("A1", "B1"), beat("C1", "A1"), beat("B1", "C2")], ["B1", "A1"])
		expect(order).toEqual(["A1", "B1"])
		expect(decisions[0]).toMatchObject({ kind: "wildcard", step: "head-to-head" })
	})

	it("uses conference record when they did not play each other", () => {
		const games = [beat("A1", "N1"), beat("C1", "A1"), beat("B1", "C2"), beat("N2", "B1")]
		const { order, decisions } = wildCard(games, ["A1", "B1"])
		expect(order).toEqual(["B1", "A1"])
		expect(decisions[0].step).toBe("conference-record")
	})

	it("skips common games unless there are at least four of them", () => {
		// A1 and B1 are 3-3 in the conference. They share three opponents (C1-C3), where A1 won all and B1 lost all. With
		// a minimum of four the step does not count, so strength of victory decides instead.
		const games = [
			...["C1", "C2", "C3"].map((c) => beat("A1", c)),
			...["D1", "D2", "D3"].map((d) => beat(d, "A1")),
			...["C1", "C2", "C3"].map((c) => beat(c, "B1")),
			...["D4", "A2", "A3"].map((o) => beat("B1", o)),
		]
		const { order, decisions } = wildCard(games, ["B1", "A1"])
		expect(decisions[0].step).not.toBe("common-games")
		expect(decisions[0].step).toBe("strength-of-victory")
		expect(order).toEqual(["A1", "B1"])
	})

	it("counts common games once there are four", () => {
		// Same as above with a fourth shared opponent, and the conference records kept level.
		const games = [
			...["C1", "C2", "C3", "C4"].map((c) => beat("A1", c)),
			...["D1", "D2", "D3", "D4"].map((d) => beat(d, "A1")),
			...["C1", "C2", "C3", "C4"].map((c) => beat(c, "B1")),
			...["A2", "A3", "A4", "B2"].map((o) => beat("B1", o)),
		]
		const { order, decisions } = wildCard(games, ["B1", "A1"])
		expect(decisions[0].step).toBe("common-games")
		expect(order).toEqual(["A1", "B1"])
	})
})

describe("wild-card ties, three or more teams", () => {
	it("is decided by a head-to-head sweep when one team beat the others", () => {
		const games = [beat("A1", "B1"), beat("A1", "C1"), beat("B1", "C1")]
		const { order, decisions } = wildCard(games, ["C1", "B1", "A1"])
		expect(order).toEqual(["A1", "B1", "C1"])
		expect(decisions[0]).toMatchObject({ placed: "A1", step: "head-to-head-sweep" })
	})

	it("drops a team that lost to each of the others, then breaks the other two on their own", () => {
		// A1 lost to B1 and C1. B1 and C1 did not play, so conference record separates them.
		const games = [beat("B1", "A1"), beat("C1", "A1"), beat("B1", "D1"), beat("D2", "C1")]
		const { order, decisions } = wildCard(games, ["A1", "B1", "C1"])
		expect(order).toEqual(["B1", "C1", "A1"])
		expect(decisions[0]).toMatchObject({ placed: "B1", step: "conference-record" })
	})

	it("does not use a sweep when there is no sweep", () => {
		// A1 beat B1, B1 beat C1, C1 beat A1: nobody swept anybody. Conference record settles it.
		const games = [beat("A1", "B1"), beat("B1", "C1"), beat("C1", "A1"), beat("A1", "D1"), beat("A1", "D2"), beat("B1", "D3"), beat("D4", "C1")]
		const { decisions } = wildCard(games, ["A1", "B1", "C1"])
		expect(decisions[0].step).toBe("conference-record")
		expect(decisions[0].placed).toBe("A1")
	})

	it("breaks a tie inside one division first, and only that division's best team goes up against the rest", () => {
		// A1 beat A2 so A1 is the best A team. A2 has a better conference record than B1, and B1 has a better one than A1.
		// Treated as one three-way tie, A2 would come first. By the rules, A1 is the A candidate and loses to B1.
		const games = [
			beat("A1", "A2"),
			beat("C1", "A1"),
			beat("A2", "C2"),
			beat("A2", "C3"),
			beat("A2", "C4"),
			beat("B1", "D1"),
			beat("B1", "D2"),
			beat("D3", "B1"),
		]
		const { order, decisions } = wildCard(games, ["A2", "B1", "A1"])
		expect(order).toEqual(["B1", "A1", "A2"])
		expect(decisions).toContainEqual(expect.objectContaining({ kind: "division", placed: "A1", over: ["A2"], step: "head-to-head" }))
	})
})

describe("ties no step can break", () => {
	it("is flagged as unresolved, in a fixed order, and never pretends a step decided it", () => {
		// One game is still to be played, so this is a projection and has no scores.
		const season = seasonOf([beat("A1", "B1"), beat("A2", "B2"), scheduled("C1", "C2")])
		const decisions: TieDecision[] = []
		const order = breakDivisionTie(season, ["A2", "A1"], decisions)
		expect(order).toEqual(["A1", "A2"])
		expect(decisions[0]).toMatchObject({ step: "unresolved", placed: "A1", stillTied: ["A1", "A2"] })
		// The next steps need scores, and a projection with open games has none.
		expect(decisions[0].blockedBy).toBe("conference-points-rank")
	})

	it("runs through the points steps in a finished season and stops only at net touchdowns", () => {
		const season = seasonOf([beat("A1", "B1"), beat("A2", "B2")])
		const decisions: TieDecision[] = []
		breakDivisionTie(season, ["A1", "A2"], decisions)
		expect(decisions[0]).toMatchObject({ step: "unresolved", blockedBy: "net-touchdowns" })
	})

	it("gives the same answer whatever order the teams come in", () => {
		const season = seasonOf([beat("A1", "B1"), beat("A2", "B2"), beat("A3", "B3")])
		const a = breakDivisionTie(season, ["A3", "A1", "A2"])
		const b = breakDivisionTie(season, ["A2", "A3", "A1"])
		expect(a).toEqual(b)
	})

	it("says plainly which steps a projection can and cannot apply", () => {
		const steps = supportedSteps()
		expect(steps.find((s) => s.id === "strength-of-victory")?.inProjection).toBe(true)
		expect(steps.find((s) => s.id === "net-points-all")?.inProjection).toBe(false)
		expect(steps.find((s) => s.id === "net-touchdowns")?.needs).toBe("touchdowns")
	})
})

describe("the points steps, once a whole season has been played", () => {
	// Four teams play a double round robin. The records are written so each step has something to separate.
	const finished = (extra: ReturnType<typeof played>[]) => seasonOf(extra, TINY)

	it("knows a finished season has scores and a season with open games does not", () => {
		const done = finished([played("X1", "X2", 20, 10)])
		expect(done.scoresKnown).toBe(true)
		expect(seasonOf([played("X1", "X2", 20, 10), scheduled("X2", "X1")], TINY).scoresKnown).toBe(false)
	})

	it("ranks teams by points scored and points allowed together", () => {
		// Every team is 1-1. X1 scores most and allows least; Y2 is the opposite.
		const season = finished([
			played("X1", "X2", 40, 10),
			played("X2", "X1", 27, 24),
			played("Y1", "Y2", 30, 20),
			played("Y2", "Y1", 21, 10),
			played("X1", "Y1", 14, 13),
			played("Y2", "X2", 6, 33),
		])
		// X1 has the most points scored (78) and the fewest allowed (50); Y2 has the fewest scored and the most allowed.
		const step = stepById("conference-points-rank")
		const result = step.apply(season, ["X1", "Y2"])
		expect(result).toEqual({ kind: "keep", teams: ["X1"] })
	})

	it("uses net points in all games", () => {
		const season = finished([played("X1", "Y1", 30, 3), played("X2", "Y2", 17, 16)])
		const result = stepById("net-points-all").apply(season, ["X1", "X2"])
		expect(result).toEqual({ kind: "keep", teams: ["X1"] })
	})

	it("uses net points in conference games for wild-card ties", () => {
		const season = finished([played("X1", "Y1", 30, 3), played("X2", "Y2", 17, 16)])
		expect(stepById("net-points-conference").apply(season, ["X1", "X2"])).toEqual({ kind: "keep", teams: ["X1"] })
	})

	it("is unavailable in a projection, and net touchdowns are never available", () => {
		const projected = seasonOf([played("X1", "Y1", 30, 3), scheduled("X2", "Y2")], TINY)
		expect(stepById("net-points-all").apply(projected, ["X1", "X2"])).toEqual({ kind: "unavailable" })
		const done = finished([played("X1", "Y1", 30, 3)])
		expect(stepById("net-touchdowns").apply(done, ["X1", "X2"])).toEqual({ kind: "unavailable" })
	})

	it("blocks at net touchdowns, not earlier, when every other step is level", () => {
		// All six games tied: every record, strength and points total is level.
		const season = finished([tied("X1", "X2", 1, 10), tied("X1", "Y1", 1, 20), tied("X1", "Y2", 1, 30), tied("X2", "Y1", 1, 40), tied("X2", "Y2", 1, 50), tied("Y1", "Y2", 1, 60)])
		const pick = pickBest(season, ["X1", "X2"], DIVISION_PROCEDURE)
		expect(pick.step).toBe("unresolved")
		expect(pick.blockedBy).toBe("net-touchdowns")
	})
})
