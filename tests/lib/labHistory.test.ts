import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { getHistory, getScouting } from "../../lib/lab/data"
import { MAX_GAMES, MIN_GAMES, MIN_SIMILAR, STAT_DEFS, buildTables, getHistoryView, getStory, pickStandouts, recordStory, statDef } from "../../lib/lab/history"
import type { HistoryData } from "../../lib/lab/history"
import { DEFAULT_FILTER, analyze, checklist, fifthsOf, formatStat, isRaiders, ordinalOf, outcomesFor, recordText, seasonGames, seasonLine, teamLabel, teamName, winsLine } from "../../lib/lab/historyKit"
import type { Meta, Table } from "../../lib/lab/historyKit"
import { fakeLeague } from "../helpers/historyFake"

const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

describe("the stat catalog", () => {
	it("says whether higher is better the same way the scouting ranks do", () => {
		const teams = Object.values(getScouting().teams)
		for (const def of STAT_DEFS.filter((d) => d.stat !== null)) {
			const side = def.side as "off" | "def"
			const ranked = teams.flatMap((t) => (t[side][def.stat!] ? [t[side][def.stat!]!] : []))
			const first = ranked.find((m) => m.rank === 1)!
			const best = def.higherIsBetter ? Math.max(...ranked.map((m) => m.v)) : Math.min(...ranked.map((m) => m.v))
			expect(first.v, def.key).toBe(best)
		}
	})

	it("has a unique key per stat, found by statDef, with the worked-out ones marked net", () => {
		expect(new Set(STAT_DEFS.map((d) => d.key)).size).toBe(STAT_DEFS.length)
		expect(statDef("def.turnovers")?.label).toBe("Takeaways")
		expect(statDef("net.points")?.stat).toBeNull()
		expect(STAT_DEFS.filter((d) => d.side === "net")).toHaveLength(2)
		expect(statDef("nope")).toBeUndefined()
	})
})

describe("history.json", () => {
	const h = getHistory()
	it("lines every list up with the team list", () => {
		expect(h.scale).toBe(1000)
		expect(h.po).toHaveLength(h.teams.length)
		expect(h.wins).toHaveLength(h.teams.length)
		expect(h.losses).toHaveLength(h.teams.length)
		expect([...h.stats].sort()).toEqual(STAT_DEFS.filter((d) => d.stat !== null).map((d) => d.key).sort())
		for (let n = MIN_GAMES; n <= MAX_GAMES; n++) {
			const b = h.n[String(n)]
			expect(b, `n=${n}`).toBeTruthy()
			expect(b.w).toHaveLength(h.teams.length)
			expect(b.l).toHaveLength(h.teams.length)
			for (const k of h.stats) {
				expect(b.s[k]).toHaveLength(h.teams.length)
				expect(b.r[k]).toHaveLength(h.teams.length)
			}
		}
	})

	it("covers every season from 1999 on, with the Raiders in each one", () => {
		expect(h.first).toBe(1999)
		expect(h.last).toBeGreaterThanOrEqual(2025)
		expect(h.teams.length).toBeGreaterThan(800)
		expect(h.teams.filter(isRaiders).length).toBe(h.last - h.first + 1)
		for (let i = 0; i < h.teams.length; i++) {
			const g = seasonGames(Number(h.teams[i].split(" ")[0]))
			expect(h.wins[i] + h.losses[i], h.teams[i]).toBeLessThanOrEqual(g)
			expect(h.wins[i] + h.losses[i], h.teams[i]).toBeGreaterThanOrEqual(g - 2)
		}
	})

	it("has the Raiders' playoff years right", () => {
		const made = (y: number) => h.po[h.teams.indexOf(`${y} LV`)]
		for (const y of [2000, 2001, 2002, 2016, 2021]) expect(made(y), String(y)).toBe(1)
		for (const y of [2003, 2010, 2017, 2022]) expect(made(y), String(y)).toBe(0)
		// The 2016 Raiders went 12-4 and the 2021 team 10-7.
		expect([h.wins[h.teams.indexOf("2016 LV")], h.losses[h.teams.indexOf("2016 LV")]]).toEqual([12, 4])
		expect([h.wins[h.teams.indexOf("2021 LV")], h.losses[h.teams.indexOf("2021 LV")]]).toEqual([10, 7])
	})

	it("measures sensible numbers", () => {
		const k = h.scale
		const avg = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null).reduce((a, b) => a + b, 0) / xs.filter((x) => x !== null).length / k
		// Takeaways are about one and a half a game, and the league's points per pass hover near zero.
		expect(avg(h.n["4"].s["def.turnovers"])).toBeGreaterThan(1.2)
		expect(avg(h.n["4"].s["def.turnovers"])).toBeLessThan(1.8)
		expect(Math.abs(avg(h.n["4"].s["off.epaPass"]))).toBeLessThan(0.1)
		// Teams score about 21 points a game, and nobody wins more games than they play.
		expect(avg(h.n["4"].s["off.points"])).toBeGreaterThan(18)
		expect(avg(h.n["4"].s["off.points"])).toBeLessThan(25)
		expect(Math.max(...h.wins)).toBeLessThanOrEqual(17)
	})
})

