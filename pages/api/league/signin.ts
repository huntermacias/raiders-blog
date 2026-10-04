import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../../lib/sanity.client"
import { SEASON } from "../../../lib/predictions"
import { authenticate } from "../../../lib/league.server"
import { UNAVAILABLE, readBody } from "../../../lib/league.api"
import { clientIp, createLimiter } from "../../../lib/rateLimit"

const byIp = createLimiter({ max: 40, windowMs: 10 * 60 * 1000 })
const byHandle = createLimiter({ max: 15, windowMs: 10 * 60 * 1000 })

/**
 * Check a handle + key (new device, or the page re-validating what it has in
 * localStorage) and return this player's own picks for the season.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" })

	const body = readBody(req)
	const handleKey = typeof body.handle === "string" ? body.handle.trim().toLowerCase().slice(0, 32) : ""
	const hit = byIp.hit(clientIp(req))
	const hitHandle = byHandle.hit(handleKey || "none")
	const blocked = !hit.ok ? hit : !hitHandle.ok ? hitHandle : null
	if (blocked) {
		res.setHeader("Retry-After", String(blocked.retryAfter))
		return res.status(429).json({ message: "Too many attempts. Wait a few minutes and try again." })
	}

	try {
		const auth = await authenticate(body.handle, body.key)
		if (!auth.ok) return res.status(auth.status).json({ message: auth.message })

		const picks = await client.fetch(
			`*[_type == 'leaguePick' && player == $player && season == $season && !(_id in path('drafts.**'))]{ predictionId, awayScore, homeScore }`,
			{ player: auth.lower, season: SEASON }
		)
		return res.status(200).json({ handle: auth.handle, picks: Array.isArray(picks) ? picks : [] })
	} catch (error) {
		const e = error as { statusCode?: number; message?: string }
		console.log("league signin error:", e?.statusCode, e?.message ?? error)
		return res.status(500).json({ message: UNAVAILABLE })
	}
}
