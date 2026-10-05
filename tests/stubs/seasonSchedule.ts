import { TEAMS } from "../../lib/nfl"
import type { SeasonGame } from "../../lib/math/season"

export const ABBRS = TEAMS.map((t) => t.abbr)

/** 17 rounds of a 32-team round robin (circle method): every team plays every week. */
export function schedule(played = 0, score = (h: number, a: number) => [20 + (h % 7), 17 + (a % 5)] as [number, number]): SeasonGame[] {
	const rest = ABBRS.slice(1)
	const out: SeasonGame[] = []
	for (let r = 0; r < 17; r++) {
		const ring = [ABBRS[0], ...rest.slice(r % 31).concat(rest.slice(0, r % 31))]
		for (let i = 0; i < 16; i++) {
			const home = r % 2 === 0 ? ring[i] : ring[31 - i]
			const away = r % 2 === 0 ? ring[31 - i] : ring[i]
			const done = r < played
			const [hs, as] = done ? score(ABBRS.indexOf(home), ABBRS.indexOf(away)) : [null, null]
			out.push({ week: r + 1, home, away, homeScore: hs, awayScore: as })
		}
	}
	return out
}
