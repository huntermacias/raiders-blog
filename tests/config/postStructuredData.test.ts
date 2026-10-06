import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const page = readFileSync(resolve(__dirname, "../../app/(user)/post/[slug]/page.tsx"), "utf8")

// Game reports, rankings and the schedule already carry structured data; regular posts
// (power rankings, previews, film study) did not, so Google had no article metadata for them.
describe("post page structured data", () => {
	it("emits a NewsArticle and a BreadcrumbList as JSON-LD", () => {
		expect(page).toMatch(/application\/ld\+json/)
		expect(page).toMatch(/"@type": "NewsArticle"/)
		expect(page).toMatch(/"@type": "BreadcrumbList"/)
	})
	it("reports publish and modified dates, an image and the publisher", () => {
		expect(page).toMatch(/datePublished: post\._createdAt/)
		expect(page).toMatch(/dateModified:/)
		expect(page).toMatch(/api\/og\?type=post&slug=/)
		expect(page).toMatch(/publisher:/)
	})
})
