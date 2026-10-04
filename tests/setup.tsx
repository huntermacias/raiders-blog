import type { ComponentProps, ReactNode } from "react"
import { vi } from "vitest"

// next/link and next/image need the Next runtime (router context, image
// loader config). The components under test only need them to render a normal
// anchor and image.
vi.mock("next/link", () => ({
	default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string; children?: ReactNode }) => (
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
