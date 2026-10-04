// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const seen: Record<string, unknown>[] = []
vi.mock("next/link", () => ({
	default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
		seen.push({ href, ...rest })
		return <a href={href}>{children}</a>
	},
}))

import SiteLink from "../../components/SiteLink"

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