describe("analyze", () => {
	it("finds the teams that started at least as high, and how far they drifted back", () => {
		const { meta, table } = fakeLeague(400, 0.2)
		const s = analyze(meta, table, 2026)!
		const group = s.rows.filter((r) => r.inGroup)
		expect(s.kind).toBe("atLeast")
		expect(group.every((r) => r.start >= 2.4)).toBe(true)
		expect(s.groupSize).toBe(group.length)
		expect(s.rows).toHaveLength(400)
		expect(s.kept).toBeCloseTo(0.2, 1)
		expect(s.verdict.id).toBe("fade")
		expect(s.good).toBe(true)
		expect(s.toward).toBeGreaterThan(0.9)
		expect(s.base).toBeCloseTo(2, 1)
		expect(s.typical).toBeCloseTo(2 + 0.2 * 0.4, 1)
		expect(s.band[0]).toBeLessThan(s.band[1])
		expect(s.domain[0]).toBeLessThan(Math.min(...s.rows.map((r) => r.rest), s.value))
		expect(s.domain[1]).toBeGreaterThan(Math.max(...s.rows.map((r) => r.start), s.value))
		expect(s.headline).toContain("at least as well as the 2026 Raiders at takeaways through 4 games")
		expect(s.earlier.count).toBeGreaterThan(0)
	})

	it("calls a low number that tends to recover 'likely to improve', and a lasting one 'likely to hold'", () => {
		const low = analyze(...args(fakeLeague(400, 0.2, { value: 1.4, rank: 30 })))!
		expect(low.good).toBe(false)
		expect(low.verdict.id).toBe("improve")
		expect(low.headline).toContain("at least as poorly")
		expect(analyze(...args(fakeLeague(400, 0.9)))!.verdict.id).toBe("hold")
		expect(analyze(...args(fakeLeague(400, 0.9, { value: 1.4, rank: 30 })))!.verdict.id).toBe("linger")
		expect(analyze(...args(fakeLeague(400, 0.6)))!.verdict.id).toBe("mixed")
	})

	it("reads 'good' the other way for a stat where lower is better", () => {
		const s = analyze(...args(fakeLeague(400, 0.2, { higherIsBetter: false, value: 1.4, rank: 2 })))!
		expect(s.good).toBe(true)
		expect(s.verdict.id).toBe("fade")
	})

	it("uses the closest teams when too few or too many started that extreme", () => {
		const few = analyze(...args(fakeLeague(400, 0.3, { value: 2.95 })))!
		expect(few.kind).toBe("closest")
		expect(few.groupSize).toBe(MIN_SIMILAR)
		expect(few.headline).toContain("closest to the 2026 Raiders")
		const many = analyze(...args(fakeLeague(1000, 0.3, { value: 1.6 })))!
		expect(many.kind).toBe("closest")
		expect(many.groupSize).toBeLessThanOrEqual(250)
	})

	it("returns null without enough data", () => {
		expect(analyze(...args(fakeLeague(50, 0.3)))).toBeNull()
		const { meta, table } = fakeLeague(400, 0.3)
		expect(analyze(meta, { ...table, start: table.start.map(() => null) }, 2026)).toBeNull()
	})

	it("keeps every team in the rows and only highlights the ones the filters pick", () => {
		const { meta, table } = fakeLeague(600, 0.3)
		const like = analyze(meta, table, 2026)!
		const all = analyze(meta, table, 2026, { ...DEFAULT_FILTER, scope: "all" })!
		expect(all.kind).toBe("all")
		expect(all.groupSize).toBe(600)
		expect(all.rows).toHaveLength(like.rows.length)
		expect(all.groupSize).toBeGreaterThan(like.groupSize)

		const made = analyze(meta, table, 2026, { ...DEFAULT_FILTER, scope: "all", playoffs: "made" })!
		expect(made.rows.filter((r) => r.inGroup).every((r) => r.po)).toBe(true)
		expect(made.groupSize).toBe(meta.po.filter(Boolean).length)
		expect(made.headline).toContain("that made the playoffs")
		const missed = analyze(meta, table, 2026, { ...DEFAULT_FILTER, scope: "all", playoffs: "missed" })!
		expect(made.groupSize + missed.groupSize).toBe(600)
		expect(missed.outcomes.playoffs).toBe(0)
		expect(made.outcomes.playoffs).toBe(1)

		const ne = analyze(meta, table, 2026, { scope: "all", team: "NE", playoffs: "any" })!
		expect(ne.rows.filter((r) => r.inGroup).every((r) => meta.teams[r.i].endsWith(" NE"))).toBe(true)
		expect(ne.headline).toContain("Patriots team-seasons")
		const lv = analyze(meta, table, 2026, { scope: "all", team: "LV", playoffs: "any" })!
		expect(lv.rows.filter((r) => r.raiders)).toHaveLength(15)
		expect(lv.headline).toContain("Raiders team-seasons")
	})

	it("says so when nothing matches, and keeps the rest of the numbers finite", () => {
		const { meta, table } = fakeLeague(400, 0.3)
		const s = analyze(meta, table, 2026, { scope: "all", team: "ZZZ", playoffs: "any" })!
		expect(s.groupSize).toBe(0)
		expect(s.headline).toMatch(/^No .* match these filters/)
		expect(s.winsLine).toBe("No team-seasons match these filters.")
		expect(s.rows).toHaveLength(400)
		expect(Number.isFinite(s.domain[0])).toBe(true)
		expect(Number.isFinite(s.typical)).toBe(true)
	})

	it("marks which dots moved toward average, made the playoffs and were Raiders teams", () => {
		const { meta, table } = fakeLeague(400, 0.2)
		const s = analyze(meta, table, 2026)!
		for (const r of s.rows) {
			expect(r.toward).toBe(Math.abs(r.rest - s.base) < Math.abs(r.start - s.base))
			expect(r.po).toBe(meta.po[r.i] === 1)
			expect(r.raiders).toBe(isRaiders(meta.teams[r.i]))
		}
	})
})

