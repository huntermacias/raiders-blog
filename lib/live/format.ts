// Small text helpers for the live page. Pure, so they can be tested.

import type { LiveGameInfo } from "./types"

const ORD = ["", "1st", "2nd", "3rd", "4th"]

export const periodName = (period: number): string => (period <= 0 ? "" : period <= 4 ? `Q${period}` : period === 5 ? "OT" : `${period - 4}OT`)

export function clockText(seconds: number | null): string {
	if (seconds == null) return ""
	const s = Math.max(0, Math.round(seconds))
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** "2nd & 7", or "1st & Goal" inside the opponent's ten. */
export function downText(down: number | null, distance: number | null, yardsToGoal: number | null): string {
	if (!down || distance == null) return ""
	const goal = yardsToGoal != null && distance >= yardsToGoal
	return `${ORD[down] ?? `${down}th`} & ${goal ? "Goal" : distance}`
}

/** A spot as the broadcast says it: "LV 25" in your own half, "KC 38" in theirs, "50" at midfield. */
export function spotName(offense: string, defense: string, fromOwnGoal: number): string {
	const v = Math.round(fromOwnGoal)
	if (v === 50) return "50"
	return v < 50 ? `${offense} ${v}` : `${defense} ${100 - v}`
}

const PT = "America/Los_Angeles"

/** "Sun 1:25 PM PT". Fixed to Pacific so the server and every browser print the same text. */
export function kickoffLabel(iso: string | null): string {
	if (!iso) return ""
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return ""
	const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: PT })
	const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: PT })
	return `${day} ${time} PT`
}

/** "1d 4h", "2h 05m", "12:34". Empty once the time has passed. */
export function countdown(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return ""
	const s = Math.floor(ms / 1000)
	const d = Math.floor(s / 86400)
	const h = Math.floor((s % 86400) / 3600)
	const m = Math.floor((s % 3600) / 60)
	if (d > 0) return `${d}d ${h}h`
	if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
	return `${m}:${String(s % 60).padStart(2, "0")}`
}

/** "KC -3.5", from the odds label or the home spread. */
export function spreadText(info: LiveGameInfo): string {
	const o = info.odds
	if (!o) return ""
	if (o.label) return o.label
	if (o.homeSpread == null) return ""
	if (o.homeSpread === 0) return "EVEN"
	const fav = o.homeSpread < 0 ? info.home.abbr : info.away.abbr
	return `${fav} -${Math.abs(o.homeSpread)}`
}

export const pct = (p: number): string => `${Math.round(p * 100)}%`

/** "Q2 3:10" for a count of seconds of game time elapsed. */
export function clockAtElapsed(el: number): string {
	if (el <= 0) return "Kickoff"
	if (el >= 3600) {
		const ot = el - 3600
		return `OT ${clockText(600 - (ot % 600))}`
	}
	const q = Math.floor(el / 900) + 1
	return `Q${q} ${clockText(900 - (el % 900))}`
}

/** Yards as the feed shows them: +13, −2, 0. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0")
