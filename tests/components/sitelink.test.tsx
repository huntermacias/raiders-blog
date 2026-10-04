// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const seen: Record<string, unknown>[] = []
// Like the real <Link>: renders an anchor and runs the caller's onClick, then lets the browser
// follow the link unless something called preventDefault.
vi.mock("next/link", () => ({
	default: ({ href, children, onClick, ...rest }: { href: string; children?: React.ReactNode; onClick?: React.MouseEventHandler } & Record<string, unknown>) => {
		seen.push({ href, ...rest })
		return (
			<a href={href} onClick={onClick} {...(rest as object)}>
				{children}
			</a>
		)
	},
}))

import SiteLink from "../../components/SiteLink"

const router = () => (globalThis as unknown as { __router: { push: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> } }).__router

afterEach(() => {
	cleanup()
	seen.length = 0
})

describe("<SiteLink />", () => {
	it("turns prefetching off by default", () => {
		render(<SiteLink href="/league">League</SiteLink>)
		expect(screen.getByRole("link", { name: "League" }).getAttribute("href")).toBe("/league")
		expect(seen[0].prefetch).toBe(false)
	})

	it("lets a caller opt back in", () => {
		render(
			<SiteLink href="/" prefetch>
				Home
			</SiteLink>
		)
		expect(seen[0].prefetch).toBe(true)
	})

	it("passes other props through", () => {
		render(
			<SiteLink href="/x" className="a b" target="_blank" rel="noopener noreferrer">
				X
			</SiteLink>
		)
		expect(seen[0]).toMatchObject({ href: "/x", className: "a b", target: "_blank", rel: "noopener noreferrer", prefetch: false })
	})
})

// On Next 13.2.1 a <Link prefetch={false}> click does nothing on routes without a loading.js, so
// SiteLink navigates with router.push itself. These are the clicks that must reach the router
// and the ones that must be left to the browser.
describe("<SiteLink /> navigation", () => {
	const click = (init: Partial<MouseEventInit> = {}) => fireEvent.click(screen.getByRole("link"), { button: 0, ...init })

	it("navigates an ordinary internal click with the router", () => {
		render(<SiteLink href="/lab/week-3">Week 3</SiteLink>)
		expect(click()).toBe(false) // preventDefault was called, so the browser does not also follow it
		expect(router().push).toHaveBeenCalledWith("/lab/week-3")
	})

	it("keeps hash links and query strings intact", () => {
		render(<SiteLink href="/#latest">Latest</SiteLink>)
		click()
		expect(router().push).toHaveBeenCalledWith("/#latest")
	})

	it("replaces instead of pushing when asked", () => {
		render(
			<SiteLink href="/x" replace>
				X
			</SiteLink>
		)
		click()
		expect(router().replace).toHaveBeenCalledWith("/x")
		expect(router().push).not.toHaveBeenCalled()
	})

	it.each([
		["command", { metaKey: true }],
		["control", { ctrlKey: true }],
		["shift", { shiftKey: true }],
		["alt", { altKey: true }],
		["middle button", { button: 1 }],
	])("leaves a %s click to the browser (new tab, download, etc.)", (_name, init) => {
		render(<SiteLink href="/x">X</SiteLink>)
		fireEvent.click(screen.getByRole("link"), init)
		expect(router().push).not.toHaveBeenCalled()
	})

	it("leaves external links, protocol-relative links and new-tab links alone", () => {
		for (const props of [{ href: "https://example.com" }, { href: "//example.com/x" }, { href: "/x", target: "_blank" }]) {
			render(<SiteLink {...props}>link</SiteLink>)
			click()
			cleanup()
		}
		expect(router().push).not.toHaveBeenCalled()
	})

	it("runs the caller's own onClick first, and respects preventDefault", () => {
		const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault())
		render(
			<SiteLink href="/x" onClick={onClick}>
				X
			</SiteLink>
		)
		click()
		expect(onClick).toHaveBeenCalledTimes(1)
		expect(router().push).not.toHaveBeenCalled()
	})

	it("does not take over navigation for a link that opted in to prefetching", () => {
		render(
			<SiteLink href="/x" prefetch>
				X
			</SiteLink>
		)
		click()
		expect(router().push).not.toHaveBeenCalled()
	})
})