describe("outcomes in wins and playoffs", () => {
	// Three team-seasons: 3-1 start then 9-3 (12-4 in 2019), 1-3 then 3-9 (4-12 in 2019), and 2-2 then 6-7 (8-9 in 2021).
	const meta: Meta = { n: 4, first: 2019, last: 2021, teams: ["2019 AAA", "2019 BBB", "2021 CCC"], po: [1, 0, 0], wins: [12, 4, 8], losses: [4, 12, 9], startWins: [3, 1, 2], startLosses: [1, 3, 2] }

	it("counts games from the right season length", () => {
		expect(seasonGames(2019)).toBe(16)
		expect(seasonGames(2021)).toBe(17)
	})

	it("works out win rates before and after the cut, and playoff rates", () => {
		const o = outcomesFor(meta, [0, 1], [0, 1, 2])
		expect(o.startWin).toBeCloseTo(4 / 8)
		expect(o.restWin).toBeCloseTo((9 + 3) / 24)
		expect(o.restWins).toBeCloseTo(6)
		expect(o.restGames).toBeCloseTo(12)
		expect(o.playoffs).toBeCloseTo(0.5)
		expect(o.allRestWin).toBeCloseTo((9 + 3 + 6) / (12 + 12 + 13))
		expect(o.allPlayoffs).toBeCloseTo(1 / 3)
		expect(o.avgWins).toBeCloseTo(8)
	})

	it("says in words whether the win rate fell, rose or held, and how it compares", () => {
		const base = { startWin: 0.7, restWin: 0.55, restWins: 7, restGames: 13, playoffs: 0.5, allRestWin: 0.5, allPlayoffs: 0.39, avgWins: 9 }
		expect(winsLine(base, 4)).toBe("Their win rate fell from 70% in the first 4 games to 55% after, still above the average team's 50%. 50% made the playoffs, against 39% of all teams.")
		expect(winsLine({ ...base, startWin: 0.35, restWin: 0.44 }, 4)).toMatch(/rose from 35% in the first 4 games to 44% after, still below/)
		expect(winsLine({ ...base, startWin: 0.5, restWin: 0.5 }, 4)).toMatch(/stayed near 50%, about what the average team does/)
	})

	it("is attached to every story, in sentences a reader can use", () => {
		for (const s of getHistoryView()!.stories) {
			expect(s.outcomes.restWin).toBeGreaterThan(0.2)
			expect(s.outcomes.restWin).toBeLessThan(0.8)
			expect(s.outcomes.allRestWin).toBeGreaterThan(0.45)
			expect(s.outcomes.allRestWin).toBeLessThan(0.55)
			expect(s.winsLine).toMatch(/made the playoffs, against \d+% of all teams\.$/)
		}
	})
})

