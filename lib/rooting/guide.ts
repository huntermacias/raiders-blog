// Turns the numbers the build stored into what a fan reads: which games to root in, for whom, how much it matters and why.
// Pure functions of the data file; no simulation happens here, so every page view is cheap and every answer can be traced to a
// stored number. Probabilities come back as 0 to 1. Differences are points (0.05 is five percentage points), never percent growth.

import { teamByAbbr } from "../nfl"
import { GOALS, SCALE, type CompletedGame, type Goal, type RootingData, type RootingGame } from "./types"

// ---------------------------------------------------------------------------------------------- thresholds

/** A game whose best and worst outcomes are closer than this (a point) does not matter enough to rank. */
export const NEGLIGIBLE = 0.01
/** Spreads under this are "minor", under NOTABLE "notable", and from there "major". */
export const MINOR = 0.03
export const NOTABLE = 0.08
/** How many standard errors a difference must clear before it is called real. Two is about 95% sure. */
export const Z = 2

export type Impact = "none" | "minor" | "notable" | "major"

export const IMPACT_LABEL: Record<Impact, string> = { none: "No real impact", minor: "Minor", notable: "Notable", major: "Major" }

export const GOAL_INFO: Record<Goal, { label: string; short: string; phrase: string; question: string }> = {
	playoffs: { label: "Make the playoffs", short: "Playoffs", phrase: "make the playoffs", question: "make the playoffs" },
	division: { label: "Win the division", short: "Division", phrase: "win the division", question: "win the division" },
	bye: { label: "Get the No. 1 seed", short: "No. 1 seed", phrase: "get the No. 1 seed", question: "earn the first-round bye" },
}

export function isGoal(v: string | null | undefined): v is Goal {
	return v === "playoffs" || v === "division" || v === "bye"
}

const goalIndex = (goal: Goal) => GOALS.indexOf(goal)

export function teamIndex(data: RootingData, team: string): number {
	return data.teams.indexOf(team)
}

const at = (data: RootingData, list: number[], team: string, goal: Goal): number => list[teamIndex(data, team) * GOALS.length + goalIndex(goal)] / SCALE

/** The team's chance at the goal as things stand, 0 to 1. Null for a team the data does not have. */
export function baselineOf(data: RootingData, team: string, goal: Goal): number | null {
	return teamIndex(data, team) < 0 ? null : at(data, data.baseline, team, goal)
}

// ---------------------------------------------------------------------------------------------- relations

export type Relation = "self" | "division" | "conference" | "other"

/** How `other` relates to `team`: the same team, a division rival, a conference rival, or a team in the other conference. */
export function relation(team: string, other: string): Relation {
	if (team === other) return "self"
	const a = teamByAbbr(team)
	const b = teamByAbbr(other)
	if (a.division === b.division) return "division"
	return a.conference === b.conference ? "conference" : "other"
}

// ---------------------------------------------------------------------------------------------- goal status

/** What the standings prove about a goal, with no simulation: already certain either way, or still open. */
export type GoalStatus = "clinched" | "out" | "live"

export type Proof = {
	clinchedPlayoff: boolean
	clinchedDivision: boolean
	clinchedTopSeed: boolean
	eliminated: boolean
	cannotWinDivision: boolean
	cannotTakeTopSeed: boolean
}

export function goalStatus(proof: Proof, goal: Goal): GoalStatus {
	if (goal === "playoffs") return proof.clinchedPlayoff ? "clinched" : proof.eliminated ? "out" : "live"
	if (goal === "division") return proof.clinchedDivision ? "clinched" : proof.eliminated || proof.cannotWinDivision ? "out" : "live"
	return proof.clinchedTopSeed ? "clinched" : proof.eliminated || proof.cannotWinDivision || proof.cannotTakeTopSeed ? "out" : "live"
}

// ---------------------------------------------------------------------------------------------- ranking the games

export type Side = "H" | "A"

export type Recommendation = {
	gameId: string
	week: number
	away: string
	home: string
	/** One of the two teams is the one being followed. */
	yours: boolean
	/** The team's chance at the goal if the home team wins, if the away team wins, and if the game ends in a tie (null when not worked out). */
	pHome: number | null
	pAway: number | null
	pTie: number | null
	baseline: number
	/** The model's chance the home team wins. */
	modelHome: number
	/** The outcome that helps most, or null when the data cannot say (a side was too rare to measure). */
	best: Side | null
	rootFor: string | null
	rootAgainst: string | null
	/** Chance at the goal after the best and the worst outcome, and how far each is from the baseline, in points as a fraction. */
	bestP: number | null
	worstP: number | null
	gain: number | null
	loss: number | null
	/** Best minus worst: how much the game is worth. */
	spread: number
	/** The sampling error of that difference. Zero when every ending was added up exactly. */
	se: number
	/** True when the spread is bigger than sampling error alone would produce. */
	significant: boolean
	/** One of the two outcomes happened in too few simulated seasons to measure. */
	thin: boolean
	impact: Impact
}

