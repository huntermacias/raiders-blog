import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"
import { reactLimiter } from "../../lib/writeLimiters"
import { guardWrite, validDocId } from "../../lib/apiGuard"
import { patchPublishedGame } from "../../lib/votePatch"

export const config = { api: { bodyParser: { sizeLimit: "8kb" } } }

const ALLOWED = ["fire", "thumbsDown", "angry"] as const
type Reaction = (typeof ALLOWED)[number]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const body = guardWrite(req, res, { limiter: reactLimiter })
	if (!body) return

	const { _id, reaction } = body
	if (!validDocId(_id) || typeof reaction !== "string" || !ALLOWED.includes(reaction as Reaction)) {
		return res.status(400).json({ message: "Invalid request" })
	}

	try {
		const doc = await patchPublishedGame(client, _id, (p) =>
			p.setIfMissing({ reactions: { fire: 0, thumbsDown: 0, angry: 0 } }).inc({ [`reactions.${reaction}`]: 1 })
		)
		if (!doc) return res.status(404).json({ message: "Not found" })
		return res.status(200).json({ reactions: doc.reactions })
	} catch (error) {
		console.log("react error:", (error as { message?: string })?.message)
		return res.status(500).json({ message: "Could not save reaction" })
	}
}
