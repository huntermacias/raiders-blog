import { describe, expect, it } from "vitest"

import { flagSeason, getFlagFiles, getRoster, hubSlice, playerIdOf, rosterFor } from "../../lib/lab/flagsData"
import {
	type Flag,
	NO_FILTER,
	TAG_ORDER,
	applyFilter,
	byDown,
	byGame,
	byType,
	clockText,
	costText,
	costliest,
	culpritText,
	downText,
	isTurnoverLike,
	latestCostly,
	marginText,
	newest,
	playOf,
	playerRows,
	rankOf,
	resultLine,
	teamRows,
	totals,
	turnoversText,
	versus,
} from "../../lib/lab/flagsKit"
import { TEAMS } from "../../lib/nfl"
import { flag } from "../helpers/flags"

describe("wording", () => {
	it("spells down and distance, the clock, the margin and the game", () => {
		expect(downText(4, 5)).toBe("4th & 5")
		expect(downText(1, 10)).toBe("1st & 10")
		expect(downText(null, null)).toBe("No down")
		expect(clockText({ q: 3, tm: "08:12" })).toBe("Q3 8:12")
		expect(clockText({ q: 5, tm: "10:00" })).toBe("OT 10:00")
		expect(marginText(0)).toBe("tied")
		expect(marginText(7)).toBe("up 7")
		expect(marginText(-3)).toBe("down 3")
		expect(versus({ hm: 1, o: "KC" })).toBe("vs KC")
		expect(versus({ hm: 0, o: "KC" })).toBe("at KC")
	})

	it("shows a cost as points lost, with the sign from the committing team's side", () => {
		expect(costText(2.94)).toBe("-2.9 pts")
		expect(costText(-1.2)).toBe("+1.2 pts")
		expect(costText(0)).toBe("0.0 pts")
		expect(turnoversText(4.4)).toBe("1.0 turnover")
		expect(turnoversText(8.8)).toBe("2.0 turnovers")
	})

	it("says what a flag did from the side that committed it", () => {
		expect(resultLine(flag({ np: 1, yds: 10, u: "offense" }))).toBe("Lost 10 yards and replayed the down")
		expect(resultLine(flag({ np: 0, yds: 15, u: "defense", au: 1 }))).toBe("Gave the offense 15 yards and a first down")
		expect(resultLine(flag({ np: 1, yds: 5, u: "defense", au: 0 }))).toBe("Gave the offense 5 yards")
		expect(resultLine(flag({ tg: ["gift", "big"], u: "defense", dn: 4 }))).toMatch(/first down on 4th down/)
		expect(resultLine(flag({ tg: ["wipedTouchdown"] }))).toMatch(/own touchdown/)
		expect(resultLine(flag({ tg: ["wipedTurnover"] }))).toMatch(/own takeaway/)
	})

	it("names who got the flag: a player, a quarterback or the team and its coaches", () => {
		expect(culpritText(flag())).toBe("A.Player")
		expect(culpritText(flag({ ck: "qb", pn: "D.Carr" }))).toBe("D.Carr (quarterback)")
		expect(culpritText(flag({ ck: "team", pid: null, pn: null }))).toBe("Team and coaches")
	})
})

describe("sums", () => {
	const flags = [
		flag({ c: 1, yds: 5, dn: 1 }),
		flag({ c: 3, yds: 15, dn: 4, tg: ["gift", "big"], u: "defense" }),
		flag({ c: 0.5, yds: 5, dn: null, yd: null, tg: [], ty: "Illegal Formation" }),
		flag({ c: 2, yds: 10, dn: 4, tg: ["wipedTouchdown"], ty: "Offensive Holding" }),
	]

	it("adds flags, yards, cost and the turnover-like ones", () => {
		const t = totals(flags)
		expect(t).toMatchObject({ flags: 4, yards: 35, cost: 6.5, costly: 2, gifts: 1, wipedTouchdowns: 1, wipedTurnovers: 0, big: 1, costlyCost: 5 })
		expect(totals([])).toMatchObject({ flags: 0, cost: 0, costly: 0 })
	})

	it("groups by down, always five rows with kicks last", () => {
		const d = byDown(flags)
		expect(d.map((r) => r.label)).toEqual(["1st", "2nd", "3rd", "4th", "Kicks"])
		expect(d.map((r) => r.flags)).toEqual([1, 0, 0, 2, 1])
		expect(d[3]).toMatchObject({ cost: 5, costly: 2 })
	})

	it("groups by penalty, the costliest first, and by game in week order", () => {
		expect(byType(flags)[0]).toMatchObject({ label: "Offensive Holding", flags: 3 })
		const g = byGame([flag({ g: "2026_02_A_B", w: 2, hm: 0, o: "DEN" }), flag({ g: "2026_01_A_B", w: 1 })])
		expect(g.map((r) => r.label)).toEqual(["Wk 1 vs KC", "Wk 2 at DEN"])
	})

	it("ranks players by cost and leaves team flags to the team", () => {
		const roster = { "00-1": { n: "A Player", t: "LV", p: "OL", s: "a-player" }, "00-2": { n: "B Player", t: "LV", p: "QB", s: "b-player" } }
		const list = [flag({ pid: "00-1", c: 1 }), flag({ pid: "00-2", c: 2, ck: "qb", ty: "Delay of Game" }), flag({ pid: "00-1", c: 0.5, dn: 4 }), flag({ ck: "team", pid: null, pn: null, c: 9 })]
		const rows = playerRows(list, roster)
		expect(rows.map((r) => r.key)).toEqual(["00-2", "00-1"])
		expect(rows[0]).toMatchObject({ label: "B Player", slug: "b-player", delay: 1, kind: "qb", pos: "QB" })
		expect(rows[1]).toMatchObject({ flags: 2, cost: 1.5, fourth: 1 })
	})

	it("lists every team, even one with no flags, and ranks them", () => {
		const rows = teamRows([flag({ t: "LV", c: 2 }), flag({ t: "KC", c: 5, ck: "team", pid: null })], ["LV", "KC", "DEN"])
		expect(rows.map((r) => r.team)).toEqual(["KC", "LV", "DEN"])
		expect(rows[0].teamFlags).toBe(1)
		expect(rankOf(rows, "LV")).toBe(2)
		expect(rankOf(rows, "XX")).toBe(0)
	})

	it("sorts the feeds: costliest by cost, latest by when, costly only", () => {
		const list = [flag({ w: 1, c: 5, tg: ["big"] }), flag({ w: 3, c: 0.2 }), flag({ w: 2, c: 3, tg: ["gift"] }), flag({ w: 4, c: 1, tg: ["wipedTurnover"] })]
		expect(costliest(list, 2).map((f) => f.c)).toEqual([5, 3])
		expect(latestCostly(list, 5).map((f) => f.w)).toEqual([4, 2, 1])
		expect(newest(list).map((f) => f.w)).toEqual([4, 3, 2, 1])
		expect(isTurnoverLike(list[1])).toBe(false)
	})

	it("breaks ties inside a game by the play number, not by text", () => {
		const a = flag({ id: "2026_01_A_B-99" })
		const b = flag({ id: "2026_01_A_B-1000" })
		expect(playOf(b)).toBe(1000)
		expect(newest([a, b])[0]).toBe(b)
	})

	it("filters by down, kicks, costly and penalty", () => {
		expect(applyFilter(flags, { ...NO_FILTER, down: 4 })).toHaveLength(2)
		expect(applyFilter(flags, { ...NO_FILTER, down: 0 })).toHaveLength(1)
		expect(applyFilter(flags, { ...NO_FILTER, costlyOnly: true })).toHaveLength(2)
		expect(applyFilter(flags, { ...NO_FILTER, type: "Illegal Formation" })).toHaveLength(1)
		expect(applyFilter(flags, NO_FILTER)).toHaveLength(4)
	})
})

