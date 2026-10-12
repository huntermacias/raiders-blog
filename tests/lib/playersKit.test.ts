import { describe, expect, it } from "vitest"

import players from "../../data/lab/players.json"
import {
	GROUP_ORDER,
	HEADLINE,
	MOVE_MIN,
	type PlayerRow,
	type PlayersData,
	STAT,
	type Slice,
	describeMove,
	driverOf,
	formName,
	formWeeks,
	formatStat,
	gradeWord,
	isMixed,
	level,
	moveText,
	risersFallers,
	roleMove,
	roleMovers,
	standoutLine,
	standouts,
	tierOf,
} from "../../lib/lab/playersKit"

const slice = (v: number, n: number, g: number | null, pct: number | null = g === null ? null : Math.min(100, Math.max(0, (g - 20) / 0.6))): Slice => ({ v, n, g, pct })

function receiver(over: Partial<PlayerRow> & { name: string }): PlayerRow {
	return {
		id: over.name,
		pos: "WR",
		group: "rec",
		games: 4,
		stats: [
			{ k: "epaTgt", season: slice(0.3, 30, 60), form: slice(0.42, 13, 66), earlier: slice(0.12, 17, 50), delta: 16 },
			{ k: "croe", season: slice(0.05, 30, 58), form: slice(0.08, 13, 60), earlier: slice(0.03, 17, 52), delta: 8 },
		],
		mover: { score: 9, driver: "epaTgt", stats: 2, agree: 2 },
		weekly: [1, 2, 3, 4].map((w) => ({ w, opp: "XXX", v: 0.1 * w, n: 8 })),
		snaps: { season: 0.6, form: 0.7, earlier: 0.55 },
		...over,
	}
}

function data(list: PlayerRow[]): PlayersData {
	return {
		season: 2026, week: 4, team: "LV", generatedAt: "2026-10-12T05:00:00Z", source: "nflverse data, CC BY 4.0", formGames: 2, formWeeks: [3, 4], defFormWeeks: [2, 3], defWeek: 3,
		games: [1, 2, 3, 4].map((w) => ({ w, opp: "XXX" })), leagueN: { rec: 80 }, players: list,
	}
}

describe("formatting a stat", () => {
	it("puts a real minus sign on a negative and a plus on a positive", () => {
		expect(formatStat("rec", "epaTgt", 0.42)).toBe("+0.42")
		expect(formatStat("rec", "epaTgt", -0.1)).toBe("−0.10")
	})

	it("shows catches over expected in points, not as a fraction", () => {
		expect(formatStat("rec", "croe", 0.079)).toBe("+7.9 pts")
	})

	it("shows rates as percentages and per-100 stats as plain numbers", () => {
		expect(formatStat("qb", "badThrow", 0.1229)).toBe("12.3%")
		expect(formatStat("qb", "success", 0.4916)).toBe("49%")
		expect(formatStat("rush", "pressRate", 8.0357)).toBe("8.0")
		expect(formatStat("run", "broken", 0.0641)).toBe("6.4 per 100")
	})

	it("shows a dash for a missing number rather than NaN", () => {
		expect(formatStat("rec", "epaTgt", null)).toBe("–")
		expect(formatStat("rec", "epaTgt", Number.NaN)).toBe("–")
	})

	it("describes every stat in words a fan can use", () => {
		for (const g of GROUP_ORDER) {
			expect(STAT[g][HEADLINE[g]], `${g} headline`).toBeDefined()
			for (const [key, info] of Object.entries(STAT[g])) {
				expect(info.label.length, key).toBeGreaterThan(3)
				expect(info.what.length, key).toBeGreaterThan(30)
				expect(info.per.length, key).toBeGreaterThan(2)
			}
		}
	})
})

describe("grades in words", () => {
	it("reads 50 as average and each step away as better or worse", () => {
		expect(gradeWord(50)).toBe("about average")
		expect(gradeWord(72)).toBe("elite")
		expect(gradeWord(62)).toBe("well above average")
		expect(gradeWord(57)).toBe("above average")
		expect(gradeWord(42)).toBe("below average")
		expect(gradeWord(35)).toBe("well below average")
		expect(gradeWord(20)).toBe("among the worst")
		expect(gradeWord(null)).toBe("not enough yet")
	})

	it("averages the graded stats of a slice, leaving out drop rate and style stats", () => {
		const p = receiver({ name: "A", stats: [
			{ k: "epaTgt", season: slice(0.3, 30, 60), form: slice(0.4, 13, 70), earlier: null },
			{ k: "croe", season: slice(0.05, 30, 50), form: slice(0.08, 13, 60), earlier: null },
			{ k: "drop", season: slice(0, 30, 99), form: slice(0, 13, 99), earlier: null },
			{ k: "adot", season: slice(9, 30, null), form: slice(9, 13, null), earlier: null },
		] })
		expect(level(p, "form")).toBe(65)
		expect(level(p, "season")).toBe(55)
		expect(level(p, "earlier")).toBeNull()
	})
})

