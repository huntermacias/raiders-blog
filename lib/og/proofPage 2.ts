// The page a client with no proof of JavaScript gets for a configured comparison (see lib/og/guard.ts). It is made in the middleware, so no function
// runs and nothing is rendered: about a kilobyte of HTML. A browser runs the script, which leaves the `rr_h` cookie and asks for the same address again, and
// from then on gets the real page. A client that does not run JavaScript sees a message and a link to the comparison tool. Pure, no Node APIs.

import { HUMAN_COOKIE, HUMAN_COOKIE_DAYS } from "./guard"

const SITE = "https://www.raidersrundown.com"
const KEEP = new Set(["a", "b", "r", "m", "g", "y", "ya", "yb"])

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** The share card for this comparison: only the parameters the card knows, so a made-up address cannot put anything else in the page. */
export function cardUrl(search: string): string {
	const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
	const keep = new URLSearchParams()
	q.forEach((v, k) => {
		if (KEEP.has(k) && v.length <= 200 && !keep.has(k)) keep.set(k, v)
	})
	return `${SITE}/api/og?type=compare&${keep.toString()}${keep.toString() ? "&" : ""}size=wide`
}

// Two tries at most within ten seconds, so a browser that will not keep the cookie stops at the message instead of reloading forever.
const SCRIPT = `(function(){var d=Math.floor(Date.now()/864e5),n=document.getElementById("rr-n"),w=document.getElementById("rr-w");
function stop(){if(n)n.hidden=false;if(w)w.hidden=true}
try{document.cookie="${HUMAN_COOKIE}="+d+";path=/;max-age=${HUMAN_COOKIE_DAYS * 86400};samesite=lax"+(location.protocol==="https:"?";secure":"")}catch(e){}
if(document.cookie.indexOf("${HUMAN_COOKIE}="+d)<0)return stop();
var t=0;try{t=+sessionStorage.getItem("rr_g")||0;if(Date.now()-t<10000)return stop();sessionStorage.setItem("rr_g",String(Date.now()))}catch(e){}
location.replace(location.href)})()`

export function proofPage(search: string): string {
	const img = esc(cardUrl(search))
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compare two NFL players in context | Raiders Rundown</title><meta name="robots" content="noindex,nofollow"><meta property="og:type" content="website"><meta property="og:site_name" content="Raiders Rundown"><meta property="og:title" content="Compare two NFL players in context | Raiders Rundown"><meta property="og:url" content="${SITE}/lab/players/compare"><meta property="og:image" content="${img}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${img}"><link rel="canonical" href="${SITE}/lab/players/compare"><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;text-align:center;padding:24px;color:#111;background:#fafafa}@media(prefers-color-scheme:dark){body{color:#eee;background:#111}a{color:#8ab4ff}}</style></head><body><main><p id="rr-w">Loading the comparison&hellip;</p><p id="rr-n" hidden>This comparison needs JavaScript and cookies. <a href="/lab/players/compare">Open the comparison tool</a>.</p><noscript><style>#rr-w{display:none}</style><p>This comparison needs JavaScript. <a href="/lab/players/compare">Open the comparison tool</a>.</p></noscript></main><script>${SCRIPT}</script></body></html>`
}
