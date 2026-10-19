// The standings table beside the Rooting Guide: every team's place in its division, its conference and the league, its chance at the
// selected goal, and one more number from elsewhere on the site. Pure: the page hands in what it has already read, and nothing here
// simulates anything. Order and seeds come from the same tiebreaker engine as the Playoff Machine.

import { teamByAbbr } from "../nfl"
import { buildSeason, NFL_LEAGUE, pct, recordOf, recordText } from "../playoffs/season"
import { seedConference } from "../playoffs/standings"
import type { Game, League } from "../playoffs/types"
import { baselineOf, baselineRange } from "./guide"
import type { Settled } from "./live"
import { type Goal, type RootingData, SCALE } from "./types"

/** What the side column can show. */
export type Extra = "wins" | "diff" | "off" | "def"

export const EXTRAS: readonly { key: Extra; label: string; hint: string }[] = [
	{ key: "wins", label: "Projected wins", hint: "Wins so far plus the model's chance of winning each game left" },
	{ key: "diff", label: "Point diff", hint: "Points scored minus points allowed this season" },
	{ key: "off", label: "Offense", hint: "Offense rank from the Lab's team board (1 is best)" },
	{ key: "def", label: "Defense", hint: "Defense rank from the Lab's team board (1 is best)" },
]

export type TableRow = {
	team: string
	nick: string
	conference: string
	division: string
	record: string
	w: number
	l: number
	t: number
	pf: number
	pa: number
	/** 1 to 4 within the division, 1 to 16 within the conference, 1 to 32 in the league. */
	divRank: number
	confRank: number
	leagueRank: number
	/** The playoff seed the team would have if the season ended now (1 to 7), or null. */
	seed: number | null
	/** Chance at the selected goal, 0 to 1, and the range across refits of the model (null when not worked out). */
	odds: number
	oddsRange: [number, number] | null
	/** Wins so far plus the model's expected wins in the games left. */
	projWins: number
	/** Rank from the Lab's team board, 1 is best; null when the board does not have the team. */
	offRank: number | null
	defRank: number | null
}

export type UnitRanks = Record<string, { off: number | null; def: number | null }>

export type TableInput = {
	data: RootingData
	schedule: readonly Game[]
	goal: Goal
	settled?: readonly Settled[]
	ranks?: UnitRanks
	league?: League
}

/** The order of one conference from first to last: the seven seeds, then everyone else as the wild-card pool has them. */
function conferenceOrder(seasonSeeding: ReturnType<typeof seedConference>): string[] {
	return [...seasonSeeding.seeds, ...seasonSeeding.pool.filter((t) => !seasonSeeding.seeds.includes(t))]
}

export function tableRows(input: TableInput): TableRow[] {
	const { data, schedule, goal } = input
	const league = input.league ?? NFL_LEAGUE
	const season = buildSeason(league, schedule, {})

	const points = new Map<string, { pf: number; pa: number }>(league.teams.map((t) => [t.id, { pf: 0, pa: 0 }]))
	for (const g of schedule) {
		if (g.status !== "final" || g.homeScore === null || g.awayScore === null) continue
		const h = points.get(g.homeTeam)
		const a = points.get(g.awayTeam)
		if (h) {
			h.pf += g.homeScore
			h.pa += g.awayScore
		}
		if (a) {
			a.pf += g.awayScore
			a.pa += g.homeScore
		}
	}

	// Expected wins left: the model's chance in each open game, or the real result for one that has just ended.
	const done = new Map((input.settled ?? []).map((s) => [s.gameId, s]))
	const expected = new Map<string, number>()
	const add = (team: string, v: number) => expected.set(team, (expected.get(team) ?? 0) + v)
	for (const g of data.games) {
		const s = done.get(g.id)
		if (s) {
			const tie = s.homeScore === s.awayScore
			add(g.home, tie ? 0.5 : s.homeScore > s.awayScore ? 1 : 0)
			add(g.away, tie ? 0.5 : s.awayScore > s.homeScore ? 1 : 0)
			continue
		}
		const p = g.pHome / SCALE
		add(g.home, p)
		add(g.away, 1 - p)
	}

	const confs = Array.from(new Set(league.teams.map((t) => t.conference))).sort()
	const confRank = new Map<string, number>()
	const seed = new Map<string, number>()
	const divRank = new Map<string, number>()
	for (const c of confs) {
		const s = seedConference(season, c)
		conferenceOrder(s).forEach((t, i) => confRank.set(t, i + 1))
		s.seeds.forEach((t, i) => seed.set(t, i + 1))
		for (const members of Object.values(s.divisions)) members.forEach((t, i) => divRank.set(t, i + 1))
	}

	const leagueOrder = league.teams
		.map((t) => t.id)
		.sort((a, b) => {
			const ra = recordOf(season, a).overall
			const rb = recordOf(season, b).overall
			const da = (points.get(a)?.pf ?? 0) - (points.get(a)?.pa ?? 0)
			const db = (points.get(b)?.pf ?? 0) - (points.get(b)?.pa ?? 0)
			return pct(rb) - pct(ra) || db - da || (a < b ? -1 : 1)
		})
	const leagueRank = new Map(leagueOrder.map((t, i) => [t, i + 1]))

	return league.teams.map((t) => {
		const rec = recordOf(season, t.id).overall
		const pts = points.get(t.id) ?? { pf: 0, pa: 0 }
		const ranks = input.ranks?.[t.id]
		return {
			team: t.id,
			nick: teamByAbbr(t.id).nick,
			conference: t.conference,
			division: t.division,
			record: recordText(rec),
			w: rec.w,
			l: rec.l,
			t: rec.t,
			pf: pts.pf,
			pa: pts.pa,
			divRank: divRank.get(t.id) ?? 0,
			confRank: confRank.get(t.id) ?? 0,
			leagueRank: leagueRank.get(t.id) ?? 0,
			seed: seed.get(t.id) ?? null,
			odds: baselineOf(data, t.id, goal) ?? 0,
			oddsRange: baselineRange(data, t.id, goal),
			projWins: rec.w + rec.t / 2 + (expected.get(t.id) ?? 0),
			offRank: ranks?.off ?? null,
			defRank: ranks?.def ?? null,
		}
	})
}

export type Scope = "division" | "conference" | "league"

/** The rows to show for a team's tab, best first. Division and conference show the team's own; the league shows everyone. */
export function rowsFor(rows: readonly TableRow[], team: string, scope: Scope): TableRow[] {
	const me = rows.find((r) => r.team === team)
	if (!me) return []
	const key = scope === "division" ? "divRank" : scope === "conference" ? "confRank" : "leagueRank"
	const pool = scope === "division" ? rows.filter((r) => r.division === me.division) : scope === "conference" ? rows.filter((r) => r.conference === me.conference) : rows
	return [...pool].sort((a, b) => a[key] - b[key])
}

/** The side column's value and the words for it. */
export function extraText(row: TableRow, extra: Extra): string {
	switch (extra) {
		case "wins":
			return row.projWins.toFixed(1)
		case "diff": {
			const d = row.pf - row.pa
			return d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0"
		}
		case "off":
			return row.offRank === null ? "–" : String(row.offRank)
		case "def":
			return row.defRank === null ? "–" : String(row.defRank)
	}
}
