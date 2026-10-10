// Clinched and eliminated, worked out the safe way.
//
// Proving a team is in or out for certain normally means checking every way the remaining games could go, which is far too
// many for the browser in the middle of a season. So this uses bounds that are always true, whatever happens:
// every open game is either lost (the floor) or won (the ceiling) by each team, and a team only counts as clinched or
// eliminated when the bounds prove it without needing a tiebreaker. That means a team can be mathematically through a little
// before this says so, but it will never say so wrongly. Once no game is open, the answer is exact.
//
// Picks count as played: a scenario with every game picked is a finished season.

import { type Season, openGamesFor, recordOf, winValue } from "./season"
import type { ConferenceSeeding } from "./standings"

export type ClinchStatus = {
	clinchedDivision: boolean
	clinchedPlayoff: boolean
	clinchedTopSeed: boolean
	eliminated: boolean
	/** True when no game is open, so the answer comes straight from the finished table. */
	exact: boolean
}

export function clinchStatuses(season: Season, seedings: readonly ConferenceSeeding[]): Map<string, ClinchStatus> {
	const out = new Map<string, ClinchStatus>()
	const wildCards = season.league.wildCards

	for (const seeding of seedings) {
		const confTeams = season.league.teams.filter((t) => t.conference === seeding.conference)
		const floor = new Map(confTeams.map((t) => [t.id, winValue(recordOf(season, t.id).overall)]))
		const ceil = new Map(confTeams.map((t) => [t.id, (floor.get(t.id) as number) + openGamesFor(season, t.id)]))

		for (const team of confTeams) {
			if (season.open.length === 0) {
				out.set(team.id, {
					clinchedDivision: seeding.winners.includes(team.id),
					clinchedPlayoff: seeding.seeds.includes(team.id),
					clinchedTopSeed: seeding.seeds[0] === team.id,
					eliminated: !seeding.seeds.includes(team.id),
					exact: true,
				})
				continue
			}

			const lo = floor.get(team.id) as number
			const hi = ceil.get(team.id) as number
			const others = confTeams.filter((t) => t.id !== team.id)
			const mates = others.filter((t) => t.division === team.division)

			// Teams that could finish level with or ahead of this one.
			const threats = others.filter((t) => (ceil.get(t.id) as number) >= lo)
			const clinchedDivision = mates.every((t) => (ceil.get(t.id) as number) < lo)
			const clinchedTopSeed = others.every((t) => (ceil.get(t.id) as number) < lo)
			// If it does not win the division, one division mate finishes ahead of it and does not take a wild card, so at
			// most (threats - 1) others can. It is in as long as that is fewer than the wild-card berths.
			const clinchedPlayoff = clinchedDivision || threats.length <= wildCards

			// Teams that must finish ahead of this one. At most one per division wins the division; the rest of them
			// take wild cards ahead of this team.
			const ahead = others.filter((t) => (floor.get(t.id) as number) > hi)
			const cannotWinDivision = mates.some((t) => (floor.get(t.id) as number) > hi)
			const perDivision = new Map<string, number>()
			for (const t of ahead) perDivision.set(t.division, (perDivision.get(t.division) ?? 0) + 1)
			let wildCardsAhead = 0
			for (const n of Array.from(perDivision.values())) wildCardsAhead += Math.max(n - 1, 0)
			const eliminated = !clinchedPlayoff && cannotWinDivision && wildCardsAhead >= wildCards

			out.set(team.id, { clinchedDivision, clinchedPlayoff, clinchedTopSeed, eliminated, exact: false })
		}
	}
	return out
}

// Out of reach, the same safe way: only when the standings prove it without needing a tiebreaker. Used by the Sunday
// Rooting Guide to say "this goal is out of reach" instead of showing odds for something that cannot happen.

function floorsAndCeilings(season: Season, confTeams: readonly { id: string }[]) {
	const floor = new Map(confTeams.map((t) => [t.id, winValue(recordOf(season, t.id).overall)]))
	const ceil = new Map(confTeams.map((t) => [t.id, (floor.get(t.id) as number) + openGamesFor(season, t.id)]))
	return { floor, ceil }
}

/** True when a division mate already has more wins than this team can finish with, so the team cannot win its division. */
export function cannotWinDivision(season: Season, team: string): boolean {
	const me = season.teamById.get(team)
	if (!me) return false
	const confTeams = season.league.teams.filter((t) => t.conference === me.conference)
	const { floor, ceil } = floorsAndCeilings(season, confTeams)
	const hi = ceil.get(team) as number
	return confTeams.some((t) => t.id !== team && t.division === me.division && (floor.get(t.id) as number) > hi)
}

/** True when some team in the conference already has more wins than this team can finish with, so it cannot be the top seed. */
export function cannotTakeTopSeed(season: Season, team: string): boolean {
	const me = season.teamById.get(team)
	if (!me) return false
	const confTeams = season.league.teams.filter((t) => t.conference === me.conference)
	const { floor, ceil } = floorsAndCeilings(season, confTeams)
	const hi = ceil.get(team) as number
	return confTeams.some((t) => t.id !== team && (floor.get(t.id) as number) > hi)
}
