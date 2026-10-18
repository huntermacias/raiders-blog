import { describe, expect, it } from "vitest"

import { getGames } from "@/lib/playoffs/data"
import { addBranch, cleanName, loadBranches, MAX_BRANCHES, removeBranch, saveBranches } from "@/lib/playoffs/branches"
import { gameChances, simulateRemaining } from "@/lib/playoffs/autosim"
import { diffScenarios } from "@/lib/playoffs/compare"
import { EMPTY_HISTORY, record, redo, undo } from "@/lib/playoffs/history"
import { oddsRun } from "@/lib/playoffs/odds"
import { pickHomeTeams } from "@/lib/playoffs/picks"
import { actualOutcome } from "@/lib/playoffs/season"
import { simulateSeason } from "@/lib/playoffs/simulator"
import { METRICS, buildTimeline, gamesThrough, metricValue, raceSummary, seasonEvents } from "@/lib/playoffs/timeline"
import type { Conference, Predictions } from "@/lib/playoffs/types"

const games = getGames()
const full = simulateRemaining(games, {}, { seed: 7 })
const CONFS: Conference[] = ["AFC", "NFC"]

describe("the timeline", () => {
	const t = buildTimeline(games, full)

	it("has one frame per week, and its last frame is the same table as the whole scenario", () => {
		expect(t.frames).toHaveLength(new Set(games.map((g) => g.week)).size)
		const last = t.frames[t.frames.length - 1]
		const sim = simulateSeason({ games, predictions: full })
		for (const c of CONFS) {
			expect(last.seeds[c]).toEqual(sim.conferences[c].seeds)
			expect(last.order[c]).toEqual(sim.conferences[c].table)
		}
		for (const [id, team] of Object.entries(sim.teams)) {
			expect(last.teams[id].record).toEqual(team.overall)
			expect(last.teams[id].seed).toBe(team.seed)
			expect(last.teams[id].eliminated).toBe(team.eliminated)
			expect(last.teams[id].clinchedPlayoff).toBe(team.clinchedPlayoff)
		}
		expect(t.final.playoffTeams).toEqual(sim.playoffTeams)
	})

	it("gives the same frames every time, in any order they are asked for", () => {
		const again = buildTimeline(games, full)
		expect(again).toEqual(t)
		const mid = t.frames[Math.floor(t.frames.length / 2)]
		const alone = simulateSeason({ games: gamesThrough(games, mid.week), predictions: Object.fromEntries(Object.entries(full).filter(([id]) => (games.find((g) => g.id === id)?.week ?? 99) <= mid.week)) })
		for (const c of CONFS) expect(alone.conferences[c].seeds).toEqual(mid.seeds[c])
	})

	it("counts every team's games week by week and never more than were played", () => {
		let prev = 0
		for (const f of t.frames) {
			expect(f.decided).toBeGreaterThanOrEqual(prev)
			prev = f.decided
			const played = Object.values(f.teams).reduce((n, x) => n + x.record.w + x.record.l + x.record.t, 0)
			expect(played).toBe(f.decided * 2)
		}
	})

	it("always has seven seeds per conference and puts the seeds first in the table", () => {
		for (const f of t.frames) {
			for (const c of CONFS) {
				expect(f.seeds[c]).toHaveLength(7)
				expect(f.order[c].slice(0, 7)).toEqual(f.seeds[c])
				expect(new Set(f.order[c]).size).toBe(16)
			}
		}
	})

	it("reads each metric for each team", () => {
		const f = t.frames[t.frames.length - 1]
		for (const m of METRICS) for (const id of Object.keys(f.teams)) expect(Number.isFinite(metricValue(f, id, m.id))).toBe(true)
		const lastSeed = f.seeds.AFC[6]
		expect(metricValue(f, lastSeed, "behind")).toBe(0)
		expect(metricValue(f, f.order.AFC[0], "rank")).toBe(1)
	})

	it("does not let a pick on a played game change anything", () => {
		const played = games.find((g) => actualOutcome(g) !== null)!
		const flipped: Predictions = { ...full, [played.id]: actualOutcome(played) === "H" ? "A" : "H" }
		expect(buildTimeline(games, flipped)).toEqual(t)
	})
})

describe("season events", () => {
	const t = buildTimeline(games, full)
	const events = seasonEvents(t)

	it("only reports a clinch or an elimination once, and never after the season is decided for that team", () => {
		const seen = new Set<string>()
		for (const e of events) {
			if (e.kind === "eliminated" || e.kind.startsWith("clinched")) {
				const key = `${e.team}:${e.kind}`
				expect(seen.has(key), key).toBe(false)
				seen.add(key)
			}
		}
	})

	it("agrees with the frames: a team reported eliminated is eliminated in that week's frame and stays out", () => {
		const frames = new Map(t.frames.map((f) => [f.week, f]))
		for (const e of events.filter((x) => x.kind === "eliminated")) {
			expect(frames.get(e.week)!.teams[e.team].eliminated).toBe(true)
			for (const f of t.frames.filter((x) => x.week > e.week)) expect(f.teams[e.team].seed).toBeNull()
		}
	})

	it("every event week is a week in the timeline, and each division lead change has two different teams", () => {
		for (const e of events) {
			expect(t.weeks).toContain(e.week)
			if (e.kind === "division-lead") expect(e.other).not.toBe(e.team)
		}
	})
})

