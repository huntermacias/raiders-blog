// Small helpers shared by the /api/league/* routes.

import type { NextApiRequest } from "next"

/** Bodies arrive as a JSON string from fetch(); accept an object too. Never throws. */
export function readBody(req: NextApiRequest): Record<string, unknown> {
	try {
		const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body
		return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
	} catch {
		return {}
	}
}

export const UNAVAILABLE = "The league is temporarily unavailable. Please try again in a minute."
