// Division order and conference seeding, built on the tiebreaker engine. Pure functions of a Season.

import { type Season, pct, recordOf } from "./season"
import { type TieDecision, breakDivisionTie, breakWildCardTie } from "./tiebreakers"
import type { Conference } from "./types"

/** Teams grouped into tiers of identical record, best tier first. Inside a tier the input order is kept (by id). */
export function recordTiers(season: Season, teams: readonly string[]): string[][] {
	const sorted = [...teams].sort((a, b) => pct(recordOf(season, b).overall) - pct(recordOf(season, a).overall) || (a < b ? -1 : 1))
	const tiers: string[][] = []
	for (const t of sorted) {
		const last = tiers[tiers.length - 1]
		if (last && pct(recordOf(season, last[0]).overall) === pct(recordOf(season, t).overall)) last.push(t)
		else tiers.push([t])
	}
	return tiers
}

function orderTiers(tiers: string[][], breakTie: (tier: string[]) => string[]): string[] {
	return tiers.flatMap((tier) => (tier.length === 1 ? tier : breakTie(tier)))
}

export type ConferenceSeeding = {
	conference: Conference
	/** Each division's teams, first place first. */
	divisions: Record<string, string[]>
	/** The division winners in seed order. */
	winners: string[]
	/** Everyone else in the conference, best first. The first few are the wild cards. */
	pool: string[]
	/** The playoff teams, seed 1 first. */
	seeds: string[]
}

export function seedConference(season: Season, conference: Conference, decisions: TieDecision[] = []): ConferenceSeeding {
	const teams = season.league.teams.filter((t) => t.conference === conference)
	const divisionNames = Array.from(new Set(teams.map((t) => t.division))).sort()

	const divisions: Record<string, string[]> = {}
	for (const d of divisionNames) {
		const members = teams.filter((t) => t.division === d).map((t) => t.id)
		divisions[d] = orderTiers(recordTiers(season, members), (tier) => breakDivisionTie(season, tier, decisions))
	}

	const champs = divisionNames.map((d) => divisions[d][0])
	const winners = orderTiers(recordTiers(season, champs), (tier) => breakWildCardTie(season, tier, decisions))

	const champSet = new Set(champs)
	const rest = teams.map((t) => t.id).filter((id) => !champSet.has(id))
	const pool = orderTiers(recordTiers(season, rest), (tier) => breakWildCardTie(season, tier, decisions))

	return { conference, divisions, winners, pool, seeds: [...winners, ...pool.slice(0, season.league.wildCards)] }
}
