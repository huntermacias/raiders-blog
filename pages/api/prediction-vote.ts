import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"

type Body = { _id?: string; choice?: "away" | "home" }

/**
 * Anonymous reader pick for an upcoming game. Unlike the older poll route this
 * one checks that the target really is a gamePrediction and that voting is
 * still open (before kickoff, not yet graded), so counts can't be pushed onto
 * arbitrary documents or after the result is known.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") {
		return res.status(405).json({ message: "Method not allowed" })
	}

	try {
		const body: Body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}
		const { _id, choice } = body

		if (!_id || typeof _id !== "string" || (choice !== "away" && choice !== "home")) {
			return res.status(400).json({ message: "Invalid request" })
		}

		// Published documents only: a draft id would let someone vote on an
		// unpublished pick, and the page never shows drafts anyway.
		if (_id.startsWith("drafts.")) {
			return res.status(400).json({ message: "Invalid request" })
		}

		const doc = await client.fetch<{
			kickoff?: string
			actualAwayScore?: number | null
			actualHomeScore?: number | null
		} | null>(
			`*[_type == "gamePrediction" && _id == $id][0]{ kickoff, actualAwayScore, actualHomeScore }`,
			{ id: _id }
		)

		if (!doc) return res.status(404).json({ message: "Pick not found" })

		const graded = typeof doc.actualAwayScore === "number" && typeof doc.actualHomeScore === "number"
		const started = doc.kickoff ? Date.now() >= new Date(doc.kickoff).getTime() : false
		if (graded || started) {
			return res.status(409).json({ message: "Voting is closed for this game" })
		}

		const field = choice === "away" ? "readerVotesAway" : "readerVotesHome"

		const result = await client
			.patch(_id)
			.setIfMissing({ readerVotesAway: 0, readerVotesHome: 0 })
			.inc({ [field]: 1 })
			.commit()

		return res.status(200).json({
			readerVotesAway: result.readerVotesAway,
			readerVotesHome: result.readerVotesHome,
		})
	} catch (error) {
		// statusCode 401/403 here means the NEXT_SANITY_TOKEN on this deploy is
		// missing, revoked, or doesn't have write (Editor) permission.
		const e = error as { statusCode?: number; message?: string }
		console.log("prediction-vote error:", e?.statusCode, e?.message ?? error)
		return res.status(500).json({ message: "Could not save pick" })
	}
}
