// Shared checks for the anonymous write endpoints (votes, reactions, comments).
//
// These routes use a Sanity token that can write, and they are open to the internet, so they have to refuse anything that is not
// this site's own page doing what the page does:
//   - only POST, only from a browser page on this site (the Origin header; a script run from a terminal has none),
//   - a small JSON body, and an id that is a plain published-document id (no GROQ, no path tricks, no drafts),
//   - a per-address speed bump, because one visitor has no reason to vote or comment dozens of times a minute.
// The speed bump lives in one instance's memory (see lib/rateLimit.ts); the Vercel firewall rule in guides/security-hardening.md is the wall.
// Pure helpers, no Sanity import, so they are easy to test.

import type { NextApiRequest, NextApiResponse } from "next"

import { clientIp, type Limiter } from "./rateLimit"

/** Hosts a browser page may come from. A preview deployment is allowed through the `Host` comparison below. */
const SITE_HOSTS = new Set(["www.raidersrundown.com", "raidersrundown.com"])

function headerValue(v: string | string[] | undefined): string {
	return (Array.isArray(v) ? v[0] : v) ?? ""
}

/**
 * True when the request was made by a page served from this site. Browsers always send `Origin` on a cross-origin or POST fetch and the page
 * cannot change it; `Referer` is the fallback for the odd client that omits it. A request with neither (curl, a script) is refused.
 */
export function isSameSite(req: Pick<NextApiRequest, "headers">): boolean {
	const origin = headerValue(req.headers.origin) || headerValue(req.headers.referer)
	if (!origin) return false
	let host: string
	try {
		host = new URL(origin).host
	} catch {
		return false
	}
	if (SITE_HOSTS.has(host)) return true
	const mine = headerValue(req.headers.host)
	return mine !== "" && host === mine
}

/** A Sanity document id as this site mints them: letters, digits, dash, underscore, dot. Drafts and system ids are never a valid target. */
export function validDocId(v: unknown): v is string {
	return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(v) && !v.startsWith("drafts.") && !v.startsWith("versions.")
}

/** A `_key` Sanity generates: short, no quotes or brackets, so it can never change the meaning of the path it is dropped into. */
export function validKey(v: unknown): v is string {
	return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)
}

/** The JSON body of a request as a plain object, or null when it is missing, malformed, or not an object. */
export function jsonBody(req: Pick<NextApiRequest, "body">): Record<string, unknown> | null {
	try {
		const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body
		return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null
	} catch {
		return null
	}
}

export type WriteGuard = { limiter: Limiter; method?: "POST" }

/**
 * Runs the checks every anonymous write shares. Returns the parsed body, or null after it has already answered (405, 403, 429 or 400).
 */
export function guardWrite(req: NextApiRequest, res: NextApiResponse, { limiter }: WriteGuard): Record<string, unknown> | null {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST")
		res.status(405).json({ message: "Method not allowed" })
		return null
	}
	if (!isSameSite(req)) {
		res.status(403).json({ message: "Not allowed" })
		return null
	}
	const hit = limiter.hit(clientIp(req))
	if (!hit.ok) {
		res.setHeader("Retry-After", String(hit.retryAfter))
		res.status(429).json({ message: "Slow down a little and try again." })
		return null
	}
	const body = jsonBody(req)
	if (!body) {
		res.status(400).json({ message: "Invalid request" })
		return null
	}
	return body
}

/** Smaller than Next's 1 MB default: nothing this site accepts needs more than a few kilobytes. */
export const SMALL_BODY = { api: { bodyParser: { sizeLimit: "8kb" } } } as const
