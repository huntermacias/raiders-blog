// Small pure helpers for how the Playoff Machine words things.

import type { SimulationResult } from "./simulator"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Thu, Oct 15 · 8:15 PM ET" from the schedule's date ("2026-10-15") and Eastern kickoff time ("20:15"). */
export function kickoffLabel(date?: string | null, time?: string | null): string {
	const m = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
	if (!m) return ""
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
	const day = `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
	const t = time ? /^(\d{1,2}):(\d{2})$/.exec(time) : null
	if (!t) return day
	const hour = Number(t[1])
	const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${t[2]} ${hour >= 12 ? "PM" : "AM"} ET`
	return `${day} · ${clock}`
}

/** "AFC West" -> "West". */
export const divisionShort = (division: string): string => division.replace(/^[AN]FC\s+/, "")

/**
 * Teams worth watching for a team's playoff race: its division rivals, plus the teams sitting within two places of it in the
 * conference table (the ones it is really racing). Never includes the team itself or the other conference.
 */
export function rivalsOf(sim: SimulationResult, team: string): Set<string> {
	const me = sim.teams[team]
	const out = new Set<string>()
	if (!me) return out
	for (const t of Object.values(sim.teams)) {
		if (t.team === team || t.conference !== me.conference) continue
		if (t.division === me.division || Math.abs(t.rank - me.rank) <= 2) out.add(t.team)
	}
	return out
}
