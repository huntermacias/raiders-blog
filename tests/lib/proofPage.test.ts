import { describe, expect, it } from "vitest"

import { cardUrl, proofPage } from "../../lib/og/proofPage"

describe("the page for a client with no proof of JavaScript", () => {
	it("points the card at the comparison and at nothing else", () => {
		expect(cardUrl("?a=brock-bowers&b=trey-mcbride&r=form&m=epaTgt,croe&utm_source=x&_rsc=1")).toBe("https://www.raidersrundown.com/api/og?type=compare&a=brock-bowers&b=trey-mcbride&r=form&m=epaTgt%2Ccroe&size=wide")
		expect(cardUrl("")).toBe("https://www.raidersrundown.com/api/og?type=compare&size=wide")
		expect(cardUrl("?a=x&a=y&evil=1")).toBe("https://www.raidersrundown.com/api/og?type=compare&a=x&size=wide")
	})

	it("cannot be made to carry markup from the address", () => {
		const html = proofPage(`?a=${encodeURIComponent('"><script>alert(1)</script>')}&b=y`)
		expect(html).not.toContain("<script>alert(1)")
		expect(html).not.toContain("alert(1)</script>")
		expect(html).toContain("%3Cscript%3Ealert%281%29%3C%2Fscript%3E")
		expect(html.match(/<script>/g)).toHaveLength(1)
	})

	it("sets the cookie, reloads once, and stops at a message if it cannot keep the cookie or has already tried", () => {
		const html = proofPage("?a=x&b=y")
		expect(html).toContain('document.cookie="rr_h="')
		expect(html).toContain("max-age=604800")
		expect(html).toContain("location.replace(location.href)")
		expect(html).toContain("sessionStorage")
		expect(html).toContain("<noscript>")
		expect(html).toContain('href="/lab/players/compare"')
		expect(html).toContain('<meta name="robots" content="noindex,nofollow">')
	})

	it("is about a kilobyte", () => {
		expect(proofPage("?a=brock-bowers&b=trey-mcbride").length).toBeLessThan(3500)
	})
})
