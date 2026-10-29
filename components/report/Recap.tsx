import { PortableText } from "@portabletext/react"

import { RichTextComponents } from "@/components/RichTextComponents"
import type { Heading } from "@/lib/report/story"

/**
 * The writer's recap, with an anchor on every heading so the contents list can jump to it. The text itself is untouched; the first
 * paragraph is set a little larger because it is the one that has to make someone keep reading.
 */
export default function Recap({ body, headings }: { body: unknown[]; headings: Heading[] }) {
	const ids = new Map(headings.filter((h) => h.key).map((h) => [h.key as string, h.id]))
	const idOf = (value: { _key?: string } | undefined) => (value?._key ? ids.get(value._key) : undefined)
	const components = {
		...RichTextComponents,
		block: {
			...RichTextComponents.block,
			h2: ({ children, value }: { children?: React.ReactNode; value?: { _key?: string } }) => (
				<h2 id={idOf(value)} className="scroll-mt-36">
					{children}
				</h2>
			),
			h3: ({ children, value }: { children?: React.ReactNode; value?: { _key?: string } }) => (
				<h3 id={idOf(value)} className="scroll-mt-36">
					{children}
				</h3>
			),
		},
	}
	return (
		<div className="prose prose-neutral max-w-none dark:prose-invert sm:prose-lg prose-headings:font-serif prose-headings:tracking-tight prose-h2:mt-12 prose-blockquote:not-italic [&>p:first-of-type]:text-xl [&>p:first-of-type]:leading-relaxed sm:[&>p:first-of-type]:text-2xl">
			{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
			<PortableText value={body as any} components={components as any} />
		</div>
	)
}
