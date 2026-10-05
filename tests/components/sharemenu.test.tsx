// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import ShareMenu from "../../components/math/ShareMenu"

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("ShareMenu", () => {
	it("posts to X with the page address, and offers the card as a download", () => {
		render(<ShareMenu view={{ team: "LV", week: 4 }} stamp={7} text="Raiders talk" />)
		const post = screen.getByRole("link", { name: /Post/ }) as HTMLAnchorElement
		const u = new URL(post.href)
		expect(u.origin + u.pathname).toBe("https://twitter.com/intent/tweet")
		expect(u.searchParams.get("text")).toBe("Raiders talk")
		expect(u.searchParams.get("url")).toBe("https://www.raidersrundown.com/rankings/math?team=LV&week=4")
		expect(post.target).toBe("_blank")
		expect(post.rel).toContain("noopener")
		const card = screen.getByRole("link", { name: /Save card/ }) as HTMLAnchorElement
		expect(card.getAttribute("href")).toBe("/api/og?team=LV&week=4&type=math&v=7")
		expect(card.getAttribute("download")).toBe("raiders-rundown-lv-week-4.png")
	})

	it("copies the link and says so", async () => {
		const writeText = vi.fn(async () => {})
		vi.stubGlobal("navigator", { clipboard: { writeText } })
		render(<ShareMenu view={{ take: "KC" }} text="x" />)
		fireEvent.click(screen.getByRole("button", { name: /Copy link/ }))
		await waitFor(() => expect(screen.getByRole("button", { name: /Link copied/ })).toBeTruthy())
		expect(writeText).toHaveBeenCalledWith("https://www.raidersrundown.com/rankings/math?take=KC")
	})

	it("doesn't break when the clipboard is refused", async () => {
		vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("denied") }) } })
		const open = vi.fn()
		vi.stubGlobal("open", open)
		render(<ShareMenu view={{}} text="x" />)
		fireEvent.click(screen.getByRole("button", { name: /Copy link/ }))
		await waitFor(() => expect(open).toHaveBeenCalled())
		expect(screen.getByRole("button", { name: /Copy link/ })).toBeTruthy()
	})
})
