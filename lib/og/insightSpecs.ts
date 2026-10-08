// Picks the right share card for a request to /api/og. Kept out of the route so it can be tested without
// Next: it only reads the Lab's static JSON.

import { getFourthDown, getGameBySlug, getGames, getSeason } from "../lab/data"
import { fourthGameFor } from "../lab/fourthDown"
import { TEAMS } from "../nfl"
import { seasonTopPlays, topPlaysFor } from "../lab/topPlays"
import type { CardSpec } from "./cards"
import { getHistoryView } from "../lab/history"
import { analyze, abbrOf } from "../lab/historyKit"
import { type RawView, readView } from "../lab/lastShare"
import { buildFourthSeasonSpec, buildFourthSpec, buildPlaySpec, buildScoutSpec } from "./insightCards"
import { getTwinsView } from "../lab/twins"
import { readTwinsView } from "../lab/twinsShare"
import { buildTwinsSpec } from "./twinsCards"
import { buildBottomSpec, buildChartSpec, buildChecklistSpec, buildFifthsSpec, buildSeasonSpec, buildWinsSpec } from "./lastCards"

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/
const ABBR = /^[A-Z]{2,3}$/

export type InsightQuery = {
	type: string
	slug: string
	view: string
	rank: string
	opp: string
	week: string
} & RawView & { mode?: string; twin?: string }

/** A card for `view=play`, `view=fourth`, `type=scout` or `type=last`; null when the request is not one of those or has no data. */
export function insightSpec(q: InsightQuery): CardSpec | null {
	const team = getSeason().team

	if (q.type === "scout") {
		if (!ABBR.test(q.opp) || q.opp === team) return null
		const info = TEAMS.find((t) => t.abbr === q.opp)
		if (!info) return null
		const week = Number(q.week)
		return buildScoutSpec({ abbr: info.abbr, name: info.name, nick: info.nick }, Number.isInteger(week) && week > 0 ? week : null)
	}

	if (q.type === "last") {
		return lastSpec(q)
	}

	if (q.type === "twins") {
		return twinsSpec(q)
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

/** A "will it last?" card for the part of the page, the stat, the filters and the pinned team the request names; null when there is nothing to show. */
function lastSpec(q: RawView): CardSpec | null {
	const data = getHistoryView()
	if (!data) return null
	const { meta, tables } = data
	const view = readView(q, {
		first: data.first,
		last: data.last,
		teams: new Set(meta.teams.map(abbrOf)),
		rows: new Set(meta.teams),
	})
	const ctx = {
		size: view.size,
		n: data.n,
		first: data.first,
		last: data.last,
		season: data.season,
	}

	if (view.kind === "checklist") return buildChecklistSpec(data.checklist, ctx)
	if (view.kind === "bottom") return buildBottomSpec(data.stories, data.bottomLine.title, data.record, ctx)

	const key = view.stat ?? data.stories[0]?.key
	const table = tables.find((t) => t.key === key)
	if (!table) return null
	// The fifths and the bottom line are about every team, so the filters only apply to the cards that show a group.
	const story = analyze(meta, table, data.season, view.kind === "fifths" ? undefined : view.filter)
	if (!story || (view.kind !== "fifths" && story.groupSize === 0)) return null

	if (view.kind === "wins") return buildWinsSpec(story, ctx, data.start)
	if (view.kind === "fifths") return buildFifthsSpec(story, ctx)
	if (view.kind === "season") return view.pin ? buildSeasonSpec(story, meta, ctx, view.pin, view.y) : null
	return buildChartSpec(story, meta, ctx, { pin: view.pin, y: view.y })
}

/** A "season twins" card for the match and twin the request names; null when the Raiders have not played enough games for a match. */
function twinsSpec(q: { size?: string; mode?: string; twin?: string }): CardSpec | null {
	const data = getTwinsView()
	if (!data?.modes.all) return null
	const rows = new Set(Object.values(data.modes).flatMap((m) => (m ? [...m.result.twins, ...(m.result.raidersTwin ? [m.result.raidersTwin] : [])].map((t) => t.row) : [])))
	const view = readTwinsView(q, rows)
	const found = data.modes[view.mode] ?? data.modes.all
	return buildTwinsSpec(found.result, view.twin, { size: view.size, season: data.season, first: data.first, last: data.last, start: data.start })
}
