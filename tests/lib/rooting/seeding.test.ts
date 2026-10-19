// Replays six finished NFL seasons (2020 to 2025) through the site's standings and tiebreakers and checks the result against what the NFL
// did: the same seven teams in each conference, the same top seed, and the same wild-card pairings. The Rooting Guide, the Playoff Machine
// and the homepage band all rest on this seeding, so a wrong tiebreaker would put a wrong number on every one of them.

import { describe, expect, it } from "vitest"

import { buildSeason } from "@/lib/playoffs/season"
import { NFL_LEAGUE } from "@/lib/playoffs/season"
import { seedConference } from "@/lib/playoffs/standings"
import type { Game } from "@/lib/playoffs/types"

import fixture from "../../fixtures/seasons.json"

type Row = { id: string; week: number; home: string; away: string; homeScore: number; awayScore: number }
type Season = { games: Row[]; wildCard: { home: string; away: string }[] }
const seasons = fixture as unknown as Record<string, Season>

function toGames(rows: Row[]): Game[] {
	return rows.map((r) => {
		const tie = r.homeScore === r.awayScore
		return {
			id: r.id,
			week: r.week,
			homeTeam: r.home,
			awayTeam: r.away,
			homeScore: r.homeScore,
			awayScore: r.awayScore,
			status: "final" as const,
			winner: tie ? null : r.homeScore > r.awayScore ? r.home : r.away,
			tie,
		}
	})
}

function replay(year: string) {
	const season = buildSeason(NFL_LEAGUE, toGames(seasons[year].games), {})
	const afc = seedConference(season, "AFC")
	const nfc = seedConference(season, "NFC")
	const pairings = [afc, nfc].flatMap((c) => [
		`${c.seeds[1]}-${c.seeds[6]}`,
		`${c.seeds[2]}-${c.seeds[5]}`,
		`${c.seeds[3]}-${c.seeds[4]}`,
	])
	return { afc, nfc, pairings }
}

describe("seeding replays the NFL", () => {
	for (const year of Object.keys(seasons)) {
		it(`${year}: same fourteen playoff teams`, () => {
			const { pairings, afc, nfc } = replay(year)
			const actual = new Set(seasons[year].wildCard.flatMap((m) => [m.home, m.away]))
			// The top seed in each conference had the bye, so it is not in a wild-card game.
			const ours = new Set(pairings.flatMap((p) => p.split("-")))
			expect(Array.from(ours).sort()).toEqual(Array.from(actual).sort())
			expect(afc.seeds).toHaveLength(7)
			expect(nfc.seeds).toHaveLength(7)
			// The top seed had the bye: it played no wild-card game.
			expect(actual.has(afc.seeds[0])).toBe(false)
			expect(actual.has(nfc.seeds[0])).toBe(false)
		})

		it(`${year}: same wild-card pairings, home team first`, () => {
			const { pairings } = replay(year)
			const actual = seasons[year].wildCard.map((m) => `${m.home}-${m.away}`)
			expect([...pairings].sort()).toEqual([...actual].sort())
		})
	}
})
