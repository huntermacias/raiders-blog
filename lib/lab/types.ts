// Shapes of data/lab/season.json, written by scripts/lab/build_lab_data.py from
// nflverse play-by-play (CC BY 4.0). Keep this file and that script in step.

/** [seconds of game time elapsed, the Raiders' win probability from 0 to 1] */
export type WpPoint = [number, number]

export type KeyKind = "TD" | "FG" | "SAF" | "2PT" | "INT" | "FUM" | "BIG"

export type KeyPlay = {
	el: number
	q: number
	clock: string
	kind: KeyKind
	/** Team that scored, or that had the ball for non-scoring plays. */
	team: string | null
	wpBefore: number | null
	wpAfter: number | null
	text: string
	/** [Raiders, opponent] after the play. */
	score: [number, number]
}

export type DrivePlay = {
	n: number
	dn: number | null
	ytg: number
	/** Yards from the offense's own goal line where the play starts (0 to 100). */
	x: number
	/** Where the ball ends up. null for kicks, where the text says how far. */
	xe: number | null
	yds: number
	type: string
	fd: boolean
	td: boolean
	text: string
	/** Third of the field the play went to, from the offense's point of view. Missing when the log has none. */
	loc?: "L" | "M" | "R"
	/** Run gap: E end, T tackle, G guard. Runs only. */
	gap?: "E" | "T" | "G"
	/** Passes: yards the ball traveled in the air (negative behind the line), and yards after the catch. */
	ay?: number
	yac?: number
	/** Expected points added by the play. */
	epa?: number
	/** Win probability added for the offense, as a fraction (0.021 = 2.1 points). */
	wpa?: number
	/** Shotgun and no-huddle, when the log says so. */
	sg?: 1
	nh?: 1
	/** The model's chance, before the snap, that this would be a pass (0 to 1). */
	xp?: number
	/** Pass length from the log: S short, D deep. */
	pl?: "S" | "D"
}

export type Drive = {
	n: number
	team: string
	q: number
	clock: string
	result: string
	start: number
	yards: number
	plays: DrivePlay[]
	top: string | null
}

export type LabGame = {
	id: string
	week: number
	date: string
	home: boolean
	opp: string
	oppName: string
	/** [Raiders, opponent] */
	score: [number, number]
	result: "W" | "L" | "T"
	spread: number | null
	roof: string | null
	wp: WpPoint[]
	/** [seconds elapsed, Raiders score, opponent score] each time the score changes. */
	scores: [number, number, number][]
	keyPlays: KeyPlay[]
	drives: Drive[]
}

export type LabSeason = {
	season: number
	team: string
	generatedAt: string
	source: string
	games: LabGame[]
}
