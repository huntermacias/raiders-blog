// The "Will it last?" view as a link: which part of the page, which stat, which filters, which pinned team.
// The same few query parameters are read by the share card route (/api/og), the share landing page and the
// page itself, so a link a reader shares reopens the exact chart they were looking at. Pure and import-free
// apart from types, so the browser, the server and the tests can all use it.

import { DEFAULT_FILTER, type Filter } from "./historyKit"

/** The parts of the page that can be shared, each with its own card. */
export const SHARE_KINDS = ["chart", "wins", "fifths", "checklist", "season", "bottom"] as const
export type ShareKind = (typeof SHARE_KINDS)[number]

/** Wide is the link preview (X, Facebook, iMessage, Slack); tall is for posting the picture itself (Instagram, X in the feed, phones). */
export const SHARE_SIZES = ["wide", "tall"] as const
export type ShareSize = (typeof SHARE_SIZES)[number]

export const SIZE_PIXELS: Record<ShareSize, { width: number; height: number }> = {
	wide: { width: 1200, height: 630 },
	tall: { width: 1080, height: 1350 },
}

/** The page a shared link opens: it carries the card in its link preview, then sends the reader on to the chart. */
export const SHARE_PATH = "/lab/will-it-last/share"
export const PAGE_PATH = "/lab/will-it-last"

/** The element on the page each card belongs to, so a shared link can scroll to it. */
export const SECTION_IDS: Record<ShareKind, string> = {
	chart: "chart-heading",
	wins: "wins-heading",
	fifths: "fifths-heading",
	checklist: "check-heading",
	season: "pinned-team",
	bottom: "bottom-heading",
}

export const KIND_NAMES: Record<ShareKind, string> = {
	chart: "The chart",
	wins: "Wins and playoffs",
	fifths: "Playoff odds by fifth",
	checklist: "The playoff checklist",
	season: "A team's season",
	bottom: "The bottom line",
}

export type ShareView = {
	stat: string | null
	filter: Filter
	/** A team-season as the data names it: "2016 LV". */
	pin: string | null
	/** What the dots go up with. */
	y: "spread" | "wins"
}

export const DEFAULT_VIEW: ShareView = {
	stat: null,
	filter: DEFAULT_FILTER,
	pin: null,
	y: "spread",
}

const STAT = /^(off|def|net)\.[A-Za-z]{2,20}$/
const TEAM = /^[A-Z]{2,3}$/
const PIN = /^(\d{4})[- ]([A-Z]{2,3})$/
const MAX_YEARS = 30

export const isKind = (v: string | undefined): v is ShareKind => !!v && (SHARE_KINDS as readonly string[]).includes(v)
export const isSize = (v: string | undefined): v is ShareSize => v === "wide" || v === "tall"

/** "2016 LV" to "2016-LV", which survives a URL without an encoded space. */
export const pinParam = (row: string): string => row.replace(" ", "-")

/** What a link or card request carries, before anything has been checked against the data. */
export type RawView = {
	kind?: string
	size?: string
	stat?: string
	scope?: string
	team?: string
	po?: string
	years?: string
	pin?: string
	y?: string
}

export type CheckedView = ShareView & { kind: ShareKind; size: ShareSize }

/**
 * Reads a request into a view, dropping anything that is not valid. `first` and `last` bound the seasons;
 * `teams` and `rows` are the abbreviations and team-seasons the data has, which stop a made-up value from
 * reaching the card. A stat is only checked for its shape here: the caller looks it up.
 */
export function readView(
	raw: RawView,
	known: {
		first: number
		last: number
		teams: ReadonlySet<string>
		rows: ReadonlySet<string>
	},
): CheckedView {
	const kind = isKind(raw.kind) ? raw.kind : "chart"
	const size = isSize(raw.size) ? raw.size : "wide"
	const stat = raw.stat && STAT.test(raw.stat) ? raw.stat : null
	const team = raw.team && TEAM.test(raw.team) && known.teams.has(raw.team) ? raw.team : null
	const years = Array.from(
		new Set(
			(raw.years ?? "")
				.split(",")
				.slice(0, MAX_YEARS)
				.map((s) => Number(s))
				.filter((y) => Number.isInteger(y) && y >= known.first && y <= known.last),
		),
	).sort((a, b) => a - b)
	const m = raw.pin ? PIN.exec(raw.pin) : null
	const pin = m && known.rows.has(`${m[1]} ${m[2]}`) ? `${m[1]} ${m[2]}` : null
	return {
		kind,
		size,
		stat,
		filter: {
			scope: raw.scope === "all" ? "all" : "like",
			team,
			playoffs: raw.po === "made" || raw.po === "missed" ? raw.po : "any",
			years,
		},
		pin,
		y: raw.y === "wins" ? "wins" : "spread",
	}
}

/** The query string (no leading "?") for a view, leaving out everything that is at its default. */
export function viewQuery(view: Partial<ShareView>, extra: { kind?: ShareKind; size?: ShareSize } = {}): string {
	const q: [string, string][] = []
	if (extra.kind) q.push(["kind", extra.kind])
	if (extra.size) q.push(["size", extra.size])
	if (view.stat) q.push(["stat", view.stat])
	const f = view.filter
	if (f) {
		if (f.scope !== DEFAULT_FILTER.scope) q.push(["scope", f.scope])
		if (f.team) q.push(["team", f.team])
		if (f.playoffs !== "any") q.push(["po", f.playoffs])
		if (f.years.length) q.push(["years", [...f.years].sort((a, b) => a - b).join(",")])
	}
	if (view.pin) q.push(["pin", pinParam(view.pin)])
	if (view.y === "wins") q.push(["y", "wins"])
	return q.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ",")}`).join("&")
}
