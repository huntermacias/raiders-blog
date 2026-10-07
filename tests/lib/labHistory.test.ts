import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { getHistory, getScouting } from "../../lib/lab/data"
import { type HistoryData, MAX_GAMES, MIN_GAMES, MIN_SIMILAR, STAT_DEFS, buildStory, getHistoryView, getStory, pickStats, recordStory, statDef } from "../../lib/lab/history"
import { formatStat, isRaiders, ordinalOf, teamLabel } from "../../lib/lab/historyKit"

const root = resolve(__dirname, "../..")
const read = (p: string) => readFileSync(resolve(root, p), "utf8")

/** A small made-up history: `rows` teams whose rest-of-season value is `slope` of the way from the average to their start. */
function fake(rows: number, slope: number, key = "def.turnovers"): HistoryData {
	const start: number[] = []
	const rest: number[] = []
	const wins: number[] = []
	const po: number[] = []
	const teams: string[] = []
	for (let i = 0; i < rows; i++) {
		const s = 1000 + (i / (rows - 1)) * 2000 // 1.00 to 3.00 per game, times 1000
		start.push(Math.round(s))
		rest.push(Math.round(2000 + slope * (s - 2000) + (i % 2 ? 40 : -40)))
		wins.push(i % 17)
		po.push(i % 2)
		teams.push(`${2000 + (i % 25)} ${i % 40 === 0 ? "LV" : "AAA"}`)
	}
	const block = { w: wins.map((w) => Math.min(w, 3)), s: { [key]: start }, r: { [key]: rest } }
	return { source: "x", generatedAt: "2026-01-01T00:00:00Z", first: 2000, last: 2024, scale: 1000, teams, po, wins, stats: [key], n: { "4": block } }
}

describe("the stat catalog", () => {
	it("says whether higher is better the same way the scouting ranks do", () => {
		const teams = Object.values(getScouting().teams)
		for (const def of STAT_DEFS) {
			const ranked = teams.flatMap((t) => (t[def.side][def.stat] ? [t[def.side][def.stat]!] : []))
			const first = ranked.find((m) => m.rank === 1)!
			const best = def.higherIsBetter ? Math.max(...ranked.map((m) => m.v)) : Math.min(...ranked.map((m) => m.v))
			expect(first.v, def.key).toBe(best)
		}
	})

	it("has a unique key per stat, found by statDef", () => {
		expect(new Set(STAT_DEFS.map((d) => d.key)).size).toBe(STAT_DEFS.length)
		expect(statDef("def.turnovers")?.label).toBe("Takeaways")
		expect(statDef("nope")).toBeUndefined()
	})
})

describe("history.json", () => {
	const h = getHistory()
	it("lines every list up with the team list", () => {
		expect(h.scale).toBe(1000)
		expect(h.po).toHaveLength(h.teams.length)
		expect(h.wins).toHaveLength(h.teams.length)
		expect(h.stats).toEqual(STAT_DEFS.map((d) => d.key))
		for (let n = MIN_GAMES; n <= MAX_GAMES; n++) {
			const b = h.n[String(n)]
			expect(b, `n=${n}`).toBeTruthy()
			expect(b.w).toHaveLength(h.teams.length)
			for (const k of h.stats) {
				expect(b.s[k]).toHaveLength(h.teams.length)
				expect(b.r[k]).toHaveLength(h.teams.length)
			}
		}
	})

	it("covers every season from 1999 on, with the Raiders in it", () => {
		expect(h.first).toBe(1999)
		expect(h.last).toBeGreaterThanOrEqual(2025)
		expect(h.teams.length).toBeGreaterThan(800)
		expect(h.teams.filter(isRaiders).length).toBe(h.last - h.first + 1)
		for (const w of h.wins) expect(w).toBeGreaterThanOrEqual(0)
	})

	it("measures sensible numbers", () => {
		const k = h.scale
		const avg = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null).reduce((a, b) => a + b, 0) / xs.filter((x) => x !== null).length / k
		// Takeaways are about one and a half a game, and the league's points per pass hover near zero.
		expect(avg(h.n["4"].s["def.turnovers"])).toBeGreaterThan(1.2)
		expect(avg(h.n["4"].s["def.turnovers"])).toBeLessThan(1.8)
		expect(Math.abs(avg(h.n["4"].s["off.epaPass"]))).toBeLessThan(0.1)
		// Nobody wins more games than they play.
		expect(Math.max(...h.wins)).toBeLessThanOrEqual(17)
	})
})

