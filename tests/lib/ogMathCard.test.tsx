import { describe, expect, it } from "vitest"

import { buildOdds, buildReport, plainOdds } from "../../lib/math/report"
import type { MathReport } from "../../lib/math/report"
import { buildMathSpec, lift, renderMathCard } from "../../lib/og/mathCard"
import { renderCard } from "../../lib/og/cards"
import { buildBoards } from "../../lib/rankings"
import { TEAMS } from "../../lib/nfl"
import { schedule } from "../stubs/seasonSchedule"

const games = schedule(4)
const names = TEAMS.map((t) => t.name)
const boards = buildBoards([3, 4].map((week) => ({ _id: `w${week}`, season: 2026, week, teams: names.map((team) => ({ team, note: null })) })))
const report: MathReport = buildReport(boards, games, 4, buildOdds(games, 4), {}, plainOdds(games, 4))

describe("buildMathSpec", () => {
	it("defaults to the Raiders", () => {
		const spec = buildMathSpec(report)!
		const lv = report.teams.find((t) => t.abbr === "LV")!
		expect(spec).toMatchObject({ type: "math", kind: "team", abbr: "LV", nick: "Raiders", week: 4, blogger: lv.blogger, math: lv.math, gap: lv.gap })
		expect(spec.record).toBe(`${lv.record.w}–${lv.record.l}`)
		expect(spec.playoffs).toMatch(/%$/)
		expect(spec.winsPct).toHaveLength(18)
		expect(spec.remaining).toBe(lv.odds!.remaining)
		expect(spec.next).toMatchObject({ week: lv.upcoming[0].week, home: lv.upcoming[0].home })
		expect(spec.plainPlayoffs).toMatch(/%$/)
	})

	it("builds a team card for any team, in any case", () => {
		expect(buildMathSpec(report, { team: "kc" })).toMatchObject({ kind: "team", abbr: "KC", nick: "Chiefs" })
	})

	it("builds a disagreement card with a verdict in the right direction", () => {
		const higher = report.teams.find((t) => t.gap < 0)!
		const lower = report.teams.find((t) => t.gap > 0)!
		expect(buildMathSpec(report, { take: higher.abbr })).toMatchObject({ kind: "take", headline: `The math loves the ${higher.nick} more than I do.` })
		expect(buildMathSpec(report, { take: lower.abbr })!.headline).toBe(`The math doesn’t believe in the ${lower.nick}.`)
	})

	it("lets a team win over a take", () => {
		expect(buildMathSpec(report, { team: "DEN", take: "KC" })).toMatchObject({ kind: "team", abbr: "DEN" })
	})

	it("returns null for an abbreviation that isn't a team, and ignores a value that isn't an abbreviation at all", () => {
		expect(buildMathSpec(report, { team: "ZZZ" })).toBeNull()
		expect(buildMathSpec(report, { take: "ZZZ" })).toBeNull()
		expect(buildMathSpec(report, { team: "../etc" })).toMatchObject({ abbr: "LV" })
	})

	it("leaves the odds tiles out when there is no simulation", () => {
		const bare = buildReport(boards, games, 4, null)
		const spec = buildMathSpec(bare)!
		expect(spec.playoffs).toBeNull()
		expect(spec.winsPct).toBeNull()
	})

	it("adds a box-score sentence when scoring and yards disagree, or turnovers stand out", () => {
		const t = (under: NonNullable<MathReport["teams"][number]["under"]>): MathReport => ({ ...report, teams: report.teams.map((x) => (x.abbr === "LV" ? { ...x, under } : x)) })
		const base = { games: 4, netYpp: 0, adj: 0 }
		expect(buildMathSpec(t({ ...base, margin: 9, yardageMargin: 2, turnoverMargin: 0 }), { take: "LV" })!.insight).toBe("Winning by +9.0 a game on the scoreboard, but only +2.0 by yards per play.")
		expect(buildMathSpec(t({ ...base, margin: -1, yardageMargin: 5, turnoverMargin: 0 }))!.insight).toBe("Only −1.0 a game on the scoreboard, but +5.0 by yards per play.")
		expect(buildMathSpec(t({ ...base, margin: 3, yardageMargin: 3.5, turnoverMargin: -1.5 }))!.insight).toBe("Turnover margin of −1.5 a game.")
		expect(buildMathSpec(t({ ...base, margin: 3, yardageMargin: 3.5, turnoverMargin: 0.2 }))!.insight).toBeNull()
		expect(buildMathSpec(t({ ...base, games: 1, margin: 9, yardageMargin: 0, turnoverMargin: 3 }))!.insight).toBeNull()
	})
})

describe("rendering", () => {
	it.each([[{}], [{ team: "KC" }], [{ take: "DEN" }]])("makes a card element for %j through renderCard", (opts) => {
		const spec = buildMathSpec(report, opts)!
		expect(renderMathCard(spec)).toBeTruthy()
		expect(renderCard(spec)).toBeTruthy()
	})
})

describe("lift", () => {
	it("leaves bright team colors alone and brightens dark ones so they show on a dark card", () => {
		expect(lift("#FFB612")).toBe("#ffb612")
		const dark = lift("#241773")
		expect(dark).not.toBe("#241773")
		expect(parseInt(dark.slice(1, 3), 16)).toBeGreaterThan(0x24)
		expect(lift("not a color")).toBe("#a7aeb3")
	})
})
