import type { NextApiRequest, NextApiResponse } from "next"

// Studio's "Preview" pane opens this. Entering preview mode sets the `__prerender_bypass` cookie, which makes every page the visitor loads skip the
// CDN and ISR cache and run a function, so it must not be something any visitor (or crawler) can switch on. It now needs PREVIEW_SECRET, passed as
// ?secret=...; without the variable set, or with the wrong secret, this just goes to the home page and sets nothing. Nothing on the site reads preview
// data today, so a plain redirect loses nothing.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
	const expected = process.env.PREVIEW_SECRET
	const given = typeof req.query.secret === "string" ? req.query.secret : ""
	if (expected && given === expected) res.setPreviewData({})
	res.setHeader("Cache-Control", "no-store")
	res.setHeader("X-Robots-Tag", "noindex, nofollow")
	res.writeHead(307, { Location: "/" })
	res.end()
}
