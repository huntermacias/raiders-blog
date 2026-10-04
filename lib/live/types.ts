// The live game model the page works with. ESPN's JSON is turned into this by espn.ts so nothing
// else on the site knows ESPN's field names, and the page can be tested with plain objects.

export type GameState = "pre" | "in" | "post"

export type LiveTeam = {
	/** Site abbreviation (ESPN's WSH becomes WAS). */
	abbr: string
	name: string
	score: number
	record: string | null
	/** ESPN's own team id, used to match plays to a team. */
	espnId: string | null
}

export type LiveOdds = {
	/** Home team's spread: negative means the home team is favored. */
	homeSpread: number | null
	overUnder: number | null
	label: string | null
}

export type LiveGameInfo = {
	id: string
	state: GameState
	/** "Final", "Q3 4:12", "Sun 1:25 PM"... as ESPN words it. */
	detail: string
	shortDetail: string
	period: number
	/** Seconds left in the current period, or null before the game. */
	clockSeconds: number | null
	/** ISO time of kickoff. */
	kickoff: string | null
	home: LiveTeam
	away: LiveTeam
	odds: LiveOdds | null
	venue: string | null
	network: string | null
	/** Abbreviation of the team with the ball right now (live games only, when ESPN says). */
	possession: string | null
	/** Down and distance and field position at the next snap, when ESPN has it. */
	situation: LiveSituation | null
}

export type LiveSituation = {
	down: number | null
	distance: number | null
	/** Yards from the goal the offense is attacking. */
	yardsToGoal: number | null
	text: string | null
	redZone: boolean
}

export type PlayKind = "run" | "pass" | "sack" | "kick" | "punt" | "fg" | "penalty" | "other"

export type LivePlay = {
	id: string
	/** Order within the game. */
	seq: number
	period: number
	clock: string
	clockSeconds: number | null
	text: string
	kind: PlayKind
	/** Team on offense for this play. */
	team: string | null
	down: number | null
	distance: number | null
	/** Yards from the offense's own goal line at the snap and after the play (0 to 100). */
	from: number | null
	to: number | null
	yards: number
	/** Score after the play. */
	away: number
	home: number
	scoring: boolean
	touchdown: boolean
	turnover: boolean
	penalty: boolean
	/** A play worth highlighting: scores, turnovers and big gains. */
	big: boolean
	/** First down gained. */
	firstDown: boolean
}

export type LiveDrive = {
	id: string
	team: string | null
	description: string
	result: string
	yards: number
	plays: LivePlay[]
}

export type TeamStat = { label: string; away: string; home: string }

export type LiveGame = {
	info: LiveGameInfo
	drives: LiveDrive[]
	stats: TeamStat[]
}

/** One point on the win-probability chart. */
export type WpSample = {
	/** Seconds of game time elapsed. */
	el: number
	/** Home team's chance of winning, 0 to 1. */
	home: number
	/** Score after the play, for hover text. */
	away: number
	homeScore: number
	text: string
}
