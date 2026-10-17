// The rivalry: every reader against the blogger, game by game.
//
// A game counts for the rivalry only if the player entered it and it is graded. "Beat" means more points than the
// blogger on that game; equal points is a tie. Pure: no I/O.

export type VsResult = "W" | "L" | "T"

export type RivalryGame = {
	eventId: string
	season: number
	week: number
	/** ISO kickoff: the order games are played in. */
	kickoff: string
	playerPoints: number
	bloggerPoints: number
	/** Player's margin error, for the "best prediction" tiebreak. Null when not applicable. */
	marginError: number | null
	voided?: boolean
}

export type Record3 = { w: number; l: number; t: number }

export type Rivalry = {
	games: number
	record: Record3
	/** Player points minus blogger points, summed. Positive means ahead of the blogger. */
	differential: number
	/** The run the player is on right now, counting back from their latest game. Null with no games. */
	current: { type: VsResult; length: number } | null
	/** Longest run of games beating the blogger. A tie or a loss ends a run. */
	longestWin: number
	/** The player's best single game: most points, then smaller margin error, then the earlier kickoff. */
	best: RivalryGame | null
	/** The game where the player beat the blogger by the most points. */
	biggestWin: RivalryGame | null
}

export const vs = (player: number, blogger: number): VsResult => (player > blogger ? "W" : player < blogger ? "L" : "T")

export function buildRivalry(input: readonly RivalryGame[]): Rivalry {
	const games = input.filter((g) => !g.voided).slice().sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.eventId.localeCompare(b.eventId))
	const record: Record3 = { w: 0, l: 0, t: 0 }
	let differential = 0
	let run = 0
	let longestWin = 0
	let best: RivalryGame | null = null
	let biggestWin: RivalryGame | null = null

	games.forEach((g) => {
		const r = vs(g.playerPoints, g.bloggerPoints)
		if (r === "W") record.w++
		else if (r === "L") record.l++
		else record.t++
		differential += g.playerPoints - g.bloggerPoints
		run = r === "W" ? run + 1 : 0
		if (run > longestWin) longestWin = run
		if (best === null || betterGame(g, best)) best = g
		if (r === "W" && (biggestWin === null || g.playerPoints - g.bloggerPoints > biggestWin.playerPoints - biggestWin.bloggerPoints)) biggestWin = g
	})

	let current: Rivalry["current"] = null
	if (games.length > 0) {
		const last = vs(games[games.length - 1].playerPoints, games[games.length - 1].bloggerPoints)
		let n = 0
		for (let i = games.length - 1; i >= 0; i--) {
			if (vs(games[i].playerPoints, games[i].bloggerPoints) !== last) break
			n++
		}
		current = { type: last, length: n }
	}
	return { games: games.length, record, differential, current, longestWin, best, biggestWin }
}

function betterGame(a: RivalryGame, b: RivalryGame): boolean {
	if (a.playerPoints !== b.playerPoints) return a.playerPoints > b.playerPoints
	const ea = a.marginError ?? Infinity
	const eb = b.marginError ?? Infinity
	if (ea !== eb) return ea < eb
	return a.kickoff < b.kickoff
}

/** Season-by-season lines for a profile's "history against me". Seasons ascending. */
export function rivalryBySeason(input: readonly RivalryGame[]): { season: number; rivalry: Rivalry }[] {
	const by: Record<number, RivalryGame[]> = {}
	input.forEach((g) => {
		;(by[g.season] || (by[g.season] = [])).push(g)
	})
	return Object.keys(by)
		.map(Number)
		.sort((a, b) => a - b)
		.map((season) => ({ season, rivalry: buildRivalry(by[season]) }))
}

/** Share of ranked players who are ahead of the blogger, for the community line. Zero players gives null. */
export function shareBeatingBlogger(rows: readonly { delta: number }[]): number | null {
	return rows.length === 0 ? null : rows.filter((r) => r.delta > 0).length / rows.length
}
