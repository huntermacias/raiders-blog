import { describe, expect, it } from "vitest"

import { STORY_TYPES, isStoryType, postTypeOptions, storyTypeOf, storyWeek, typeCounts } from "@/lib/storyType"

describe("storyTypeOf", () => {
	it("uses the type picked in Studio over everything else", () => {
		expect(storyTypeOf({ storyType: "opinion", title: "Week 8 Preview", categories: [{ title: "Preview Matchup" }] })).toBe("opinion")
	})

	it("works the type out from categories for posts written before the field existed", () => {
		expect(storyTypeOf({ categories: [{ title: "Las Vegas Raiders" }, { title: "Preview Matchup" }] })).toBe("preview")
		expect(storyTypeOf({ categories: [{ title: "NFL Power Rankings" }] })).toBe("power-rankings")
		expect(storyTypeOf({ categories: ["Trades"] })).toBe("trade")
		expect(storyTypeOf({ categories: [{ title: "Meet the Raiders" }, { title: "Las Vegas Raiders" }] })).toBe("profile")
	})

	it("lets the most specific category win", () => {
		expect(storyTypeOf({ categories: [{ title: "Free Agency" }, { title: "NFL Power Rankings" }] })).toBe("power-rankings")
	})

	it("falls back to the title, then to News & Analysis", () => {
		expect(storyTypeOf({ title: "Raiders Film Room: Why the win mattered", categories: [{ title: "Las Vegas Raiders" }] })).toBe("film-room")
		expect(storyTypeOf({ title: "Klint Kubiak Takes Over", categories: [{ title: "Las Vegas Raiders" }] })).toBe("news")
		expect(storyTypeOf({})).toBe("news")
		expect(storyTypeOf(null)).toBe("news")
	})

	it("ignores a type it does not know", () => {
		expect(storyTypeOf({ storyType: "nonsense", title: "Week 3 Preview" })).toBe("preview")
	})
})

describe("storyWeek", () => {
	it("reads the week from the title", () => {
		expect(storyWeek({ title: "Week 8 Preview: Raiders vs. Jets" })).toBe(8)
		expect(storyWeek({ title: "NFL Power Rankings After Week 8: The Bears" })).toBe(8)
		expect(storyWeek({ title: "NFL Power Rankings, Week 2: Seven Unbeaten" })).toBe(2)
	})
	it("returns null when there is none or it is not a real week", () => {
		expect(storyWeek({ title: "Dear Kansas City" })).toBeNull()
		expect(storyWeek({ title: "Week 99 of waiting" })).toBeNull()
		expect(storyWeek(null)).toBeNull()
	})
})

describe("the list of types", () => {
	it("offers every type but game report on a post, with unique ids", () => {
		const ids = STORY_TYPES.map((t) => t.id)
		expect(new Set(ids).size).toBe(ids.length)
		expect(postTypeOptions().some((o) => o.value === "game-report")).toBe(false)
		expect(postTypeOptions().length).toBe(STORY_TYPES.length - 1)
		expect(isStoryType("preview")).toBe(true)
		expect(isStoryType("x")).toBe(false)
	})

	it("counts only the types that have stories, in the usual order", () => {
		const out = typeCounts(["news", "preview", "preview", "trade"])
		expect(out.map((c) => [c.type.id, c.count])).toEqual([["preview", 2], ["trade", 1], ["news", 1]])
	})
})