describe("the flags files", () => {
	const files = getFlagFiles()
	const abbrs = new Set(TEAMS.map((t) => t.abbr))

	it("has a file per season, newest first", () => {
		expect(files.length).toBeGreaterThanOrEqual(2)
		expect(files.map((f) => f.season)).toEqual([...files.map((f) => f.season)].sort((a, b) => b - a))
		expect(flagSeason(files[0].season)).toBe(files[0])
	})

	for (const f of files) {
		it(`${f.season}: every flag is whole, on a real team, with a player we can name`, () => {
			expect(f.flags.length).toBeGreaterThan(500)
			const ids = new Set<string>()
			for (const x of f.flags) {
				expect(ids.has(x.id), x.id).toBe(false)
				ids.add(x.id)
				expect(abbrs.has(x.t), x.id).toBe(true)
				expect(abbrs.has(x.o), x.id).toBe(true)
				expect(x.t).not.toBe(x.o)
				expect(Number.isFinite(x.c), x.id).toBe(true)
				expect(x.w).toBeGreaterThanOrEqual(1)
				expect(x.w).toBeLessThanOrEqual(f.week)
				expect(x.tg.every((t) => TAG_ORDER.includes(t))).toBe(true)
				// Only a delay of game goes to a quarterback, and a team flag names nobody.
				if (x.ck === "qb") expect(x.ty).toBe("Delay of Game")
				if (x.ck === "team") expect(x.pid).toBeNull()
				else expect(x.pid, x.id).toBeTruthy()
				if (x.pid) expect(f.players[x.pid], x.id).toBeTruthy()
				// The "big" mark is exactly the cost at 60% of a turnover.
				expect(x.tg.includes("big"), `${x.id} ${x.c}`).toBe(x.c >= f.bigShare * f.turnoverCost)
				// A gift is a flag by the defending team (its defense or its kicking-down unit) on fourth down that gave a first down.
				if (x.tg.includes("gift")) {
					expect(["defense", "special"]).toContain(x.u)
					expect([x.dn, x.au]).toEqual([4, 1])
				}
			}
		})
	}

	it("keeps the coaching flags off the players", () => {
		for (const x of files.flatMap((f) => f.flags)) {
			if (/Too Many Men|Illegal Substitution/.test(x.ty)) expect(x.ck, x.id).toBe("team")
		}
	})

	it("gives every flagged player one page name, and every page name one player", () => {
		const r = getRoster()
		const slugs = Object.values(r.byId).map((p) => p.s)
		expect(new Set(slugs).size).toBe(slugs.length)
		for (const [slug, id] of Object.entries(r.bySlug)) expect(r.byId[id].s).toBe(slug)
		expect(playerIdOf("no-such-player")).toBeUndefined()
		for (const x of files.flatMap((f) => f.flags)) if (x.pid) expect(r.byId[x.pid], x.id).toBeTruthy()
	})

	it("cuts a hub slice that is small enough to send to the browser", () => {
		const s = hubSlice(files[0])
		expect(s.teams).toHaveLength(32)
		expect(s.players.length).toBeLessThanOrEqual(150)
		expect(s.latest.length).toBeLessThanOrEqual(30)
		expect(s.latest.every(isTurnoverLike)).toBe(true)
		expect(JSON.stringify(s).length).toBeLessThan(200_000)
		const some = rosterFor(s.worst)
		for (const x of s.worst) if (x.pid) expect(some[x.pid]).toBeTruthy()
	})
})
