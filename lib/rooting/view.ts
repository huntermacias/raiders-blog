// Everything the page shows for one team and goal, worked out from the stored data, the schedule file and what has just finished.
// No React and no network: the page, the share card and the tests all call this, so what the card says is what the page says.

import { teamByAbbr } from "../nfl"
import { cannotTakeTopSeed, cannotWinDivision, clinchStatuses } from "../playoffs/clinching"
import { NFL_LEAGUE, buildSeason, recordOf, recordText } from "../playoffs/season"
import { seedConference } from "../playoffs/standings"
import type { Game } from "../playoffs/types"
import { resultsKey } from "./engine"
import {
	type CompletedEntry,
	GOAL_INFO,
	type GoalStatus,
	type Recommendation,
	actionable,
	baselineOf,
	baselineRange,
	completedFor,
	goalStatus,
	pctText,
	rankGames,
	recommend,
	sinceLastWeek,
} from "./guide"
import { type Settled, overdueGames } from "./live"
import type { GuideQuery } from "./share"
import { GOALS, type Goal, type RootingData, SCALE } from "./types"

export type Standing = {
	record: string
	conference: "AFC" | "NFC"
	division: string
	/** The team's place in its conference: the seed when it is in, or its place among the rest. */
	place: number
	/** "No. 3 seed, division leader", "In the hunt, 9th in the AFC". */
	text: string
	inPlayoffs: boolean
}

export type GoalSummary = { goal: Goal; label: string; short: string; baseline: number; status: GoalStatus; text: string }

/** Whether the numbers include every result that has happened, and if not, what is missing. */
export type Freshness = {
	state: "current" | "settling" | "behind"
	/** Results the numbers do not include: games reported final since they were built. */
	pending: number
	/** Games that kicked off long enough ago to be over but have no final score anywhere yet. */
	overdue: number
	/** The date of the latest final score the numbers include, or null. */
	through: string | null
	/** One sentence a reader can act on. */
	text: string
}

export type Emptiness = "none" | "season-over" | "no-games-this-week" | "nothing-matters" | "clinched" | "out"

export type GuideView = {
	team: string
	nick: string
	color: string
	goal: Goal
	scope: GuideQuery["scope"]
	/** The week the guide covers: the first week with a game still to play. Null when the season is over. */
	week: number | null
	requestedWeek: number | null
	/** Said when a link was made for a different week than the one shown. */
	weekNote: string | null
	standing: Standing
	goals: GoalSummary[]
	status: GoalStatus
	/** The one-sentence state of the selected goal. */
	headline: string
	/** The team's chance at the goal could be this low / high if the model were refitted on other past seasons. Null when not worked out. */
	baselineRange: [number, number] | null
	/** The team's next game that has not been played, with what a win and a loss are each worth. Null when it has none left. */
	own: OwnGame | null
	freshness: Freshness
	/** Games to root in, most important first, within the scope. */
	recs: Recommendation[]
	/** Games in the scope that were looked at and do not move this goal. */
	quiet: number
	/** Games in the scope that matter, in all weeks, for the "see all" link. */
	remaining: number
	empty: Emptiness
	emptyText: string
	settled: Settled[]
	completed: CompletedEntry[]
	since: ReturnType<typeof sinceLastWeek>
	/** Cautions about the data: stale, out of season, a result not in the numbers yet. */
	notes: string[]
	generatedAt: string
	sims: number
	exact: boolean
	stale: boolean
}

const nickOf = (abbr: string) => teamByAbbr(abbr).nick

/** The first week that still has a game to play, once the games already known to be over are set aside. */
export function guideWeek(data: RootingData, settled: readonly Settled[] = []): number | null {
	const done = new Set(settled.map((s) => s.gameId))
	let week: number | null = null
	for (const g of data.games) if (!done.has(g.id) && (week === null || g.week < week)) week = g.week
	return week
}

