// What is different between two scenarios. Only differences are reported: a stat that did not move is not in the result,
// so a reader sees the consequences of the change instead of two full tables.

import { recordText } from "./season"
import type { SimulationResult } from "./simulator"
import type { Conference, Game, Outcome, Predictions } from "./types"

export type PickDiff = { gameId: string; week: number; home: string; away: string; a: Outcome | null; b: Outcome | null }

export type TeamDiff = {
	team: string
	conference: Conference
	seedA: number | null
	seedB: number | null
	recordA: string
	recordB: string
	/** "in" / "out" when the team is in the playoffs in one scenario and not in the other. */
	flip: "in" | "out" | null
}

export type ScenarioDiff = {
	picks: PickDiff[]
	teams: TeamDiff[]
	divisions: { division: string; a: string; b: string }[]
	/** One plain sentence per change that matters, most important first. */
	lines: string[]
	same: boolean
}

export function diffPicks(games: readonly Game[], a: Predictions, b: Predictions): PickDiff[] {
	const out: PickDiff[] = []
	for (const g of games) {
		const pa = Object.prototype.hasOwnProperty.call(a, g.id) ? a[g.id] : null
		const pb = Object.prototype.hasOwnProperty.call(b, g.id) ? b[g.id] : null
		if (pa !== pb) out.push({ gameId: g.id, week: g.week, home: g.homeTeam, away: g.awayTeam, a: pa, b: pb })
	}
	return out
}

export function diffScenarios(games: readonly Game[], pa: Predictions, pb: Predictions, a: SimulationResult, b: SimulationResult): ScenarioDiff {
	const picks = diffPicks(games, pa, pb)
	const teams: TeamDiff[] = []
	for (const id of Object.keys(a.teams).sort()) {
		const ta = a.teams[id]
		const tb = b.teams[id]
		const changed = ta.seed !== tb.seed || recordText(ta.overall) !== recordText(tb.overall)
		if (!changed) continue
		teams.push({ team: id, conference: ta.conference, seedA: ta.seed, seedB: tb.seed, recordA: recordText(ta.overall), recordB: recordText(tb.overall), flip: ta.seed === null && tb.seed !== null ? "in" : ta.seed !== null && tb.seed === null ? "out" : null })
	}
	teams.sort((x, y) => Number(Boolean(y.flip)) - Number(Boolean(x.flip)) || x.team.localeCompare(y.team))

	const divisions: ScenarioDiff["divisions"] = []
	for (const c of Object.keys(a.conferences) as Conference[]) {
		for (const [division, order] of Object.entries(a.conferences[c].divisions)) {
			const other = b.conferences[c].divisions[division]
			if (other && other[0] !== order[0]) divisions.push({ division, a: order[0], b: other[0] })
		}
	}

	const lines: string[] = []
	for (const d of divisions) lines.push(`${d.b} win the ${d.division} instead of ${d.a}`)
	for (const t of teams) {
		if (t.flip === "in") lines.push(`${t.team} make the playoffs as the ${t.seedB} seed (they miss in the first scenario)`)
		else if (t.flip === "out") lines.push(`${t.team} miss the playoffs (they are the ${t.seedA} seed in the first scenario)`)
		else if (t.seedA !== null && t.seedB !== null && t.seedA !== t.seedB) lines.push(`${t.team} move from the ${t.seedA} seed to the ${t.seedB} seed`)
	}
	return { picks, teams, divisions, lines, same: picks.length === 0 }
}
