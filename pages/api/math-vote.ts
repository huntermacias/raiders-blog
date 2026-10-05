import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"
import { SEASON } from "../../lib/predictions"
import { weekGames } from "../../lib/live/service"
import { parseVoteKey, voteDocId } from "../../lib/math/votes"
import { clientIp, createLimiter } from "../../lib/rateLimit"

const limiter = createLimiter({ max: 60, windowMs: 10 * 60 * 1000 })

/** Only games close enough to matter take votes, so nobody can litter Studio with next December's slate. */
const WINDOW_MS = 14 * 24 * 3_600_000

type Body = { key?: unknown; side?: unknown }

/**
 * "Who do you trust?": one anonymous vote for me or for the math on a game where we pick different teams.
 * The server works out for itself that the game exists, hasn't started and isn't final (from ESPN, not from
 * anything the browser said) and fails closed when ESPN can't be reached. One tally document per game, with
 * a hyphenated id so Sanity treats it as public (the page reads it without a token).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" })

	const hit = limiter.hit(clientIp(req))
	if (!hit.ok) {
		res.setHeader("Retry-After", String(hit.retryAfter))
		return res.status(429).json({ message: "Slow down a little and try again." })
	}

	try {
		const body: Body = typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {}
		const target = parseVoteKey(body.key)
		const side = body.side
		if (!target || (side !== "blogger" && side !== "math")) return res.status(400).json({ message: "Invalid request" })

		let games
		try {
			games = await weekGames(target.week)
		} catch {
			return res.status(503).json({ message: "Can't check the schedule right now" })
		}
		const game = games.find((g) => g.away === target.away && g.home === target.home)
		if (!game) return res.status(404).json({ message: "Game not found" })
		const kickoff = game.kickoff ? Date.parse(game.kickoff) : NaN
		const now = Date.now()
		if (game.homeScore != null || game.awayScore != null || !Number.isFinite(kickoff) || kickoff <= now) {
			return res.status(409).json({ message: "Voting is closed for this game" })
		}
		if (kickoff - now > WINDOW_MS) return res.status(409).json({ message: "Voting isn't open for this game yet" })

		const _id = voteDocId(SEASON, target)
		await client.createIfNotExists({ _id, _type: "mathVote", season: SEASON, week: target.week, away: target.away, home: target.home, blogger: 0, math: 0 })
		const result = await client.patch(_id).inc({ [side]: 1 }).commit()
		return res.status(200).json({ blogger: result.blogger ?? 0, math: result.math ?? 0 })
	} catch (error) {
		// A 401/403 here means NEXT_SANITY_TOKEN is missing or lacks write (Editor) access on this deploy.
		const e = error as { statusCode?: number; message?: string }
		console.log("math-vote error:", e?.statusCode, e?.message ?? error)
		return res.status(500).json({ message: "Could not save vote" })
	}
}