/** Whether the stored guide still matches the schedule file: false means a final score has arrived since it was built. */
export function isStale(data: RootingData, schedule: readonly Game[]): boolean {
	return data.resultsKey !== resultsKey(schedule, { sims: data.exact ? undefined : data.sims, tieSims: data.tieSims }) && !sameResults(data, schedule)
}

// A guide built with exact enumeration records sims 0, which resultsKey's settings would not reproduce; compare the games instead.
function sameResults(data: RootingData, schedule: readonly Game[]): boolean {
	if (!data.exact) return false
	return schedule.filter((g) => g.status === "final").length === data.finals && schedule.length - data.finals === data.open
}

type Proof = ReturnType<typeof clinchStatuses> extends Map<string, infer V> ? V : never

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`

function standingOf(schedule: readonly Game[], team: string): { standing: Standing; proof: Proof; cannotDiv: boolean; cannotTop: boolean } {
	const season = buildSeason(NFL_LEAGUE, schedule, {})
	const info = teamByAbbr(team)
	const seedings = (["AFC", "NFC"] as const).map((c) => seedConference(season, c))
	const mine = seedings.find((s) => s.conference === info.conference)
	const proof = clinchStatuses(season, seedings).get(team) as Proof
	const seat = mine ? mine.seeds.indexOf(team) : -1
	// Outside the seven, the place continues down the wild-card pool: the first three in it are the wild cards.
	const place = seat >= 0 ? seat + 1 : mine ? mine.seeds.length + (mine.pool.indexOf(team) - NFL_LEAGUE.wildCards) + 1 : 0
	const leader = mine ? mine.winners.includes(team) : false
	const text = seat >= 0 ? `No. ${place} seed, ${leader ? "division leader" : "wild card"}` : `Outside the seven, ${ordinal(place)} in the ${info.conference}`
	return {
		standing: { record: recordText(recordOf(season, team).overall), conference: info.conference, division: info.division, place, text, inPlayoffs: seat >= 0 },
		proof,
		cannotDiv: cannotWinDivision(season, team),
		cannotTop: cannotTakeTopSeed(season, team),
	}
}

function statusText(team: string, goal: Goal, status: GoalStatus): string {
	const nick = nickOf(team)
	if (status === "clinched") return goal === "playoffs" ? `The ${nick} have clinched a playoff spot.` : goal === "division" ? `The ${nick} have clinched the division.` : `The ${nick} have clinched the No. 1 seed.`
	if (status === "out") return goal === "playoffs" ? `The ${nick} have been eliminated from the playoffs.` : goal === "division" ? `The ${nick} can no longer win the division.` : `The ${nick} can no longer get the No. 1 seed.`
	return ""
}

export type ViewInput = {
	/** The current time in milliseconds, to tell whether the data is behind. Left out, the data is assumed to be current. */
	now?: number
	data: RootingData
	/** The schedule file's games, for the record and for what has finished since the guide was built. */
	schedule: readonly Game[]
	query: GuideQuery
	settled?: readonly Settled[]
	/** The schedule file's season, to catch a guide built for another year. */
	season?: number
}

export function buildView({ data, schedule, query, settled = [], season, now }: ViewInput): GuideView {
	const { team, goal } = query
	const info = teamByAbbr(team)
	const { standing, proof, cannotDiv, cannotTop } = standingOf(schedule, team)
	const proofOf = { ...proof, cannotWinDivision: cannotDiv, cannotTakeTopSeed: cannotTop }
	const done = new Set(settled.map((s) => s.gameId))
	const week = guideWeek(data, settled)

	const goals: GoalSummary[] = GOALS.map((g) => {
		const status = goalStatus(proofOf, g)
		const base = baselineOf(data, team, g) ?? 0
		const text = status === "clinched" ? "Clinched" : status === "out" ? (g === "playoffs" ? "Eliminated" : "Out of reach") : pctText(base)
		return { goal: g, label: GOAL_INFO[g].label, short: GOAL_INFO[g].short, baseline: base, status, text }
	})
	const status = goalStatus(proofOf, goal)
	const baseline = baselineOf(data, team, goal) ?? 0

	const all = actionable(rankGames(data, team, goal)).filter((r) => !done.has(r.gameId))
	const inScope = query.scope === "all" || week === null ? all : all.filter((r) => r.week === week)
	const allInScopeGames = data.games.filter((g) => !done.has(g.id) && (query.scope === "all" || week === null || g.week === week))
	const quiet = Math.max(0, allInScopeGames.length - inScope.length)

	const stale = isStale(data, schedule)
	const overdue = now === undefined ? [] : overdueGames(data, settled, now)
	const freshness = freshnessOf(data, settled.length, overdue.length, stale)
	const notes: string[] = []
	if (season !== undefined && data.season !== season) notes.push("This guide is for a different season than the schedule. It will refresh with the next data update.")
	if (data.exact) notes.push("Few enough games are left that every possible ending was counted, so these chances are exact for the model.")

	let empty: Emptiness = "none"
	let emptyText = ""
	if (week === null) {
		empty = "season-over"
		emptyText = "The regular season is over, so there are no games left to root in. The Playoff Machine shows the final bracket."
	} else if (status === "clinched" || status === "out") {
		empty = status
		emptyText = statusText(team, goal, status) + (status === "clinched" ? " Nothing left on the schedule can change that." : " Nothing left on the schedule can change that, so there is nothing to root for here. Try another goal.")
	} else if (!inScope.length) {
		if (query.scope !== "all" && all.length) {
			empty = "no-games-this-week"
			emptyText = `No game in Week ${week} moves the ${nickOf(team)}' chance to ${GOAL_INFO[goal].phrase} by a point or more. ${all.length === 1 ? "One later game does" : `${all.length} later games do`}.`
		} else {
			empty = "nothing-matters"
			emptyText = `No game still to play moves the ${nickOf(team)}' chance to ${GOAL_INFO[goal].phrase} by a point or more. The ${nickOf(team)}' own games included, there is nothing worth rooting over right now.`
		}
	}

	const requested = query.week
	const weekNote = requested && week !== null && requested !== week ? `This link was made for Week ${requested}. The guide always shows the current week, which is Week ${week}.` : null

	return {
		team,
		nick: info.nick,
		color: info.color,
		goal,
		scope: query.scope,
		week,
		requestedWeek: requested,
		weekNote,
		standing,
		goals,
		status,
		headline: statusText(team, goal, status),
		baselineRange: baselineRange(data, team, goal),
		own: ownNextGame(data, team, goal, done),
		freshness,
		recs: inScope,
		quiet,
		remaining: all.length,
		empty,
		emptyText,
		settled: [...settled],
		completed: completedFor(data, team, goal).filter((c) => Math.abs(c.swing) >= 0.005 || c.yours).slice(0, 8),
		since: sinceLastWeek(data, team, goal),
		notes,
		generatedAt: data.generatedAt,
		sims: data.sims,
		exact: data.exact,
		stale,
	}
}

