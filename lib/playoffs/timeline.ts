// The season as a film strip: the standings after each week, for one scenario. Everything the replay, the team
// explorer and the season summary show comes from here, so they can never disagree with each other or with the table.
//
// A frame is "the league after the games of weeks 1 to N", built by running the same simulateSeason the page uses on
// a schedule where every game after week N is treated as not yet played. Real results and the reader's picks count
// the same way they do everywhere else. The last frame is the whole scenario, so it equals simulateSeason(games, picks).
//
// Pure and deterministic: the same games and picks always give the same frames, in any order they are asked for.

import { actualOutcome } from "./season"
import { type Berth, type SimulationResult, simulateSeason } from "./simulator"
import type { Conference, Game, League, Outcome, Predictions, WLT } from "./types"

export type FrameTeam = {
	record: WLT
	conference: Conference
	division: string
	/** 1 to 7 for a playoff team, null for the rest. */
	seed: number | null
	/** Place in the conference table, 1 first. */
	rank: number
	/** Place in the division, 1 first. */
	divisionRank: number
	berth: Berth
	clinchedDivision: boolean
	clinchedPlayoff: boolean
	clinchedTopSeed: boolean
	eliminated: boolean
	/** Wins a team would need to gain on the last playoff seed to catch it: 0 on the line, negative when ahead of it. */
	behind: number
	/** Win percentage, a tie counting half. */
	pct: number
}

export type Frame = {
	/** The last week whose games are counted. */
	week: number
	/** Games with a result so far (played or picked). */
	decided: number
	teams: Record<string, FrameTeam>
	/** Each conference in table order. */
	order: Record<Conference, string[]>
	seeds: Record<Conference, string[]>
}

export type Timeline = {
	weeks: number[]
	frames: Frame[]
	/** The whole scenario: identical to the last frame's standings. */
	final: SimulationResult
}

/** The schedule as it stood after `week`: every later game goes back to not played. */
export function gamesThrough(games: readonly Game[], week: number): Game[] {
	return games.map((g) => (g.week <= week ? g : { ...g, status: "scheduled" as const, homeScore: null, awayScore: null, winner: null, tie: false }))
}

function picksThrough(games: readonly Game[], picks: Predictions, week: number): Predictions {
	const out: Record<string, Outcome> = {}
	for (const g of games) if (g.week <= week && Object.prototype.hasOwnProperty.call(picks, g.id) && actualOutcome(g) === null) out[g.id] = picks[g.id]
	return out
}

function frameOf(sim: SimulationResult, week: number): Frame {
	const teams: Record<string, FrameTeam> = {}
	const line: Partial<Record<Conference, WLT>> = {}
	for (const c of Object.keys(sim.conferences) as Conference[]) {
		const last = sim.conferences[c].seeds[sim.conferences[c].seeds.length - 1]
		if (last) line[c] = sim.teams[last].overall
	}
	for (const t of Object.values(sim.teams)) {
		const l = line[t.conference]
		// Games behind the last playoff seed: half the gap in wins plus half the gap in losses, the baseball way.
		const behind = l ? (l.w - t.overall.w + (t.overall.l - l.l)) / 2 : 0
		teams[t.team] = {
			record: t.overall,
			conference: t.conference,
			division: t.division,
			seed: t.seed,
			rank: t.rank,
			divisionRank: t.divisionRank,
			berth: t.berth,
			clinchedDivision: t.clinchedDivision,
			clinchedPlayoff: t.clinchedPlayoff,
			clinchedTopSeed: t.clinchedTopSeed,
			eliminated: t.eliminated,
			behind,
			pct: t.pct,
		}
	}
	const order = {} as Record<Conference, string[]>
	const seeds = {} as Record<Conference, string[]>
	for (const c of Object.keys(sim.conferences) as Conference[]) {
		order[c] = sim.conferences[c].table
		seeds[c] = sim.conferences[c].seeds
	}
	return { week, decided: sim.pickedGames + (sim.openGames === 0 ? 0 : 0), teams, order, seeds }
}

