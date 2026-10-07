import { type Meta, type Table, seasonGames } from "../../lib/lab/historyKit"

/**
 * A made-up league of `rows` team-seasons for one stat: each team's rest-of-season value is `slope` of the way from the
 * average (2.0) to its start, and teams that start higher win more and make the playoffs more often.
 */
export function fakeLeague(rows: number, slope: number, opts: { higherIsBetter?: boolean; value?: number; rank?: number; key?: string } = {}): { meta: Meta; table: Table } {
	const { higherIsBetter = true, value = 2.4, rank = 1, key = "def.turnovers" } = opts
	const start: number[] = []
	const rest: number[] = []
	const teams: string[] = []
	const po: number[] = []
	const wins: number[] = []
	const losses: number[] = []
	const startWins: number[] = []
	const startLosses: number[] = []
	for (let i = 0; i < rows; i++) {
		const s = 1 + (i / (rows - 1)) * 2
		const season = 2000 + (i % 25)
		start.push(s)
		rest.push(2 + slope * (s - 2) + (i % 2 ? 0.04 : -0.04))
		teams.push(`${season} ${i % 40 === 0 ? "LV" : i % 3 === 0 ? "NE" : "AAA"}`)
		po.push(s >= 2 ? (i % 3 ? 1 : 0) : i % 5 === 0 ? 1 : 0)
		const w = Math.min(seasonGames(season), 4 + Math.round((s - 1) * 4) + (i % 3))
		wins.push(w)
		losses.push(seasonGames(season) - w)
		const sw = Math.min(4, Math.round((s - 1) * 2))
		startWins.push(sw)
		startLosses.push(4 - sw)
	}
	const meta: Meta = { n: 4, first: 2000, last: 2024, teams, po, wins, losses, startWins, startLosses }
	const table: Table = { key, label: "Takeaways", short: "takeaways", unit: "takeaways per game", fmt: "per", higherIsBetter, family: "def", value, rank, start, rest }
	return { meta, table }
}