export function impactOf(spread: number, se: number, exact: boolean): Impact {
	if (spread < NEGLIGIBLE) return "none"
	if (!exact && spread < Z * se) return "none"
	if (spread < MINOR) return "minor"
	if (spread < NOTABLE) return "notable"
	return "major"
}

/** The bucket sizes below which a conditional chance is too rough to quote (same floor the Playoff Machine uses). */
export const MIN_BUCKET = 120

function recommend(data: RootingData, g: RootingGame, team: string, goal: Goal, base: number): Recommendation {
	const idx = teamIndex(data, team) * GOALS.length + goalIndex(goal)
	const [nH, nA] = g.n
	const exact = data.exact
	const okH = exact || nH >= MIN_BUCKET
	const okA = exact || nA >= MIN_BUCKET
	const pH = okH ? g.H[idx] / SCALE : null
	const pA = okA ? g.A[idx] / SCALE : null
	const tie = data.ties[g.id]
	const pTie = tie ? tie[idx] / SCALE : null
	const yours = g.home === team || g.away === team

	let best: Side | null = null
	let bestP: number | null = null
	let worstP: number | null = null
	let se = 0
	let spread = 0
	if (pH !== null && pA !== null) {
		best = pH === pA ? null : pH > pA ? "H" : "A"
		bestP = Math.max(pH, pA)
		worstP = Math.min(pH, pA)
		spread = bestP - worstP
		se = exact ? 0 : Math.sqrt((pH * (1 - pH)) / nH + (pA * (1 - pA)) / nA)
	}
	const impact = best === null ? "none" : impactOf(spread, se, exact)
	return {
		gameId: g.id,
		week: g.week,
		away: g.away,
		home: g.home,
		yours,
		pHome: pH,
		pAway: pA,
		pTie,
		baseline: base,
		modelHome: g.pHome / SCALE,
		best: impact === "none" ? null : best,
		rootFor: impact === "none" || best === null ? null : best === "H" ? g.home : g.away,
		rootAgainst: impact === "none" || best === null ? null : best === "H" ? g.away : g.home,
		bestP,
		worstP,
		gain: bestP === null ? null : bestP - base,
		loss: worstP === null ? null : worstP - base,
		spread,
		se,
		significant: impact !== "none",
		thin: !okH || !okA,
		impact,
	}
}

/**
 * Every game still to play, scored for one team and goal, the most important first. A game is ranked by the spread between the
 * team's chance after the best outcome and after the worst. A game with no real effect keeps its place at the bottom with impact
 * "none" and no recommendation, so nothing is ever recommended on noise.
 */
export function rankGames(data: RootingData, team: string, goal: Goal): Recommendation[] {
	const base = baselineOf(data, team, goal)
	if (base === null) return []
	return data.games
		.map((g) => recommend(data, g, team, goal, base))
		.sort((a, b) => b.spread - a.spread || a.week - b.week || (a.gameId < b.gameId ? -1 : 1))
}

/** The games worth a fan's attention: those that matter, in order. */
export function actionable(recs: readonly Recommendation[]): Recommendation[] {
	return recs.filter((r) => r.impact !== "none")
}

/** The games whose tie scenario the build works out: the top few for each team and goal. */
export const TIE_TOP = 5

export function tieTargets(data: RootingData): string[] {
	const ids = new Set<string>()
	for (const team of data.teams) {
		for (const goal of GOALS) {
			actionable(rankGames(data, team, goal))
				.slice(0, TIE_TOP)
				.forEach((r) => ids.add(r.gameId))
		}
	}
	return Array.from(ids).sort()
}

// ---------------------------------------------------------------------------------------------- finished games and history

export type CompletedEntry = {
	gameId: string
	week: number
	away: string
	home: string
	awayScore: number
	homeScore: number
	winner: string | null
	yours: boolean
	/** The team's chance now minus its chance had the other team won, as a fraction. */
	swing: number
	/** "helped" or "hurt" the team's chance at the goal, or "neutral" when it barely moved. */
	effect: "helped" | "hurt" | "neutral"
}