describe("playoff rates by fifth, and the checklist", () => {
	const { meta, table } = fakeLeague(500, 0.3)

	it("splits teams into five equal groups, best first, and finds the Raiders' group", () => {
		const hi = fifthsOf(meta, table, 2.9)
		expect(hi.fifths).toHaveLength(5)
		expect(hi.raidersFifth).toBe(0)
		expect(fifthsOf(meta, table, 1.1).raidersFifth).toBe(4)
		expect(fifthsOf(meta, table, 2.0).raidersFifth).toBe(2)
		expect(hi.fifths.reduce((a, f) => a + f.teams, 0)).toBe(500)
		expect(hi.fifths[0].rate).toBeGreaterThan(hi.fifths[4].rate)
		expect(hi.fifths[0].lo).toBeGreaterThan(hi.fifths[1].hi - 0.01)
		// When lower is better, the best fifth is the lowest numbers.
		const low = fifthsOf(meta, { ...table, higherIsBetter: false }, 1.1)
		expect(low.raidersFifth).toBe(0)
		expect(low.fifths[0].hi).toBeLessThan(low.fifths[4].lo + 0.01)
	})

	it("puts the stats that separate playoff teams from the rest first", () => {
		const flat: Table = { ...table, key: "off.flat", label: "Flat", start: table.start.map((_, i) => 1 + ((i * 37) % 100) / 50) }
		const rows = checklist(meta, [flat, table])
		expect(rows.map((r) => r.key)).toEqual(["def.turnovers", "off.flat"])
		expect(rows[0].spread).toBeGreaterThan(rows[1].spread)
		expect(rows[0].rate).toBeGreaterThanOrEqual(0)
		expect(rows[0].rate).toBeLessThanOrEqual(1)
		expect(rows[0].valueText).toBe("2.40")
	})

	it("reads the real history the same way, best fifth above worst for scoring", () => {
		const v = getHistoryView()!
		const net = v.tables.find((t) => t.key === "net.points")!
		const { fifths } = fifthsOf(v.meta, net, net.value)
		expect(fifths[0].rate).toBeGreaterThan(0.6)
		expect(fifths[4].rate).toBeLessThan(0.15)
		expect(v.checklist.length).toBe(v.tables.length)
		expect(v.checklist.map((c) => c.spread)).toEqual(v.checklist.map((c) => c.spread).sort((a, b) => b - a))
	})
})

describe("seasonLine", () => {
	it("describes a team-season in one line, with both records and the playoff result", () => {
		const { meta, table } = fakeLeague(400, 0.3)
		const i = meta.po.findIndex((p, k) => p === 1 && meta.startWins[k] === 3)
		const line = seasonLine(meta, i, table)
		expect(line).toContain("through 4 games (3-1)")
		expect(line).toContain("made the playoffs")
		expect(line).toContain(recordText(meta.wins[i], meta.losses[i], seasonGames(Number(meta.teams[i].split(" ")[0]))))
		const j = meta.po.findIndex((p) => p === 0)
		expect(seasonLine(meta, j, table)).toContain("missed the playoffs")
	})
})

describe("recordStory", () => {
	const hist = (rows: number): HistoryData => {
		const { meta } = fakeLeague(rows, 0.3)
		return { source: "x", generatedAt: "", first: 2000, last: 2024, scale: 1000, teams: meta.teams, po: meta.po, wins: meta.wins, losses: meta.losses, stats: [], n: { "4": { w: meta.startWins, l: meta.startLosses, s: {}, r: {} } } }
	}
	it("finds teams with the same record and how they finished", () => {
		const r = recordStory(hist(400), 4, [{ result: "W" }, { result: "W" }, { result: "W" }, { result: "L" }])!
		expect(r.wins).toBe(3)
		expect(r.losses).toBe(1)
		expect(r.teams).toBeGreaterThan(20)
		expect(r.playoffs).toBeLessThanOrEqual(r.teams)
	})
	it("is null with a tie, too few games, or too few teams", () => {
		expect(recordStory(hist(400), 4, [{ result: "W" }, { result: "T" }, { result: "W" }, { result: "L" }])).toBeNull()
		expect(recordStory(hist(400), 4, [{ result: "W" }])).toBeNull()
		expect(recordStory(hist(8), 4, [{ result: "W" }, { result: "W" }, { result: "W" }, { result: "L" }])).toBeNull()
	})
})

