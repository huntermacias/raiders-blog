// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

let path = "/"
vi.mock("next/navigation", async (importOriginal) => ({
	...(await importOriginal<typeof import("next/navigation")>()),
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
	usePathname: () => path,
}))

import NavMore, { isUnder } from "../../components/NavMore"

const items = [
	{ href: "/live", label: "Live", hint: "Live threads." },
	{ href: "/community", label: "Discussion", hint: "Talk." },
	{ href: "https://huntermacias.com", label: "Meet the Maintainer", hint: "Hunter.", external: true },
]

afterEach(() => {
	cleanup()
	path = "/"
})

const panel = () => document.getElementById(screen.getByRole("button", { name: /more/i }).getAttribute("aria-controls")!) as HTMLElement

describe("isUnder", () => {
	it("matches the page and pages beneath it, not lookalikes", () => {
		expect(isUnder("/live", "/live")).toBe(true)
		expect(isUnder("/live", "/live/week-4")).toBe(true)
		expect(isUnder("/live", "/livestream")).toBe(false)
		expect(isUnder("https://x.com", "/live")).toBe(false)
		expect(isUnder("/live", null)).toBe(false)
	})
})

describe("<NavMore />", () => {
	it("starts closed and toggles from the button", () => {
		render(<NavMore items={items} />)
		const b = screen.getByRole("button", { name: /more/i })
		expect(b.getAttribute("aria-expanded")).toBe("false")
		expect(panel().hidden).toBe(true)
		fireEvent.click(b)
		expect(b.getAttribute("aria-expanded")).toBe("true")
		expect(panel().hidden).toBe(false)
		fireEvent.click(b)
		expect(panel().hidden).toBe(true)
	})

	it("lists every item with its hint, and opens the external one in a new tab safely", () => {
		render(<NavMore items={items} />)
		fireEvent.click(screen.getByRole("button", { name: /more/i }))
		expect(screen.getByText("Live threads.")).toBeTruthy()
		const ext = screen.getByRole("link", { name: /meet the maintainer/i })
		expect(ext.getAttribute("target")).toBe("_blank")
		expect(ext.getAttribute("rel")).toBe("noopener noreferrer")
		expect(screen.getByRole("link", { name: /^live/i }).getAttribute("target")).toBeNull()
	})

	it("closes on Escape, on an outside press, and when a link is chosen", () => {
		render(<NavMore items={items} />)
		const b = screen.getByRole("button", { name: /more/i })
		fireEvent.click(b)
		fireEvent.keyDown(document, { key: "Escape" })
		expect(panel().hidden).toBe(true)
		fireEvent.click(b)
		fireEvent.pointerDown(document.body)
		expect(panel().hidden).toBe(true)
		fireEvent.click(b)
		fireEvent.click(screen.getByRole("link", { name: /discussion/i }))
		expect(panel().hidden).toBe(true)
	})

	it("marks the current page and shows the button as active when inside it", () => {
		path = "/live/week-4"
		render(<NavMore items={items} />)
		expect(screen.getByRole("button", { name: /more/i }).className).toContain("text-foreground")
		fireEvent.click(screen.getByRole("button", { name: /more/i }))
		expect(screen.getByRole("link", { name: /^live/i }).getAttribute("aria-current")).toBe("page")
		expect(screen.getByRole("link", { name: /discussion/i }).getAttribute("aria-current")).toBeNull()
	})
})
