import type { ComponentProps, ReactNode } from "react"
import { beforeEach, vi } from "vitest"

// next/link and next/image need the Next runtime (router context, image
// loader config). The components under test only need them to render a normal
// anchor and image.
vi.mock("next/link", () => ({
	default: ({ href, children, prefetch: _prefetch, ...rest }: ComponentProps<"a"> & { href: string; children?: ReactNode; prefetch?: boolean }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}))

vi.mock("next/image", () => ({
	default: ({ src, alt, fill: _fill, priority: _priority, sizes: _sizes, ...rest }: Record<string, unknown>) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={String(src)} alt={String(alt ?? "")} {...(rest as object)} />
	),
}))

// Web Analytics would try to talk to Vercel; tests only need to see what was tracked.
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))

// useRouter() throws outside a mounted app router. Components only need something that
// records navigation, so every test gets these spies (reset before each test).
// Read them in a test with `(globalThis as unknown as { __router: RouterSpies }).__router`.
const routerSpies = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }))
;(globalThis as unknown as { __router: typeof routerSpies }).__router = routerSpies
beforeEach(() => {
	for (const fn of Object.values(routerSpies)) fn.mockReset()
})
vi.mock("next/navigation", async (importOriginal) => ({
	...(await importOriginal<typeof import("next/navigation")>()),
	useRouter: () => routerSpies,
	usePathname: () => "/",
}))
