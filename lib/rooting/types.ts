// The shapes of the Sunday Rooting Guide's data. Plain types, no imports from the site, so the engine, the page, the share card and
// the tests can all use them.

/** What a fan can root for: make the playoffs, win the division, or take the conference's top seed (the bye). */
export type Goal = "playoffs" | "division" | "bye"

export const GOALS: readonly Goal[] = ["playoffs", "division", "bye"]
export const DEFAULT_GOAL: Goal = "playoffs"

/** A game's result from the home team's side: home win, away win, tie. */
export type Result = "H" | "A" | "T"

/** Probabilities are stored as whole numbers out of this many, so the file stays small and exact when read back. */
export const SCALE = 10_000

/**
 * What the build writes to data/lab/rooting.json. Every list of numbers that says "per team and goal" has one entry for each
 * (team, goal): the index is `teamIndex * 3 + goalIndex`, with teams in the order of `teams` and goals in the order of GOALS.
 */
export type RootingData = {
	version: number
	season: number
	/** The last week with a played game. */
	throughWeek: number
	generatedAt: string
	/** Identifies the results, the model and the settings this was made from. When it changes, the guide is stale. */
	resultsKey: string
	finals: number
	open: number
	/** Simulated seasons behind the odds. 0 when every open game was played out exactly. */
	sims: number
	exact: boolean
	tieSims: number
	source: string
	teams: string[]
	/** Each team's chance at each goal as things stand, out of SCALE. */
	baseline: number[]
	/** One entry per game still to play. */
	games: RootingGame[]
	/** Each (team, goal)'s chance if the game ended in a tie, for the games where that was worked out. */
	ties: Record<string, number[]>
	/** Recently finished games and how much each result was worth to every team. */
	completed: CompletedGame[]
	/** The odds as they stood when each earlier week finished, for "since last week". */
	history: HistoryPoint[]
}

export type RootingGame = {
	id: string
	week: number
	away: string
	home: string
	/** The model's chance the home team wins, out of SCALE. */
	pHome: number
	/** Simulated seasons in which the home team won, and in which the away team won. 0 for both when played out exactly. */
	n: [number, number]
	/** Each (team, goal)'s chance if the home team wins / if the away team wins, out of SCALE. */
	H: number[]
	A: number[]
}

export type CompletedGame = {
	id: string
	week: number
	away: string
	home: string
	awayScore: number
	homeScore: number
	result: Result
	/** For each (team, goal): its chance with this result minus its chance had the other team won, out of SCALE (signed). Empty for a tie. */
	swing: number[]
}

export type HistoryPoint = {
	/** The week that had just finished. */
	week: number
	/** Identifies the results through that week, so a snapshot is only reused when they have not changed. */
	key: string
	p: number[]
}
