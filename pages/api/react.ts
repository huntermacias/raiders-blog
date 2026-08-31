import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"

const ALLOWED = ["fire", "thumbsDown", "angry"] as const
type Reaction = (typeof ALLOWED)[number]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		const { _id, reaction } = JSON.parse(req.body) as { _id: string; reaction: Reaction }

		if (!_id || !ALLOWED.includes(reaction)) {
			return res.status(400).json({ message: "Invalid request" })
		}

		const result = await client
			.patch(_id)
			.setIfMissing({ reactions: { fire: 0, thumbsDown: 0, angry: 0 } })
			.inc({ [`reactions.${reaction}`]: 1 })
			.commit()

		return res.status(200).json({ reactions: result.reactions })
	} catch (error) {
		console.log("react error:", error)
		return res.status(500).json({ message: "Could not save reaction", error })
	}
}
