import { describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { fetch: vi.fn() }, readClient: { fetch: vi.fn() } }))
vi.mock("../../lib/math/server", () => ({ loadMath: vi.fn(), HOT: 6 }))

import { generateMetadata } from "../../app/(user)/rankings/math/page"

const og = (m: { openGraph?: unknown }) => (m.openGraph as { images: string[] }).images[0]
const tw = (m: { twitter?: unknown }) => (m.twitter as { images: string[] }).images[0]
const plain = (m: { other?: unknown }) => (m.other as Record<string, string>)["og:image"]

describe("Blogger vs. the Math share metadata", () => {
	it("points the plain page at the Raiders card, for Open Graph, Twitter and the plain og:image tag", async () => {
		const m = await generateMetadata({})
		expect(og(m)).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=math&v=\d+$/)
		expect(tw(m)).toBe(og(m))
		expect(plain(m)).toBe(og(m))
		expect((m.twitter as { card: string }).card).toBe("summary_large_image")
		expect((m.alternates as { canonical: string }).canonical).toBe("https://www.raidersrundown.com/rankings/math")
	})

	it("points a shared team link at that team's card, with the team in the title", async () => {
		const m = await generateMetadata({ searchParams: Promise.resolve({ team: "kc", week: "4" }) })
		expect(og(m)).toMatch(/api\/og\?team=KC&week=4&type=math&v=\d+$/)
		expect(String(m.title)).toContain("Chiefs")
		expect((m.alternates as { canonical: string }).canonical).toBe("https://www.raidersrundown.com/rankings/math")
	})

	it("points a shared disagreement link at the take card, and carries the model", async () => {
		const m = await generateMetadata({ searchParams: Promise.resolve({ take: "DEN", model: "season" }) })
		expect(og(m)).toMatch(/api\/og\?take=DEN&model=season&type=math&v=\d+$/)
	})

	it("ignores a team that isn't one, and junk in the address", async () => {
		for (const searchParams of [{ team: "ZZZ" }, { team: "../x" }, { week: "99" }, { week: "x", model: "bad" }]) {
			const m = await generateMetadata({ searchParams: Promise.resolve(searchParams) })
			expect(og(m)).toMatch(/api\/og\?type=math&v=\d+$/)
			expect(String(m.title)).toMatch(/^Blogger vs\. the Math/)
		}
	})
})
