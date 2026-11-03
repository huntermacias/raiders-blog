import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"
import { potmLimiter } from "../../lib/writeLimiters"
import { guardWrite, validDocId, validKey } from "../../lib/apiGuard"
import { patchPublishedGame } from "../../lib/votePatch"

export const config = { api: { bodyParser: { sizeLimit: "8kb" } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	const body = guardWrite(req, res, { limiter: potmLimiter })
	if (!body) return

	const { _id, candidateKey } = body
	// The key is dropped into a Sanity path below, so it must be a plain `_key` (no quotes or brackets), and it must name a real candidate.
	if (!validDocId(_id) || !validKey(candidateKey)) {
		return res.status(400).json({ message: "Invalid request" })
	}

	try {
		const path = `potmCandidates[_key=="${candidateKey}"].votes`
		const doc = await patchPublishedGame(
			client,
			_id,
			(p) => p.setIfMissing({ [path]: 0 }).inc({ [path]: 1 }),
			` && count(potmCandidates[_key == $key]) == 1`,
			{ key: candidateKey }
		)
		if (!doc) return res.status(404).json({ message: "Candidate not found" })
		return res.status(200).json({ potmCandidates: doc.potmCandidates })
	} catch (error) {
		console.log("potm-vote error:", (error as { message?: string })?.message)
		return res.status(500).json({ message: "Could not save vote" })
	}
}
