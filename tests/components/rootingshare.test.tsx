// @vitest-environment jsdom
import { track } from "@vercel/analytics"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import RootingShare from "../../components/rooting/RootingShare"

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.mocked(track).mockClear()
})

const props = { team: "KC", nick: "Chiefs", goal: "bye" as const, goalLabel: "No. 1 seed", week: 5, scope: "week" as const, stamp: 99, text: "Week 5 rooting guide for Chiefs fans" }

describe("sharing a rooting guide", () => {
	it("opens a card for this team, goal and week, and says so to analytics", () => {
		render(<RootingShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: /Share guide: Chiefs rooting guide/ }))
		const img = document.querySelector("dialog, [role=dialog]")!.querySelector("img") as HTMLImageElement
		expect(img.getAttribute("src")).toMatch(/^\/api\/og\?type=rooting&team=KC&goal=bye&week=5&size=wide&v=99/)
		expect(img.getAttribute("alt")).toMatch(/Chiefs Sunday Rooting Guide for Week 5/)
		expect(vi.mocked(track)).toHaveBeenCalledWith("rooting_share_opened", { team: "KC", goal: "bye" })
	})

	it("posts to X with the guide's own address and campaign tracking", () => {
		const open = vi.fn()
		vi.stubGlobal("open", open)
		render(<RootingShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: /Share guide/ }))
		fireEvent.click(screen.getByRole("button", { name: /Post on X/ }))
		const [href] = open.mock.calls[0]
		const u = new URL(href as string)
		expect(u.origin + u.pathname).toBe("https://twitter.com/intent/tweet")
		expect(u.searchParams.get("text")).toBe(props.text)
		const shared = new URL(u.searchParams.get("url") as string)
		expect(shared.origin + shared.pathname).toBe("https://www.raidersrundown.com/lab/rooting-guide")
		expect(Object.fromEntries(shared.searchParams)).toEqual({ team: "KC", goal: "bye", week: "5", utm_source: "x", utm_medium: "social", utm_campaign: "rooting_guide" })
		expect(vi.mocked(track)).toHaveBeenCalledWith("rooting_share_action", { method: "x", goal: "bye" })
	})

	it("copies a clean link, without tracking, and reports it", async () => {
		const writeText = vi.fn(async () => {})
		vi.stubGlobal("navigator", { clipboard: { writeText } })
		render(<RootingShare {...props} />)
		fireEvent.click(screen.getByRole("button", { name: /Share guide/ }))
		fireEvent.click(screen.getByRole("button", { name: /Copy link/ }))
		await waitFor(() => expect(writeText).toHaveBeenCalled())
		expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/lab\/rooting-guide\?team=KC&goal=bye&week=5$/))
		expect(vi.mocked(track)).toHaveBeenCalledWith("rooting_link_copied", { team: "KC", goal: "bye" })
	})
})
