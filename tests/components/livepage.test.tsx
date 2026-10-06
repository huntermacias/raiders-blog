import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/sanity.client", () => ({ client: { fetch: vi.fn() }, readClient: { fetch: vi.fn() } }))
vi.mock("../../lib/live/service", () => ({ getScoreboard: vi.fn() }))

import { generateMetadata } from "../../app/(user)/live/page"
import { parseScoreboard } from "../../lib/live/espn"
import { getScoreboard } from "../../lib/live/service"
import { scoreboard } from "../stubs/liveFeed"

const board = parseScoreboard(scoreboard)
const scoreboardMock = getScoreboard as unknown as ReturnType<typeof vi.fn>

const images = (m: Awaited<ReturnType<typeof generateMetadata>>) => ({
	og: ((m.openGraph as { images: unknown[] }).images[0] as string),
	tw: ((m.twitter as { images: string[] }).images[0] as string),
})

beforeEach(() => {
	scoreboardMock.mockReset()
	vi.useRealTimers()
})

describe("/live metadata", () => {
	it("points the share image at the live card, as a plain string first and for Twitter too", async () => {
		scoreboardMock.mockResolvedValue({ value: board, stale: false, at: 0 })
		const m = await generateMetadata({})
		const { og, tw } = images(m)
		expect(og).toMatch(/^https:\/\/www\.raidersrundown\.com\/api\/og\?type=live&v=\d+$/)
		expect(tw).toBe(og)
		expect((m.twitter as { card: string }).card).toBe("summary_large_image")
	})

	it("ties the card and the address to the game in a shared link, but keeps the canonical page", async () => {
		scoreboardMock.mockResolvedValue({ value: board, stale: false, at: 0 })
		const m = await generateMetadata({ searchParams: Promise.resolve({ game: "401872980" }) })
		expect(images(m).og).toContain("&game=401872980&v=")
		expect((m.openGraph as { url: string }).url).toBe("https://www.raidersrundown.com/live?game=401872980")
		expect(m.alternates?.canonical).toBe("https://www.raidersrundown.com/live")
	})

	it("ignores a game id that isn't an id", async () => {
		scoreboardMock.mockResolvedValue({ value: board, stale: false, at: 0 })
		for (const bad of ["abc", "../../x", "12", "1&v=2", ["x"]]) {
			const m = await generateMetadata({ searchParams: Promise.resolve({ game: bad as string }) })
			expect(images(m).og).not.toContain("game=")
		}
	})

	it("changes the card's address every minute while a game is on, and every ten minutes otherwise", async () => {
		vi.useFakeTimers()
		scoreboardMock.mockResolvedValue({ value: board, stale: false, at: 0 }) // one game is live
		vi.setSystemTime(new Date("2026-10-04T21:00:00Z"))
		const a = images(await generateMetadata({})).og
		vi.setSystemTime(new Date("2026-10-04T21:01:05Z"))
		const b = images(await generateMetadata({})).og
		expect(a).not.toBe(b)

		scoreboardMock.mockResolvedValue({ value: board.filter((g) => g.state !== "in"), stale: false, at: 0 })
		vi.setSystemTime(new Date("2026-10-04T21:00:00Z"))
		const c = images(await generateMetadata({})).og
		vi.setSystemTime(new Date("2026-10-04T21:05:00Z"))
		const d = images(await generateMetadata({})).og
		expect(c).toBe(d)
	})

	it("still answers when the score feed is down", async () => {
		scoreboardMock.mockRejectedValue(new Error("down"))
		const m = await generateMetadata({})
		expect(images(m).og).toContain("/api/og?type=live")
	})
})
