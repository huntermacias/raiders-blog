import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { fetch: vi.fn() }, readClient: { fetch: vi.fn() } }))

const loadLeague = vi.fn()
vi.mock("../../lib/league.data", () => ({ loadLeague: (...a: unknown[]) => loadLeague(...a) }))

import { generateMetadata as profileMeta } from "../../app/(user)/league/[handle]/page"
import { generateMetadata as leagueMeta } from "../../app/(user)/league/page"

const og = (m: { openGraph?: unknown }) => (m.openGraph as { images: unknown[] }).images[0] as string
const tw = (m: { twitter?: unknown }) => (m.twitter as { images: string[] }).images[0]
const plain = (m: { other?: unknown }) => (m.other as Record<string, string> | undefined)?.["og:image"]

const league = {
	data: {
		games: [{ _id: "g1", week: 1, awayTeam: "Las Vegas Raiders", homeTeam: "Opponent", kickoff: "2026-09-12T20:00:00Z", predictedAwayScore: 24, predictedHomeScore: 20, actualAwayScore: 27, actualHomeScore: 20 }],
		players: [{ handle: "Ann_1", lower: "ann_1", joinedAt: "2026-09-01T00:00:00Z" }],
		picks: [{ player: "ann_1", predictionId: "g1", awayScore: 27, homeScore: 20 }],
	},
	ok: true,
}

describe("league share metadata", () => {
	beforeEach(() => loadLeague.mockReset().mockResolvedValue(league))

	it("points /league at the league card, for Open Graph, Twitter and the plain og:image tag", async () => {
		const m = await leagueMeta({})
		expect(og(m)).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=league&v=\d+$/)
		expect(tw(m)).toBe(og(m))
		expect(plain(m)).toBe(og(m))
		expect((m.twitter as { card: string }).card).toBe("summary_large_image")
		expect(loadLeague).not.toHaveBeenCalled()
	})

	it("points a challenge link at that player's challenge card, with their name in the title", async () => {
		const m = await leagueMeta({ searchParams: Promise.resolve({ challenge: "ann_1" }) })
		expect(og(m)).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=league&challenge=Ann_1&v=\d+$/)
		expect(tw(m)).toBe(og(m))
		expect(plain(m)).toBe(og(m))
		expect(String(m.title)).toContain("Ann_1 challenged you")
	})

	it("falls back to the plain invite for a challenger who isn't a player or isn't a handle", async () => {
		for (const challenge of ["ghost", "../../x", "a b"]) {
			const m = await leagueMeta({ searchParams: Promise.resolve({ challenge }) })
			expect(og(m)).toMatch(/type=league&v=\d+$/)
			expect(String(m.title)).not.toContain("challenged you")
		}
	})

	it("points a player's page at that player's card, with the handle encoded", async () => {
		const m = await profileMeta({ params: Promise.resolve({ handle: "Ann_1" }) })
		expect(og(m)).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=league&handle=Ann_1&v=\d+$/)
		expect(tw(m)).toBe(og(m))
		expect(plain(m)).toBe(og(m))
	})

	it("doesn't put a bad handle into an image address", async () => {
		const m = await profileMeta({ params: Promise.resolve({ handle: "../../x" }) })
		expect(JSON.stringify(m)).not.toContain("api/og")
	})
})
