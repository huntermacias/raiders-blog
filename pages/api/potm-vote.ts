import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		const { _id, candidateKey } = JSON.parse(req.body) as { _id: string; candidateKey: string }

		if (!_id || !candidateKey) {
			return res.status(400).json({ message: "Invalid request" })
		}

		const path = `potmCandidates[_key=="${candidateKey}"].votes`

		const result = await client
			.patch(_id)
			.setIfMissing({ [path]: 0 })
			.inc({ [path]: 1 })
			.commit()

		return res.status(200).json({ potmCandidates: result.potmCandidates })
	} catch (error) {
		console.log("potm-vote error:", error)
		return res.status(500).json({ message: "Could not save vote", error })
	}
}
