import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"
import { pollLimiter } from "../../lib/writeLimiters"
import { guardWrite, validDocId } from "../../lib/apiGuard"
import { patchPublishedGame } from "../../lib/votePatch"

export const config = { api: { bodyParser: { sizeLimit: "8kb" } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const body = guardWrite(req, res, { limiter: pollLimiter })
	if (!body) return

	const { _id, choice } = body
	if (!validDocId(_id) || (choice !== "A" && choice !== "B")) {
		return res.status(400).json({ message: "Invalid request" })
	}

	try {
		const field = choice === "A" ? "pollVotesA" : "pollVotesB"
		const doc = await patchPublishedGame(client, _id, (p) => p.setIfMissing({ pollVotesA: 0, pollVotesB: 0 }).inc({ [field]: 1 }))
		if (!doc) return res.status(404).json({ message: "Poll not found" })
		return res.status(200).json({ pollVotesA: doc.pollVotesA, pollVotesB: doc.pollVotesB })
	} catch (error) {
		console.log("poll-vote error:", (error as { message?: string })?.message)
		return res.status(500).json({ message: "Could not save vote" })
	}
}