describe("the tables", () => {
	const scouting = getScouting()
	const g = scouting.teams.LV.g
	const playable = g >= MIN_GAMES && g <= MAX_GAMES

	it("makes one per stat the Raiders have a number for, with the worked-out ones", () => {
		if (!playable) return
		const built = buildTables(getHistory(), g, scouting)!
		expect(built.tables.length).toBe(STAT_DEFS.length)
		for (const t of built.tables) {
			expect(t.start, t.key).toHaveLength(built.meta.teams.length)
			expect(t.rest, t.key).toHaveLength(built.meta.teams.length)
			expect(t.rank).toBeGreaterThanOrEqual(1)
			expect(t.rank).toBeLessThanOrEqual(32)
		}
		const lv = scouting.teams.LV
		const pd = built.tables.find((t) => t.key === "net.points")!
		expect(pd.value).toBeCloseTo(lv.off.points!.v - lv.def.points!.v, 5)
		const tm = built.tables.find((t) => t.key === "net.turnovers")!
		expect(tm.value).toBeCloseTo(lv.def.turnovers!.v - lv.off.turnovers!.v, 5)
		// A team's point differential through n games is the points it scored minus the points it allowed.
		const i = built.meta.teams.indexOf("2016 LV")
		const off = built.tables.find((t) => t.key === "off.points")!
		const def = built.tables.find((t) => t.key === "def.points")!
		expect(pd.start[i]).toBeCloseTo(off.start[i]! - def.start[i]!, 5)
		expect(built.meta.startWins[i] + built.meta.startLosses[i]).toBeLessThanOrEqual(g)
		expect(built.tables.every((t) => ["off", "def", "net"].includes(t.family))).toBe(true)
	})

	it("analyzes every stat at every game count the page can show, so it works all season", () => {
		for (let n = MIN_GAMES; n <= MAX_GAMES; n++) {
			const built = buildTables(getHistory(), n, scouting)!
			expect(built.tables.length, `n=${n}`).toBe(STAT_DEFS.length)
			for (const t of built.tables) {
				const a = analyze(built.meta, t, 2026)
				expect(a, `${t.key} after ${n}`).not.toBeNull()
				expect(a!.groupSize).toBeGreaterThanOrEqual(MIN_SIMILAR)
				expect(a!.fifths.every((f) => Number.isFinite(f.rate))).toBe(true)
			}
		}
	})

	it("is null for a game count the history does not have", () => {
		expect(buildTables(getHistory(), 99, scouting)).toBeNull()
	})

	it("picks the best two and worst two among the standout stats, only if they stand out", () => {
		const t = (key: string, rank: number): Table => ({ ...fakeLeague(120, 0.3).table, key, rank })
		const keys = STAT_DEFS.filter((d) => d.standout).map((d) => d.key)
		const tables = [t("net.points", 1), ...keys.map((k, i) => t(k, 3 + i * 2)), t("off.epa", 32)]
		const picks = pickStandouts(tables)
		expect(picks).toHaveLength(4)
		expect(picks).not.toContain("net.points")
		expect(picks).not.toContain("off.epa")
		const flat = pickStandouts(keys.map((k, i) => t(k, 14 + (i % 5))))
		expect(flat).toHaveLength(1)
	})
})

