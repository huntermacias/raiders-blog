// Browser-side bits of the league: where the handle + recovery key live.
// Kept apart from lib/league.ts so server code never touches localStorage.

export type LeagueCreds = { handle: string; key: string }

const STORAGE_KEY = "raiders-rundown:league"

export function loadCreds(): LeagueCreds | null {
	if (typeof window === "undefined") return null
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const v = JSON.parse(raw)
		return v && typeof v.handle === "string" && typeof v.key === "string" ? { handle: v.handle, key: v.key } : null
	} catch {
		return null
	}
}

export function saveCreds(c: LeagueCreds): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ handle: c.handle, key: c.key }))
	} catch {
		// Private mode etc. The player just has to sign in again next visit.
	}
}

export function clearCreds(): void {
	if (typeof window === "undefined") return
	try {
		window.localStorage.removeItem(STORAGE_KEY)
	} catch {
		// ignore
	}
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string }

/** POST JSON to a league route. Never throws; status 0 means the network failed. */
export async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
	try {
		const res = await fetch(path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})
		const data = await res.json().catch(() => ({}))
		if (res.ok) return { ok: true, data: data as T }
		return { ok: false, status: res.status, message: typeof data?.message === "string" ? data.message : "Something went wrong. Try again." }
	} catch {
		return { ok: false, status: 0, message: "Couldn't reach the server. Check your connection and try again." }
	}
}
