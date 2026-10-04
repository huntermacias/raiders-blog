import type { ComponentProps, ReactNode } from "react"
import { vi } from "vitest"

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
