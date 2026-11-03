import type { NextApiRequest, NextApiResponse } from "next"

import { client } from "../../lib/sanity.client"
import { commentLimiter } from "../../lib/writeLimiters"
import { guardWrite, validDocId } from "../../lib/apiGuard"

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } }

// A comment only shows once it is approved in Studio, so the aim here is to keep junk out of the dataset, not to moderate: the page is the only
// caller, so anything outside what the form can produce is refused.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

function text(v: unknown, max: number): string | null {
	if (typeof v !== "string") return null
	// Strip control characters other than newline/tab; a comment is plain text.
	const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
	return s.length > 0 && s.length <= max ? s : null
}

export default async function createComment(req: NextApiRequest, res: NextApiResponse) {
	const body = guardWrite(req, res, { limiter: commentLimiter })
	if (!body) return

	// Honeypot: the form has a field no reader sees. A bot that fills every input fills this one too; pretend it worked.
	if (typeof body.website === "string" && body.website.trim() !== "") {
		return res.status(200).json({ message: "Comment Submitted" })
	}

	const { _id } = body
	const name = text(body.name, 80)
	const email = text(body.email, 254)
	const comment = text(body.comment, 2000)
	if (!validDocId(_id) || !name || !email || !EMAIL.test(email) || !comment) {
		return res.status(400).json({ message: "Please fill in your name, a valid email and a comment (up to 2,000 characters)." })
	}

	try {
		// Only a published post or game report can be commented on.
		const exists = await client.fetch<number>(
			`count(*[_id == $id && _type in ["post", "gameReport"] && !(_id in path("drafts.**"))])`,
			{ id: _id }
		)
		if (!exists) return res.status(404).json({ message: "That page doesn't take comments." })

		await client.create({
			_type: "comment",
			post: { _type: "reference", _ref: _id },
			name,
			email,
			comment,
		})
	} catch (error) {
		console.log("createComment error:", (error as { message?: string })?.message)
		return res.status(500).json({ message: "Couldn't submit comment" })
	}

	return res.status(200).json({ message: "Comment Submitted" })
}
