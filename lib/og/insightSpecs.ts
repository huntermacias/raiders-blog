// Picks the right share card for a request to /api/og. Kept out of the route so it can be tested without
// Next: it only reads the Lab's static JSON.

import { getFourthDown, getGameBySlug, getGames, getSeason } from "../lab/data"
import { fourthGameFor } from "../lab/fourthDown"
import { TEAMS } from "../nfl"
import { seasonTopPlays, topPlaysFor } from "../lab/topPlays"
import type { CardSpec } from "./cards"
import { buildFourthSeasonSpec, buildFourthSpec, buildPlaySpec, buildScoutSpec } from "./insightCards"

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/
const ABBR = /^[A-Z]{2,3}$/

export type InsightQuery = { type: string; slug: string; view: string; rank: string; opp: string; week: string }

/** A card for `view=play`, `view=fourth` or `type=scout`; null when the request is not one of those or has no data. */
export function insightSpec(q: InsightQuery): CardSpec | null {
	const team = getSeason().team

	if (q.type === "scout") {
		if (!ABBR.test(q.opp) || q.opp === team) return null
		const info = TEAMS.find((t) => t.abbr === q.opp)
		if (!info) return null
		const week = Number(q.week)
		return buildScoutSpec({ abbr: info.abbr, name: info.name, nick: info.nick }, Number.isInteger(week) && week > 0 ? week : null)
	}

	if (q.type !== "lab" || !SLUG.test(q.slug)) return null

	if (q.view === "play") {
		const rank = Number(q.rank)
		const n = Number.isInteger(rank) && rank >= 1 && rank <= 10 ? rank : 1
		if (q.slug === "season") {
			const play = seasonTopPlays(getGames(), team, 10)[n - 1]
			const game = play ? getGames().find((g) => g.week === play.week) : undefined
			return play && game ? buildPlaySpec(game, play, "season") : null
		}
		const game = getGameBySlug(q.slug)
		const play = game ? topPlaysFor(game, team, 5)[n - 1] : undefined
		return game && play ? buildPlaySpec(game, play, "game") : null
	}

	if (q.view === "fourth") {
		if (q.slug === "season") {
			const games = getFourthDown().games
			return games.length ? buildFourthSeasonSpec(games) : null
		}
		const game = getGameBySlug(q.slug)
		const fg = game ? fourthGameFor(game.week) : null
		return game && fg ? buildFourthSpec(fg, game) : null
	}

	return null
}

