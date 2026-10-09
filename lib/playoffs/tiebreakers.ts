// The NFL's tiebreaking procedures, written as data (an ordered list of steps) plus one small engine that walks them.
// Source: the NFL's published tie-breaking procedures (nfl.com/standings/tie-breaking-procedures).
//
// What is exact and what is not:
//  - Every record-based step is implemented exactly: head-to-head, head-to-head sweep, division record, common games
//    (with the wild-card minimum of four), conference record, strength of victory and strength of schedule.
//  - The points steps (combined points ranking, net points) need real scores, so they run only when the whole season
//    has been played. A pick has no score, so in a projection they report "unavailable" and the tie is marked unresolved
//    rather than guessed at.
//  - Net touchdowns need touchdown counts, which the schedule data does not carry, so that step is never available.
//    The final step in the real rules, a coin toss, cannot be simulated either.
// When a tie reaches a step that is unavailable, the teams are ordered by abbreviation so the result stays
// deterministic, and the decision is flagged `unresolved` so nothing downstream pretends it was settled.

import { type Season, type TeamGame, emptyWLT, gamesPlayed, pct, recordOf } from "./season"
import type { WLT } from "./types"

export type StepId =
	| "head-to-head"
	| "head-to-head-sweep"
	| "division-record"
	| "common-games"
	| "conference-record"
	| "strength-of-victory"
	| "strength-of-schedule"
	| "conference-points-rank"
	| "league-points-rank"
	| "net-points-common"
	| "net-points-conference"
	| "net-points-all"
	| "net-touchdowns"

export type TieKind = "division" | "wildcard"

/** One decision the engine made: `placed` ranked ahead of `over`, and the step that settled it. */
export type TieDecision = {
	kind: TieKind
	placed: string
	over: string[]
	step: StepId | "unresolved"
	/** For an unresolved tie, the step that could not be applied. */
	blockedBy?: StepId
	/** Every team that was still level when the engine gave up (unresolved only). */
	stillTied?: string[]
}

type StepResult = { kind: "skip" } | { kind: "unavailable" } | { kind: "keep"; teams: string[] }

export type Step = {
	id: StepId
	label: string
	/** Whether the step can be applied to a projection that includes picks. */
	needs: "record" | "scores" | "touchdowns"
	apply: (season: Season, group: readonly string[]) => StepResult
}

const SKIP: StepResult = { kind: "skip" }
const UNAVAILABLE: StepResult = { kind: "unavailable" }

// ------------------------------------------------------------------------------------------------ helpers

function recordVs(season: Season, team: string, want: (g: TeamGame) => boolean): WLT {
	const r = emptyWLT()
	for (const g of season.byTeam.get(team) ?? []) {
		if (!want(g)) continue
		if (g.result === "W") r.w++
		else if (g.result === "L") r.l++
		else r.t++
	}
	return r
}

/** The teams that have the best (highest) value, in the order they came in. */
function best(group: readonly string[], value: (team: string) => number): string[] {
	let top = -Infinity
	for (const t of group) top = Math.max(top, value(t))
	return group.filter((t) => value(t) === top)
}

const keep = (teams: string[]): StepResult => ({ kind: "keep", teams })

function commonOpponents(season: Season, group: readonly string[]): Set<string> {
	const faced = group.map((t) => new Set((season.byTeam.get(t) ?? []).map((g) => g.opp)))
	if (faced.length === 0) return new Set()
	// A tied club is never its own opponent, so the clubs in the tie drop out of the overlap on their own: those
	// games are covered by the head-to-head steps.
	return new Set(Array.from(faced[0]).filter((o) => faced.every((set) => set.has(o))))
}

/** Combined W-L-T percentage of a list of opponents: all their wins over all their games. */
function opponentsPct(season: Season, opponents: readonly string[]): number {
	let wins = 0
	let games = 0
	for (const o of opponents) {
		const r = recordOf(season, o).overall
		wins += r.w + r.t / 2
		games += gamesPlayed(r)
	}
	return games === 0 ? 0 : wins / games
}

