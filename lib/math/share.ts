// Addresses for sharing the Blogger vs. the Math page: the page link, the card image behind it, and the
// words that go with it. Pure, so the page, the buttons and the card route all agree.

export const SITE_URL = "https://www.raidersrundown.com"
export const MATH_PATH = "/rankings/math"

export type ShareView = {
	/** A team abbreviation: share that team's card. */
	team?: string | null
	/** A team abbreviation from the disagreement list: share the "where we disagree" card. */
	take?: string | null
	week?: number | null
	model?: "full" | "season" | null
}

const ABBR = /^[A-Z]{2,3}$/

const clean = (v: string | null | undefined) => {
	const s = (v ?? "").toUpperCase()
	return ABBR.test(s) ? s : null
}

function params(view: ShareView, extra: Record<string, string> = {}): URLSearchParams {
	const p = new URLSearchParams()
	const team = clean(view.team)
	const take = team ? null : clean(view.take)
	if (team) p.set("team", team)
	if (take) p.set("take", take)
	if (view.week != null && Number.isInteger(view.week) && view.week >= 1 && view.week <= 18) p.set("week", String(view.week))
	if (view.model === "season") p.set("model", "season")
	for (const [k, v] of Object.entries(extra)) p.set(k, v)
	return p
}

/** The page address for a view, path only (`/rankings/math?team=LV&week=4`). */
export function pagePath(view: ShareView = {}): string {
	const q = params(view).toString()
	return `${MATH_PATH}${q ? `?${q}` : ""}`
}

/** The card's address, path only. `stamp` makes the link change when the numbers can have changed. */
export function cardPath(view: ShareView = {}, stamp?: number | string): string {
	const q = params(view, { type: "math", ...(stamp != null ? { v: String(stamp) } : {}) })
	return `/api/og?${q.toString()}`
}

/** A number that changes once an hour, so a shared card is refreshed hourly and not on every view. */
export const hourStamp = (now: number = Date.now()) => Math.floor(now / 3_600_000)

export const absolute = (path: string) => `${SITE_URL}${path}`

export const xIntent = (text: string, url: string) => `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url }).toString()}`

export const cardFileName = (view: ShareView = {}) => `raiders-rundown-${[clean(view.team) ?? (clean(view.take) ? `take-${clean(view.take)}` : "raiders-vs-math"), view.week != null ? `week-${view.week}` : null].filter(Boolean).join("-").toLowerCase()}.png`
