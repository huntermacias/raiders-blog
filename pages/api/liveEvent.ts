import type { NextApiRequest, NextApiResponse } from "next"
import { randomUUID } from "crypto"
import { groq } from "next-sanity"

import { client } from "../../lib/sanity.client"

const STATUSES = ["upcoming", "live", "final"] as const
type Status = (typeof STATUSES)[number]

function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.slice(0, 96)
}

// This whole endpoint is only meant to be called from the /live-post admin
// page, which isn't behind any real login (unlike /studio, which has
// Sanity's own auth) -- so every request, GET included, has to present the
// shared secret. If the env var itself isn't set, fail closed rather than
// leaving this wide open.
function isAuthorized(req: NextApiRequest): boolean {
	const secret = process.env.LIVE_POST_SECRET
	if (!secret) return false
	return req.headers["x-live-secret"] === secret
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (!isAuthorized(req)) {
		return res.status(401).json({ message: "Unauthorized" })
	}

	if (req.method === "GET") {
		try {
			const query = groq`
				*[_type == "liveEvent"] | order(_createdAt desc) [0...20] {
					_id, title, slug, status, startedAt,
					updates[] { _key, body, postedAt } | order(postedAt desc)
				}
			`
			const events = await client.fetch(query)
			return res.status(200).json({ events })
		} catch (error) {
			console.log("liveEvent GET error:", error)
			return res.status(500).json({ message: "Could not load live events" })
		}
	}

	if (req.method === "POST") {
		try {
			const payload = JSON.parse(req.body)
			const { action } = payload

			if (action === "createEvent") {
				const { title } = payload
				if (!title || typeof title !== "string" || !title.trim()) {
					return res.status(400).json({ message: "Title is required" })
				}
				const now = new Date().toISOString()
				const created = await client.create({
					_type: "liveEvent",
					title: title.trim(),
					slug: { _type: "slug", current: slugify(title) },
					status: "live",
					startedAt: now,
					updates: [],
				})
				return res.status(200).json({ event: created })
			}

			if (action === "postUpdate") {
				const { eventId, body, embedUrl } = payload
				if (!eventId || !body || typeof body !== "string" || !body.trim()) {
					return res.status(400).json({ message: "eventId and body are required" })
				}
				const update: Record<string, unknown> = {
					_key: randomUUID(),
					_type: "liveUpdate",
					body: body.trim(),
					postedAt: new Date().toISOString(),
				}
				if (typeof embedUrl === "string" && embedUrl.trim()) {
					update.embedUrl = embedUrl.trim()
				}
				const result = await client
					.patch(eventId)
					.setIfMissing({ updates: [] })
					.append("updates", [update])
					.commit()
				return res.status(200).json({ event: result })
			}

			if (action === "setStatus") {
				const { eventId, status } = payload as { eventId: string; status: Status }
				if (!eventId || !STATUSES.includes(status)) {
					return res.status(400).json({ message: "Invalid status" })
				}
				const result = await client.patch(eventId).set({ status }).commit()
				return res.status(200).json({ event: result })
			}

			return res.status(400).json({ message: "Unknown action" })
		} catch (error) {
			console.log("liveEvent POST error:", error)
			return res.status(500).json({ message: "Could not process request" })
		}
	}

	return res.status(405).json({ message: "Method not allowed" })
}
