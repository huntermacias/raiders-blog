// The share links and cards of the position-group pages: which part of a matchup a card is of, what a shared link
// carries, and where it lands. Pure and import-free apart from types, so the browser, the server and the tests can
// all use it. The share card route (/api/og), the share landing pages and the page's Share buttons all read it.

/** The parts of a matchup page that can be shared, each with its own card. */
export const MATCHUP_VIEWS = ["overview", "pairs", "tape", "style", "coaches", "injuries"] as const
export type MatchupView = (typeof MATCHUP_VIEWS)[number]

export const isMatchupView = (v: string | undefined): v is MatchupView => !!v && (MATCHUP_VIEWS as readonly string[]).includes(v)

/** The heading on the matchup page each card belongs to, so a shared link can scroll to it. */
export const VIEW_SECTION: Record<MatchupView, string> = {
	overview: "paper-heading",
	pairs: "pairs-heading",
	tape: "tape-heading",
	style: "style-heading",
	coaches: "coach-heading",
	injuries: "injury-heading",
}

export const VIEW_NAMES: Record<MatchupView, string> = {
	overview: "The matchup",
	pairs: "Position group by position group",
	tape: "Tale of the tape",
	style: "How each team plays",
	coaches: "The coaches",
	injuries: "Who is missing",
}

/** Where a shared link to a matchup, the week's slate or the board lands: it carries the card, then sends the reader on. */
export const MATCHUP_SHARE_PATH = "/lab/matchup/share"
export const SLATE_SHARE_PATH = "/lab/matchups/share"
export const BOARD_SHARE_PATH = "/lab/teams/share"
export const SLATE_PATH = "/lab/matchups"
export const BOARD_PATH = "/lab/teams"

const TEAM = /^[A-Z]{2,3}$/

/** A matchup request, checked for its shape. The caller looks the teams up. */
export function readMatchupQuery(raw: { a?: string; b?: string; view?: string }): { a: string; b: string; view: MatchupView } | null {
	const a = (raw.a ?? "").toUpperCase()
	const b = (raw.b ?? "").toUpperCase()
	if (!TEAM.test(a) || !TEAM.test(b) || a === b) return null
	return { a, b, view: isMatchupView(raw.view) ? raw.view : "overview" }
}

export function matchupQuery(a: string, b: string, view: MatchupView): string {
	return `a=${a}&b=${b}&view=${view}`
}

/** The words that go with a post, and the picture's alt text, for each part. */
export function viewText(view: MatchupView, names: { a: string; b: string }, line: string): { text: string; alt: string } {
	const both = `${names.a} vs ${names.b}`
	switch (view) {
		case "pairs":
			return { text: `${both}, one position group at a time: ${line}`, alt: `${both}: each offense against the other defense, position group by position group` }
		case "tape":
			return { text: `${both}, unit by unit. Seven position groups graded and ranked across the league.`, alt: `${both}: the seven position groups side by side` }
		case "style":
			return { text: `${both}: how each team likes to play. Pass rate, play-action, motion, blitzes and more.`, alt: `${both}: how each team likes to play` }
		case "coaches":
			return { text: `${both}: the coaches. Records, against the spread, and head to head.`, alt: `${both}: the head coaches side by side` }
		case "injuries":
			return { text: `${both}: who is on the injury report, starters first.`, alt: `${both}: who is missing from each team` }
		default:
			return { text: `${both}, position group by position group: ${line}`, alt: `${both}: how the position groups stack up, with a radar of both teams` }
	}
}

// ------------------------------------------------------------------------------------------------ the board

/** The columns the board can be sorted by, in the order the card lists them. */
export const BOARD_SORTS = ["composite", "off", "def", "qb", "ol", "rec", "run", "rush", "rund", "cov"] as const
export type BoardSort = (typeof BOARD_SORTS)[number]

export const isBoardSort = (v: string | undefined): v is BoardSort => !!v && (BOARD_SORTS as readonly string[]).includes(v)

export type BoardView = { sort: BoardSort; show: string | null; team: string | null }

/**
 * Reads a board request. `shows` are the filters the board offers (a conference or a division) and `teams` the
 * abbreviations it has, so a made-up value never reaches the card.
 */
export function readBoardQuery(raw: { sort?: string; show?: string; team?: string }, known: { shows: ReadonlySet<string>; teams: ReadonlySet<string> }): BoardView {
	return {
		sort: isBoardSort(raw.sort) ? raw.sort : "composite",
		show: raw.show && known.shows.has(raw.show) ? raw.show : null,
		team: raw.team && TEAM.test(raw.team) && known.teams.has(raw.team) ? raw.team : null,
	}
}

export function boardQuery(view: Partial<BoardView>): string {
	const parts: string[] = []
	if (view.sort && view.sort !== "composite") parts.push(`sort=${view.sort}`)
	if (view.show) parts.push(`show=${encodeURIComponent(view.show)}`)
	if (view.team) parts.push(`team=${view.team}`)
	return parts.join("&")
}