describe("race summary", () => {
	it("leaves out weeks where nothing new was decided", () => {
		const none = buildTimeline(games, {})
		const played = new Set(games.filter((g) => actualOutcome(g) !== null).map((g) => g.week))
		expect(raceSummary(none).weeks).toBeLessThanOrEqual(played.size + 1)
		expect(raceSummary(none).weeks).toBeLessThan(none.frames.length)
	})
	const t = buildTimeline(games, full)
	const s = raceSummary(t)
	it("ranks stay within the conference and the weeks add up", () => {
		for (const r of Object.values(s.teams)) {
			expect(r.bestRank).toBeGreaterThanOrEqual(1)
			expect(r.worstRank).toBeLessThanOrEqual(16)
			expect(r.bestRank).toBeLessThanOrEqual(r.worstRank)
			expect(r.weeksIn + r.weeksOut).toBe(s.weeks)
			expect(r.biggestJump.places).toBeGreaterThanOrEqual(0)
		}
	})
})

describe("simulating the rest of the season", () => {
	it("is the same season for the same sim number, and a different one for another", () => {
		expect(simulateRemaining(games, {}, { seed: 11 })).toEqual(simulateRemaining(games, {}, { seed: 11 }))
		expect(simulateRemaining(games, {}, { seed: 11 })).not.toEqual(simulateRemaining(games, {}, { seed: 12 }))
	})

	it("fills every open game once, never a played game, and never a tie", () => {
		const open = games.filter((g) => actualOutcome(g) === null)
		expect(Object.keys(full).sort()).toEqual(open.map((g) => g.id).sort())
		expect(Object.values(full).every((v) => v === "H" || v === "A")).toBe(true)
	})

	it("keeps the reader's picks when asked, and re-rolls nothing else when one pick changes", () => {
		const open = games.filter((g) => actualOutcome(g) === null)
		const mine: Predictions = { [open[3].id]: "A", [open[40].id]: "H" }
		const kept = simulateRemaining(games, mine, { seed: 5, keepPicks: true })
		expect(kept[open[3].id]).toBe("A")
		expect(kept[open[40].id]).toBe("H")
		// Same second pick, different first pick: every other game must come out the same. (Dropping the second pick
		// would make this depend on how that one game happens to roll for the current ratings.)
		const other = simulateRemaining(games, { [open[3].id]: "H", [open[40].id]: "H" }, { seed: 5, keepPicks: true })
		expect(other[open[3].id]).toBe("H")
		for (const g of open.filter((x) => x.id !== open[3].id)) expect(other[g.id]).toBe(kept[g.id])
	})

	it("limits itself to the weeks asked for", () => {
		const week = games.filter((g) => actualOutcome(g) === null)[0].week
		const some = simulateRemaining(games, {}, { seed: 1, weeks: [week] })
		for (const id of Object.keys(some)) expect(games.find((g) => g.id === id)!.week).toBe(week)
	})

	it("gives the favorite every game under the favorites rule, and the favorites win more often than not under the model", () => {
		const chances = gameChances(games)
		const fav = simulateRemaining(games, {}, { rule: "favorites" })
		for (const g of games) if (chances[g.id] !== undefined) expect(fav[g.id]).toBe(chances[g.id] >= 0.5 ? "H" : "A")
		let favoriteWins = 0
		let n = 0
		for (let seed = 0; seed < 40; seed++) {
			const p = simulateRemaining(games, {}, { seed })
			for (const g of games) {
				if (chances[g.id] === undefined) continue
				n++
				if ((chances[g.id] >= 0.5) === (p[g.id] === "H")) favoriteWins++
			}
		}
		expect(favoriteWins / n).toBeGreaterThan(0.5)
	})
})

describe("comparing scenarios", () => {
	it("reports nothing for the same scenario", () => {
		const sim = simulateSeason({ games, predictions: full })
		const d = diffScenarios(games, full, full, sim, sim)
		expect(d.same).toBe(true)
		expect(d.teams).toEqual([])
		expect(d.lines).toEqual([])
	})

	it("reports the picks that differ and only the teams that moved", () => {
		const a = pickHomeTeams(games, {})
		const open = games.filter((g) => actualOutcome(g) === null)
		const g = open[open.length - 1]
		const b: Predictions = { ...a, [g.id]: "A" }
		const d = diffScenarios(games, a, b, simulateSeason({ games, predictions: a }), simulateSeason({ games, predictions: b }))
		expect(d.picks).toHaveLength(1)
		expect(d.picks[0]).toMatchObject({ gameId: g.id, a: "H", b: "A" })
		const touched = new Set([g.homeTeam, g.awayTeam])
		for (const t of d.teams) expect(touched.has(t.team) || t.seedA !== t.seedB).toBe(true)
		expect(d.teams.find((t) => t.team === g.homeTeam)?.recordA).not.toBe(d.teams.find((t) => t.team === g.homeTeam)?.recordB)
	})
})

