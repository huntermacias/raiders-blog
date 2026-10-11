import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { STORY_CARD_FIELDS, homeGameReportsQuery, homePostsQuery } from "../../lib/homeQueries"

const page = readFileSync(join(__dirname, "../../app/(user)/page.tsx"), "utf8")
const code = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")

describe("the homepage's story queries", () => {
	it("ask only for what a card shows: no article body, no author", () => {
		expect(STORY_CARD_FIELDS).not.toMatch(/\bbody\b(?!\))/)
		expect(homePostsQuery).not.toMatch(/\.\.\./)
		expect(homePostsQuery).not.toMatch(/author->/)
		expect(homePostsQuery).toMatch(/categories\[\]->\{[^}]*title/)
	})

	it("work out the read time from the body inside the query, the way a related story does", () => {
		expect(STORY_CARD_FIELDS).toContain('"words": length(string::split(pt::text(body), " "))')
	})

	it("leave out drafts and keep the newest first", () => {
		expect(homePostsQuery).toContain("!(_id in path('drafts.**'))")
		expect(homePostsQuery).toContain("order(_createdAt desc)")
		expect(homeGameReportsQuery).toContain("[0...3]")
	})
})

describe("the homepage's use of Sanity", () => {
	const src = code(page)

	it("reads stories and recaps through the edge cache, and nothing else through it", () => {
		expect(src).toMatch(/cdnClient\.fetch\(homePostsQuery\)/)
		expect(src).toMatch(/cdnClient\.fetch\(homeGameReportsQuery\)/)
		expect(src.match(/cdnClient\.fetch/g)?.length).toBe(2)
	})

	it("does not use the token client, which skips the cache", () => {
		expect(src).not.toMatch(/\bclient\.fetch/)
		expect(src).not.toMatch(/import \{[^}]*\bclient\b[^}]*\} from "\.\.\/\.\.\/lib\/sanity\.client"/)
	})

	it("survives a failed query: every fetch is wrapped", () => {
		const fetches = src.match(/(?:cdnClient|readClient)\.fetch\(/g) ?? []
		const wrapped = src.match(/safe\((?:cdnClient|readClient)\.fetch\(/g) ?? []
		expect(wrapped.length).toBe(fetches.length)
	})
})
