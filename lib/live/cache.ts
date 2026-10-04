// A small in-memory cache with two jobs: many viewers share one upstream request per window, and a
// failed refresh serves the last good answer instead of an error. Lives per server instance, which
// is enough because the API routes also tell Vercel's CDN to share responses.

type Entry = { at: number; value: unknown }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

export type Cached<T> = { value: T; stale: boolean; at: number }

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): Promise<Cached<T>> {
	const hit = store.get(key)
	if (hit && now() - hit.at < ttlMs) return { value: hit.value as T, stale: false, at: hit.at }
	let pending = inflight.get(key) as Promise<T> | undefined
	if (!pending) {
		pending = load().finally(() => inflight.delete(key))
		inflight.set(key, pending)
	}
	try {
		const value = await pending
		const at = now()
		store.set(key, { at, value })
		return { value, stale: false, at }
	} catch (e) {
		if (hit) return { value: hit.value as T, stale: true, at: hit.at }
		throw e
	}
}

export function clearCache() {
	store.clear()
	inflight.clear()
}