/** The games the share card and the post text lead with: the top of the list, leaving out the followed team's own game, since "root for your own team" says nothing. */
export function topThree(view: GuideView): Recommendation[] {
	return view.recs.filter((r) => !r.yours).slice(0, 3)
}

/**
 * The followed team's next game that has not been played, with what a win and a loss are each worth to it. This is its next game
 * whether or not the game is the one that matters most: "your next game" and "the game that swings your odds most" are different
 * questions, and a headline about the first must not be built from the second.
 */
export type OwnGame = {
	gameId: string
	week: number
	date: string | null
	opp: string
	venue: "vs" | "at"
	/** The model's chance the followed team wins. */
	pWin: number
	/** True when that chance is the game's posted spread; false when it comes from the teams' ratings. */
	line: boolean
	/** The team's chance at the goal after a win and after a loss, and each one's change from now. */
	win: { p: number; delta: number }
	loss: { p: number; delta: number }
	/** Win minus loss: what the game is worth. */
	swing: number
	/** The swing's lowest and highest value across refits of the model, or null. */
	range: [number, number] | null
}

export function ownNextGame(data: RootingData, team: string, goal: Goal, skip: ReadonlySet<string> = new Set()): OwnGame | null {
	const base = baselineOf(data, team, goal)
	if (base === null) return null
	const mine = data.games.filter((g) => !skip.has(g.id) && (g.home === team || g.away === team)).sort((a, b) => a.week - b.week || (a.date ?? "").localeCompare(b.date ?? "") || (a.id < b.id ? -1 : 1))
	const next = mine[0]
	if (!next) return null
	const r = recommend(data, next, team, goal, base)
	if (r.pHome === null || r.pAway === null) return null
	const home = next.home === team
	const win = home ? r.pHome : r.pAway
	const loss = home ? r.pAway : r.pHome
	const hi = r.range
	// `range` is oriented to the best side; reorient it to a win for this team.
	const winIsBest = r.best === null ? null : (r.best === "H") === home
	const range: [number, number] | null = hi === null || winIsBest === null ? null : winIsBest ? hi : [-hi[1], -hi[0]]
	return {
		gameId: next.id,
		week: next.week,
		date: next.date,
		opp: home ? next.away : next.home,
		venue: home ? "vs" : "at",
		pWin: home ? next.pHome / SCALE : 1 - next.pHome / SCALE,
		line: next.line,
		win: { p: win, delta: win - base },
		loss: { p: loss, delta: loss - base },
		swing: win - loss,
		range,
	}
}

