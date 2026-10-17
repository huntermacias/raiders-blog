// Which NFL week is it? Pure, so it can be tested without a calendar.
//
// A "week" runs from Tuesday 12:00 UTC (early morning in the US, after Monday night's game is over) to the next
// Tuesday, so Monday night still belongs to the week it was played in and the next slate opens on Tuesday morning. Week 1 is anchored to the real kickoff of the season's first game.

const DAY = 86_400_000

/** First moment (Tuesday 12:00 UTC) of week 1, from the first kickoff of the season, which is a Thursday. */
export function weekOneStart(firstKickoffIso: string): number {
	const t = new Date(firstKickoffIso)
	const midnight = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
	// Back to the Tuesday on or before the kickoff day (Thursday is two days after Tuesday).
	const back = (t.getUTCDay() + 5) % 7 // Sun 5, Mon 6, Tue 0, Wed 1, Thu 2, Fri 3, Sat 4
	return midnight - back * DAY + 12 * 3_600_000
}

/** The regular-season week (1 to 18) at `nowMs`. Before the season it is 1; after week 18 it stays 18. */
export function currentWeek(firstKickoffIso: string, nowMs: number): number {
	const w = Math.floor((nowMs - weekOneStart(firstKickoffIso)) / (7 * DAY)) + 1
	return Math.min(18, Math.max(1, w))
}

/** The weeks worth keeping in step with ESPN: last week (for late corrections), this week, and next week. */
export function weeksToSync(week: number): number[] {
	return [week - 1, week, week + 1].filter((w) => w >= 1 && w <= 18)
}
