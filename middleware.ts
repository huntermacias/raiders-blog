import { NextResponse, type NextRequest } from "next/server"

import { HUMAN_COOKIE, checkCompare, checkOg, type Verdict } from "./lib/og/guard"
import { proofPage } from "./lib/og/proofPage"

// Runs on the Edge in front of two routes only (see lib/og/guard.ts): the share-card renderer and the player comparison page. Every other
// request on the site skips it. It reads the user agent and one cookie; it never touches the data files.
export function middleware(req: NextRequest) {
	const { pathname, search } = req.nextUrl
	const ua = req.headers.get("user-agent")
	const verdict: Verdict = pathname === "/api/og" ? checkOg(search, ua) : checkCompare(search, ua, req.cookies.get(HUMAN_COOKIE)?.value)

	if (verdict.action === "deny") {
		return new NextResponse(verdict.status === 414 ? "Request too long" : "Automated access to this page is not allowed. Use the public site.", {
			status: verdict.status,
			headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
		})
	}
	if (verdict.action === "default-image") {
		// Not a card anyone could have a link to: the same picture the card route falls back to, served as a file.
		const res = NextResponse.rewrite(new URL("/og-default-v2.png", req.url))
		res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
		return res
	}
	if (verdict.action === "preview") {
		// A link-preview bot reads the tags in the head and nothing else: the comparison's own title, description and card, in a page with no body to render.
		const url = req.nextUrl.clone()
		url.pathname = "/lab/players/compare/preview"
		return NextResponse.rewrite(url)
	}
	if (verdict.action === "proof") {
		// Not a thing a reader can be told from a crawler by: ask for proof of JavaScript, from the edge, so no function runs for a client that cannot give it.
		return new NextResponse(proofPage(search), {
			status: 200,
			headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
		})
	}
	return NextResponse.next()
}

export const config = { matcher: ["/api/og", "/lab/players/compare"] }
