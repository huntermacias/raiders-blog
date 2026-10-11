import { describe, expect, it } from "vitest"

import { GAME_WEEK_HOURS, chooseView, labCopy, labPhase, labTools, rootingSnapshot } from "../../lib/homeLab"
import { loadRootingSnapshot } from "../../lib/homeLab.server"
import type { HubState } from "../../lib/home"
import { LAB_TOOLS } from "../../lib/lab/tools"
import { getGames, getSchedule } from "../../lib/playoffs/data"
import { getRooting } from "../../lib/rooting/data"
import { settledGames } from "../../lib/rooting/live"
import type { GuideView } from "../../lib/rooting/view"
import { buildView } from "../../lib/rooting/view"
import type { ScheduleRow } from "../../lib/schedule"

const row = (kickoff: string | null): ScheduleRow => ({ week: 6, opponent: "Denver Broncos", homeAway: "home", kickoff, pick: null, outcome: null })
const NOW = new Date("2026-10-12T20:00:00Z").getTime()
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString()

describe("labPhase", () => {
	it("follows the hub for live, final and idle", () => {
		expect(labPhase({ kind: "live", game: row(hours(-1)) }, NOW)).toBe("live")
		expect(labPhase({ kind: "final", game: row(hours(-30)), next: null }, NOW)).toBe("final")
		expect(labPhase({ kind: "idle" }, NOW)).toBe("idle")
	})

	it("is 'early' when the next game is more than three days off and 'late' inside that", () => {
		const next = (h: number): HubState => ({ kind: "next", game: row(hours(h)) })
		expect(labPhase(next(GAME_WEEK_HOURS + 1), NOW)).toBe("early")
		expect(labPhase(next(GAME_WEEK_HOURS), NOW)).toBe("late")
		expect(labPhase(next(5), NOW)).toBe("late")
	})

	it("is 'early' when the kickoff is not known", () => {
		expect(labPhase({ kind: "next", game: row(null) }, NOW)).toBe("early")
		expect(labPhase({ kind: "next", game: row("not a date") }, NOW)).toBe("early")
	})
})

describe("labCopy and labTools", () => {
	const phases = ["live", "final", "early", "late", "idle"] as const

	it("has a title and a sentence for every phase, with and without a week", () => {
		for (const p of phases) {
			for (const w of [null, 6]) {
				const c = labCopy(p, w)
				expect(c.title.length).toBeGreaterThan(2)
				expect(c.blurb.length).toBeGreaterThan(10)
				expect(c.title + c.blurb).not.toMatch(/undefined|null|NaN/)
			}
		}
		expect(labCopy("early", 6).title).toBe("Week 6 in the Lab")
		expect(labCopy("early", null).title).toBe("This week in the Lab")
	})

	it("picks three real tools per phase, and never the Rooting Guide, which is the panel", () => {
		for (const p of phases) {
			const tools = labTools(p)
			expect(tools).toHaveLength(3)
			expect(new Set(tools.map((t) => t.id)).size).toBe(3)
			expect(tools.map((t) => t.id)).not.toContain("rooting-guide")
			for (const t of tools) expect(LAB_TOOLS).toContain(t)
		}
	})

	it("puts the matchups first early in the week and the playoff machine first after a game", () => {
		expect(labTools("early")[0].id).toBe("matchups")
		expect(labTools("final")[0].id).toBe("playoff-machine")
	})
})

describe("rootingSnapshot", () => {
	const data = getRooting()
	const schedule = getGames()

	function view(goal: "playoffs" | "division" | "bye" = "playoffs"): GuideView {
		if (!data) throw new Error("no rooting data")
		return buildView({ data, schedule, query: { team: "LV", goal, week: null, scope: "week" }, settled: settledGames(data, schedule, []), season: getSchedule().season })
	}

	it("describes the Raiders' playoff odds from the stored guide, in the words the page uses", () => {
		const s = rootingSnapshot(view())
		expect(s.nick).toBe("Raiders")
		expect(s.goal).toBe("playoffs")
		expect(s.pct).toMatch(/^(<1%|>99%|\d{1,2}%|100%|Clinched|Out)$/)
		expect(s.href).toBe("/lab/rooting-guide?team=LV&goal=playoffs")
		if (s.best) {
			expect(s.best.gain).toMatch(/^[+−]\d+ pts?$/)
			expect(s.best.rootFor).not.toBe("LV")
			expect(s.best.matchup).toMatch(/ at /)
		}
		if (s.change) expect(s.change.since).toMatch(/^since Week \d+$/)
	})

	it("never offers the Raiders' own game as the game to root for", () => {
		for (const goal of ["playoffs", "division", "bye"] as const) {
			const s = rootingSnapshot(view(goal))
			if (s.best) {
				expect(s.best.rootFor).not.toBe("LV")
				expect(s.best.against).not.toBe("LV")
			}
		}
	})

	it("loads for the homepage and never throws", () => {
		const s = loadRootingSnapshot()
		expect(s === null || typeof s.pct === "string").toBe(true)
	})
})

describe("chooseView", () => {
	const fake = (status: string) => ({ status }) as unknown as GuideView

	it("keeps the playoffs while they can still change", () => {
		const asked: string[] = []
		const v = chooseView((g) => {
			asked.push(g)
			return fake("live")
		})
		expect(v.status).toBe("live")
		expect(asked).toEqual(["playoffs"])
	})

	it("moves on to the division, then the No. 1 seed, when the earlier goal is settled", () => {
		const out = chooseView((g) => ({ ...fake(g === "playoffs" ? "clinched" : g === "division" ? "out" : "live"), goal: g }) as unknown as GuideView)
		expect((out as unknown as { goal: string }).goal).toBe("bye")
	})

	it("falls back to the playoffs when nothing is left to change", () => {
		const v = chooseView((g) => ({ ...fake("clinched"), goal: g }) as unknown as GuideView)
		expect((v as unknown as { goal: string }).goal).toBe("playoffs")
	})
})