/** The followed team's next game (see ownNextGame), for the share card and the post text. */
export function ownGame(view: GuideView): OwnGame | null {
	return view.own
}

const pts = (v: number) => `${Math.round(Math.abs(v) * 100)}-pt`

/** The words that go with a post: the week, the goal, the team's next game as a win and a loss, then the other games that swing its odds most. */
export function shareText(view: GuideView): string {
	const goal = GOAL_INFO[view.goal].phrase
	if (view.empty === "clinched" || view.empty === "out") return `${view.nick} Sunday Rooting Guide: ${view.headline}`
	const picks = topThree(view)
	const own = view.own
	const week = view.week ? `Week ${view.week} ` : ""
	if (!picks.length && !own) return `${week}rooting guide for ${view.nick} fans hoping to ${goal}: nothing left moves their odds by a point.`
	const parts: string[] = []
	if (own) {
		const opp = nickOf(own.opp)
		parts.push(`Next game, ${own.venue} the ${opp} (Week ${own.week}): a win puts the ${view.nick} at ${pctText(own.win.p)}, a loss at ${pctText(own.loss.p)} (${pts(own.swing)} swing).`)
	}
	if (picks.length) parts.push(`${own ? "Elsewhere: " : ""}${picks.map((r, i) => `${i + 1}. ${nickOf(r.rootFor as string)} win (${pts(r.spread)} swing)`).join(" ")}`)
	return `${week}rooting guide for ${view.nick} fans hoping to ${goal}: ${parts.join(" ")}`
}

function freshnessOf(data: RootingData, pending: number, overdue: number, stale: boolean): Freshness {
	const through = data.lastFinal
	const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
	if (pending > 0 || stale) {
		const k = Math.max(pending, 0)
		return {
			state: "settling",
			pending: k,
			overdue,
			through,
			text: k > 0 ? `${n(k, "game has", "games have")} ended since these numbers were worked out, so they do not include ${k === 1 ? "that result" : "those results"} yet. They are being recalculated.` : "A newer score has come in than these numbers include. They are being recalculated.",
		}
	}
	if (overdue > 0) {
		return {
			state: "behind",
			pending: 0,
			overdue,
			through,
			text: `${n(overdue, "game", "games")} that should be over ${overdue === 1 ? "has" : "have"} no final score in our data yet, so the numbers do not include ${overdue === 1 ? "it" : "them"}.`,
		}
	}
	return { state: "current", pending: 0, overdue: 0, through, text: through ? `Includes every final score through ${through}.` : "No games have been played yet." }
}