describe("risers and fallers", () => {
	const list = [
		receiver({ name: "Hot A", mover: { score: 9, driver: "epaTgt", stats: 2, agree: 2 } }),
		receiver({ name: "Hot B", mover: { score: 4, driver: "epaTgt", stats: 2, agree: 2 } }),
		receiver({ name: "Quiet", mover: { score: 1.2, driver: "epaTgt", stats: 2, agree: 1 } }),
		receiver({ name: "Cold A", mover: { score: -12, driver: "epaTgt", stats: 2, agree: 2 } }),
		receiver({ name: "Cold B", mover: { score: -3.5, driver: "epaTgt", stats: 2, agree: 2 } }),
		receiver({ name: "No trend", mover: null }),
	]

	it("sorts the biggest moves first and leaves out anyone inside the noise", () => {
		const { risers, fallers } = risersFallers(data(list))
		expect(risers.map((p) => p.name)).toEqual(["Hot A", "Hot B"])
		expect(fallers.map((p) => p.name)).toEqual(["Cold A", "Cold B"])
		expect(MOVE_MIN).toBeGreaterThan(1.2)
	})

	it("limits each list", () => {
		expect(risersFallers(data(list), 1).risers.map((p) => p.name)).toEqual(["Hot A"])
	})

	it("calls a player with no mover score steady, since it has no trend to show", () => {
		expect(tierOf(list[5])).toBe("steady")
		expect(tierOf(list[2])).toBe("steady")
		expect(tierOf(list[0])).toBe("hot")
		expect(tierOf(list[3])).toBe("cold")
	})

	it("gives a nobody-moved week an empty list, not a crash", () => {
		expect(risersFallers(data([]))).toEqual({ risers: [], fallers: [] })
	})

	it("says a move in plain words with the plays behind it and the window it covers", () => {
		const d = data(list)
		const text = describeMove(d, list[0])
		expect(text).toBe("EPA per target is +0.42 over the last 2 games (13 targets), against +0.12 before that.")
		expect(formName(d, "rec")).toBe("Last 2 games")
		expect(formWeeks(d, "rec")).toBe("Weeks 3 and 4")
	})

	it("uses the defensive window for defenders, since PFR posts their numbers later", () => {
		const d = data([])
		expect(formWeeks(d, "cov")).toBe("Weeks 2 and 3")
		expect(formWeeks(d, "rush")).toBe("Weeks 2 and 3")
		expect(formWeeks(d, "qb")).toBe("Weeks 3 and 4")
	})

	it("says nothing when a player has no driver stat", () => {
		expect(describeMove(data([]), receiver({ name: "A", mover: null }))).toBe("")
		expect(driverOf(receiver({ name: "A", mover: null }))).toBeNull()
	})

	it("flags a split picture instead of telling a flat story", () => {
		const split = receiver({ name: "A", mover: { score: -5, driver: "epaTgt", stats: 4, agree: 2 } })
		expect(isMixed(split)).toBe(true)
		expect(isMixed(receiver({ name: "B", mover: { score: -5, driver: "epaTgt", stats: 4, agree: 4 } }))).toBe(false)
		// With two stats there is no meaningful "mixed".
		expect(isMixed(receiver({ name: "C", mover: { score: -5, driver: "epaTgt", stats: 2, agree: 1 } }))).toBe(false)
	})

	it("writes a grade change with a real minus", () => {
		expect(moveText(4.25)).toBe("+4.3")
		expect(moveText(-12)).toBe("−12.0")
	})
})

