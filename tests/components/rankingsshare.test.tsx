// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import RankingsShare from "../../components/rankings/RankingsShare"

const URL_ = "https://www.raidersrundown.com/rankings"

beforeEach(() => window.history.replaceState(null, "", "/rankings"))
afterEach(cleanup)

describe("<RankingsShare />", () => {
	it("puts the version on the address bar, so a link copied from the browser is a new address when the rankings change", () => {
		render(<RankingsShare url={URL_} stamp={1760000000000} text="t" />)
		expect(window.location.search).toBe("?v=1760000000000")
		cleanup()
		render(<RankingsShare url={URL_} stamp={1760000999999} text="t" />)
		expect(window.location.search).toBe("?v=1760000999999")
	})

	it("keeps the other parts of the address when it adds the version", () => {
		window.history.replaceState(null, "", "/rankings?utm_source=x#top")
		render(<RankingsShare url={URL_} stamp={5} text="t" />)
		expect(window.location.pathname).toBe("/rankings")
		expect(window.location.search).toBe("?utm_source=x&v=5")
		expect(window.location.hash).toBe("#top")
	})

	it("posts to X with the rankings link and the words, and a version on the link", () => {
		render(<RankingsShare url={URL_} stamp={5} text="Week 6 NFL power rankings: the Raiders are No. 13." />)
		const a = screen.getByText("Post on X").closest("a")!
		const href = new globalThis.URL(a.getAttribute("href")!)
		expect(href.origin + href.pathname).toBe("https://twitter.com/intent/tweet")
		expect(href.searchParams.get("text")).toBe("Week 6 NFL power rankings: the Raiders are No. 13.")
		expect(href.searchParams.get("url")).toMatch(/^https:\/\/www\.raidersrundown\.com\/rankings\?v=\d+$/)
	})

	it("copies the stamped link", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.assign(navigator, { clipboard: { writeText } })
		render(<RankingsShare url={URL_} stamp={7} text="t" />)
		fireEvent.click(screen.getByText("Copy link"))
		expect(writeText).toHaveBeenCalledWith("https://www.raidersrundown.com/rankings?v=7")
		expect(await screen.findByText("Link copied")).toBeTruthy()
	})
})