describe("the view the page and cards use", () => {
	const view = getHistoryView()

	it("is built from the real data for however many games the Raiders have played", () => {
		const g = getScouting().teams.LV.g
		if (g < MIN_GAMES || g > MAX_GAMES) {
			expect(view).toBeNull()
			return
		}
		expect(view).not.toBeNull()
		expect(view!.n).toBe(g)
		expect(view!.stories.length).toBeGreaterThanOrEqual(1)
		expect(view!.standouts.length).toBe(view!.stories.length)
		for (const s of view!.stories) {
			expect(s.groupSize).toBeGreaterThanOrEqual(MIN_SIMILAR)
			expect(s.rows.length).toBeGreaterThan(800)
			expect(s.rows.filter((r) => r.raiders)).toHaveLength(view!.last - view!.first + 1)
			expect(s.kept).toBeGreaterThanOrEqual(0)
			expect(s.kept).toBeLessThanOrEqual(1)
			expect(s.toward).toBeGreaterThan(0)
			expect(s.toward).toBeLessThanOrEqual(1)
			expect(s.domain[0]).toBeLessThan(s.value)
			expect(s.domain[1]).toBeGreaterThan(s.value)
			expect(s.headline).toMatch(/teams since 1999/)
			expect(s.verdict.text.length).toBeGreaterThan(3)
			expect(s.rank).toBeGreaterThanOrEqual(1)
			expect(s.rank).toBeLessThanOrEqual(32)
			expect(s.fifths).toHaveLength(5)
			expect(s.raidersFifth).toBeGreaterThanOrEqual(0)
			expect(s.raidersFifth).toBeLessThanOrEqual(4)
		}
		expect(view!.start).toEqual({ wins: expect.any(Number), losses: expect.any(Number) })
		expect(view!.start!.wins + view!.start!.losses).toBe(g)
		expect(view!.bottomLine.title.length).toBeGreaterThan(10)
		expect(view!.bottomLine.body).toMatch(/None of this is a prediction/)
	})

	it("can answer for any team, any playoff result and any stat, from the real data", () => {
		if (!view) return
		const abbrs = Array.from(new Set(view.meta.teams.map((t) => t.split(" ")[1])))
		expect(abbrs).toHaveLength(32)
		for (const abbr of abbrs) expect(teamName(abbr), abbr).not.toBe(abbr)
		for (const t of view.tables) {
			const a = analyze(view.meta, t, view.season, { scope: "all", team: "LV", playoffs: "any" })
			expect(a, t.key).not.toBeNull()
			expect(a!.groupSize, t.key).toBe(view.last - view.first + 1)
		}
	})

	it("builds a story for any stat in the catalog, for the share cards, and nothing for a made-up one", () => {
		if (!view) return
		for (const d of STAT_DEFS) expect(getStory(d.key)?.story.key, d.key).toBe(d.key)
		expect(getStory("off.nope")).toBeNull()
		expect(getStory("hello")).toBeNull()
	})
})

describe("formatting", () => {
	it("formats each kind of stat", () => {
		expect(formatStat({ fmt: "epa" }, 0.152)).toBe("+0.15")
		expect(formatStat({ fmt: "epa" }, -0.199)).toBe("−0.20")
		expect(formatStat({ fmt: "pct" }, 0.733)).toBe("73%")
		expect(formatStat({ fmt: "pct1" }, 0.0822)).toBe("8.2%")
		expect(formatStat({ fmt: "per" }, 2.25)).toBe("2.25")
		expect(formatStat({ fmt: "pts" }, 21.04)).toBe("21.0")
		expect(formatStat({ fmt: "diff" }, 6.25)).toBe("+6.3")
		expect(formatStat({ fmt: "diff" }, -3.04)).toBe("−3.0")
	})
	it("names a team by its season and nickname, and the Raiders by name", () => {
		expect(teamLabel("2007 NE")).toBe("2007 Patriots")
		expect(teamLabel("2001 LV")).toBe("2001 Raiders")
		expect(teamLabel("2001 OAK")).toBe("2001 Raiders")
		expect(teamName("LAR")).toBe("Rams")
		expect(isRaiders("2001 LV")).toBe(true)
		expect(isRaiders("2001 NE")).toBe(false)
		expect(recordText(3, 1, 4)).toBe("3-1")
		expect(recordText(3, 1, 5)).toBe("3-1-1")
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 27].map(ordinalOf)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "27th"])
	})
})

describe("what ships to the browser", () => {
	it("keeps the chart's imports free of the data files", () => {
		const kit = read("lib/lab/historyKit.ts")
		expect(kit).not.toMatch(/^import /m)
		const component = read("components/lab/WillItLast.tsx")
		expect(component).not.toMatch(/lib\/lab\/(data|history|scouting)"/)
		expect(component).not.toMatch(/history\.json/)
	})
})

/** `analyze(meta, table, 2026)` as spread arguments. */
function args({ meta, table }: { meta: Meta; table: Table }): [Meta, Table, number] {
	return [meta, table, 2026]
}
