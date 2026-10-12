// The team around a player: how his club is doing, how the unit he plays in ranks, who shares his room, and who they play next.
// Pure functions of the two data files (players.json and units.json), so the server, the browser and the tests share them.

import { type PlayerGroup, type PlayerRow, type PlayersData, overall } from "./playersKit"
import { GROUPS, type GroupKey, type Metric, type SlateGame, type UnitTeam, type UnitsData, ordinal, recText, statValue } from "./unitsKit"

/** The team unit a player's job belongs to. Kickers, punters and returners belong to none. */
export const UNIT_FOR: Partial<Record<PlayerGroup, GroupKey>> = { qb: "qb", rb: "run", wr: "rec", te: "rec", ol: "ol", edge: "rush", idl: "rush", lb: "rund", cb: "cov", saf: "cov" }

export type UnitLine = { label: string; value: string; rank: number }
export type RoomMate = { slug: string; name: string; pos: string; group: PlayerGroup; grade: number | null; rank: number; me: boolean }
export type NextGame = { week: number; opp: string; home: boolean; day: string; time: string | null }
export type TeamView = {
	abbr: string
	record: string
	games: number
	pf: number
	pa: number
	off: Metric
	def: Metric
	teams: number
	unit: { key: GroupKey; label: string; rank: number; score: number | null; lines: UnitLine[] } | null
	room: RoomMate[]
	/** His place among the teammates at his job, by overall grade, and how many of them are graded. */
	standing: { rank: number; of: number } | null
	next: NextGame | null
}

/** The slate's game for a team, with the other club and whether it is at home, or null when the team is not on the slate. */
export function nextGame(slate: UnitsData["slate"], team: string): NextGame | null {
	const g: SlateGame | undefined = slate?.games.find((x) => x.home === team || x.away === team)
	if (!slate || !g) return null
	return { week: slate.week, opp: g.home === team ? g.away : g.home, home: g.home === team, day: g.day, time: g.time }
}

/**
 * Everything about the club around one player. `maxRoom` caps the list of teammates at his job; he is always on it. Null when the
 * units file has no table for his club.
 */
export function teamView(units: UnitsData, data: PlayersData, p: PlayerRow, maxRoom = 6): TeamView | null {
	const t: UnitTeam | undefined = units.teams[p.team]
	if (!t) return null
	const key = UNIT_FOR[p.group]
	const unitInfo = key ? t.groups[key] : null
	const unit = key && unitInfo
		? {
				key,
				label: GROUPS[key].label,
				rank: unitInfo.rank,
				score: unitInfo.score,
				lines: Object.entries(unitInfo.stats)
					.filter((e): e is [string, NonNullable<Metric>] => Boolean(e[1]) && Boolean(GROUPS[key].stats[e[0]]))
					.map(([k, m]) => ({ label: GROUPS[key].stats[k].label, value: statValue(key, k, m.v), rank: m.rank })),
			}
		: null
	const mates = data.players
		.filter((q) => q.team === p.team && q.group === p.group)
		.map((q) => ({ q, o: overall(q) }))
		.sort((a, b) => (b.o ?? -1) - (a.o ?? -1) || b.q.games - a.q.games || a.q.name.localeCompare(b.q.name))
	const graded = mates.filter((m) => m.o !== null)
	const place = graded.findIndex((m) => m.q.id === p.id)
	const shown = mates.slice(0, maxRoom)
	if (!shown.some((m) => m.q.id === p.id)) {
		const me = mates.find((m) => m.q.id === p.id)
		if (me) shown.splice(maxRoom - 1, 1, me)
	}
	return {
		abbr: p.team,
		record: recText({ w: t.w, l: t.l, t: t.t }),
		games: t.g,
		pf: t.pf,
		pa: t.pa,
		off: t.overall.off,
		def: t.overall.def,
		teams: Object.keys(units.teams).length,
		unit,
		room: shown.map((m, i) => ({ slug: m.q.slug, name: m.q.name, pos: m.q.pos, group: m.q.group, grade: m.o === null ? null : Math.round(m.o), rank: graded.findIndex((x) => x.q.id === m.q.id) + 1 || i + 1, me: m.q.id === p.id })),
		standing: place >= 0 ? { rank: place + 1, of: graded.length } : null,
		next: nextGame(units.slate, p.team),
	}
}

/** One plain sentence tying him to his unit, or "" when there is nothing honest to say. */
export function teamSentence(view: TeamView, p: PlayerRow, single: string, nick: string): string {
	const first = p.name.split(" ")[0]
	const bits: string[] = []
	if (view.standing && view.standing.of > 1) {
		bits.push(view.standing.rank === 1 ? `${first} grades as the ${nick}' best ${single.toLowerCase()}` : `${first} is the ${nick}' ${ordinal(view.standing.rank)}-best ${single.toLowerCase()} by grade (of ${view.standing.of})`)
	}
	if (view.unit) bits.push(`the ${nick}' ${view.unit.label.toLowerCase()} rank${/s$/.test(view.unit.label) ? "" : "s"} ${ordinal(view.unit.rank)} of ${view.teams}`)
	return bits.length ? `${bits.join(", and ")}.`.replace(/^./, (c) => c.toUpperCase()) : ""
}
