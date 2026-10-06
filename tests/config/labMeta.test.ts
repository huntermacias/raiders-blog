import { describe, expect, it } from "vitest"

import { generateMetadata } from "../../app/(user)/lab/[slug]/page"
import { getGames } from "../../lib/lab/data"

describe("lab game page metadata", () => {
	it("shares the generated cards, story first, with the og:image tag Next 13.2 leaves out", async () => {
		for (const g of getGames()) {
			const meta = await generateMetadata({ params: Promise.resolve({ slug: `week-${g.week}` }) })
			const images = meta.openGraph!.images as { url: string }[]
			expect(images[0].url).toMatch(new RegExp(`^https://www\\.raidersrundown\\.com/api/og\\?type=lab&slug=week-${g.week}&v=\\d+$`))
			expect(images[1].url).toContain("view=drive")
			expect((meta.twitter!.images as string[])[0]).toBe(images[0].url)
			expect((meta.other as Record<string, string>)["og:image"]).toBe(images[0].url)
		}
	})

	it("still has the default title for an unknown game", async () => {
		expect((await generateMetadata({ params: Promise.resolve({ slug: "week-99" }) })).title).toMatch(/Lab/)
	})
})
