import { describe, expect, it } from "vitest"
import units from "../../data/lab/units.json"
import { GROUPS, GROUP_ORDER, STYLE, STYLE_ORDER, type UnitsData, isGameStatus, isGroup, matchupRows } from "../../lib/lab/unitsKit"
import { TEAMS } from "../../lib/nfl"

const data = units as unknown as UnitsData
const abbrs = Object.keys(data.teams)

describe("data/lab/units.json", () => {
	it("has every team the site lists, under the site's abbreviations", () => {
		expect(abbrs.sort()).toEqual(TEAMS.map((t) => t.abbr).sort())
	})

	it("credits nflverse and says which season it is", () => {
		expect(data.source).toMatch(/CC BY 4\.0/)
		expect(data.season).toBeGreaterThanOrEqual(2025)
		expect(data.week).toBeGreaterThan(0)
	})

	it("has exactly the groups and stats the catalog describes", () => {
		for (const abbr of abbrs) {
			const t = data.teams[abbr]
			expect(Object.keys(t.groups).sort()).toEqual([...GROUP_ORDER].sort())
			for (const g of GROUP_ORDER) expect(Object.keys(t.groups[g].stats).sort()).toEqual(Object.keys(GROUPS[g].stats).sort())
			expect(Object.keys(t.style.off).sort()).toEqual([...STYLE_ORDER.off].sort())
			expect(Object.keys(t.style.def).sort()).toEqual([...STYLE_ORDER.def].sort())
		}
	})

	it("ranks 1 to N once each, with 1 the best by the catalog's direction", () => {
		const n = abbrs.length
		for (const g of GROUP_ORDER) {
			for (const [key, info] of Object.entries(GROUPS[g].stats)) {
				const rows = abbrs.map((a) => ({ a, m: data.teams[a].groups[g].stats[key] }))
				expect(rows.every((r) => r.m)).toBe(true)
				const sorted = rows.map((r) => r.m!).sort((x, y) => x.rank - y.rank)
				expect(sorted.map((m) => m.rank)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
				// Values never get worse as the rank gets worse.
				for (let i = 1; i < n; i++) {
					const [better, worse] = [sorted[i - 1].v, sorted[i].v]
					expect(info.better === "high" ? better >= worse : better <= worse, `${g}.${key} rank ${i}`).toBe(true)
				}
			}
		}
	})

	it("ranks each group 1 to N by its grade", () => {
		const n = abbrs.length
		for (const g of GROUP_ORDER) {
			const rows = abbrs.map((a) => data.teams[a].groups[g]).sort((x, y) => x.rank - y.rank)
			expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
			for (let i = 1; i < n; i++) expect(rows[i - 1].score! >= rows[i].score!).toBe(true)
			for (const r of rows) expect(r.score).toBeGreaterThanOrEqual(0), expect(r.score).toBeLessThanOrEqual(100)
		}
	})

	it("ranks the style stats from the highest rate down", () => {
		for (const side of ["off", "def"] as const) {
			for (const key of STYLE_ORDER[side]) {
				expect(STYLE[key].side).toBe(side)
				const rows = abbrs.map((a) => data.teams[a].style[side][key]!).sort((x, y) => x.rank - y.rank)
				for (let i = 1; i < rows.length; i++) expect(rows[i - 1].v >= rows[i].v).toBe(true)
			}
		}
	})

	it("gives every team a coach, a record and a history with every other team", () => {
		for (const a of abbrs) {
			const c = data.teams[a].coach
			expect(c, a).toBeTruthy()
			expect(c!.name.length).toBeGreaterThan(3)
			expect(Object.keys(c!.vs).sort()).toEqual(abbrs.filter((x) => x !== a).sort())
			expect(c!.withTeam.since).toBeLessThanOrEqual(data.season)
			// A record with a coach is never longer than his whole career.
			expect(c!.withTeam.w + c!.withTeam.l + c!.withTeam.t).toBeLessThanOrEqual(c!.career.n)
		}
	})

	it("fixes the Raiders coach's spelling", () => {
		expect(data.teams.LV.coach?.name).toBe("Klint Kubiak")
	})

	it("only puts players in groups the page knows, with a status it can show", () => {
		for (const a of abbrs) {
			for (const p of data.teams[a].injuries.players) {
				expect(isGroup(p.group)).toBe(true)
				expect(["Out", "Doubtful", "Questionable", "DNP", "Limited", "Full"]).toContain(p.status)
				if (isGameStatus(p.status)) expect(p.name.length).toBeGreaterThan(2)
			}
		}
	})

	it("keeps each player's practice trail in order, ending where his status is now", () => {
		if (data.injuriesUpdatedAt) expect(Number.isNaN(new Date(data.injuriesUpdatedAt).getTime())).toBe(false)
		for (const a of abbrs) {
			for (const p of data.teams[a].injuries.players) {
				if (!p.trail) continue
				expect(p.trail.length).toBeGreaterThan(0)
				const times = p.trail.map((t) => new Date(t.at).getTime())
				expect(times).toEqual([...times].sort((x, y) => x - y))
				expect(p.trail[p.trail.length - 1].status).toBe(p.status)
				expect(p.trail[p.trail.length - 1].practice ?? null).toBe(p.practice ?? null)
			}
		}
	})

	it("has a slate of real, different teams", () => {
		expect(data.slate).toBeTruthy()
		expect(data.slate!.week).toBeGreaterThan(data.week)
		for (const g of data.slate!.games) {
			expect(data.teams[g.away]).toBeTruthy()
			expect(data.teams[g.home]).toBeTruthy()
			expect(g.away).not.toBe(g.home)
		}
	})

	it("builds a full matchup for every pair of teams", () => {
		for (const b of abbrs.filter((x) => x !== "LV")) expect(matchupRows(data, "LV", b)).toHaveLength(8)
	})
})
