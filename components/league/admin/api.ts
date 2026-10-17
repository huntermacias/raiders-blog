import { post, type Res } from "@/lib/league2/client"

/** The one admin door. A non-admin gets a 404 here, which the screens show as "not found". */
export const admin = <T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<Res<T>> => post<T>("/api/league/account/admin", { action, ...body })

export const MIN_REASON = 10

/** A datetime-local value (the admin's own clock) to an ISO instant, or null if empty or invalid. */
export function localToIso(v: string): string | null {
	if (!v) return null
	const t = new Date(v)
	return Number.isNaN(t.getTime()) ? null : t.toISOString()
}

/** An ISO instant to the value a datetime-local input expects, in the admin's own timezone. */
export function isoToLocal(iso: string | null): string {
	if (!iso) return ""
	const d = new Date(iso)
	const p = (n: number) => String(n).padStart(2, "0")
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
