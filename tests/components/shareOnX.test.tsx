// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import ShareOnX from "../../components/ShareOnX"
import FlagLedger from "../../components/predictions/FlagLedger"

afterEach(() => {
	cleanup()
	vi.useRealTimers()
})

describe("<ShareOnX />", () => {
	it("posts the text and an address carrying this hour's stamp, once the page is up", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(3_600_000 * 400))
		render(<ShareOnX text="Hello" url="https://www.raidersrundown.com/predictions#flags">Share</ShareOnX>)
		const u = new URL((screen.getByRole("link", { name: "Share" }) as HTMLAnchorElement).href)
		expect(u.origin + u.pathname).toBe("https://twitter.com/intent/tweet")
		expect(u.searchParams.get("text")).toBe("Hello")
		expect(u.searchParams.get("url")).toBe("https://www.raidersrundown.com/predictions?v=400#flags")
		expect(screen.getByRole("link", { name: "Share" }).getAttribute("target")).toBe("_blank")
	})

	it("is the flag ledger's share link too", () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(3_600_000 * 400))
		render(<FlagLedger pageUrl="https://www.raidersrundown.com/predictions" flags={[{ _id: "f1", week: 5, text: "Raiders cover" }]} />)
		const a = screen.getByRole("link", { name: /Share on X/ }) as HTMLAnchorElement
		expect(new URL(a.href).searchParams.get("url")).toBe("https://www.raidersrundown.com/predictions?v=400#flag-f1")
	})
})