export function buildTimeline(games: readonly Game[], picks: Predictions = {}, league?: League): Timeline {
	const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b)
	const frames = weeks.map((w) => {
		const sim = simulateSeason({ games: gamesThrough(games, w), predictions: picksThrough(games, picks, w), league })
		const f = frameOf(sim, w)
		f.decided = games.filter((g) => g.week <= w && (actualOutcome(g) !== null || Object.prototype.hasOwnProperty.call(picks, g.id))).length
		return f
	})
	return { weeks, frames, final: simulateSeason({ games, predictions: picks, league }) }
}

// ---------------------------------------------------------------------------------------------------------------------
// What happened, week by week.

export type SeasonEventKind = "division-lead" | "enters-picture" | "leaves-picture" | "clinched-division" | "clinched-playoff" | "clinched-bye" | "eliminated" | "top-seed"

export type SeasonEvent = {
	week: number
	team: string
	kind: SeasonEventKind
	/** The other team in the story: who lost the division lead, who dropped out of the picture. */
	other?: string
	text: string
}

const RANK: Record<SeasonEventKind, number> = { "clinched-bye": 0, "clinched-division": 1, "clinched-playoff": 2, eliminated: 3, "top-seed": 4, "division-lead": 5, "enters-picture": 6, "leaves-picture": 7 }

const nick = (id: string) => id

/**
 * The changes worth telling a reader about, from one frame to the next. The first frame is the baseline: nothing is
 * reported for it. Status changes (clinched, eliminated) come straight from the engine's own sound bounds, never from a
 * guess, so the replay cannot call a team in or out early.
 */
export function seasonEvents(timeline: Timeline): SeasonEvent[] {
	const out: SeasonEvent[] = []
	const { frames } = timeline
	for (let i = 1; i < frames.length; i++) {
		const prev = frames[i - 1]
		const cur = frames[i]
		if (cur.decided === prev.decided) continue
		const events: SeasonEvent[] = []
		const divisions = new Map<string, { prev?: string; cur?: string }>()
		for (const [id, t] of Object.entries(cur.teams)) {
			const p = prev.teams[id]
			if (!p) continue
			const d = divisions.get(t.division) ?? {}
			if (p.divisionRank === 1) d.prev = id
			if (t.divisionRank === 1) d.cur = id
			divisions.set(t.division, d)

			if (!p.clinchedTopSeed && t.clinchedTopSeed) events.push({ week: cur.week, team: id, kind: "clinched-bye", text: `${id} clinch the No. 1 seed and the first-round bye` })
			else if (!p.clinchedDivision && t.clinchedDivision) events.push({ week: cur.week, team: id, kind: "clinched-division", text: `${id} clinch the ${t.division}` })
			else if (!p.clinchedPlayoff && t.clinchedPlayoff && !t.clinchedDivision) events.push({ week: cur.week, team: id, kind: "clinched-playoff", text: `${id} clinch a playoff berth` })
			if (!p.eliminated && t.eliminated) events.push({ week: cur.week, team: id, kind: "eliminated", text: `${id} are eliminated from the playoffs` })

			if (p.seed === null && t.seed !== null && !t.clinchedPlayoff) events.push({ week: cur.week, team: id, kind: "enters-picture", text: `${id} move into the playoff picture as the ${t.seed} seed` })
			else if (p.seed !== null && t.seed === null && !t.eliminated) events.push({ week: cur.week, team: id, kind: "leaves-picture", text: `${id} slip out of the playoff picture` })
			if (t.seed === 1 && p.seed !== 1 && !t.clinchedTopSeed) events.push({ week: cur.week, team: id, kind: "top-seed", text: `${id} take over the No. 1 seed in the ${t.conference}` })
		}
		for (const [division, d] of Array.from(divisions)) {
			if (d.prev && d.cur && d.prev !== d.cur && !events.some((e) => e.kind === "clinched-division" && e.team === d.cur)) {
				events.push({ week: cur.week, team: d.cur, kind: "division-lead", other: d.prev, text: `${nick(d.cur)} take the ${division} lead from ${nick(d.prev)}` })
			}
		}
		events.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.team.localeCompare(b.team))
		out.push(...events)
	}
	return out
}

// ---------------------------------------------------------------------------------------------------------------------
// The season summary.