describe("buildStory", () => {
	it("finds the teams that started at least as high, and how far they drifted back", () => {
		const def = statDef("def.turnovers")!
		const s = buildStory(fake(400, 0.2), def, 4, 2.4, 1, 2026)!
		expect(s.kind).toBe("atLeast")
		expect(s.dots.every((d) => d.start >= 2.4)).toBe(true)
		expect(s.kept).toBeCloseTo(0.2, 1)
		expect(s.verdict.id).toBe("fade")
		expect(s.good).toBe(true)
		expect(s.toward).toBeGreaterThan(0.9)
		expect(s.base).toBeCloseTo(2, 1)
		expect(s.typical).toBeCloseTo(2 + 0.2 * 0.4, 1)
		expect(s.band[0]).toBeLessThan(s.band[1])
		expect(s.domain[0]).toBeLessThan(Math.min(...s.dots.map((d) => d.rest), s.value))
		expect(s.domain[1]).toBeGreaterThan(Math.max(...s.dots.map((d) => d.start), s.value))
		expect(s.headline).toContain("at least as well as the 2026 Raiders at takeaways through 4 games")
		expect(s.earlier.count).toBeGreaterThan(0)
	})

	it("calls a low number that tends to recover 'likely to improve', and a lasting one 'likely to hold'", () => {
		const def = statDef("def.turnovers")!
		const low = buildStory(fake(400, 0.2), def, 4, 1.4, 30, 2026)!
		expect(low.good).toBe(false)
		expect(low.verdict.id).toBe("improve")
		expect(low.headline).toContain("at least as poorly")
		const real = buildStory(fake(400, 0.9), def, 4, 2.4, 1, 2026)!
		expect(real.verdict.id).toBe("hold")
		const bad = buildStory(fake(400, 0.9), def, 4, 1.4, 30, 2026)!
		expect(bad.verdict.id).toBe("linger")
		const mid = buildStory(fake(400, 0.6), def, 4, 2.4, 1, 2026)!
		expect(mid.verdict.id).toBe("mixed")
	})

	it("uses the closest teams when too few or too many started that extreme", () => {
		const def = statDef("def.turnovers")!
		const few = buildStory(fake(400, 0.3), def, 4, 2.95, 1, 2026)!
		expect(few.kind).toBe("closest")
		expect(few.dots).toHaveLength(MIN_SIMILAR)
		expect(few.headline).toContain("closest to the 2026 Raiders")
		const many = buildStory(fake(1000, 0.3), def, 4, 1.6, 1, 2026)!
		expect(many.kind).toBe("closest")
		expect(many.dots.length).toBeLessThanOrEqual(250)
	})

	it("returns null without enough data", () => {
		const def = statDef("def.turnovers")!
		expect(buildStory(fake(50, 0.3), def, 4, 2.4, 1, 2026)).toBeNull()
		expect(buildStory(fake(400, 0.3), def, 5, 2.4, 1, 2026)).toBeNull()
		expect(buildStory(fake(400, 0.3, "def.third"), def, 4, 2.4, 1, 2026)).toBeNull()
	})
})

describe("pickStats", () => {
	it("takes the Raiders' best two and worst two, only if they stand out", () => {
		const picks = pickStats(getScouting())
		expect(picks.length).toBeGreaterThanOrEqual(1)
		expect(picks.length).toBeLessThanOrEqual(4)
		for (const p of picks) expect(p.rank <= 10 || p.rank >= 23).toBe(true)
		const keys = picks.map((p) => p.def.key)
		expect(new Set(keys).size).toBe(keys.length)
	})

	it("falls back to the single most extreme number for a very average team", () => {
		const base = getScouting()
		const lv = base.teams.LV
		const mid = (m: { v: number; rank: number } | null) => (m ? { ...m, rank: 16 } : m)
		const flat = { ...base, teams: { ...base.teams, LV: { ...lv, off: Object.fromEntries(Object.entries(lv.off).map(([k, m]) => [k, mid(m)])), def: Object.fromEntries(Object.entries(lv.def).map(([k, m]) => [k, mid(m)])) } } }
		expect(pickStats(flat as never)).toHaveLength(1)
	})
})

describe("recordStory", () => {
	it("finds teams with the same record and how they finished", () => {
		const h = fake(400, 0.3)
		const r = recordStory(h, 4, [{ result: "W" }, { result: "W" }, { result: "W" }, { result: "L" }])!
		expect(r.wins).toBe(3)
		expect(r.losses).toBe(1)
		expect(r.teams).toBeGreaterThan(20)
		expect(r.playoffs).toBeLessThanOrEqual(r.teams)
	})
	it("is null with a tie, too few games, or too few teams", () => {
		const h = fake(400, 0.3)
		expect(recordStory(h, 4, [{ result: "W" }, { result: "T" }, { result: "W" }, { result: "L" }])).toBeNull()
		expect(recordStory(h, 4, [{ result: "W" }])).toBeNull()
		expect(recordStory(fake(8, 0.3), 4, [{ result: "W" }, { result: "W" }, { result: "W" }, { result: "L" }])).toBeNull()
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
		for (const s of view!.stories) {
			expect(s.dots.length).toBeGreaterThanOrEqual(MIN_SIMILAR)
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
		}
		expect(view!.bottomLine.title.length).toBeGreaterThan(10)
		expect(view!.bottomLine.body).toMatch(/None of this is a prediction/)
	})

	it("builds a story for any stat in the catalog, for the share cards, and nothing for a made-up one", () => {
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
	})
	it("names a team by its season and abbreviation, and the Raiders by name", () => {
		expect(teamLabel("2007 NE")).toBe("2007 NE")
		expect(teamLabel("2001 LV")).toBe("2001 Raiders")
		expect(teamLabel("2001 OAK")).toBe("2001 Raiders")
		expect(isRaiders("2001 LV")).toBe(true)
		expect(isRaiders("2001 NE")).toBe(false)
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
