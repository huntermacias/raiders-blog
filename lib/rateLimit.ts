// A tiny fixed-window rate limiter kept in memory.
//
// On Vercel each serverless instance has its own memory, so this is a speed
// bump against one person hammering an endpoint, not a hard guarantee. The
// real protections are elsewhere (ids that make duplicates impossible, keys
// with 100 bits of entropy). Good enough to stop casual abuse for free.

export type Limiter = {
	/** Count one hit for `key`. ok=false means over the limit; retryAfter is in seconds. */
	hit: (key: string, now?: number) => { ok: true } | { ok: false; retryAfter: number }
	/** Forget everything (tests). */
	reset: () => void
}

export function createLimiter({ max, windowMs }: { max: number; windowMs: number }): Limiter {
	const buckets = new Map<string, { count: number; resetAt: number }>()

	return {
		hit(key, now = Date.now()) {
			// Keep the map from growing without bound on a long-lived instance.
			if (buckets.size > 5000) {
				buckets.forEach((b, k) => {
					if (b.resetAt <= now) buckets.delete(k)
				})
			}
			const b = buckets.get(key)
			if (!b || b.resetAt <= now) {
				buckets.set(key, { count: 1, resetAt: now + windowMs })
				return { ok: true }
			}
			if (b.count >= max) return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
			b.count++
			return { ok: true }
		},
		reset() {
			buckets.clear()
		},
	}
}

/** Best-effort client address from the proxy headers Vercel sets. */
export function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
	const fwd = req.headers["x-forwarded-for"]
	const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim()
	return first || req.socket?.remoteAddress || "unknown"
}