export type TeamRace = {
	team: string
	/** Best and worst place in the conference table at the end of any week. */
	bestRank: number
	worstRank: number
	bestSeed: number | null
	/** Weeks the team ended inside / outside the seven playoff spots. */
	weeksIn: number
	weeksOut: number
	/** Biggest one-week climb and fall in conference rank (places gained / lost). */
	biggestJump: { week: number; places: number }
	biggestDrop: { week: number; places: number }
}

export type RaceSummary = {
	/** Weeks that counted: a week in which no game was decided adds nothing and is left out. */
	weeks: number
	teams: Record<string, TeamRace>
	/** Times each division's leader changed hands. */
	leadChanges: Record<string, number>
	/** Weeks in which the first team out and the last team in were level on record, as the engine saw it. */
	tightWeeks: number[]
}

export function raceSummary(timeline: Timeline): RaceSummary {
	const teams: Record<string, TeamRace> = {}
	const leadChanges: Record<string, number> = {}
	// Weeks with nothing new decided repeat the week before, so counting them would pad "weeks in the field" with a guess.
	const frames = timeline.frames.filter((f, i, all) => i === 0 || f.decided !== all[i - 1].decided)
	const ids = frames.length ? Object.keys(frames[0].teams) : []
	for (const id of ids) {
		let bestRank = Infinity
		let worstRank = 0
		let bestSeed: number | null = null
		let weeksIn = 0
		let weeksOut = 0
		let jump = { week: 0, places: 0 }
		let drop = { week: 0, places: 0 }
		frames.forEach((f, i) => {
			const t = f.teams[id]
			bestRank = Math.min(bestRank, t.rank)
			worstRank = Math.max(worstRank, t.rank)
			if (t.seed !== null) {
				weeksIn++
				bestSeed = bestSeed === null ? t.seed : Math.min(bestSeed, t.seed)
			} else weeksOut++
			if (i > 0) {
				const moved = frames[i - 1].teams[id].rank - t.rank
				if (moved > jump.places) jump = { week: f.week, places: moved }
				if (-moved > drop.places) drop = { week: f.week, places: -moved }
			}
		})
		teams[id] = { team: id, bestRank, worstRank, bestSeed, weeksIn, weeksOut, biggestJump: jump, biggestDrop: drop }
	}
	for (let i = 1; i < frames.length; i++) {
		const seen = new Map<string, { prev?: string; cur?: string }>()
		for (const [id, t] of Object.entries(frames[i].teams)) {
			const d = seen.get(t.division) ?? {}
			if (t.divisionRank === 1) d.cur = id
			if (frames[i - 1].teams[id].divisionRank === 1) d.prev = id
			seen.set(t.division, d)
		}
		for (const [division, d] of Array.from(seen)) if (d.prev && d.cur && d.prev !== d.cur) leadChanges[division] = (leadChanges[division] ?? 0) + 1
	}
	const tightWeeks: number[] = []
	for (const f of frames) {
		for (const c of Object.keys(f.seeds) as Conference[]) {
			const last = f.seeds[c][f.seeds[c].length - 1]
			const next = f.order[c][f.seeds[c].length]
			if (last && next && f.teams[last].pct === f.teams[next].pct && !tightWeeks.includes(f.week)) tightWeeks.push(f.week)
		}
	}
	return { weeks: frames.length, teams, leadChanges, tightWeeks }
}

/** The value a chart line plots for a team in a frame. Rank and games-behind read "up is better"; the chart flips its own axis. */
export type ChartMetric = "rank" | "behind" | "pct"

export const METRICS: { id: ChartMetric; label: string; blurb: string }[] = [
	{ id: "rank", label: "Conference rank", blurb: "Place in the conference table after each week, 1 first. The seven playoff spots are above the dashed line." },
	{ id: "behind", label: "Games from the line", blurb: "Games behind the last playoff spot (negative means ahead of it). Zero is on the line." },
	{ id: "pct", label: "Win %", blurb: "Winning percentage after each week, a tie counting half. It ignores who the games were played against." },
]

export function metricValue(f: Frame, team: string, metric: ChartMetric): number {
	const t = f.teams[team]
	return metric === "rank" ? t.rank : metric === "behind" ? t.behind : t.pct
}
