// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import ChallengeLink from "../../components/league/ChallengeLink"

describe("ChallengeLink", () => {
	beforeEach(() => {
		Object.defineProperty(window.navigator, "share", { value: undefined, configurable: true })
	})
	afterEach(() => {
		cleanup()
		vi.restoreAllMocks()
	})

	it("copies the player's tagged challenge link and says so", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined)
		Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true })
		render(<ChallengeLink handle="Ann_1" />)
		fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }))
		await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
		const url = new URL(writeText.mock.calls[0][0])
		expect(url.pathname).toBe("/league")
		expect(url.searchParams.get("challenge")).toBe("Ann_1")
		expect(url.searchParams.get("utm_source")).toBe("challenge")
		expect(await screen.findByText("Challenge link copied")).toBeTruthy()
	})

	it("shows the link to copy by hand when copying is blocked", async () => {
		Object.defineProperty(window.navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true })
		render(<ChallengeLink handle="Ann_1" />)
		fireEvent.click(screen.getByRole("button", { name: /challenge a friend/i }))
		expect(await screen.findByText(/\/league\?challenge=Ann_1/)).toBeTruthy()
	})
})