/** A finished result under this many points either way is not called help or harm. */
export const NEUTRAL = 0.005

export function completedFor(data: RootingData, team: string, goal: Goal): CompletedEntry[] {
	const idx = teamIndex(data, team) * GOALS.length + goalIndex(goal)
	if (teamIndex(data, team) < 0) return []
	return data.completed
		.filter((c: CompletedGame) => c.swing.length > 0)
		.map((c) => {
			const swing = c.swing[idx] / SCALE
			return {
				gameId: c.id,
				week: c.week,
				away: c.away,
				home: c.home,
				awayScore: c.awayScore,
				homeScore: c.homeScore,
				winner: c.result === "T" ? null : c.result === "H" ? c.home : c.away,
				yours: c.home === team || c.away === team,
				swing,
				effect: Math.abs(swing) < NEUTRAL ? ("neutral" as const) : swing > 0 ? ("helped" as const) : ("hurt" as const),
			}
		})
		.sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing) || b.week - a.week)
}

/** The chance at the goal after the last full week, or null when there is no earlier snapshot to compare with. */
export function sinceLastWeek(data: RootingData, team: string, goal: Goal): { week: number; before: number; now: number; change: number } | null {
	const base = baselineOf(data, team, goal)
	if (base === null || !data.history.length) return null
	const sorted = [...data.history].sort((a, b) => a.week - b.week)
	// If games from a later week have already been played, the last full week is the thing to compare with; if the table sits exactly at
	// the end of a full week, compare with the week before it.
	const lastFull = sorted[sorted.length - 1]
	const playedAfter = data.throughWeek > lastFull.week
	const ref = playedAfter ? lastFull : sorted[sorted.length - 2]
	if (!ref) return null
	const before = ref.p[teamIndex(data, team) * GOALS.length + goalIndex(goal)] / SCALE
	return { week: ref.week, before, now: base, change: base - before }
}

// ---------------------------------------------------------------------------------------------- words

/** "34%", "<1%", ">99%": an estimate is never shown as certain unless the standings prove it. */
export function pctText(p: number, certain = false): string {
	if (certain) return `${Math.round(p * 100)}%`
	if (p < 0.005) return "<1%"
	if (p > 0.995) return ">99%"
	return `${Math.round(p * 100)}%`
}

/** A change in points, with a real minus sign: "+8 pts", "−1 pt", "0 pts". */
export function pointsText(delta: number): string {
	const v = Math.round(delta * 100)
	if (v === 0) return "0 pts"
	return `${v > 0 ? "+" : "−"}${Math.abs(v)} ${Math.abs(v) === 1 ? "pt" : "pts"}`
}

const nick = (abbr: string) => teamByAbbr(abbr).nick

/** One or two sentences on why the recommended result helps: what is at stake and who the other team is to the one being followed. */
export function whyText(rec: Recommendation, team: string, goal: Goal): string {
	if (!rec.rootFor || rec.bestP === null || rec.worstP === null || !rec.best) return ""
	const me = nick(team)
	const phrase = GOAL_INFO[goal].phrase
	const other = rec.rootAgainst as string
	const numbers = `The ${me}' chance to ${phrase} is ${pctText(rec.bestP)} if the ${nick(rec.rootFor)} win and ${pctText(rec.worstP)} if the ${nick(other)} do.`
	if (rec.yours) return `This is the ${me}' own game. ${numbers}`
	const rel = relation(team, other)
	const relFor = relation(team, rec.rootFor)
	if (rel === "division") return `The ${nick(other)} are in the ${teamByAbbr(team).division}, so a loss for them helps the ${me}' race directly. ${numbers}`
	if (relFor === "division") return `The ${nick(rec.rootFor)} are a division rival, but this is the better result for the ${me}: it keeps the ${nick(other)} from gaining ground. ${numbers}`
	if (rel === "conference") return `The ${nick(other)} are chasing the same ${teamByAbbr(team).conference} seeds, so a loss for them helps. ${numbers}`
	if (rel === "other" && relFor === "other") return `This game is in the other conference, so it matters only through the tiebreakers, such as strength of victory and strength of schedule. ${numbers}`
	if (rel === "other") return `This game is across conferences, so it matters through the tiebreakers, such as strength of victory and strength of schedule. ${numbers}`
	return numbers
}

export type Outlook = { team: string; goal: Goal; baseline: number; status: GoalStatus }