describe("undo and redo", () => {
	it("walks back and forward through picks, and a new change ends the redo path", () => {
		const a: Predictions = {}
		const b: Predictions = { x: "H" }
		const c: Predictions = { x: "H", y: "A" }
		let h = record(EMPTY_HISTORY, a, "pick")
		h = record(h, b, "pick")
		const u1 = undo(h, c)!
		expect(u1.picks).toEqual(b)
		const u2 = undo(u1.history, u1.picks)!
		expect(u2.picks).toEqual(a)
		expect(undo(u2.history, u2.picks)).toBeNull()
		const r1 = redo(u2.history, u2.picks)!
		expect(r1.picks).toEqual(b)
		expect(redo(record(r1.history, r1.picks, "new"), r1.picks)).toBeNull()
	})
})

describe("rooting and wins table in the odds run", () => {
	const run = oddsRun({ games, predictions: {}, track: "LV", sims: 600, rootAll: true })
	run.step(run.total)
	const r = run.result()
	it("scores every open game, ordered by swing, and its own games are the loudest", () => {
		expect(r.rooting.length).toBe(games.filter((g) => actualOutcome(g) === null).length)
		const swings = r.rooting.map((x) => x.swing ?? -1)
		expect([...swings].sort((a, b) => b - a)).toEqual(swings)
	})
	it("adds up the win totals to the number of simulated seasons", () => {
		expect(r.winsTable.reduce((n, w) => n + w.seasons, 0)).toBe(r.sims)
		expect(r.winsTable.every((w) => w.made <= w.seasons)).toBe(true)
		const lo = r.winsTable[0]
		const hi = r.winsTable[r.winsTable.length - 1]
		expect(hi.made / hi.seasons).toBeGreaterThanOrEqual(lo.made / lo.seasons)
	})
	it("changes nothing when it is not asked for", () => {
		const plain = oddsRun({ games, predictions: {}, track: "LV", sims: 200 })
		plain.step(plain.total)
		expect(plain.result().rooting).toEqual([])
	})
})

describe("holds over random seasons, ties included", () => {
	it("keeps the last frame equal to the whole season, and the replay deterministic, for 24 seasons", () => {
		const open = games.filter((g) => actualOutcome(g) === null)
		for (let seed = 100; seed < 124; seed++) {
			const p = simulateRemaining(games, {}, { seed })
			const picks: Record<string, "H" | "A" | "T"> = { ...p }
			// About one game in twenty is a tie, so tied results run through the tiebreakers and the events too.
			open.forEach((g, i) => {
				if ((i * 7 + seed) % 20 === 0) picks[g.id] = "T"
			})
			const t = buildTimeline(games, picks)
			const sim = simulateSeason({ games, predictions: picks })
			for (const c of CONFS) expect(t.frames[t.frames.length - 1].seeds[c], `seed ${seed}`).toEqual(sim.conferences[c].seeds)
			expect(buildTimeline(games, picks)).toEqual(t)
			const events = seasonEvents(t)
			for (const e of events) expect(t.weeks).toContain(e.week)
			const finalFrame = t.frames[t.frames.length - 1]
			// Whoever the events say is eliminated is out of the final seeds, and whoever clinched a berth is in them.
			for (const e of events.filter((x) => x.kind === "eliminated")) expect(finalFrame.teams[e.team].seed, `${e.team} seed ${seed}`).toBeNull()
			for (const e of events.filter((x) => x.kind === "clinched-playoff" || x.kind === "clinched-division" || x.kind === "clinched-bye")) expect(finalFrame.teams[e.team].seed, `${e.team} seed ${seed}`).not.toBeNull()
		}
	})
})


describe("saved snapshots", () => {
	const open = games.filter((g) => actualOutcome(g) === null)
	const mem = () => {
		const data = new Map<string, string>()
		return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
	}
	it("keeps names plain and short", () => {
		expect(cleanName("  <b>Raiders\nwin out</b>  ")).toBe("b Raiders win out /b")
		expect(cleanName("x".repeat(200))).toHaveLength(40)
	})
	it("round-trips, newest first, capped, and drops picks that no longer apply", () => {
		let list = addBranch([], "A", { [open[0].id]: "H" }, 1000)
		list = addBranch(list, "B", { [open[1].id]: "A", nope: "H" } as never, 2000)
		const store = mem()
		saveBranches(store, 2026, list)
		const back = loadBranches(store, 2026, games)
		expect(back.map((b) => b.name)).toEqual(["B", "A"])
		expect(back[0].picks).toEqual({ [open[1].id]: "A" })
		expect(loadBranches(store, 2025, games)).toEqual([])
		let many = list
		for (let i = 0; i < 20; i++) many = addBranch(many, `n${i}`, {}, 3000 + i)
		expect(many).toHaveLength(MAX_BRANCHES)
		expect(removeBranch(list, list[0].id)).toHaveLength(1)
	})
	it("survives damaged storage", () => {
		expect(loadBranches({ getItem: () => "{nope" }, 2026, games)).toEqual([])
		expect(loadBranches(null, 2026, games)).toEqual([])
	})
})