/** Competition ranking (1, 2, 2, 4): ties share a rank. `lowerIsBetter` ranks the smallest value first. */
function rankMap(values: Map<string, number>, lowerIsBetter: boolean): Map<string, number> {
	const sorted = Array.from(values.values()).sort((a, b) => (lowerIsBetter ? a - b : b - a))
	const out = new Map<string, number>()
	values.forEach((v, team) => out.set(team, sorted.indexOf(v) + 1))
	return out
}

function pointTotals(season: Season, teams: readonly string[]) {
	const scored = new Map<string, number>()
	const allowed = new Map<string, number>()
	for (const t of teams) {
		let pf = 0
		let pa = 0
		for (const g of season.byTeam.get(t) ?? []) {
			pf += g.pf ?? 0
			pa += g.pa ?? 0
		}
		scored.set(t, pf)
		allowed.set(t, pa)
	}
	return { scored, allowed }
}

/** Each team's rank in points scored plus its rank in points allowed, among `teams`. Lower is better. */
function combinedPointsRank(season: Season, teams: readonly string[]): Map<string, number> {
	const { scored, allowed } = pointTotals(season, teams)
	const rs = rankMap(scored, false)
	const ra = rankMap(allowed, true)
	return new Map(teams.map((t) => [t, (rs.get(t) as number) + (ra.get(t) as number)]))
}

function net(season: Season, team: string, want: (g: TeamGame) => boolean): number {
	let n = 0
	for (const g of season.byTeam.get(team) ?? []) if (want(g)) n += (g.pf ?? 0) - (g.pa ?? 0)
	return n
}

// ------------------------------------------------------------------------------------------------ steps

const headToHead: Step = {
	id: "head-to-head",
	label: "Head-to-head record",
	needs: "record",
	apply(season, group) {
		const recs = new Map(group.map((t) => [t, recordVs(season, t, (g) => group.includes(g.opp))]))
		if (Array.from(recs.values()).some((r) => gamesPlayed(r) === 0)) return SKIP
		return keep(best(group, (t) => pct(recs.get(t) as WLT)))
	},
}

/** Wild card, three or more clubs: only decisive when one club beat every other, or lost to every other. */
const headToHeadSweep: Step = {
	id: "head-to-head-sweep",
	label: "Head-to-head sweep",
	needs: "record",
	apply(season, group) {
		const vs = (t: string, o: string) => recordVs(season, t, (g) => g.opp === o)
		const sweeper = group.find((t) =>
			group.every((o) => {
				if (o === t) return true
				const r = vs(t, o)
				return gamesPlayed(r) > 0 && r.l === 0 && r.t === 0
			}),
		)
		if (sweeper) return keep([sweeper])
		const swept = group.find((t) =>
			group.every((o) => {
				if (o === t) return true
				const r = vs(t, o)
				return gamesPlayed(r) > 0 && r.w === 0 && r.t === 0
			}),
		)
		if (swept) return keep(group.filter((t) => t !== swept))
		return SKIP
	},
}

const divisionRecord: Step = {
	id: "division-record",
	label: "Record in division games",
	needs: "record",
	apply: (season, group) => keep(best(group, (t) => pct(recordOf(season, t).division))),
}

function commonGames(min: number): Step {
	return {
		id: "common-games",
		label: min > 0 ? `Record in common games (minimum ${min})` : "Record in common games",
		needs: "record",
		apply(season, group) {
			const common = commonOpponents(season, group)
			if (common.size === 0) return SKIP
			const recs = new Map(group.map((t) => [t, recordVs(season, t, (g) => common.has(g.opp))]))
			if (Array.from(recs.values()).some((r) => gamesPlayed(r) < Math.max(min, 1))) return SKIP
			return keep(best(group, (t) => pct(recs.get(t) as WLT)))
		},
	}
}

const conferenceRecord: Step = {
	id: "conference-record",
	label: "Record in conference games",
	needs: "record",
	apply: (season, group) => keep(best(group, (t) => pct(recordOf(season, t).conference))),
}

const strengthOfVictory: Step = {
	id: "strength-of-victory",
	label: "Strength of victory",
	needs: "record",
	apply: (season, group) =>
		keep(
			best(group, (t) =>
				opponentsPct(
					season,
					(season.byTeam.get(t) ?? []).filter((g) => g.result === "W").map((g) => g.opp),
				),
			),
		),
}

