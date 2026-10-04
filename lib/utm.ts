// UTM campaign tags: read them off the landing URL, remember the first ones a
// visitor arrives with, and clean anything that comes back from a browser
// before it is stored or forwarded. Pure and dependency-free.

export type Utm = {
	source?: string
	medium?: string
	campaign?: string
	content?: string
}

const FIELDS = ["source", "medium", "campaign", "content"] as const
const MAX_LEN = 64

/** How long a visitor's first campaign is remembered before a new one can replace it. */
export const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const UTM_STORAGE_KEY = "raiders-rundown:utm"

/**
 * One tag value: trimmed, lower case, spaces and '+' become '-', anything but
 * letters, digits, '.', '_' and '-' is dropped, 64 characters at most.
 * Returns undefined for anything that isn't a usable string.
 */
export function cleanValue(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined
	const out = v
		.trim()
		.toLowerCase()
		.replace(/[\s+]+/g, "-")
		.replace(/[^a-z0-9._-]/g, "")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_LEN)
	return out === "" ? undefined : out
}

/** Cleans an arbitrary object (a request body, stored JSON) down to known UTM fields. */
export function sanitizeUtm(input: unknown): Utm {
	const out: Utm = {}
	if (!input || typeof input !== "object") return out
	const o = input as Record<string, unknown>
	for (const f of FIELDS) {
		const v = cleanValue(o[f])
		if (v) out[f] = v
	}
	return out
}

export function isEmptyUtm(u: Utm | null | undefined): boolean {
	return !u || FIELDS.every((f) => !u[f])
}

/**
 * The UTM tags in a query string ("?utm_source=x&..."), or null when the link
 * wasn't tagged. Needs at least a source, medium or campaign: a stray
 * utm_content alone is not a campaign.
 */
export function parseUtm(search: string): Utm | null {
	let params: URLSearchParams
	try {
		params = new URLSearchParams(search)
	} catch {
		return null
	}
	const u = sanitizeUtm({
		source: params.get("utm_source"),
		medium: params.get("utm_medium"),
		campaign: params.get("utm_campaign"),
		content: params.get("utm_content"),
	})
	return u.source || u.medium || u.campaign ? u : null
}

type Store = Pick<Storage, "getItem" | "setItem">

function defaultStore(): Store | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage
	} catch {
		return null
	}
}

/** The remembered campaign, or null when there is none or it has expired. */
export function loadUtm(now: number = Date.now(), store: Store | null = defaultStore()): Utm | null {
	if (!store) return null
	try {
		const raw = store.getItem(UTM_STORAGE_KEY)
		if (!raw) return null
		const v = JSON.parse(raw) as { utm?: unknown; at?: unknown }
		if (typeof v.at !== "number" || now - v.at >= UTM_TTL_MS || now < v.at) return null
		const u = sanitizeUtm(v.utm)
		return isEmptyUtm(u) ? null : u
	} catch {
		return null
	}
}

/**
 * Call on landing. A tagged URL is remembered unless the visitor already has an
 * unexpired campaign (first touch wins), so reading an X link and later
 * clicking a newsletter link credits the first one. Returns what is remembered.
 */
export function captureUtm(search: string, now: number = Date.now(), store: Store | null = defaultStore()): Utm | null {
	const existing = loadUtm(now, store)
	if (existing) return existing
	const fresh = parseUtm(search)
	if (!fresh) return null
	if (store) {
		try {
			store.setItem(UTM_STORAGE_KEY, JSON.stringify({ utm: fresh, at: now }))
		} catch {
			// Private mode: this visit is still attributed through the URL itself.
		}
	}
	return fresh
}
