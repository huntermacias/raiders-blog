// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import ShareGame, { shareText, shareUrl } from "../../components/live/ShareGame"
import { parseScoreboard } from "../../lib/live/espn"
import { scoreboard } from "../stubs/liveFeed"

const board = parseScoreboard(scoreboard)
const live = board.find((g) => g.state === "in")!
const pre = board.find((g) => g.state === "pre")!
const post = board.find((g) => g.state === "post")!

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe("shareUrl", () => {
	it("points at the page with the game picked, stamped by the minute", () => {
		expect(shareUrl("https://www.raidersrundown.com", "401872980", 60_000 * 123)).toBe("https://www.raidersrundown.com/live?game=401872980&v=123")
	})
	it("changes with the minute so a platform fetches the card again", () => {
		expect(shareUrl("https://x.test", "1", 0)).not.toBe(shareUrl("https://x.test", "1", 120_000))
	})
	it("keeps the same stamp within a minute", () => {
		expect(shareUrl("https://x.test", "1", 60_000)).toBe(shareUrl("https://x.test", "1", 119_999))
	})
})

describe("shareText", () => {
	it("words a game that hasn't started", () => {
		expect(shareText(pre)).toMatch(/at .*: win probability and every play, live\./)
	})
	it("leads with the team that is ahead while it is live", () => {
		expect(shareText(live)).toMatch(/^Raiders 20, Chiefs 17/)
	})
	it("says Final once it is over", () => {
		expect(shareText(post)).toMatch(/\(Final\)\./)
		expect(shareText(post)).toMatch(/^Browns 27, Steelers 24/)
	})
})

describe("<ShareGame />", () => {
	it("copies the link and says so", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText }, userAgent: "Mozilla/5.0 (Macintosh)" })
		render(<ShareGame info={live} />)
		fireEvent.click(screen.getByRole("button", { name: /Share this game/ }))
		await waitFor(() => expect(screen.getByText("Link copied")).toBeTruthy())
		expect(writeText).toHaveBeenCalledTimes(1)
		expect(writeText.mock.calls[0][0]).toMatch(new RegExp(`/live\\?game=${live.id}&v=\\d+$`))
	})

	it("opens the share sheet on a phone, with the link and a line about the game", async () => {
		const share = vi.fn().mockResolvedValue(undefined)
		const writeText = vi.fn()
		vi.stubGlobal("navigator", { ...navigator, share, clipboard: { writeText }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })
		render(<ShareGame info={live} />)
		fireEvent.click(screen.getByRole("button", { name: /Share this game/ }))
		await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
		const arg = share.mock.calls[0][0]
		expect(arg.url).toContain(`/live?game=${live.id}`)
		expect(arg.text).toMatch(/Raiders 20, Chiefs 17/)
		expect(writeText).not.toHaveBeenCalled()
	})

	it("says nothing when the share sheet is closed", async () => {
		const abort = Object.assign(new Error("closed"), { name: "AbortError" })
		const writeText = vi.fn()
		vi.stubGlobal("navigator", { ...navigator, share: vi.fn().mockRejectedValue(abort), clipboard: { writeText }, userAgent: "iPhone" })
		render(<ShareGame info={live} />)
		fireEvent.click(screen.getByRole("button", { name: /Share this game/ }))
		await new Promise((r) => setTimeout(r, 20))
		expect(writeText).not.toHaveBeenCalled()
		expect(screen.queryByText("Link copied")).toBeNull()
	})

	it("falls back to copying when the share sheet fails, and shows the link when copying is blocked", async () => {
		vi.stubGlobal("navigator", {
			...navigator,
			share: vi.fn().mockRejectedValue(new Error("nope")),
			clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
			userAgent: "Android",
		})
		render(<ShareGame info={live} />)
		fireEvent.click(screen.getByRole("button", { name: /Share this game/ }))
		await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/\/live\?game=/))
	})
})
