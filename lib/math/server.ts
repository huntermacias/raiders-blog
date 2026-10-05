// Loads everything the Blogger vs. the Math page (and its share cards) need: the blogger's boards from Studio,
// the season from ESPN, last season's ratings, the box scores, and then the finished report. Server only.

import { groq } from "next-sanity"

import { readClient } from "../sanity.client"
import { SEASON } from "../predictions"
import { type RankingsDoc, buildBoards } from "../rankings"
import { getBoxes, getPriorRatings, getSeasonSchedule } from "../live/service"
import { cached } from "../live/cache"
import { HOT, type MathReport, buildOdds, buildReport, finals, plainOdds } from "./report"
import { annotate } from "./situation"

const rankingsQuery = groq`
	*[_type == 'powerRankings' && season == $season && !(_id in path('drafts.**'))] | order(_updatedAt asc) {
		_id, season, week, headline,
		teams[]{ _key, team, note }
	}
`

export type MathPage = {
	/** Weeks with a published board, oldest first. */
	weeks: number[]
	/** The latest of them, or null when no board is published yet. */
	newest: number | null
	/** The week the report is for. */
	week: number | null
	/** Null when there is no board, or the game results couldn't be read. */
	report: MathReport | null
}

export { HOT }

/** "full" starts from last season and weighs box scores; "season" is this season's scores alone. */
export type ModelChoice = "full" | "season"

/** `asked` is honored only if there is a board for that week. */
export async function loadMath(asked?: number, opts: { boxBudgetMs?: number; model?: ModelChoice } = {}): Promise<MathPage> {
	const docs: RankingsDoc[] = (await readClient.fetch(rankingsQuery, { season: SEASON })) ?? []
	const boards = buildBoards(docs)
	const weeks = boards.map((b) => b.week)
	const newest = weeks.length ? weeks[weeks.length - 1] : null
	if (newest == null) return { weeks, newest, week: null, report: null }
	const week = asked != null && weeks.includes(asked) ? asked : newest

	const full = (opts.model ?? "full") === "full"
	const [sched, prior] = await Promise.all([getSeasonSchedule(week), full ? getPriorRatings() : Promise.resolve(null)])
	if (!sched) return { weeks, newest, week, report: null }
	const games = annotate(sched.games)
	const played = finals(games, week)
	if (played.length === 0) return { weeks, newest, week, report: null }

	const boxes = full ? await getBoxes(games, week, opts.boxBudgetMs ?? 6000) : []
	const model = { prior, boxes }
	// Ten thousand simulated seasons are worth keeping for ten minutes, not redoing on every visit.
	const key = `mathodds:${week}:${played.length}:${games.length}:${prior ? "p" : "-"}:${boxes.length}`
	const odds = sched.complete ? (await cached(key, 600_000, async () => buildOdds(games, week, model))).value : null
	// Beside the fuller model, what results alone say: the gap between them is itself worth showing.
	const plain = odds && full && (prior || boxes.length > 0) ? (await cached(`mathplain:${week}:${played.length}:${games.length}`, 600_000, async () => plainOdds(games, week))).value : null
	return { weeks, newest, week, report: buildReport(boards, games, week, odds, model, plain) }
}
