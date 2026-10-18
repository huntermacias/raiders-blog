import { describe, expect, it } from "vitest"

import { getScouting, getTrail } from "../../lib/lab/data"
import { MAX_GAMES, MIN_GAMES, STAT_DEFS, getHistoryView, getStory, scoutingStanding, teamAbbrs, trailStanding } from "../../lib/lab/history"
import { RAIDERS, TEAM_NAMES, analyze, isTeamRow, subjectOf, trackRecord } from "../../lib/lab/historyKit"

describe("a page for every team", () => {
	it("has a subject for every team in the scouting file and none for anything else", () => {
		expect(Object.keys(getScouting().teams).sort()).toEqual(Object.keys(TEAM_NAMES).sort())
		expect(teamAbbrs()).toHaveLength(32)
		expect(subjectOf("KC")).toEqual({ abbr: "KC", name: "Chiefs" })
		expect(subjectOf("XXX")).toBeNull()
	})

	it("matches a team's own seasons, with the Raiders also found as OAK", () => {
		expect(isTeamRow("2016 LV", "LV")).toBe(true)
		expect(isTeamRow("2016 OAK", "LV")).toBe(true)
		expect(isTeamRow("2016 KC", "LV")).toBe(false)
		expect(isTeamRow("2016 KC", "KC")).toBe(true)
	})

	it("builds the Raiders' page exactly as before when no team is named", () => {
		const a = getHistoryView()
		const b = getHistoryView("LV")
		expect(a?.subject).toEqual(RAIDERS)
		expect(a?.bottomLine).toEqual(b?.bottomLine)
		expect(a?.standouts).toEqual(b?.standouts)
	})

	it("builds a page for every team that has played enough games, about that team and no one else", () => {
		const sc = getScouting()
		let built = 0
		for (const abbr of teamAbbrs()) {
			const g = sc.teams[abbr].g
			const view = getHistoryView(abbr)
			if (g < MIN_GAMES || g > MAX_GAMES) {
				expect(view, abbr).toBeNull()
				continue
			}
			built++
			expect(view, abbr).not.toBeNull()
			expect(view!.n).toBe(g)
			expect(view!.subject.abbr).toBe(abbr)
			const name = TEAM_NAMES[abbr]
			for (const s of view!.stories) {
				expect(s.sub, abbr).toContain(`The ${name} are at`)
				if (abbr !== "LV") expect(`${s.headline} ${s.sub}`, abbr).not.toContain("Raiders")
				// the gold-ring rows are this team's own seasons, one per season on file
				const own = s.rows.filter((r) => r.raiders).map((r) => view!.meta.teams[r.i])
				expect(own.every((row) => isTeamRow(row, abbr)), abbr).toBe(true)
				expect(own.length, abbr).toBeGreaterThan(15)
			}
			if (abbr !== "LV") expect(`${view!.bottomLine.title} ${view!.bottomLine.body}`, abbr).not.toContain("Raiders")
		}
		expect(built).toBeGreaterThan(20)
	})

	it("ranks each team's own number, so two teams never share a standout by accident", () => {
		const sc = getScouting()
		const a = scoutingStanding(sc, "KC")(STAT_DEFS[0])
		const b = scoutingStanding(sc, "LV")(STAT_DEFS[0])
		expect(a?.value).toBe(sc.teams.KC.off.epaPass?.v)
		expect(b?.value).toBe(sc.teams.LV.off.epaPass?.v)
	})

	it("returns one story for a stat and team, null for an unknown team or stat", () => {
		expect(getStory("off.epaPass", "KC")?.story.subject.abbr).toBe("KC")
		expect(getStory("off.epaPass", "NOPE")).toBeNull()
		expect(getStory("nope", "KC")).toBeNull()
	})
})