describe("standouts", () => {
	const star = receiver({ name: "Star", stats: [
		{ k: "epaTgt", season: slice(0.7, 30, 80, 97), form: null, earlier: null },
		{ k: "drop", season: slice(0, 30, 80, 100), form: null, earlier: null },
		{ k: "adot", season: slice(14, 30, null, null), form: null, earlier: null },
	] })
	const dud = receiver({ name: "Dud", stats: [
		{ k: "epaTgt", season: slice(-0.4, 30, 33, 8), form: null, earlier: null },
		{ k: "croe", season: slice(0.0, 30, 49, 47), form: null, earlier: null },
	] })

	it("finds the best and worst stats against the league, leaving out drops and style stats", () => {
		const { best, worst } = standouts(data([star, dud]))
		expect(best.map((x) => `${x.player.name}:${x.stat.k}`)).toEqual(["Star:epaTgt"])
		expect(worst.map((x) => `${x.player.name}:${x.stat.k}`)).toEqual(["Dud:epaTgt"])
	})

	it("rounds a percentile before it makes an ordinal of it", () => {
		const { best } = standouts(data([receiver({ name: "A", stats: [{ k: "epaTgt", season: slice(0.7, 30, 80, 98.2), form: null, earlier: null }] })]))
		expect(standoutLine(data([]), best[0])).toBe("EPA per target +0.70: 98th percentile among receivers and tight ends.")
	})

	it("says where it ranks among his position", () => {
		const { best } = standouts(data([star, dud]))
		expect(standoutLine(data([]), best[0])).toBe("EPA per target +0.70: 97th percentile among receivers and tight ends.")
	})
})

describe("playing time", () => {
	it("notices a share of snaps that moved by 15 points or more", () => {
		const up = receiver({ name: "Up", snaps: { season: 0.4, form: 0.7, earlier: 0.2 } })
		const down = receiver({ name: "Down", snaps: { season: 0.5, form: 0.2, earlier: 0.7 } })
		const flat = receiver({ name: "Flat", snaps: { season: 0.5, form: 0.55, earlier: 0.5 } })
		const none = receiver({ name: "None", snaps: { season: null, form: null, earlier: null } })
		expect(roleMove(up)).toBe("up")
		expect(roleMove(down)).toBe("down")
		expect(roleMove(flat)).toBeNull()
		expect(roleMove(none)).toBeNull()
		expect(roleMovers(data([up, down, flat, none])).map((p) => p.name)).toEqual(["Up", "Down"])
	})

	it("ignores a player who barely plays, whose share swings on nothing", () => {
		const scrub = receiver({ name: "Scrub", snaps: { season: 0.04, form: 0.3, earlier: 0.0 } })
		expect(roleMovers(data([scrub]))).toEqual([])
	})
})

// The real file. Only what must hold for any week of any season, because the data changes every few hours.
describe("data/lab/players.json", () => {
	const real = players as unknown as PlayersData

	it("credits nflverse and says which season it covers", () => {
		expect(real.source).toMatch(/CC BY 4\.0/)
		expect(real.season).toBeGreaterThanOrEqual(2025)
		expect(real.week).toBeGreaterThan(0)
		expect(Date.parse(real.generatedAt)).not.toBeNaN()
	})

	it("has only groups and stats the catalog describes", () => {
		for (const p of real.players) {
			expect(GROUP_ORDER, p.name).toContain(p.group)
			for (const s of p.stats) expect(Object.keys(STAT[p.group]), `${p.name} ${s.k}`).toContain(s.k)
		}
	})

	it("keeps every number finite and every grade on a sane scale", () => {
		for (const p of real.players) {
			for (const s of p.stats) {
				for (const sl of [s.season, s.form, s.earlier]) {
					if (!sl) continue
					expect(Number.isFinite(sl.v), `${p.name} ${s.k}`).toBe(true)
					expect(sl.n).toBeGreaterThan(0)
					if (sl.g !== null) expect(sl.g).toBeGreaterThan(-20)
					if (sl.g !== null) expect(sl.g).toBeLessThan(150)
					if (sl.pct !== null) expect(sl.pct).toBeGreaterThanOrEqual(0)
					if (sl.pct !== null) expect(sl.pct).toBeLessThanOrEqual(100)
				}
			}
			if (p.mover) {
				expect(Number.isFinite(p.mover.score)).toBe(true)
				expect(p.mover.agree).toBeLessThanOrEqual(p.mover.stats)
				expect(p.stats.map((s) => s.k)).toContain(p.mover.driver)
			}
		}
	})

	it("has a weekly line for each game and every player named once", () => {
		const ids = real.players.map((p) => p.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const p of real.players) {
			expect(p.weekly.map((w) => w.w), p.name).toEqual(real.games.map((g) => g.w))
			expect(p.name.length).toBeGreaterThan(2)
		}
	})

	it("describes each mover's biggest change without throwing", () => {
		for (const p of real.players) {
			if (p.mover) expect(describeMove(real, p)).toMatch(/ against /)
		}
		const { risers, fallers } = risersFallers(real, 99)
		for (const p of [...risers, ...fallers]) expect(Math.abs(p.mover!.score)).toBeGreaterThanOrEqual(MOVE_MIN)
	})
})
