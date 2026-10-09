// simulateSeason: the schedule plus a reader's picks in, standings, seeds, bracket and clinching out.
//
// Pure and deterministic: the same games and picks always give the same result, nothing is read from the clock, the
// network or Math.random, and the inputs are never changed. That makes it safe to call thousands of times outside
// the page (for "what does Kansas City need?" style questions later) and easy to test.

import { buildBracket, type Bracket } from "./bracket"
import { type ClinchStatus, clinchStatuses } from "./clinching"
import { NFL_LEAGUE, buildSeason, openGamesFor, pct, recordOf } from "./season"
import { type ConferenceSeeding, seedConference } from "./standings"
import type { TieDecision } from "./tiebreakers"
import type { Conference, Game, League, Predictions, WLT } from "./types"

export type SimulationInput = {
	games: readonly Game[]
	predictions?: Predictions
	league?: League
}

/** Where a team stands in the scenario. */
export type Berth = "division" | "wildcard" | "hunt" | "out"

export type TeamResult = ClinchStatus & {
	team: string
	conference: Conference
	division: string
	overall: WLT
	divisionRecord: WLT
	conferenceRecord: WLT
	pct: number
	/** 1 to 7 for a playoff team, null for everyone else. */
	seed: number | null
	berth: Berth
	/** Position in the conference table, 1 first. */
	rank: number
	/** Position in the division, 1 first. */
	divisionRank: number
	/** Games this team still has open (not played and not picked). */
	openGames: number
}

export type ConferenceResult = {
	conference: Conference
	/** The whole conference in table order: the seeds, then the rest. */
	table: string[]
	seeds: string[]
	divisions: Record<string, string[]>
}

export type SimulationResult = {
	teams: Record<string, TeamResult>
	conferences: Record<Conference, ConferenceResult>
	/** Every playoff team, AFC then NFC, seed order. */
	playoffTeams: string[]
	/** Teams that cannot make the playoffs. */
	eliminatedTeams: string[]
	/** Teams that have clinched at least a playoff berth. */
	clinchedTeams: string[]
	bracket: Record<Conference, Bracket>
	/** How every tie was settled, for the page to explain. */
	ties: TieDecision[]
	openGames: number
	pickedGames: number
	/** True when every game has a result (played or picked), so the standings are final for this scenario. */
	complete: boolean
}

export function simulateSeason(input: SimulationInput): SimulationResult {
	const league = input.league ?? NFL_LEAGUE
	const season = buildSeason(league, input.games, input.predictions ?? {})

	const ties: TieDecision[] = []
	const conferences = Array.from(new Set(league.teams.map((t) => t.conference))).sort() as Conference[]
	const seedings: ConferenceSeeding[] = conferences.map((c) => seedConference(season, c, ties))
	const clinch = clinchStatuses(season, seedings)

	const teams: Record<string, TeamResult> = {}
	const confResults = {} as Record<Conference, ConferenceResult>
	const bracket = {} as Record<Conference, Bracket>

	for (const s of seedings) {
		const table = [...s.seeds, ...s.pool.slice(season.league.wildCards)]
		confResults[s.conference] = { conference: s.conference, table, seeds: s.seeds, divisions: s.divisions }
		bracket[s.conference] = buildBracket(s.conference, s.seeds, league.byes)

		table.forEach((id, i) => {
			const info = season.teamById.get(id)!
			const rec = recordOf(season, id)
			const seedIndex = s.seeds.indexOf(id)
			const c = clinch.get(id) as ClinchStatus
			const berth: Berth = s.winners.includes(id) ? "division" : seedIndex >= 0 ? "wildcard" : c.eliminated ? "out" : "hunt"
			teams[id] = {
				...c,
				team: id,
				conference: s.conference,
				division: info.division,
				overall: rec.overall,
				divisionRecord: rec.division,
				conferenceRecord: rec.conference,
				pct: pct(rec.overall),
				seed: seedIndex >= 0 ? seedIndex + 1 : null,
				berth,
				rank: i + 1,
				divisionRank: s.divisions[info.division].indexOf(id) + 1,
				openGames: openGamesFor(season, id),
			}
		})
	}

	const all = Object.values(teams)
	return {
		teams,
		conferences: confResults,
		playoffTeams: conferences.flatMap((c) => confResults[c].seeds),
		eliminatedTeams: all.filter((t) => t.eliminated).map((t) => t.team).sort(),
		clinchedTeams: all.filter((t) => t.clinchedPlayoff).map((t) => t.team).sort(),
		bracket,
		ties,
		openGames: season.open.length,
		pickedGames: season.picked,
		complete: season.open.length === 0,
	}
}