const strengthOfSchedule: Step = {
	id: "strength-of-schedule",
	label: "Strength of schedule",
	needs: "record",
	apply: (season, group) =>
		keep(
			best(group, (t) =>
				opponentsPct(
					season,
					(season.byTeam.get(t) ?? []).map((g) => g.opp),
				),
			),
		),
}

function pointsRank(scope: "conference" | "league"): Step {
	return {
		id: scope === "conference" ? "conference-points-rank" : "league-points-rank",
		label: scope === "conference" ? "Combined rank in points scored and allowed, conference" : "Combined rank in points scored and allowed, league",
		needs: "scores",
		apply(season, group) {
			if (!season.scoresKnown) return UNAVAILABLE
			const conf = season.teamById.get(group[0])?.conference
			const pool = season.league.teams.filter((t) => scope === "league" || t.conference === conf).map((t) => t.id)
			const ranks = combinedPointsRank(season, pool)
			return keep(best(group, (t) => -(ranks.get(t) as number)))
		},
	}
}

function netPoints(id: StepId, label: string, want: (season: Season, team: string) => (g: TeamGame) => boolean, commonOnly = false): Step {
	return {
		id,
		label,
		needs: "scores",
		apply(season, group) {
			if (!season.scoresKnown) return UNAVAILABLE
			const filter = (t: string) => want(season, t)
			if (commonOnly) {
				const common = commonOpponents(season, group)
				if (common.size === 0) return SKIP
				return keep(best(group, (t) => net(season, t, (g) => common.has(g.opp))))
			}
			return keep(best(group, (t) => net(season, t, filter(t))))
		},
	}
}

const netPointsCommon = netPoints("net-points-common", "Net points in common games", () => () => true, true)
const netPointsConference = netPoints("net-points-conference", "Net points in conference games", (season, t) => {
	const conf = season.teamById.get(t)?.conference
	return (g) => season.teamById.get(g.opp)?.conference === conf
})
const netPointsAll = netPoints("net-points-all", "Net points in all games", () => () => true)

/** Needs touchdown counts the schedule data does not have, so it never applies. */
const netTouchdowns: Step = {
	id: "net-touchdowns",
	label: "Net touchdowns in all games",
	needs: "touchdowns",
	apply: () => UNAVAILABLE,
}

const leagueRank = pointsRank("league")
const conferenceRank = pointsRank("conference")

export type Procedure = { kind: TieKind; two: readonly Step[]; multi: readonly Step[] }

const DIVISION_STEPS: readonly Step[] = [headToHead, divisionRecord, commonGames(0), conferenceRecord, strengthOfVictory, strengthOfSchedule, conferenceRank, leagueRank, netPointsCommon, netPointsAll, netTouchdowns]
const WILDCARD_TAIL: readonly Step[] = [conferenceRecord, commonGames(4), strengthOfVictory, strengthOfSchedule, conferenceRank, leagueRank, netPointsConference, netPointsAll, netTouchdowns]

/** Any step by its id, for testing one rule on its own. */
export function stepById(id: StepId): Step {
	const found = [...DIVISION_STEPS, ...WILDCARD_TAIL, headToHeadSweep, netPointsConference].find((s) => s.id === id)
	if (!found) throw new Error(`No tiebreaker step named ${id}`)
	return found
}

export const DIVISION_PROCEDURE: Procedure = { kind: "division", two: DIVISION_STEPS, multi: DIVISION_STEPS }
export const WILDCARD_PROCEDURE: Procedure = { kind: "wildcard", two: [headToHead, ...WILDCARD_TAIL], multi: [headToHeadSweep, ...WILDCARD_TAIL] }

/** What the machine can and cannot apply, for the page's explanation. Mirrors the steps above. */
export function supportedSteps(): { id: StepId; label: string; needs: Step["needs"]; inProjection: boolean }[] {
	const seen = new Set<StepId>()
	const out: { id: StepId; label: string; needs: Step["needs"]; inProjection: boolean }[] = []
	for (const s of [...DIVISION_STEPS, ...WILDCARD_PROCEDURE.multi, ...WILDCARD_PROCEDURE.two]) {
		if (seen.has(s.id)) continue
		seen.add(s.id)
		out.push({ id: s.id, label: s.label, needs: s.needs, inProjection: s.needs === "record" })
	}
	return out
}

