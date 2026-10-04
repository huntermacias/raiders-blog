import type { NextApiRequest, NextApiResponse } from "next"

import { getGame } from "@/lib/live/service"
import { biggestSwings, currentHomeWp, wpSeries } from "@/lib/live/series"

// One game: info, drives, stats, and the win-probability line, ready for the page to draw.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" })
	const id = typeof req.query.id === "string" ? req.query.id : ""
	try {
		const result = await getGame(id)
		if (!result) return res.status(404).json({ message: "Game not found" })
		const series = wpSeries(result.game)
		res.setHeader("Cache-Control", result.game.info.state === "in" ? "public, s-maxage=5, stale-while-revalidate=15" : "public, s-maxage=60, stale-while-revalidate=120")
		return res.status(200).json({
			game: result.game,
			wp: { series, now: currentHomeWp(result.game.info), swings: biggestSwings(series) },
			stale: result.stale,
			at: result.at,
		})
	} catch (error) {
		console.log("live game error:", error)
		res.setHeader("Cache-Control", "no-store")
		return res.status(502).json({ message: "This game's data is unavailable right now" })
	}
}
