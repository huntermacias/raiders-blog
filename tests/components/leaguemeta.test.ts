import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { fetch: vi.fn() }, readClient: { fetch: vi.fn() } }))

import { generateMetadata as profileMeta } from "../../app/(user)/league/[handle]/page"
import { generateMetadata as leagueMeta } from "../../app/(user)/league/page"

const og = (m: { openGraph?: unknown }) => (m.openGraph as { images: unknown[] }).images[0] as string
const tw = (m: { twitter?: unknown }) => (m.twitter as { images: string[] }).images[0]
const plain = (m: { other?: unknown }) => (m.other as Record<string, string> | undefined)?.["og:image"]

describe("league share metadata", () => {
	it("points /league at the league card, for Open Graph, Twitter and the plain og:image tag", () => {
		const m = leagueMeta()
		expect(og(m)).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=league&v=\d+$/)
		expect(tw(m)).toBe(og(m))
		expect(plain(m)).toBe(og(m))
		expect((m.twitter as { card: string }).card).toBe("summary_large_image")
	})

	it("points a player's page at that player's card, with the handle encoded", async () => {
		const m = await profileMeta({ params: { handle: "Ann_1" } })
		expect(og(m)).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=league&handle=Ann_1&v=\d+$/)
		expect(tw(m)).toBe(og(m))
		expect(plain(m)).toBe(og(m))
	})

	it("doesn't put a bad handle into an image address", async () => {
		const m = await profileMeta({ params: { handle: "../../x" } })
		expect(JSON.stringify(m)).not.toContain("api/og")
	})
})
