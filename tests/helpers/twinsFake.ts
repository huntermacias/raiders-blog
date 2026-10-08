import { type Meta, type Table, seasonGames } from "../../lib/lab/historyKit"

/** A small deterministic random stream, so the made-up league is the same every run. */
export function stream(seed: number): () => number {
	let s = seed >>> 0
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0
		return s / 4294967296
	}
}

export const OFF = ["epaPass", "epaRush", "third", "redZone", "sackRate", "explosive"]
export const DEF = ["epaPass", "epaRush", "third", "redZone", "sackRate", "explosive"]

/**
 * A made-up league of `rows` team-seasons with twelve stats (six offense, six defense). Every stat is a team's hidden
 * quality plus noise, and the quality also drives how it does over the rest of the season, so matching on the stats
 * means something. With `quality: false` the rest of the season is unrelated to the stats, which a backtest must notice.
 * The Raiders' own numbers (`value`) are copied from row `twin`, so that row must come out as the closest.
 */
export function fakeSeasons(rows = 240, opts: { twin?: number; quality?: boolean; seed?: number } = {}): { meta: Meta; tables: Table[] } {
	const { twin = 17, quality = true, seed = 7 } = opts
	const rnd = stream(seed)
	const abbrs = ["LV", "KC", "NE", "DEN", "SEA", "GB", "DAL", "PHI"]
	const teams: string[] = []
	const po: number[] = []
	const wins: number[] = []
	const losses: number[] = []
	const startWins: number[] = []
	const startLosses: number[] = []
	const q: number[] = []
	for (let i = 0; i < rows; i++) {
		const season = 1999 + (i % 26)
		teams.push(`${season} ${abbrs[(i * 5 + (i >> 3)) % abbrs.length]}`)
		const quality01 = rnd()
		q.push(quality01)
		const g = seasonGames(season)
		const sw = Math.round(quality01 * 4 * 0.6 + rnd() * 1.6)
		const sWins = Math.min(4, sw)
		const restRate = quality ? 0.25 + 0.5 * quality01 : 0.2 + 0.6 * rnd()
		const restWins = Math.round(restRate * (g - 4))
		startWins.push(sWins)
		startLosses.push(4 - sWins)
		wins.push(sWins + restWins)
		losses.push(g - sWins - restWins)
		po.push(sWins + restWins >= 10 ? 1 : 0)
	}
	const meta: Meta = { n: 4, first: 1999, last: 2024, teams, po, wins, losses, startWins, startLosses }
	const make = (side: "off" | "def", key: string, higherIsBetter: boolean): Table => {
		const start = q.map((v) => (higherIsBetter ? 1 : -1) * ((v - 0.5) * 2 + (rnd() - 0.5) * 0.9))
		const rest = q.map((v) => (higherIsBetter ? 1 : -1) * ((v - 0.5) * 1.2 + (rnd() - 0.5) * 0.9))
		return {
			key: `${side}.${key}`,
			label: `${side === "off" ? "Offense" : "Defense"} ${key}`,
			short: `${side} ${key}`,
			unit: "points",
			fmt: "epa",
			higherIsBetter,
			family: side,
			value: start[twin],
			rank: 1 + start.filter((x) => (higherIsBetter ? x > start[twin] : x < start[twin])).length,
			start,
			rest,
		}
	}
	const tables = [...OFF.map((k) => make("off", k, true)), ...DEF.map((k, j) => make("def", k, j % 2 === 0))]
	return { meta, tables }
}