describe("the range and the track record", () => {
	const view = getHistoryView()!
	it("puts the typical finish inside the range teams like this actually finished in, and says so in words", () => {
		for (const s of view.stories) {
			expect(s.forecast.lo).toBeLessThanOrEqual(s.forecast.hi)
			expect(s.forecast.teams).toBeGreaterThanOrEqual(30)
			expect(s.forecastText).toMatch(/^80% of the \d+ teams that started/)
			expect(s.forecastText).toContain("Raiders")
		}
	})

	it("scores the method on past seasons it was not fitted on, and beats 'it will stay the same' on extreme starts", () => {
		for (const s of view.stories) {
			expect(s.track).not.toBeNull()
			expect(s.track!.teams).toBeGreaterThan(100)
			expect(s.track!.closer).toBeGreaterThan(0.5)
			expect(s.track!.missModel).toBeLessThan(s.track!.missHold)
			expect(s.trackText).toContain("predicting each season from the others only")
		}
	})

	it("works on a made-up league where the truth is known", () => {
		// Every team's rest-of-season is half its start plus noise, so the method should clearly beat 'it stays the same'.
		const seasons: number[] = []
		const start: number[] = []
		const rest: number[] = []
		let seed = 7
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5
		for (let y = 2000; y < 2025; y++) {
			for (let t = 0; t < 32; t++) {
				const s = rnd() * 4
				seasons.push(y)
				start.push(s)
				rest.push(s * 0.5 + rnd() * 0.5)
			}
		}
		const track = trackRecord(start, rest, seasons)!
		expect(track.closer).toBeGreaterThan(0.85)
		expect(track.missModel).toBeLessThan(track.missHold / 2)
	})

	it("says nothing with too little data", () => {
		expect(trackRecord([1, 2, 3], [1, 2, 3], [2000, 2001, 2002])).toBeNull()
	})

	it("does not change an analysis for the Raiders when the team is named explicitly", () => {
		const plain = view.stories[0]
		const t = view.tables.find((x) => x.key === plain.key)!
		const named = analyze(view.meta, t, view.season, undefined, RAIDERS)!
		expect(named.headline).toBe(plain.headline)
		expect(named.typicalText).toBe(plain.typicalText)
	})
})

describe("the weekly trail", () => {
	it("holds every key the page uses and only those", () => {
		const t = getTrail()
		expect([...t.keys].sort()).toEqual(STAT_DEFS.map((d) => d.key).sort())
		for (const teams of Object.values(t.seasons)) {
			for (const byN of Object.values(teams)) {
				for (const snap of Object.values(byN)) {
					for (const [k, v] of Object.entries(snap)) {
						expect(t.keys, k).toContain(k)
						expect(v).toHaveLength(2)
						expect(v[1]).toBeGreaterThanOrEqual(1)
						expect(v[1]).toBeLessThanOrEqual(32)
					}
				}
			}
		}
	})

	it("reads the same value and rank back as the scouting file for the week it was taken", () => {
		const sc = getScouting()
		for (const abbr of ["LV", "KC", "BUF"]) {
			const snap = getTrail().seasons[String(sc.season)]?.[abbr]?.[String(sc.teams[abbr].g)]
			expect(snap, abbr).toBeTruthy()
			for (const def of STAT_DEFS) {
				const a = scoutingStanding(sc, abbr)(def)
				const b = trailStanding(snap)(def)
				expect(b?.rank, `${abbr} ${def.key}`).toBe(a?.rank)
				expect(b?.value ?? 0, `${abbr} ${def.key}`).toBeCloseTo(a?.value ?? 0, 3)
			}
		}
	})

	it("says how the standouts moved since the week before, when there is one", () => {
		const trail = getHistoryView()!.trail
		expect(trail).not.toBeNull()
		for (const st of trail!.stats) {
			expect(st.weeks.length).toBeGreaterThan(0)
			expect(st.weeks.map((w) => w.n)).toEqual([...st.weeks.map((w) => w.n)].sort((a, b) => a - b))
		}
		if (trail!.since !== null) {
			expect(trail!.since).toBeLessThan(getHistoryView()!.n)
			for (const c of trail!.changes) expect(c.verdictChanged).toBe(c.verdictFrom !== c.verdictTo)
			for (const m of trail!.movers) expect(Math.abs(m.to - m.from)).toBeGreaterThanOrEqual(4)
		}
	})
})