// ------------------------------------------------------------------------------------------------ engine

type Pick = { winner: string; step: StepId | "unresolved"; blockedBy?: StepId; stillTied?: string[] }

/**
 * Finds the one team that comes out ahead in a group of teams that are level on record.
 * Each step keeps the teams with the best value. If that leaves exactly one team, it wins. If it leaves fewer teams
 * than before (but more than one) the NFL starts again from the first step with the smaller group, switching to the
 * two-club list when two remain. If a step does not separate anyone, the next step is tried.
 */
export function pickBest(season: Season, group: readonly string[], proc: Procedure): Pick {
	if (group.length < 2) throw new Error("A tie needs at least two teams")
	let cur = [...group]
	for (;;) {
		const steps = cur.length === 2 ? proc.two : proc.multi
		let reduced = false
		for (const step of steps) {
			const r = step.apply(season, cur)
			if (r.kind === "skip") continue
			if (r.kind === "unavailable") return unresolved(cur, step.id)
			if (r.teams.length === 1) return { winner: r.teams[0], step: step.id }
			if (r.teams.length < cur.length) {
				cur = r.teams
				reduced = true
				break
			}
		}
		if (!reduced) return unresolved(cur, null)
	}
}

function unresolved(cur: readonly string[], blockedBy: StepId | null): Pick {
	const order = [...cur].sort()
	return { winner: order[0], step: "unresolved", blockedBy: blockedBy ?? undefined, stillTied: order }
}

function record(decisions: TieDecision[], kind: TieKind, group: readonly string[], p: Pick) {
	const d: TieDecision = { kind, placed: p.winner, over: group.filter((t) => t !== p.winner), step: p.step, blockedBy: p.blockedBy, stillTied: p.stillTied }
	// A wild-card tie repeats the division step for every spot it fills; say it once.
	const same = decisions.some((x) => x.kind === d.kind && x.placed === d.placed && x.step === d.step && x.over.join() === d.over.join())
	if (!same) decisions.push(d)
}

/** Orders teams from the same division that have the same record. Best first. */
export function breakDivisionTie(season: Season, teams: readonly string[], decisions: TieDecision[] = []): string[] {
	const remaining = [...teams]
	const order: string[] = []
	while (remaining.length > 1) {
		const p = pickBest(season, remaining, DIVISION_PROCEDURE)
		record(decisions, "division", remaining, p)
		order.push(p.winner)
		remaining.splice(remaining.indexOf(p.winner), 1)
	}
	return order.concat(remaining)
}

/**
 * Orders teams from the same conference that have the same record, for a wild-card spot or for seeding the division
 * winners. Several teams from one division are first cut to the best of them by the division procedure, and that is
 * repeated for every spot in the order, as the NFL does.
 */
export function breakWildCardTie(season: Season, teams: readonly string[], decisions: TieDecision[] = []): string[] {
	const remaining = [...teams]
	const order: string[] = []
	while (remaining.length > 1) {
		const byDivision = new Map<string, string[]>()
		for (const t of remaining) {
			const d = season.teamById.get(t)?.division ?? ""
			byDivision.set(d, [...(byDivision.get(d) ?? []), t])
		}
		const candidates: string[] = []
		for (const members of Array.from(byDivision.values())) {
			if (members.length === 1) {
				candidates.push(members[0])
				continue
			}
			const p = pickBest(season, members, DIVISION_PROCEDURE)
			record(decisions, "division", members, p)
			candidates.push(p.winner)
		}
		const winner = candidates.length === 1 ? candidates[0] : (() => {
			const p = pickBest(season, candidates, WILDCARD_PROCEDURE)
			record(decisions, "wildcard", candidates, p)
			return p.winner
		})()
		order.push(winner)
		remaining.splice(remaining.indexOf(winner), 1)
	}
	return order.concat(remaining)
}
