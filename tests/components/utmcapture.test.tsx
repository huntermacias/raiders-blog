// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import UtmCapture from "../../components/UtmCapture"
import { loadUtm } from "../../lib/utm"

afterEach(() => {
	cleanup()
	window.localStorage.clear()
	window.history.replaceState({}, "", "/")
})

describe("<UtmCapture />", () => {
	it("renders nothing and remembers the tags in the landing URL", () => {
		window.history.replaceState({}, "", "/league?utm_source=x&utm_medium=social&utm_campaign=week4-league")
		const { container } = render(<UtmCapture />)
		expect(container.innerHTML).toBe("")
		expect(loadUtm()).toEqual({ source: "x", medium: "social", campaign: "week4-league" })
	})

	it("does nothing for an untagged landing", () => {
		window.history.replaceState({}, "", "/league")
		render(<UtmCapture />)
		expect(loadUtm()).toBeNull()
	})

	it("keeps the first campaign across a second tagged landing", () => {
		window.history.replaceState({}, "", "/?utm_source=x&utm_campaign=first")
		render(<UtmCapture />)
		cleanup()
		window.history.replaceState({}, "", "/?utm_source=newsletter&utm_campaign=second")
		render(<UtmCapture />)
		expect(loadUtm()).toEqual({ source: "x", campaign: "first" })
	})
})
