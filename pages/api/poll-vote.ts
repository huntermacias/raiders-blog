import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		const { _id, choice } = JSON.parse(req.body) as { _id: string; choice: "A" | "B" }

		if (!_id || (choice !== "A" && choice !== "B")) {
			return res.status(400).json({ message: "Invalid request" })
		}

		const field = choice === "A" ? "pollVotesA" : "pollVotesB"

		const result = await client
			.patch(_id)
			.setIfMissing({ pollVotesA: 0, pollVotesB: 0 })
			.inc({ [field]: 1 })
			.commit()

		return res.status(200).json({ pollVotesA: result.pollVotesA, pollVotesB: result.pollVotesB })
	} catch (error) {
		console.log("poll-vote error:", error)
		return res.status(500).json({ message: "Could not save vote", error })
	}
}
