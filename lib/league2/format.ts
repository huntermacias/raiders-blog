// Small display helpers shared by League pages. Pure; safe on server and client.

import { teamInfo } from "../nfl"

// A fixed zone so server render and client hydration agree.
export function kickoffLabel(iso: string): string {
	return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" })
}
export function shortDay(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })
}
export const nick = (team: string) => teamInfo(team).nick
export const teamColor = (team: string) => teamInfo(team).color
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0")
export const oneDecimal = (n: number | null) => (n === null ? "–" : (Math.round(n * 10) / 10).toFixed(1))
export const pct = (n: number) => `${Math.round(n * 100)}%`
export function duration(ms: number): string {
	const m = Math.max(0, Math.floor(ms / 60000))
	if (m < 1) return "under a minute"
	if (m < 60) return `${m}m`
	const h = Math.floor(m / 60)
	if (h < 24) return `${h}h ${m % 60}m`
	return `${Math.floor(h / 24)}d ${h % 24}h`
}
