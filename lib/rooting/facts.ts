// The plain facts a game card shows besides the odds: when the game is, each team's record and how each relates to the team being followed.
// Pure; the page passes in the schedule's games and the records.

import { teamByAbbr } from "../nfl"
import { kickoffLabel } from "../playoffs/format"
import { NFL_LEAGUE, buildSeason, recordOf, recordText } from "../playoffs/season"
import type { Game } from "../playoffs/types"
import { GOAL_INFO, type Recommendation, relation, whyText } from "./guide"
import type { Goal } from "./types"

export type GameFacts = {
	when: string
	awayRecord: string
	homeRecord: string
	why: string
	goalPhrase: string
	context: string[]
}

const RELATION_TEXT = { division: "division rival", conference: "conference rival", other: "other conference" } as const

/** Facts for each recommended game, keyed by game id. */
export function gameFactsFor(schedule: readonly Game[], recs: readonly Recommendation[], team: string, goal: Goal): Record<string, GameFacts> {
	const season = buildSeason(NFL_LEAGUE, schedule, {})
	const byId = new Map(schedule.map((g) => [g.id, g]))
	const out: Record<string, GameFacts> = {}
	for (const rec of recs) {
		const g = byId.get(rec.gameId)
		const context: string[] = []
		for (const abbr of [rec.away, rec.home]) {
			if (abbr === team) continue
			const rel = relation(team, abbr)
			if (rel !== "self") context.push(`${teamByAbbr(abbr).nick}: ${RELATION_TEXT[rel]}`)
		}
		out[rec.gameId] = {
			when: g ? kickoffLabel(g.date, g.time) : "",
			awayRecord: recordText(recordOf(season, rec.away).overall),
			homeRecord: recordText(recordOf(season, rec.home).overall),
			why: whyText(rec, team, goal),
			goalPhrase: GOAL_INFO[goal].phrase,
			context,
		}
	}
	return out
}
