import type { NextApiRequest, NextApiResponse } from "next"

// Newsletter signup. Emails go straight to Buttondown (https://buttondown.com)
// and are NOT stored in Sanity: this project's dataset is public, so anything
// saved there could be read by anyone. Set BUTTONDOWN_API_KEY in Vercel to turn
// this on; without it the signup boxes don't render at all.

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

type Body = { email?: unknown; website?: unknown; source?: unknown }

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

		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), 8000)
		let r: Response
		try {
			r = await fetch("https://api.buttondown.com/v1/subscribers", {
				method: "POST",
				headers: {
					Authorization: `Token ${key}`,
					"Content-Type": "application/json",
					// Re-signups succeed quietly instead of revealing who is already on the list.
					"X-Buttondown-Collision-Behavior": "add",
				},
				body: JSON.stringify({ email_address: email, utm_source: "raidersrundown.com", utm_medium: source }),
				signal: ctrl.signal,
			})
		} finally {
			clearTimeout(timer)
		}

		if (r.ok || r.status === 400) return res.status(200).json({ ok: true })
		if (r.status === 422) return res.status(400).json({ message: "That email address doesn't look right." })

		console.error("newsletter signup failed", r.status)
		return res.status(502).json({ message: "Couldn't sign you up right now. Try again in a minute." })
	} catch (err) {
		console.error("newsletter signup error", err instanceof Error ? err.name : "unknown")
		return res.status(500).json({ message: "Something went wrong. Try again in a minute." })
	}
}
