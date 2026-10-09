// When the page should report something to analytics, kept apart from the page so it can be tested. The aim is a few
// useful numbers, not an event for every tap: a milestone for the number of games picked, one per week completed, and
// one each for the open, share, reset and Raiders-mode actions.

import { weekProgress } from "./picks"
import type { Game, Predictions } from "./types"

export type PlayoffEventName =
	| "playoff_machine_open"
	| "playoff_prediction_selected"
	| "playoff_week_completed"
	| "playoff_scenario_shared"
	| "playoff_reset"
	| "raiders_mode_enabled"
	| "playoff_team_followed"

/** How many games a reader has picked when we report it: the first, then at a few round numbers. */
export const PICK_MILESTONES = [1, 5, 10, 25, 50, 100, 150, 200] as const

/** The milestone crossed when going from `before` picks to `after`, or null. Taking picks back never reports. */
export function crossedMilestone(before: number, after: number): number | null {
	if (after <= before) return null
	let hit: number | null = null
	for (const m of PICK_MILESTONES) if (before < m && after >= m) hit = m
	return hit
}

/** Weeks whose every game now has a result (played or picked) that did not before. A week counts only if the reader picked in it. */
export function newlyCompletedWeeks(games: readonly Game[], before: Predictions, after: Predictions): number[] {
	const was = new Map(weekProgress(games, before).map((w) => [w.week, w]))
	return weekProgress(games, after)
		.filter((w) => w.picked > 0 && w.open === 0 && (was.get(w.week)?.open ?? 0) > 0)
		.map((w) => w.week)
}
