// The whole rating model in one place: Elo from the finished games (starting from last season's ratings, with
// rest and travel already folded into each game's `edge`), plus the box-score efficiency nudge. Every
// number the page shows as "the math" comes from `at(week)`.

import { type EloRun, type FinalGame, type Ratings, runElo } from "./elo"
import { type GameBox, type Underlying, underlying } from "./efficiency"

export type Model = {
	/** Starting ratings (last season carried over), or none to start every team at 1500. */
	prior?: Ratings | null
	/** Box scores of finished games; the efficiency nudge is skipped without enough of them. */
	boxes?: GameBox[]
}

export type Rated = {
	/** The plain Elo run (its `log` is each game's rating shift). */
	run: EloRun
	/** Final ratings after `week`: Elo plus the efficiency nudge. */
	at: (week: number) => Ratings
	/** Box-score numbers per team after `week` (empty when there aren't enough box scores). */
	under: (week: number) => Record<string, Underlying>
}

export function rateSeason(finished: FinalGame[], model: Model = {}): Rated {
	const run = runElo(finished, model.prior ?? {})
	const boxes = model.boxes ?? []
	const unders = new Map<number, Record<string, Underlying>>()
	const under = (week: number) => {
		let u = unders.get(week)
		if (!u) unders.set(week, (u = underlying(boxes, week)))
		return u
	}
	const at = (week: number): Ratings => {
		const base = run.byWeek[week] ?? run.ratings
		const u = under(week)
		const out: Ratings = { ...base }
		for (const [team, x] of Object.entries(u)) out[team] = (out[team] ?? 1500) + x.adj
		return out
	}
	return { run, at, under }
}
