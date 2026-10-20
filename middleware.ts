import { NextResponse, type NextRequest } from "next/server"

import { checkCompare, checkOg, type Verdict } from "./lib/og/guard"

// Runs on the Edge in front of two routes only (see lib/og/guard.ts): the share-card renderer and the player comparison page. Every other
// request on the site skips it.
export function middleware(req: NextRequest) {
	const { pathname, search } = req.nextUrl
	const ua = req.headers.get("user-agent")
	const verdict: Verdict = pathname === "/api/og" ? checkOg(search, ua) : checkCompare(search, ua)

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
	return NextResponse.next()
}

export const config = { matcher: ["/api/og", "/lab/players/compare"] }
