import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../../lib/sanity.client"
import { parseHandle, playerId } from "../../../lib/league"
import { generateKey, hashKey } from "../../../lib/league.server"
import { UNAVAILABLE, readBody } from "../../../lib/league.api"
import { clientIp, createLimiter } from "../../../lib/rateLimit"
import { sanitizeUtm } from "../../../lib/utm"

// Handles are free, so keep one address from claiming a pile of them.
const limiter = createLimiter({ max: 5, windowMs: 60 * 60 * 1000 })

function acquisition(utm: ReturnType<typeof sanitizeUtm>) {
	return {
		...(utm.source ? { signupSource: utm.source } : {}),
		...(utm.medium ? { signupMedium: utm.medium } : {}),
		...(utm.campaign ? { signupCampaign: utm.campaign } : {}),
		...(utm.content ? { signupContent: utm.content } : {}),
	}
}

/**
 * Claim a handle. The player document id is derived from the handle
 * (leaguePlayer.<handle>), so two people can never hold the same one: whoever's
 * createIfNotExists lands first owns it. The recovery key is returned exactly
 * once; only its hash is stored.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" })

	const hit = limiter.hit(clientIp(req))
	if (!hit.ok) {
		res.setHeader("Retry-After", String(hit.retryAfter))
		return res.status(429).json({ message: "Too many sign-ups from this connection. Try again later." })
	}

	const body = readBody(req)
	const parsed = parseHandle(body.handle)
	if (!parsed.ok) return res.status(400).json({ message: parsed.message })

	try {
		const key = generateKey()
		const keyHash = hashKey(key)
		const doc = await client.createIfNotExists({
			_id: playerId(parsed.lower),
			_type: "leaguePlayer",
			handle: parsed.handle,
			handleLower: parsed.lower,
			keyHash,
			banned: false,
			// Which tagged link brought them (empty strings are dropped by Sanity's
			// own validation, so only set what exists).
			...acquisition(sanitizeUtm(body.utm)),
		})
		// createIfNotExists hands back the existing document when the id was taken.
		if (doc.keyHash !== keyHash) return res.status(409).json({ message: "That handle is taken. Try another." })
		return res.status(200).json({ handle: parsed.handle, key })
	} catch (error) {
		const e = error as { statusCode?: number; message?: string }
		console.log("league join error:", e?.statusCode, e?.message ?? error)
		return res.status(500).json({ message: UNAVAILABLE })
	}
}
