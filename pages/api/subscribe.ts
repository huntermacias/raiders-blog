import type { NextApiRequest, NextApiResponse } from "next"

import { sanitizeUtm } from "../../lib/utm"

// Newsletter signup. Emails go straight to Buttondown (https://buttondown.com)
// and are NOT stored in Sanity: this project's dataset is public, so anything
// saved there could be read by anyone. Set BUTTONDOWN_API_KEY in Vercel to turn
// this on; without it the signup boxes don't render at all.

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

type Body = { email?: unknown; website?: unknown; source?: unknown; utm?: unknown }

function sameSite(req: NextApiRequest): boolean {
	const origin = req.headers.origin
	if (!origin) return true // non-browser callers carry no Origin; the key stays server-side either way
	try {
		const host = new URL(origin).host
		return host === req.headers.host || host === "www.raidersrundown.com" || host === "raidersrundown.com"
	} catch {
		return false
	}
}

/** The visitor's address as Vercel saw it, so Buttondown's firewall judges them rather than our server. */
function visitorIp(req: NextApiRequest): string | undefined {
	const fwd = req.headers["x-forwarded-for"]
	const raw = Array.isArray(fwd) ? fwd[0] : fwd
	const ip = (raw ? raw.split(",")[0] : req.socket?.remoteAddress)?.trim()
	return ip && ip.length <= 64 ? ip : undefined
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		res.setHeader("Allow", "POST")
		return res.status(405).json({ message: "Method not allowed" })
	}
	if (!sameSite(req)) return res.status(403).json({ message: "Not allowed" })

	const key = process.env.BUTTONDOWN_API_KEY
	if (!key) return res.status(503).json({ message: "Signups aren't open yet." })

	try {
		const body: Body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}

		// Honeypot: real people never see or fill this field. Pretend success.
		if (typeof body.website === "string" && body.website.trim() !== "") {
			return res.status(200).json({ ok: true })
		}

		const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
		if (email.length > 254 || !EMAIL.test(email)) {
			return res.status(400).json({ message: "Enter a valid email address." })
		}
		const source = typeof body.source === "string" ? body.source.slice(0, 60) : "site"
		// The campaign that brought this visitor (from a tagged link), cleaned again
		// here because the browser can send anything.
		const utm = sanitizeUtm(body.utm)

		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), 8000)
		let r: Response
		try {
			r = await fetch("https://api.buttondown.com/v1/subscribers", {
				method: "POST",
				headers: {
					Authorization: `Token ${key}`,
					"Content-Type": "application/json",
					// A re-signup of an existing address should succeed quietly rather
					// than reveal who is already on the list.
					"X-Buttondown-Collision-Behavior": "add",
				},
				body: JSON.stringify({
					email_address: email,
					// Buttondown's firewall scores signups by IP. Without the visitor's
					// own address every signup looks like it comes from our server.
					ip_address: visitorIp(req),
					referrer_url: typeof req.headers.referer === "string" ? req.headers.referer.slice(0, 300) : "https://www.raidersrundown.com/",
					// Buttondown's own attribution fields. A tagged visit wins; otherwise
					// fall back to "which box on the site" so untagged signups still say where.
					utm_source: utm.source ?? "raidersrundown.com",
					utm_medium: utm.medium ?? source,
					...(utm.campaign ? { utm_campaign: utm.campaign } : {}),
					metadata: { placement: source, ...(utm.content ? { utm_content: utm.content } : {}) },
				}),
				signal: ctrl.signal,
			})
		} finally {
			clearTimeout(timer)
		}

		if (r.ok) return res.status(200).json({ ok: true })

		// Only a 2xx counts as signed up. Log why Buttondown refused (with the
		// address redacted) so a blocked signup shows up in the Vercel logs instead
		// of being reported to the reader as a success.
		const detail = (await r.text().catch(() => "")).split(email).join("[email]").slice(0, 300)
		console.error("newsletter signup refused", r.status, detail)

		if (r.status === 422) return res.status(400).json({ message: "That email address doesn't look right." })
		if (r.status === 400 || r.status === 403) {
			return res.status(422).json({ message: "We couldn't add that address. Try another email, or let me know if it keeps happening." })
		}
		return res.status(502).json({ message: "Couldn't sign you up right now. Try again in a minute." })
	} catch (err) {
		console.error("newsletter signup error", err instanceof Error ? err.name : "unknown")
		return res.status(500).json({ message: "Something went wrong. Try again in a minute." })
	}
}
