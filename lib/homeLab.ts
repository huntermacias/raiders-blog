// What the homepage's Lab band says and shows. It changes with where the Raiders are in their week (a game being played, a game just
// played, early in the week, close to kickoff, nothing scheduled) and carries one live number from the Rooting Guide: the Raiders'
// playoff odds and the game elsewhere that moves them most. Pure: the page loads the guide and hands over the view, so every
// sentence here can be tested without a clock or a file.

import type { HubState } from "./home"
import { LAB_TOOLS, type LabTool } from "./lab/tools"
import { teamByAbbr } from "./nfl"
import { type GoalStatus, GOAL_INFO, pctText, pointsText } from "./rooting/guide"
import { guidePath } from "./rooting/share"
import type { Goal } from "./rooting/types"
import { type GuideView, ownGame, topThree } from "./rooting/view"

export type LabPhase = "live" | "final" | "early" | "late" | "idle"

/** Within this long of kickoff it is game week in earnest. */
export const GAME_WEEK_HOURS = 72

export function labPhase(state: HubState, nowMs: number): LabPhase {
	if (state.kind === "live") return "live"
	if (state.kind === "final") return "final"
	if (state.kind === "idle") return "idle"
	const t = state.game.kickoff ? new Date(state.game.kickoff).getTime() : NaN
	if (Number.isNaN(t)) return "early"
	return (t - nowMs) / 3_600_000 <= GAME_WEEK_HOURS ? "late" : "early"
}

export type LabCopy = { title: string; blurb: string }

/** The band's heading and the sentence under it. `week` is the week being talked about, when there is one. */
export function labCopy(phase: LabPhase, week: number | null): LabCopy {
	const w = week ? `Week ${week}` : "this week"
	switch (phase) {
		case "live":
			return { title: "While you watch", blurb: "The other games are on too. These are the ones that move the Raiders' playoff odds." }
		case "final":
			return { title: "After the final", blurb: "What the result did to the playoff race, and what to root for next." }
		case "late":
			return { title: `Game week in the Lab`, blurb: `Matchups, scouting and the numbers behind ${w}.` }
		case "early":
			return { title: `${week ? `Week ${week}` : "This week"} in the Lab`, blurb: "Get ahead of Sunday: the matchups, the scouting and the math." }
		default:
			return { title: "The Lab", blurb: "Playoff odds, matchups and every Raiders game rebuilt from the play-by-play." }
	}
}

/** The tools that go beside the Rooting Guide panel, in order. The Rooting Guide itself is the panel, so it is not repeated here. */
const TOOLS_BY_PHASE: Record<LabPhase, string[]> = {
	live: ["playoff-machine", "matchups", "top-plays"],
	final: ["playoff-machine", "top-plays", "season-twins"],
	early: ["matchups", "scouting", "will-it-last"],
	late: ["matchups", "scouting", "playoff-machine"],
	idle: ["playoff-machine", "teams", "season-twins"],
}

export function labTools(phase: LabPhase): LabTool[] {
	return TOOLS_BY_PHASE[phase].map((id) => LAB_TOOLS.find((t) => t.id === id)).filter((t): t is LabTool => Boolean(t))
}

export type RootingSnapshot = {
	nick: string
	goal: Goal
	goalPhrase: string
	week: number | null
	status: GoalStatus
	/** "41%", or "Clinched" / "Out" when the standings settle it. */
	pct: string
	/** 0 to 1, for the bar. */
	baseline: number
	change: { text: string; dir: "up" | "down" | "flat"; since: string } | null
	best: { gameId: string; rootFor: string; against: string; forNick: string; againstNick: string; matchup: string; gain: string; small: boolean } | null
	own: { opp: string; venue: "vs" | "at"; win: string; loss: string } | null
	/** How many games in this week's list move the odds by a point or more. */
	matters: number
	/** One sentence for the cases with no list: clinched, out, nothing moves it. */
	headline: string
	/** A final score has come in that the numbers do not include yet. */
	updating: boolean
	href: string
}

const nickOf = (abbr: string) => teamByAbbr(abbr).nick

export function rootingSnapshot(view: GuideView): RootingSnapshot {
	const picks = topThree(view)
	const top = picks[0]
	const own = ownGame(view)
	const goal = view.goals.find((g) => g.goal === view.goal)
	const since = view.since
	const change: RootingSnapshot["change"] =
		since && view.status === "live"
			? Math.abs(since.change) < 0.005
				? { text: "No change", dir: "flat", since: `since Week ${since.week}` }
				: { text: pointsText(since.change), dir: since.change > 0 ? "up" : "down", since: `since Week ${since.week}` }
			: null

	return {
		nick: view.nick,
		goal: view.goal,
		goalPhrase: GOAL_INFO[view.goal].phrase,
		week: view.week,
		status: view.status,
		pct: view.status === "clinched" ? "Clinched" : view.status === "out" ? "Out" : pctText(goal?.baseline ?? 0),
		baseline: goal?.baseline ?? 0,
		change,
		best:
			top && top.rootFor && top.rootAgainst
				? {
						gameId: top.gameId,
						rootFor: top.rootFor,
						against: top.rootAgainst,
						forNick: nickOf(top.rootFor),
						againstNick: nickOf(top.rootAgainst),
						matchup: `${nickOf(top.away)} at ${nickOf(top.home)}`,
						gain: pointsText(top.gain ?? 0),
						small: (top.gain ?? 0) < 0.02,
				  }
				: null,
		own: own ? { opp: nickOf(own.opp), venue: own.venue, win: pointsText(own.win.delta), loss: pointsText(own.loss.delta) } : null,
		matters: view.recs.length,
		headline: view.headline || view.emptyText,
		updating: view.stale || view.settled.length > 0,
		href: guidePath({ team: view.team, goal: view.goal }),
	}
}

/** The first goal the team can still change (playoffs, then division, then the No. 1 seed), or the playoffs when it has none. */
export function chooseView(build: (goal: Goal) => GuideView): GuideView {
	const first = build("playoffs")
	if (first.status === "live") return first
	for (const g of ["division", "bye"] as const) {
		const v = build(g)
		if (v.status === "live") return v
	}
	return first
}
