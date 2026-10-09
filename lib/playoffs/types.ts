// The shapes the Playoff Machine passes around. Plain types, no imports, so the engine can run in the browser,
// on the server and in tests without any framework.

export type Conference = "AFC" | "NFC"

export type Team = {
	/** The site's abbreviation, e.g. "LV". */
	id: string
	name: string
	conference: Conference
	/** e.g. "AFC West". Divisions are named per conference, so the name alone is unique. */
	division: string
}

export type GameStatus = "final" | "scheduled"

/** One regular-season game as the schedule file has it. The engine never changes a game. */
export type Game = {
	id: string
	week: number
	homeTeam: string
	awayTeam: string
	homeScore: number | null
	awayScore: number | null
	status: GameStatus
	/** The winning team's id. Null while the game is scheduled, and for a tie. */
	winner: string | null
	tie: boolean
	date?: string
	time?: string | null
	/** The market spread (positive means the home team is favored), kept only when the schedule has one. */
	spread?: number | null
}

/** A reader's pick for one game: the home team, the away team, or a tie. */
export type Outcome = "H" | "A" | "T"

/** Everything a scenario needs besides the schedule: game id -> pick. Games with no entry are still open. */
export type Predictions = Readonly<Record<string, Outcome>>

/** A game that has a result in this scenario, either because it was played or because the reader picked it. */
export type ResolvedGame = {
	id: string
	week: number
	homeTeam: string
	awayTeam: string
	outcome: Outcome
	source: "actual" | "pick"
	homeScore: number | null
	awayScore: number | null
}

export type League = {
	teams: readonly Team[]
	/** Wild-card berths per conference. */
	wildCards: number
	/** Teams per conference that skip the first round (the top seed in the 7-team format). */
	byes: number
}

export type WLT = { w: number; l: number; t: number }
