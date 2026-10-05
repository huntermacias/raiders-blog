// Small text formatters for the Blogger vs. the Math page. Pure; the time zone is fixed so the server and the
// browser print the same thing.

/** "Pick'em" or "KC by 3.5": the expected margin rounded to the nearest half point. */
export function lineText(homeMargin: number, home: string, away: string): string {
	const half = Math.round(Math.abs(homeMargin) * 2) / 2
	if (half === 0) return "Pick’em"
	return `${homeMargin > 0 ? home : away} by ${Number.isInteger(half) ? half : half.toFixed(1)}`
}

const PT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" })

/** ESPN parks games without a set time at 04:00 or 05:00 UTC: show the day only. */
const isPlaceholder = (d: Date) => d.getUTCMinutes() === 0 && (d.getUTCHours() === 4 || d.getUTCHours() === 5)

/** "Sun, Oct 11, 1:25 PM PT", or just the day when the time isn't set. Empty for no kickoff. */
export function kickoffText(iso: string | null | undefined): string {
	if (!iso) return ""
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ""
	if (isPlaceholder(d)) return `${ET_DAY.format(d)} · time TBD`
	return `${PT.format(d).replace(" at ", ", ")} PT`
}

const pct0 = (p: number) => `${Math.round(p * 100)}%`

/** "<1%" and ">99%" instead of a flat 0 or 100: a simulation can't be certain. */
export function oddsText(p: number, sims = 10_000) {
	if (p <= 0) return "0%"
	if (p >= 1) return "100%"
	if (p < 0.5 / sims || p * 100 < 1) return "<1%"
	if (p * 100 > 99) return ">99%"
	return pct0(p)
}
