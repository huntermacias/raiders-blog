// The penalty flags as a link: which card, of what. The card route (/api/og?type=flags), the share landing page (/lab/flags/share) and the page a
// shared link finally opens all read the same few query parameters, so a link reopens what the reader was looking at. Pure, like lastShare.ts.

import { COMPARE_PATH, FLAGS_PATH, SITUATIONS_PATH, playerFlagsHref, teamFlagsHref } from "./flagsKit"
import { type DimId, isDim } from "./flagsSituations"
import { type ShareSize, isSize } from "./lastShare"

export const FLAGS_SHARE_PATH = `${FLAGS_PATH}/share`

export const KINDS = ["flag", "team", "player", "compare", "board", "penalty", "situation"] as const
export type FlagsKind = (typeof KINDS)[number]
export const BOARDS = ["latest", "worst", "players", "teams", "types"] as const
export type FlagsBoard = (typeof BOARDS)[number]

export type FlagsView = {
	kind: FlagsKind
	season?: number
	/** A single flag: its id. */
	id?: string
	/** A team's page, or the team a situation card is about. */
	team?: string
	/** Two teams side by side. */
	a?: string
	b?: string
	/** A player's page name. */
	slug?: string
	board?: FlagsBoard
	/** A penalty's page name ("roughing-the-kicker"). */
	ty?: string
	dim?: DimId
}

export type FlagsRaw = Partial<Record<"kind" | "season" | "id" | "team" | "a" | "b" | "slug" | "board" | "ty" | "dim" | "size", string | undefined>>

const ID = /^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}-\d{1,5}$/
const TEAM = /^[A-Z]{2,3}$/
const NAME = /^[a-z0-9][a-z0-9-]{0,80}$/
const SEASON = /^20\d{2}$/

/** Reads a request into a view, or null when it does not name a card. Only the fields a kind uses are kept, each checked for shape (not yet against the data). */
export function readFlagsView(raw: FlagsRaw): FlagsView | null {
	const kind = KINDS.find((k) => k === raw.kind)
	if (!kind) return null
	const view: FlagsView = { kind }
	if (raw.season && SEASON.test(raw.season)) view.season = Number(raw.season)
	const team = raw.team && TEAM.test(raw.team) ? raw.team : undefined
	switch (kind) {
		case "flag":
			if (!raw.id || !ID.test(raw.id)) return null
			view.id = raw.id
			return view
		case "team":
			if (!team) return null
			view.team = team
			return view
		case "player":
			if (!raw.slug || !NAME.test(raw.slug)) return null
			view.slug = raw.slug
			return view
		case "compare":
			if (!raw.a || !raw.b || !TEAM.test(raw.a) || !TEAM.test(raw.b) || raw.a === raw.b) return null
			view.a = raw.a
			view.b = raw.b
			return view
		case "board": {
			const board = BOARDS.find((x) => x === raw.board)
			if (!board) return null
			view.board = board
			return view
		}
		case "penalty":
			if (!raw.ty || !NAME.test(raw.ty)) return null
			view.ty = raw.ty
			return view
		case "situation":
			view.dim = isDim(raw.dim) ? raw.dim : "score"
			if (team) view.team = team
			return view
	}
}

export const sizeOf = (raw: string | undefined): ShareSize => (isSize(raw) ? raw : "wide")

/** The query string (no leading "?") for a view, in a fixed order. `size` goes first when given. */
export function flagsQuery(view: FlagsView, extra: { size?: ShareSize } = {}): string {
	const q: [string, string | number | undefined][] = [
		["size", extra.size],
		["kind", view.kind],
		["season", view.season],
		["id", view.id],
		["team", view.team],
		["a", view.a],
		["b", view.b],
		["slug", view.slug],
		["board", view.board],
		["ty", view.ty],
		["dim", view.kind === "situation" && view.dim === "score" ? undefined : view.dim],
	]
	return q
		.filter((p): p is [string, string | number] => p[1] !== undefined && p[1] !== "")
		.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
		.join("&")
}

const withSeason = (path: string, view: FlagsView, first = true) => (view.season ? `${path}${first ? "?" : "&"}season=${view.season}` : path)

/** The interactive page a shared card opens. `team` is the committing team of a single flag, which the view cannot know by itself. */
export function flagsHref(view: FlagsView, ctx: { team?: string; player?: string } = {}): string {
	switch (view.kind) {
		case "flag":
			return withSeason(ctx.team ? teamFlagsHref(ctx.team) : FLAGS_PATH, view)
		case "team":
			return withSeason(teamFlagsHref(view.team ?? ""), view)
		case "player":
			return withSeason(playerFlagsHref(view.slug ?? ""), view)
		case "compare":
			return withSeason(`${COMPARE_PATH}?a=${view.a}&b=${view.b}`, view, false)
		case "board":
			return withSeason(`${FLAGS_PATH}?tab=${view.board}`, view, false)
		case "penalty":
			return withSeason(`${FLAGS_PATH}/penalty/${view.ty}`, view)
		case "situation": {
			const q = [view.dim && view.dim !== "score" ? `dim=${view.dim}` : "", view.team ? `team=${view.team}` : "", view.season ? `season=${view.season}` : ""].filter(Boolean).join("&")
			return `${SITUATIONS_PATH}${q ? `?${q}` : ""}`
		}
	}
}

/** The first value of a query parameter, as Next hands it to a page. */
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)
