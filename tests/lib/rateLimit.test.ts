import { describe, expect, it } from "vitest"

import { clientIp, createLimiter } from "../../lib/rateLimit"

describe("createLimiter", () => {
	it("allows up to max hits per window, then blocks with a retry time", () => {
		const l = createLimiter({ max: 3, windowMs: 60_000 })
		expect(l.hit("a", 0).ok).toBe(true)
		expect(l.hit("a", 1).ok).toBe(true)
		expect(l.hit("a", 2).ok).toBe(true)
		const blocked = l.hit("a", 30_000)
		expect(blocked).toEqual({ ok: false, retryAfter: 30 })
	})

	it("keeps keys separate", () => {
		const l = createLimiter({ max: 1, windowMs: 1000 })
		expect(l.hit("a", 0).ok).toBe(true)
		expect(l.hit("b", 0).ok).toBe(true)
		expect(l.hit("a", 1).ok).toBe(false)
	})

	it("opens a fresh window after it expires", () => {
		const l = createLimiter({ max: 1, windowMs: 1000 })
		l.hit("a", 0)
		expect(l.hit("a", 999).ok).toBe(false)
		expect(l.hit("a", 1000).ok).toBe(true)
	})

	it("reports at least one second to wait", () => {
		const l = createLimiter({ max: 1, windowMs: 1000 })
		l.hit("a", 0)
		expect(l.hit("a", 999)).toMatchObject({ ok: false, retryAfter: 1 })
	})

	it("can be reset", () => {
		const l = createLimiter({ max: 1, windowMs: 1000 })
		l.hit("a", 0)
		l.reset()
		expect(l.hit("a", 1).ok).toBe(true)
	})

	it("prunes expired buckets so memory stays bounded", () => {
		const l = createLimiter({ max: 1, windowMs: 10 })
		for (let i = 0; i < 5100; i++) l.hit(`k${i}`, 0)
		expect(l.hit("fresh", 1_000).ok).toBe(true) // triggers the prune without throwing
	})
})

describe("clientIp", () => {
	it("uses the first forwarded address", () => {
		expect(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } })).toBe("1.2.3.4")
		expect(clientIp({ headers: { "x-forwarded-for": ["5.6.7.8"] } })).toBe("5.6.7.8")
	})
	it("falls back to the socket, then 'unknown'", () => {
		expect(clientIp({ headers: {}, socket: { remoteAddress: "9.9.9.9" } })).toBe("9.9.9.9")
		expect(clientIp({ headers: {} })).toBe("unknown")
	})
})
