import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../../lib/sanity.client"
import { pickId, validatePick } from "../../../lib/league"
import { authenticate } from "../../../lib/league.server"
import { UNAVAILABLE, readBody } from "../../../lib/league.api"
import { clientIp, createLimiter } from "../../../lib/rateLimit"

const limiter = createLimiter({ max: 120, windowMs: 10 * 60 * 1000 })

// Published game ids are plain UUIDs. No dots: they're joined into a dotted id.
const GAME_ID = /^[A-Za-z0-9_-]{1,80}$/

/**
 * Save (or change) a score pick. The pick's id is derived from player + game,
 * so there is exactly one document per pair and re-submitting replaces it.
 * The server re-checks everything: who you are, that the game exists, and that
 * kickoff hasn't passed. The browser's clock is never trusted.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" })

	const hit = limiter.hit(clientIp(req))
	if (!hit.ok) {
		res.setHeader("Retry-After", String(hit.retryAfter))
		return res.status(429).json({ message: "Slow down a little and try again." })
	}

	const body = readBody(req)
	const predictionId = body.predictionId
	if (typeof predictionId !== "string" || !GAME_ID.test(predictionId)) {
		return res.status(400).json({ message: "Invalid request" })
	}

	try {
		const auth = await authenticate(body.handle, body.key)
		if (!auth.ok) return res.status(auth.status).json({ message: auth.message })

		const game = await client.fetch(
			`*[_type == "gamePrediction" && _id == $id && !(_id in path('drafts.**'))][0]{ _id, season, week, kickoff, actualAwayScore, actualHomeScore }`,
			{ id: predictionId }
		)
		const v = validatePick(body, game ?? null, Date.now())
		if (!v.ok) return res.status(v.status).json({ message: v.message })

		await client.createOrReplace({
			_id: pickId(auth.lower, predictionId),
			_type: "leaguePick",
			season: game.season,
			week: game.week,
			player: auth.lower,
			predictionId,
			awayScore: v.awayScore,
			homeScore: v.homeScore,
			pickedAt: new Date().toISOString(),
		})
		return res.status(200).json({ ok: true, predictionId, awayScore: v.awayScore, homeScore: v.homeScore })
	} catch (error) {
		const e = error as { statusCode?: number; message?: string }
		console.log("league pick error:", e?.statusCode, e?.message ?? error)
		return res.status(500).json({ message: UNAVAILABLE })
	}
}
