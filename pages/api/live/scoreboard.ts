import type { NextApiRequest, NextApiResponse } from "next"

import { featuredGame, getScoreboard } from "@/lib/live/service"

// All of this week's games, as the live page's picker and the featured-game choice need them.
// s-maxage lets Vercel's CDN answer most viewers without running this at all.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" })
	try {
		const board = await getScoreboard()
		res.setHeader("Cache-Control", "public, s-maxage=6, stale-while-revalidate=20")
		return res.status(200).json({ games: board.value, featured: featuredGame(board.value)?.id ?? null, stale: board.stale, at: board.at })
	} catch (error) {
		console.log("live scoreboard error:", error)
		res.setHeader("Cache-Control", "no-store")
		return res.status(502).json({ message: "Live scores are unavailable right now" })
	}
}
